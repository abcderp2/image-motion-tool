(function attachGifEncoder(globalScope) {
  'use strict';

  const MAX_DICTIONARY_SIZE = 4096;
  const HISTOGRAM_SIZE = 32 * 32 * 32;
  const BAYER_4X4 = new Int8Array([
    -8, 0, -6, 2,
    4, -4, 6, -2,
    -5, 3, -7, 1,
    7, -1, 5, -3,
  ]);

  function clampByte(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function writeU16(bytes, value) {
    bytes.push(value & 0xff, (value >>> 8) & 0xff);
  }

  function fixedPalette() {
    const palette = new Uint8Array(256 * 3);
    for (let index = 0; index < 256; index += 1) {
      const red = (index >>> 5) & 0x07;
      const green = (index >>> 2) & 0x07;
      const blue = index & 0x03;
      palette[index * 3] = Math.round((red / 7) * 255);
      palette[index * 3 + 1] = Math.round((green / 7) * 255);
      palette[index * 3 + 2] = Math.round((blue / 3) * 255);
    }
    return palette;
  }

  function createColorHistogram() {
    return {
      counts: new Uint32Array(HISTOGRAM_SIZE),
      reds: new Uint32Array(HISTOGRAM_SIZE),
      greens: new Uint32Array(HISTOGRAM_SIZE),
      blues: new Uint32Array(HISTOGRAM_SIZE),
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
      if (transparent && rgba[source + 3] < 128) continue;
      const red = rgba[source];
      const green = rgba[source + 1];
      const blue = rgba[source + 2];
      const key = histogramKey(red, green, blue);
      histogram.counts[key] += 1;
      histogram.reds[key] += red;
      histogram.greens[key] += green;
      histogram.blues[key] += blue;
      histogram.samples += 1;
    }
    return histogram;
  }

  function boxStats(colors) {
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
    return { colors, count, rangeR, rangeG, rangeB, channel, score: Math.max(rangeR, rangeG, rangeB) * Math.sqrt(count || 1) };
  }

  function splitBox(box) {
    if (box.colors.length < 2) return [box];
    const colors = box.colors.slice().sort((left, right) => left[box.channel] - right[box.channel]);
    const target = box.count / 2;
    let running = 0;
    let splitIndex = 1;
    for (; splitIndex < colors.length; splitIndex += 1) {
      running += colors[splitIndex - 1].count;
      if (running >= target) break;
    }
    return [boxStats(colors.slice(0, splitIndex)), boxStats(colors.slice(splitIndex))];
  }

  function paletteFromHistogram(histogram, options = {}) {
    if (!histogram || !(histogram.counts instanceof Uint32Array)) throw new TypeError('invalid histogram');
    const transparent = Boolean(options.transparent);
    const requestedColors = Math.max(2, Math.min(256 - (transparent ? 1 : 0), Math.floor(Number(options.maxColors) || 255)));
    const colors = [];
    for (let key = 0; key < HISTOGRAM_SIZE; key += 1) {
      const count = histogram.counts[key];
      if (!count) continue;
      colors.push({
        r: Math.round(histogram.reds[key] / count),
        g: Math.round(histogram.greens[key] / count),
        b: Math.round(histogram.blues[key] / count),
        count,
      });
    }
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
    let paletteIndex = transparent ? 1 : 0;
    if (transparent) {
      palette[0] = 0;
      palette[1] = 0;
      palette[2] = 0;
    }
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
    const fallbackIndex = Math.max(transparent ? 1 : 0, paletteIndex - 1);
    while (paletteIndex < 256) {
      palette[paletteIndex * 3] = palette[fallbackIndex * 3];
      palette[paletteIndex * 3 + 1] = palette[fallbackIndex * 3 + 1];
      palette[paletteIndex * 3 + 2] = palette[fallbackIndex * 3 + 2];
      paletteIndex += 1;
    }
    return palette;
  }

  function nearestPaletteIndex(red, green, blue, palette, startIndex, cache) {
    const key = histogramKey(red, green, blue);
    const cached = cache[key];
    if (cached >= 0) return cached;
    let bestIndex = startIndex;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = startIndex; index < 256; index += 1) {
      const offset = index * 3;
      const deltaR = red - palette[offset];
      const deltaG = green - palette[offset + 1];
      const deltaB = blue - palette[offset + 2];
      const distance = deltaR * deltaR * 2 + deltaG * deltaG * 4 + deltaB * deltaB;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
        if (distance === 0) break;
      }
    }
    cache[key] = bestIndex;
    return bestIndex;
  }

  function rgbaToIndexed(rgba, options = {}) {
    if (!(rgba instanceof Uint8ClampedArray) && !(rgba instanceof Uint8Array)) throw new TypeError('rgba must be a Uint8Array');
    if (rgba.length % 4 !== 0) throw new RangeError('rgba length must be divisible by 4');
    const transparent = Boolean(options.transparent);
    const palette = options.palette instanceof Uint8Array && options.palette.length === 768 ? options.palette : fixedPalette();
    const width = Math.max(1, Math.floor(Number(options.width) || (rgba.length / 4)));
    const dither = options.dither === 'ordered';
    const indexed = new Uint8Array(rgba.length / 4);
    const cache = new Int16Array(HISTOGRAM_SIZE);
    cache.fill(-1);
    const startIndex = transparent ? 1 : 0;

    for (let pixel = 0; pixel < indexed.length; pixel += 1) {
      const source = pixel * 4;
      if (transparent && rgba[source + 3] < 128) {
        indexed[pixel] = 0;
        continue;
      }
      let red = rgba[source];
      let green = rgba[source + 1];
      let blue = rgba[source + 2];
      if (dither) {
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        const adjustment = BAYER_4X4[(y & 3) * 4 + (x & 3)] * 2;
        red = clampByte(red + adjustment);
        green = clampByte(green + adjustment);
        blue = clampByte(blue + adjustment);
      }
      indexed[pixel] = nearestPaletteIndex(red, green, blue, palette, startIndex, cache);
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
        if (nextCode === (1 << codeSize) && codeSize < 12) codeSize += 1;
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
      const packed = transparent ? 0x05 : 0x04;
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
    rgbaToIndexed,
    encodeIndexedFrames,
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  globalScope.ImageMotionGif = api;
}(typeof self !== 'undefined' ? self : globalThis));
