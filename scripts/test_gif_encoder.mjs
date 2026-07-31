import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const encoder = require('../gif-encoder.js');

function readSubBlocks(data, offset) {
  const bytes = [];
  let cursor = offset;
  while (true) {
    const size = data[cursor];
    cursor += 1;
    if (size === 0) break;
    bytes.push(...data.subarray(cursor, cursor + size));
    cursor += size;
  }
  return { bytes: Uint8Array.from(bytes), offset: cursor };
}

function decodeLzw(data, minimumCodeSize, expectedLength) {
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  let codeSize = minimumCodeSize + 1;
  let nextCode = endCode + 1;
  let bytePosition = 0;
  let bitPosition = 0;
  let dictionary = [];

  function reset() {
    dictionary = Array.from({ length: clearCode }, (_, index) => Uint8Array.of(index));
    dictionary[clearCode] = null;
    dictionary[endCode] = null;
    codeSize = minimumCodeSize + 1;
    nextCode = endCode + 1;
  }

  function readCode() {
    let code = 0;
    for (let bit = 0; bit < codeSize; bit += 1) {
      const value = (data[bytePosition] >>> bitPosition) & 1;
      code |= value << bit;
      bitPosition += 1;
      if (bitPosition === 8) {
        bitPosition = 0;
        bytePosition += 1;
      }
    }
    return code;
  }

  reset();
  const output = [];
  let previous = null;
  while (bytePosition < data.length && output.length < expectedLength) {
    const code = readCode();
    if (code === clearCode) {
      reset();
      previous = null;
      continue;
    }
    if (code === endCode) break;
    let entry;
    if (dictionary[code]) {
      entry = dictionary[code];
    } else if (code === nextCode && previous) {
      entry = Uint8Array.from([...previous, previous[0]]);
    } else {
      throw new Error(`invalid LZW code ${code}`);
    }
    output.push(...entry);
    if (previous && nextCode < 4096) {
      dictionary[nextCode] = Uint8Array.from([...previous, entry[0]]);
      nextCode += 1;
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize += 1;
    }
    previous = entry;
  }
  return Uint8Array.from(output.slice(0, expectedLength));
}

const width = 16;
const height = 12;
const frames = [0, 1, 2].map((frameNumber) => {
  const frame = new Uint8Array(width * height);
  for (let index = 0; index < frame.length; index += 1) {
    frame[index] = ((index * 7) + frameNumber * 23) % 255 + 1;
  }
  return frame;
});

const gif = encoder.encodeIndexedFrames({ width, height, delay: 10, transparent: false, frames });
assert.equal(Buffer.from(gif.subarray(0, 6)).toString('ascii'), 'GIF89a');
assert.equal(gif.at(-1), 0x3b);

let cursor = 13 + 256 * 3;
let decodedFrameCount = 0;
while (cursor < gif.length) {
  const marker = gif[cursor];
  if (marker === 0x3b) break;
  if (marker === 0x21) {
    const label = gif[cursor + 1];
    cursor += 2;
    if (label === 0xf9) {
      cursor += 1 + gif[cursor] + 1;
    } else {
      if (label === 0xff) {
        const blockSize = gif[cursor];
        cursor += 1 + blockSize;
      }
      cursor = readSubBlocks(gif, cursor).offset;
    }
    continue;
  }
  assert.equal(marker, 0x2c);
  cursor += 10;
  const minimumCodeSize = gif[cursor];
  cursor += 1;
  const blocks = readSubBlocks(gif, cursor);
  cursor = blocks.offset;
  const decoded = decodeLzw(blocks.bytes, minimumCodeSize, width * height);
  assert.deepEqual(decoded, frames[decodedFrameCount]);
  decodedFrameCount += 1;
}
assert.equal(decodedFrameCount, frames.length);
console.log('GIF encoder test passed');
