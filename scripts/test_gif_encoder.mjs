import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const gif = require('../gif-encoder.js');

const width = 4;
const height = 4;
const redFrame = new Uint8ClampedArray(width * height * 4);
const blueFrame = new Uint8ClampedArray(width * height * 4);
for (let index = 0; index < width * height; index += 1) {
  redFrame.set([240, 32, 32, 255], index * 4);
  blueFrame.set([32, 64, 240, index === 0 ? 0 : 255], index * 4);
}

const histogram = gif.createColorHistogram();
gif.addRgbaToHistogram(histogram, redFrame, { transparent: true, stride: 1 });
gif.addRgbaToHistogram(histogram, blueFrame, { transparent: true, stride: 1 });
const palette = gif.paletteFromHistogram(histogram, { transparent: true, maxColors: 32 });
assert.equal(palette.length, 768);

const first = gif.rgbaToIndexed(redFrame, { transparent: true, palette, width, dither: 'none' });
const second = gif.rgbaToIndexed(blueFrame, { transparent: true, palette, width, dither: 'ordered' });
assert.equal(first.length, width * height);
assert.equal(second[0], 0);
assert.notEqual(first[1], 0);

const encoded = gif.encodeIndexedFrames({
  width,
  height,
  delay: 10,
  transparent: true,
  palette,
  frames: [first, second],
});
assert.equal(Buffer.from(encoded.subarray(0, 6)).toString('ascii'), 'GIF89a');
assert.equal(encoded.at(-1), 0x3b);
assert.ok(encoded.length > 800);

assert.throws(() => gif.encodeIndexedFrames({ width: 0, height: 1, frames: [first] }), /invalid GIF dimensions/);
console.log('gif encoder tests passed');
