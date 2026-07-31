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
    const length = bytes[offset++];
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
      bitBuffer |= data[byteOffset++] << bitCount;
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
    if (code < nextCode && dictionary[code]) entry = dictionary[code];
    else if (code === nextCode && previous) {
      entry = new Uint8Array(previous.length + 1);
      entry.set(previous);
      entry[previous.length] = previous[0];
    } else throw new Error(`invalid GIF LZW code ${code}`);

    if (outputOffset + entry.length > output.length) throw new Error('GIF LZW output exceeds frame size');
    output.set(entry, outputOffset);
    outputOffset += entry.length;

    if (previous && nextCode < MAX_DICTIONARY_SIZE) {
      const combined = new Uint8Array(previous.length + 1);
      combined.set(previous);
      combined[previous.length] = entry[0];
      dictionary[nextCode++] = combined;
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize += 1;
    }
    previous = entry;
  }

  assert.equal(outputOffset, output.length);
  return output;
}

function decodeGifFrames(encoded) {
  const bytes = encoded instanceof Uint8Array ? encoded : new Uint8Array(encoded);
  assert.equal(Buffer.from(bytes.subarray(0, 6)).toString('ascii'), 'GIF89a');
  const width = readU16(bytes, 6);
  const height = readU16(bytes, 8);
  let offset = 13;
  const packed = bytes[10];
  if (packed & 0x80) offset += 3 * (1 << ((packed & 7) + 1));
  const frames = [];
  while (offset < bytes.length) {
    const marker = bytes[offset++];
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      offset += 1;
      ({ offset } = readSubBlocks(bytes, offset));
      continue;
    }
    assert.equal(marker, 0x2c);
    const frameWidth = readU16(bytes, offset + 4);
    const frameHeight = readU16(bytes, offset + 6);
    const imagePacked = bytes[offset + 8];
    offset += 9;
    if (imagePacked & 0x80) offset += 3 * (1 << ((imagePacked & 7) + 1));
    const minimumCodeSize = bytes[offset++];
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

function makeColorTestFrame(width, height) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      let red = 35 + 185 * x / (width - 1) + 18 * Math.sin(y / 11);
      let green = 30 + 165 * y / (height - 1) + 20 * Math.sin(x / 17);
      let blue = 50 + 135 * (x + y) / (width + height - 2) + 17 * Math.sin((x - y) / 13);
      const skin = ((x - width * 0.33) / (width * 0.2)) ** 2 + ((y - height * 0.53) / (height * 0.3)) ** 2 < 1;
      if (skin) {
        red = 176 + 42 * x / width;
        green = 105 + 36 * y / height;
        blue = 74 + 28 * x / width;
      }
      rgba[offset] = Math.max(0, Math.min(255, Math.round(red)));
      rgba[offset + 1] = Math.max(0, Math.min(255, Math.round(green)));
      rgba[offset + 2] = Math.max(0, Math.min(255, Math.round(blue)));
      rgba[offset + 3] = 255;
    }
  }
  return rgba;
}

function colorError(rgba, indexed, palette) {
  let absolute = 0;
  const shifts = [0, 0, 0];
  for (let pixel = 0; pixel < indexed.length; pixel += 1) {
    const source = pixel * 4;
    const target = indexed[pixel] * 3;
    for (let channel = 0; channel < 3; channel += 1) {
      const difference = palette[target + channel] - rgba[source + channel];
      absolute += Math.abs(difference);
      shifts[channel] += difference;
    }
  }
  const samples = indexed.length;
  return {
    meanAbsolute: absolute / (samples * 3),
    meanShift: shifts.map((value) => value / samples),
  };
}

const sampleWidth = 4;
const sampleHeight = 4;
const redFrame = new Uint8ClampedArray(sampleWidth * sampleHeight * 4);
const blueFrame = new Uint8ClampedArray(sampleWidth * sampleHeight * 4);
for (let index = 0; index < sampleWidth * sampleHeight; index += 1) {
  redFrame.set([240, 32, 32, 255], index * 4);
  blueFrame.set([32, 64, 240, index === 0 ? 0 : 255], index * 4);
}
const smallHistogram = gif.createColorHistogram();
gif.addRgbaToHistogram(smallHistogram, redFrame, { transparent: true, stride: 1 });
gif.addRgbaToHistogram(smallHistogram, blueFrame, { transparent: true, stride: 1 });
const smallPalette = gif.paletteFromHistogram(smallHistogram, { transparent: true, maxColors: 32, refineIterations: 1 });
const smallLookup = gif.createPaletteLookup(smallPalette, { transparent: true });
const first = gif.rgbaToIndexed(redFrame, { transparent: true, palette: smallPalette, lookup: smallLookup, width: sampleWidth });
const second = gif.rgbaToIndexed(blueFrame, { transparent: true, palette: smallPalette, lookup: smallLookup, width: sampleWidth, dither: 'error-diffusion' });
assert.equal(second[0], 0);
assert.notEqual(first[1], 0);
const transparentGif = gif.encodeIndexedFrames({ width: sampleWidth, height: sampleHeight, delay: 10, transparent: true, palette: smallPalette, frames: [first, second] });
assert.deepEqual(decodeGifFrames(transparentGif).frames, [first, second]);

const width = 160;
const height = 90;
const largeFrames = [deterministicFrame(width * height, 0x12345678), deterministicFrame(width * height, 0x9abcdef0)];
const encoded = gif.encodeIndexedFrames({ width, height, delay: 8, transparent: false, palette: gif.fixedPalette(), frames: largeFrames });
assert.deepEqual(decodeGifFrames(encoded).frames, largeFrames);

const colorWidth = 192;
const colorHeight = 128;
const colorFrame = makeColorTestFrame(colorWidth, colorHeight);
const colorHistogram = gif.createColorHistogram();
gif.addRgbaToHistogram(colorHistogram, colorFrame, { transparent: false, stride: 4 });
const colorPalette = gif.paletteFromHistogram(colorHistogram, { transparent: false, maxColors: 256, refineIterations: 1 });
const colorLookup = gif.createPaletteLookup(colorPalette, { transparent: false });
const balanced = gif.rgbaToIndexed(colorFrame, { transparent: false, palette: colorPalette, lookup: colorLookup, width: colorWidth, dither: 'none' });
const balancedError = colorError(colorFrame, balanced, colorPalette);
assert.ok(balancedError.meanAbsolute < 4.2, `balanced color MAE ${balancedError.meanAbsolute}`);
for (const shift of balancedError.meanShift) assert.ok(Math.abs(shift) < 0.8, `balanced color shift ${shift}`);

const high = gif.rgbaToIndexed(colorFrame, { transparent: false, palette: colorPalette, lookup: colorLookup, width: colorWidth, dither: 'error-diffusion', ditherStrength: 0.45 });
const highError = colorError(colorFrame, high, colorPalette);
assert.ok(highError.meanAbsolute < 4.8, `high color MAE ${highError.meanAbsolute}`);
for (const shift of highError.meanShift) assert.ok(Math.abs(shift) < 0.8, `high color shift ${shift}`);

assert.throws(() => gif.encodeIndexedFrames({ width: 0, height: 1, frames: [first] }), /invalid GIF dimensions/);
console.log('GIF encoder decode regression tests passed');
