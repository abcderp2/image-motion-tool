(function attachGifEncoder(globalScope) {
  'use strict';

  const MAX_DICTIONARY_SIZE = 4096;
  const HISTOGRAM_SIZE = 32 * 32 * 32;
  const DEFAULT_ERROR_STRENGTH = 0.45;
  const MAX_ERROR = 24;

  function clampByte(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function writeU16(bytes, value) {
    bytes.push(value & 0xff, (value >>> 8) & 0xff);
  }

  function fixedPalette() {
    const palette = new Uint8Array(256 * 3);
    let index = 0;
    const levels = [0, 51, 102, 153, 204, 255];
    for (const red of levels) {
      for (const green of levels) {
        for (const blue of levels) {
          palette[index * 3] = red;
          palette[index * 3 + 1] = green;
          palette[index * 3 + 2] = blue;
          index += 1;
        }
      }
    }
    for (; index < 256; index += 1) {
      const gray = Math.round(((index - 216) / 39) * 255);
      palette[index * 3] = gray;
      palette[index * 3 + 1] = gray;
      palette[index * 3 + 2] = gray;
    }
    return palette;
  }

  function createColorHistogram() {
    return {
      counts: new Uint32Array(HISTOGRAM_SIZE),
      reds: new Float64Array(HISTOGRAM_SIZE),
      greens: new Float64Array(HISTOGRAM_SIZE),
      blues: new Float64Array(HISTOGRAM_SIZE),
      samples: 0,
    };
  }

  function histogramKey(red, green, blue) {
    return ((red >>> 3) << 10) | ((green >>> 3) << 5) | (blue >>> 3);
  }

  function addRgbaToHistogram(histogram, rgba, options = {}) {
    if (!histogram || !(histogram.counts instanceof Uint32Array)) throw new TypeError('invalid histogram');
    if (!(rgba instanceof Uint8ClampedArray) && !(rgba instanceof Uint8Array)) throw new TypeError('rgba must be a Uint8Array');
    if (rgba.length % 4 !== 0) throw new RangeError('rgba length must be divisible by 4');
    const transparent = Boolean(options.transparent);
    const stride = Math.max(1, Math.floor(Number(options.stride) || 1));
    for (let pixel = 0; pixel < rgba.length / 4; pixel += stride) {
      const source = pixel * 4;
      const alpha = rgba[source + 3];
      if (transparent && alpha < 128) continue;
      const weight = transparent ? Math.max(1, alpha) : 255;
      const red = rgba[source];
      const green = rgba[source + 1];
      const blue = rgba[source + 2];
      const key = histogramKey(red, green, blue);
      histogram.counts[key] += weight;
      histogram.reds[key] += red * weight;
      histogram.greens[key] += green * weight;
      histogram.blues[key] += blue * weight;
      histogram.samples += 1;
    }
    return histogram;
  }

  function histogramColors(histogram) {
    const colors = [];
    for (let key = 0; key < HISTOGRAM_SIZE; key += 1) {
      const count = histogram.counts[key];
      if (!count) continue;
      colors.push({
        r: histogram.reds[key] / count,
        g: histogram.greens[key] / count,
        b: histogram.blues[key] / count,
        count,
      });
    }
    return colors;
  }

  function boxStats(colors) {
    if (!Array.isArray(colors) || colors.length === 0) throw new RangeError('palette box must contain colors');
    let count = 0;
    let minR = 255;
    let minG = 255;
    let minB = 255;
    let maxR = 0;
    let maxG = 0;
    let maxB = 0;
    for (const color of colors) {
      count += color.count;
      minR = Math.min(minR, color.r);
      minG = Math.min(minG, color.g);
      minB = Math.min(minB, color.b);
      maxR = Math.max(maxR, color.r);
      maxG = Math.max(maxG, color.g);
      maxB = Math.max(maxB, color.b);
    }
    const rangeR = maxR - minR;
    const rangeG = maxG - minG;
    const rangeB = maxB - minB;
    const channel = rangeR >= rangeG && rangeR >= rangeB ? 'r' : (rangeG >= rangeB ? 'g' : 'b');
    const weightedRange = Math.max(rangeR * 2, rangeG * 3, rangeB);
    return { colors, count, channel, score: weightedRange * Math.sqrt(count || 1) };
  }

  function splitBox(box) {
    if (box.colors.length < 2) return [box];
    const colors = box.colors.slice().sort((left, right) => left[box.channel] - right[box.channel]);
    const target = box.count / 2;
    let running = 0;
    let splitIndex = 1;
    for (let index = 0; index < colors.length - 1; index += 1) {
      running += colors[index].count;
      splitIndex = index + 1;
      if (running >= target) break;
    }
    splitIndex = Math.max(1, Math.min(colors.length - 1, splitIndex));
    return [boxStats(colors.slice(0, splitIndex)), boxStats(colors.slice(splitIndex))];
  }

  function colorDistance(red, green, blue, palette, index) {
    const offset = index * 3;
    const deltaR = red - palette[offset];
    const deltaG = green - palette[offset + 1];
    const deltaB = blue - palette[offset + 2];
    return deltaR * deltaR * 2 + deltaG * deltaG * 4 + deltaB * deltaB;
  }

  function nearestPaletteIndexExact(red, green, blue, palette, startIndex, endIndex = 256) {
    let bestIndex = startIndex;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = startIndex; index < endIndex; index += 1) {
      const distance = colorDistance(red, green, blue, palette, index);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
        if (distance === 0) break;
      }
    }
    return bestIndex;
  }

  function refinePalette(colors, palette, startIndex, colorCount, iterations) {
    const endIndex = startIndex + colorCount;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const weights = new Float64Array(256);
      const reds = new Float64Array(256);
      const greens = new Float64Array(256);
      const blues = new Float64Array(256);
      for (const color of colors) {
        const index = nearestPaletteIndexExact(color.r, color.g, color.b, palette, startIndex, endIndex);
        weights[index] += color.count;
        reds[index] += color.r * color.count;
        greens[index] += color.g * color.count;
        blues[index] += color.b * color.count;
      }
      for (let index = startIndex; index < endIndex; index += 1) {
        if (!weights[index]) continue;
        palette[index * 3] = clampByte(reds[index] / weights[index]);
        palette[index * 3 + 1] = clampByte(greens[index] / weights[index]);
        palette[index * 3 + 2] = clampByte(blues[index] / weights[index]);
      }
    }
  }

  function paletteFromHistogram(histogram, options = {}) {
    if (!histogram || !(histogram.counts instanceof Uint32Array)) throw new TypeError('invalid histogram');
    const transparent = Boolean(options.transparent);
    const maximum = 256 - (transparent ? 1 : 0);
    const requestedColors = Math.max(2, Math.min(maximum, Math.floor(Number(options.maxColors) || maximum)));
    const refineIterations = Math.max(0, Math.min(2, Math.floor(Number(options.refineIterations) || 0)));
    const colors = histogramColors(histogram);
    if (!colors.length) return fixedPalette();

    const boxes = [boxStats(colors)];
    while (boxes.length < requestedColors) {
      let candidateIndex = -1;
      let candidateScore = -1;
      for (let index = 0; index < boxes.length; index += 1) {
        if (boxes[index].colors.length > 1 && boxes[index].score > candidateScore) {
          candidateIndex = index;
          candidateScore = boxes[index].score;
        }
      }
      if (candidateIndex < 0) break;
      const [left, right] = splitBox(boxes[candidateIndex]);
      boxes.splice(candidateIndex, 1, left, right);
    }

    const palette = new Uint8Array(256 * 3);
    const startIndex = transparent ? 1 : 0;
    let paletteIndex = startIndex;
    for (const box of boxes) {
      let total = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (const color of box.colors) {
        total += color.count;
        red += color.r * color.count;
        green += color.g * color.count;
        blue += color.b * color.count;
      }
      palette[paletteIndex * 3] = clampByte(red / total);
      palette[paletteIndex * 3 + 1] = clampByte(green / total);
      palette[paletteIndex * 3 + 2] = clampByte(blue / total);
      paletteIndex += 1;
      if (paletteIndex >= 256) break;
    }
    const colorCount = Math.max(1, paletteIndex - startIndex);
    if (refineIterations) refinePalette(colors, palette, startIndex, colorCount, refineIterations);

    const fallbackIndex = Math.max(startIndex, paletteIndex - 1);
    while (paletteIndex < 256) {
      palette[paletteIndex * 3] = palette[fallbackIndex * 3];
      palette[paletteIndex * 3 + 1] = palette[fallbackIndex * 3 + 1];
      palette[paletteIndex * 3 + 2] = palette[fallbackIndex * 3 + 2];
      paletteIndex += 1;
    }
    return palette;
  }

  function createPaletteLookup(palette, options = {}) {
    if (!(palette instanceof Uint8Array) || palette.length !== 768) throw new TypeError('palette must contain 256 RGB colors');
    const startIndex = options.transparent ? 1 : 0;
    const lookup = new Uint8Array(HISTOGRAM_SIZE);
    for (let key = 0; key < HISTOGRAM_SIZE; key += 1) {
      const red = ((key >>> 10) & 31) * 8 + 4;
      const green = ((key >>> 5) & 31) * 8 + 4;
      const blue = (key & 31) * 8 + 4;
      lookup[key] = nearestPaletteIndexExact(red, green, blue, palette, startIndex);
    }
    return lookup;
  }

  function mapWithoutDither(rgba, indexed, lookup, transparent) {
    for (let pixel = 0; pixel < indexed.length; pixel += 1) {
      const source = pixel * 4;
      if (transparent && rgba[source + 3] < 128) {
        indexed[pixel] = 0;
        continue;
      }
      indexed[pixel] = lookup[histogramKey(rgba[source], rgba[source + 1], rgba[source + 2])];
    }
  }

  function mapWithErrorDiffusion(rgba, indexed, palette, lookup, width, transparent, strength) {
    const height = Math.ceil(indexed.length / width);
    let current = new Float32Array((width + 2) * 3);
    let next = new Float32Array((width + 2) * 3);
    for (let y = 0; y < height; y += 1) {
      const swap = current;
      current = next;
      next = swap;
      next.fill(0);
      const direction = y % 2 === 0 ? 1 : -1;
      const start = direction === 1 ? 0 : width - 1;
      const end = direction === 1 ? width : -1;
      for (let x = start; x !== end; x += direction) {
        const pixel = y * width + x;
        if (pixel >= indexed.length) break;
        const source = pixel * 4;
        const errorOffset = (x + 1) * 3;
        if (transparent && rgba[source + 3] < 128) {
          indexed[pixel] = 0;
          current[errorOffset] = 0;
          current[errorOffset + 1] = 0;
          current[errorOffset + 2] = 0;
          continue;
        }
        const red = clampByte(rgba[source] + current[errorOffset]);
        const green = clampByte(rgba[source + 1] + current[errorOffset + 1]);
        const blue = clampByte(rgba[source + 2] + current[errorOffset + 2]);
        const paletteIndex = lookup[histogramKey(red, green, blue)];
        indexed[pixel] = paletteIndex;
        const paletteOffset = paletteIndex * 3;
        const errorR = Math.max(-MAX_ERROR, Math.min(MAX_ERROR, red - palette[paletteOffset])) * strength;
        const errorG = Math.max(-MAX_ERROR, Math.min(MAX_ERROR, green - palette[paletteOffset + 1])) * strength;
        const errorB = Math.max(-MAX_ERROR, Math.min(MAX_ERROR, blue - palette[paletteOffset + 2])) * strength;
        const sameRow = errorOffset + direction * 3;
        const nextBack = errorOffset - direction * 3;
        const nextFront = errorOffset + direction * 3;
        current[sameRow] += errorR * 7 / 16;
        current[sameRow + 1] += errorG * 7 / 16;
        current[sameRow + 2] += errorB * 7 / 16;
        next[nextBack] += errorR * 3 / 16;
        next[nextBack + 1] += errorG * 3 / 16;
        next[nextBack + 2] += errorB * 3 / 16;
        next[errorOffset] += errorR * 5 / 16;
        next[errorOffset + 1] += errorG * 5 / 16;
        next[errorOffset + 2] += errorB * 5 / 16;
        next[nextFront] += errorR / 16;
        next[nextFront + 1] += errorG / 16;
        next[nextFront + 2] += errorB / 16;
      }
    }
  }

  function rgbaToIndexed(rgba, options = {}) {
    if (!(rgba instanceof Uint8ClampedArray) && !(rgba instanceof Uint8Array)) throw new TypeError('rgba must be a Uint8Array');
    if (rgba.length % 4 !== 0) throw new RangeError('rgba length must be divisible by 4');
    const transparent = Boolean(options.transparent);
    const palette = options.palette instanceof Uint8Array && options.palette.length === 768 ? options.palette : fixedPalette();
    const lookup = options.lookup instanceof Uint8Array && options.lookup.length === HISTOGRAM_SIZE
      ? options.lookup
      : createPaletteLookup(palette, { transparent });
    const width = Math.max(1, Math.floor(Number(options.width) || (rgba.length / 4)));
    const indexed = new Uint8Array(rgba.length / 4);
    if (options.dither === 'error-diffusion') {
      const strength = Math.max(0, Math.min(1, Number(options.ditherStrength) || DEFAULT_ERROR_STRENGTH));
      mapWithErrorDiffusion(rgba, indexed, palette, lookup, width, transparent, strength);
    } else {
      mapWithoutDither(rgba, indexed, lookup, transparent);
    }
    return indexed;
  }

  class BitWriter {
    constructor() {
      this.bytes = [];
      this.current = 0;
      this.bitCount = 0;
    }

    write(code, width) {
      this.current |= code << this.bitCount;
      this.bitCount += width;
      while (this.bitCount >= 8) {
        this.bytes.push(this.current & 0xff);
        this.current >>>= 8;
        this.bitCount -= 8;
      }
    }

    finish() {
      if (this.bitCount > 0) this.bytes.push(this.current & 0xff);
      return Uint8Array.from(this.bytes);
    }
  }

  function lzwEncode(indices, minimumCodeSize) {
    if (!(indices instanceof Uint8Array) || indices.length === 0) throw new TypeError('indices must be a non-empty Uint8Array');
    const clearCode = 1 << minimumCodeSize;
    const endCode = clearCode + 1;
    const writer = new BitWriter();
    let dictionary;
    let nextCode;
    let codeSize;

    function resetDictionary() {
      dictionary = new Map();
      nextCode = endCode + 1;
      codeSize = minimumCodeSize + 1;
    }

    resetDictionary();
    writer.write(clearCode, codeSize);
    let prefix = indices[0];
    for (let position = 1; position < indices.length; position += 1) {
      const suffix = indices[position];
      const key = prefix * 256 + suffix;
      const found = dictionary.get(key);
      if (found !== undefined) {
        prefix = found;
        continue;
      }
      writer.write(prefix, codeSize);
      if (nextCode < MAX_DICTIONARY_SIZE) {
        dictionary.set(key, nextCode);
        nextCode += 1;
        if (nextCode > (1 << codeSize) && codeSize < 12) codeSize += 1;
      } else {
        writer.write(clearCode, codeSize);
        resetDictionary();
      }
      prefix = suffix;
    }
    writer.write(prefix, codeSize);
    writer.write(endCode, codeSize);
    return writer.finish();
  }

  function appendSubBlocks(bytes, data) {
    for (let offset = 0; offset < data.length; offset += 255) {
      const length = Math.min(255, data.length - offset);
      bytes.push(length);
      for (let index = 0; index < length; index += 1) bytes.push(data[offset + index]);
    }
    bytes.push(0);
  }

  function encodeIndexedFrames(options) {
    const width = Number(options.width);
    const height = Number(options.height);
    const delay = Math.max(1, Math.min(65535, Number(options.delay) || 10));
    const transparent = Boolean(options.transparent);
    const frames = options.frames;
    const palette = options.palette instanceof Uint8Array && options.palette.length === 768 ? options.palette : fixedPalette();

    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096) {
      throw new RangeError('invalid GIF dimensions');
    }
    if (!Array.isArray(frames) || frames.length < 1) throw new RangeError('at least one frame is required');

    const pixelCount = width * height;
    const bytes = [];
    for (const character of 'GIF89a') bytes.push(character.charCodeAt(0));
    writeU16(bytes, width);
    writeU16(bytes, height);
    bytes.push(0xf7, 0, 0);
    bytes.push(...palette);

    bytes.push(0x21, 0xff, 0x0b);
    for (const character of 'NETSCAPE2.0') bytes.push(character.charCodeAt(0));
    bytes.push(0x03, 0x01, 0x00, 0x00, 0x00);

    for (const frame of frames) {
      if (!(frame instanceof Uint8Array) || frame.length !== pixelCount) throw new RangeError('frame size does not match GIF dimensions');
      const packed = transparent ? 0x09 : 0x04;
      bytes.push(0x21, 0xf9, 0x04, packed);
      writeU16(bytes, delay);
      bytes.push(0x00, 0x00);
      bytes.push(0x2c);
      writeU16(bytes, 0);
      writeU16(bytes, 0);
      writeU16(bytes, width);
      writeU16(bytes, height);
      bytes.push(0x00);
      bytes.push(0x08);
      appendSubBlocks(bytes, lzwEncode(frame, 8));
    }
    bytes.push(0x3b);
    return Uint8Array.from(bytes);
  }

  const api = Object.freeze({
    fixedPalette,
    createColorHistogram,
    addRgbaToHistogram,
    paletteFromHistogram,
    createPaletteLookup,
    rgbaToIndexed,
    encodeIndexedFrames,
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  globalScope.ImageMotionGif = api;
}(typeof self !== 'undefined' ? self : globalThis));
