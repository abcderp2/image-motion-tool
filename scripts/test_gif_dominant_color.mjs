import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const gif = require('../gif-encoder.js');

const width = 360;
const height = 360;
const rgba = new Uint8ClampedArray(width * height * 4);

function setPixel(x, y, red, green, blue, alpha = 255) {
  const offset = (y * width + x) * 4;
  rgba[offset] = red;
  rgba[offset + 1] = green;
  rgba[offset + 2] = blue;
  rgba[offset + 3] = alpha;
}

// Reproduce a wide illustration fitted inside a square transparent GIF canvas.
// More than half of the opaque pixels are near white, while the subject contains
// many dark-blue, skin-tone and pale-blue shades.
for (let y = 78; y < 281; y += 1) {
  for (let x = 0; x < width; x += 1) setPixel(x, y, 254, 254, 254);
}
for (let y = 105; y < 210; y += 1) {
  for (let x = 24; x < 336; x += 1) {
    if (x < 120 || x >= 240) {
      setPixel(
        x,
        y,
        18 + ((x + y) % 30),
        28 + ((x * 2 + y) % 46),
        58 + ((x + y * 3) % 96),
      );
    } else {
      const position = (x - 120) / 120;
      setPixel(
        x,
        y,
        Math.min(255, 238 - Math.round(position * 16) + ((x + y) % 7)),
        Math.min(255, 202 + Math.round(position * 32) + ((x * 2 + y) % 5)),
        Math.min(255, 190 + Math.round(position * 44) + ((x + y * 2) % 6)),
      );
    }
  }
}
for (let y = 170; y < 250; y += 1) {
  for (let x = 110; x < 250; x += 1) {
    if ((x + y) % 17 < 8) setPixel(x, y, 238 - (y % 8), 240 - (x % 7), 252);
    else setPixel(x, y, 202 + (x % 20), 214 + (y % 18), 244);
  }
}

const histogram = gif.createColorHistogram();
gif.addRgbaToHistogram(histogram, rgba, { transparent: true, stride: 1 });
const palette = gif.paletteFromHistogram(histogram, {
  transparent: true,
  maxColors: 255,
  refineIterations: 1,
});

const paletteColors = new Set();
let blackEntries = 0;
for (let index = 1; index < 256; index += 1) {
  const offset = index * 3;
  const red = palette[offset];
  const green = palette[offset + 1];
  const blue = palette[offset + 2];
  paletteColors.add(`${red},${green},${blue}`);
  if (red === 0 && green === 0 && blue === 0) blackEntries += 1;
}
assert.ok(paletteColors.size >= 128, `dominant white must not collapse the palette: ${paletteColors.size} colors`);
assert.ok(blackEntries <= 2, `empty palette boxes must not become black entries: ${blackEntries}`);

const lookup = gif.createPaletteLookup(palette, { transparent: true });
const indexed = gif.rgbaToIndexed(rgba, {
  transparent: true,
  palette,
  lookup,
  width,
  dither: 'none',
});

let error = 0;
let samples = 0;
let whiteSamples = 0;
for (let pixel = 0; pixel < indexed.length; pixel += 1) {
  const source = pixel * 4;
  if (rgba[source + 3] < 128) {
    assert.equal(indexed[pixel], 0);
    continue;
  }
  const paletteOffset = indexed[pixel] * 3;
  error += Math.abs(rgba[source] - palette[paletteOffset]);
  error += Math.abs(rgba[source + 1] - palette[paletteOffset + 1]);
  error += Math.abs(rgba[source + 2] - palette[paletteOffset + 2]);
  samples += 3;
  if (rgba[source] >= 250 && rgba[source + 1] >= 250 && rgba[source + 2] >= 250) {
    assert.ok(palette[paletteOffset] >= 240 && palette[paletteOffset + 1] >= 240 && palette[paletteOffset + 2] >= 240);
    whiteSamples += 1;
  }
}
const meanAbsoluteError = error / samples;
assert.ok(whiteSamples > 30_000);
assert.ok(meanAbsoluteError < 12, `dominant-color mean absolute error is too high: ${meanAbsoluteError.toFixed(3)}`);

console.log(`GIF dominant-color palette tests passed: ${paletteColors.size} colors, MAE ${meanAbsoluteError.toFixed(3)}`);
