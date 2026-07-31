import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const gif = require('../gif-encoder.js');
const MAX_DICTIONARY_SIZE = 4096;

function readU16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readSubBlocks(bytes, offset) {
  const chunks = [];
  let total = 0;
  while (true) {
    if (offset >= bytes.length) throw new Error('GIF sub-block is truncated');
    const length = bytes[offset];
    offset += 1;
    if (length === 0) break;
    if (offset + length > bytes.length) throw new Error('GIF sub-block exceeds file length');
    chunks.push(bytes.subarray(offset, offset + length));
    total += length;
    offset += length;
  }
  const data = new Uint8Array(total);
  let target = 0;
  for (const chunk of chunks) {
    data.set(chunk, target);
    target += chunk.length;
  }
  return { data, offset };
}

function decodeLzw(data, minimumCodeSize, expectedLength) {
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  let byteOffset = 0;
  let bitBuffer = 0;
  let bitCount = 0;
  let codeSize;
  let nextCode;
  let dictionary;

  function resetDictionary() {
    dictionary = new Array(MAX_DICTIONARY_SIZE);
    for (let index = 0; index < clearCode; index += 1) dictionary[index] = Uint8Array.of(index);
    codeSize = minimumCodeSize + 1;
    nextCode = endCode + 1;
  }

  function readCode() {
    while (bitCount < codeSize) {
      if (byteOffset >= data.length) throw new Error('GIF LZW data ended unexpectedly');
      bitBuffer |= data[byteOffset] << bitCount;
      byteOffset += 1;
      bitCount += 8;
    }
    const code = bitBuffer & ((1 << codeSize) - 1);
    bitBuffer >>>= codeSize;
    bitCount -= codeSize;
    return code;
  }

  resetDictionary();
  const output = new Uint8Array(expectedLength);
  let outputOffset = 0;
  let previous = null;

  while (true) {
    const code = readCode();
    if (code === clearCode) {
      resetDictionary();
      previous = null;
      continue;
    }
    if (code === endCode) break;

    let entry;
    if (code < nextCode && dictionary[code]) {
      entry = dictionary[code];
    } else if (code === nextCode && previous) {
      entry = new Uint8Array(previous.length + 1);
      entry.set(previous);
      entry[previous.length] = previous[0];
    } else {
      throw new Error(`invalid GIF LZW code ${code}`);
    }

    if (outputOffset + entry.length > output.length) throw new Error('GIF LZW output exceeds frame size');
    output.set(entry, outputOffset);
    outputOffset += entry.length;

    if (previous && nextCode < MAX_DICTIONARY_SIZE) {
      const combined = new Uint8Array(previous.length + 1);
      combined.set(previous);
      combined[previous.length] = entry[0];
      dictionary[nextCode] = combined;
      nextCode += 1;
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize += 1;
    }
    previous = entry;
  }

  if (outputOffset !== output.length) {
    throw new Error(`GIF LZW frame has ${outputOffset} pixels, expected ${output.length}`);
  }
  return output;
}

function decodeGifFrames(encoded) {
  const bytes = encoded instanceof Uint8Array ? encoded : new Uint8Array(encoded);
  assert.equal(Buffer.from(bytes.subarray(0, 6)).toString('ascii'), 'GIF89a');
  const width = readU16(bytes, 6);
  const height = readU16(bytes, 8);
  const packed = bytes[10];
  let offset = 13;
  if (packed & 0x80) offset += 3 * (1 << ((packed & 0x07) + 1));

  const frames = [];
  while (offset < bytes.length) {
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      if (offset >= bytes.length) throw new Error('GIF extension is truncated');
      offset += 1;
      ({ offset } = readSubBlocks(bytes, offset));
      continue;
    }
    if (marker !== 0x2c) throw new Error(`unexpected GIF marker ${marker}`);
    if (offset + 9 > bytes.length) throw new Error('GIF image descriptor is truncated');
    const frameWidth = readU16(bytes, offset + 4);
    const frameHeight = readU16(bytes, offset + 6);
    const imagePacked = bytes[offset + 8];
    offset += 9;
    if (imagePacked & 0x80) offset += 3 * (1 << ((imagePacked & 0x07) + 1));
    const minimumCodeSize = bytes[offset];
    offset += 1;
    const blocks = readSubBlocks(bytes, offset);
    offset = blocks.offset;
    frames.push(decodeLzw(blocks.data, minimumCodeSize, frameWidth * frameHeight));
  }

  assert.equal(bytes.at(-1), 0x3b);
  return { width, height, frames };
}

function deterministicFrame(length, seed) {
  const frame = new Uint8Array(length);
  let state = seed >>> 0;
  for (let index = 0; index < frame.length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    frame[index] = state & 0xff;
  }
  return frame;
}

const sampleWidth = 4;
const sampleHeight = 4;
const redFrame = new Uint8ClampedArray(sampleWidth * sampleHeight * 4);
const blueFrame = new Uint8ClampedArray(sampleWidth * sampleHeight * 4);
for (let index = 0; index < sampleWidth * sampleHeight; index += 1) {
  redFrame.set([240, 32, 32, 255], index * 4);
  blueFrame.set([32, 64, 240, index === 0 ? 0 : 255], index * 4);
}

const histogram = gif.createColorHistogram();
gif.addRgbaToHistogram(histogram, redFrame, { transparent: true, stride: 1 });
gif.addRgbaToHistogram(histogram, blueFrame, { transparent: true, stride: 1 });
const adaptivePalette = gif.paletteFromHistogram(histogram, { transparent: true, maxColors: 32 });
assert.equal(adaptivePalette.length, 768);

const first = gif.rgbaToIndexed(redFrame, {
  transparent: true,
  palette: adaptivePalette,
  width: sampleWidth,
  dither: 'none',
});
const second = gif.rgbaToIndexed(blueFrame, {
  transparent: true,
  palette: adaptivePalette,
  width: sampleWidth,
  dither: 'ordered',
});
assert.equal(first.length, sampleWidth * sampleHeight);
assert.equal(second[0], 0);
assert.notEqual(first[1], 0);

const transparentGif = gif.encodeIndexedFrames({
  width: sampleWidth,
  height: sampleHeight,
  delay: 10,
  transparent: true,
  palette: adaptivePalette,
  frames: [first, second],
});
const decodedTransparent = decodeGifFrames(transparentGif);
assert.equal(decodedTransparent.width, sampleWidth);
assert.equal(decodedTransparent.height, sampleHeight);
assert.deepEqual(decodedTransparent.frames, [first, second]);

// A normal-sized, high-entropy frame crosses every GIF LZW code-width boundary
// and resets the 4096-entry dictionary. This regression test catches files that
// have a valid header and trailer but become unreadable partway through a frame.
const width = 160;
const height = 90;
const largeFrames = [
  deterministicFrame(width * height, 0x12345678),
  deterministicFrame(width * height, 0x9abcdef0),
];
const encoded = gif.encodeIndexedFrames({
  width,
  height,
  delay: 8,
  transparent: false,
  palette: gif.fixedPalette(),
  frames: largeFrames,
});
const decoded = decodeGifFrames(encoded);
assert.equal(decoded.width, width);
assert.equal(decoded.height, height);
assert.deepEqual(decoded.frames, largeFrames);
assert.ok(encoded.length > 1000);

assert.throws(
  () => gif.encodeIndexedFrames({ width: 0, height: 1, frames: [first] }),
  /invalid GIF dimensions/,
);
console.log('GIF encoder decode regression tests passed');
