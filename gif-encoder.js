(function attachGifEncoder(globalScope) {
  'use strict';

  const MAX_DICTIONARY_SIZE = 4096;

  function writeU16(bytes, value) {
    bytes.push(value & 0xff, (value >>> 8) & 0xff);
  }

  function makePalette() {
    const palette = new Uint8Array(256 * 3);
    palette[0] = 0;
    palette[1] = 0;
    palette[2] = 0;
    for (let index = 1; index < 256; index += 1) {
      const red = (index >>> 5) & 0x07;
      const green = (index >>> 2) & 0x07;
      const blue = index & 0x03;
      palette[index * 3] = Math.round((red / 7) * 255);
      palette[index * 3 + 1] = Math.round((green / 7) * 255);
      palette[index * 3 + 2] = Math.round((blue / 3) * 255);
    }
    return palette;
  }

  function rgbaToIndexed(rgba, transparent) {
    if (!(rgba instanceof Uint8ClampedArray) && !(rgba instanceof Uint8Array)) {
      throw new TypeError('rgba must be a Uint8Array');
    }
    if (rgba.length % 4 !== 0) {
      throw new RangeError('rgba length must be divisible by 4');
    }

    const indexed = new Uint8Array(rgba.length / 4);
    for (let source = 0, target = 0; source < rgba.length; source += 4, target += 1) {
      if (transparent && rgba[source + 3] < 128) {
        indexed[target] = 0;
        continue;
      }
      let color = (rgba[source] & 0xe0) | ((rgba[source + 1] & 0xe0) >>> 3) | ((rgba[source + 2] & 0xc0) >>> 6);
      if (color === 0) {
        color = 1;
      }
      indexed[target] = color;
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
      if (this.bitCount > 0) {
        this.bytes.push(this.current & 0xff);
      }
      return Uint8Array.from(this.bytes);
    }
  }

  function lzwEncode(indices, minimumCodeSize) {
    if (!(indices instanceof Uint8Array) || indices.length === 0) {
      throw new TypeError('indices must be a non-empty Uint8Array');
    }

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
        if (nextCode === (1 << codeSize) && codeSize < 12) {
          codeSize += 1;
        }
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
      for (let index = 0; index < length; index += 1) {
        bytes.push(data[offset + index]);
      }
    }
    bytes.push(0);
  }

  function encodeIndexedFrames(options) {
    const width = Number(options.width);
    const height = Number(options.height);
    const delay = Math.max(1, Math.min(65535, Number(options.delay) || 10));
    const transparent = Boolean(options.transparent);
    const frames = options.frames;

    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096) {
      throw new RangeError('invalid GIF dimensions');
    }
    if (!Array.isArray(frames) || frames.length < 1) {
      throw new RangeError('at least one frame is required');
    }

    const pixelCount = width * height;
    const bytes = [];
    for (const character of 'GIF89a') {
      bytes.push(character.charCodeAt(0));
    }
    writeU16(bytes, width);
    writeU16(bytes, height);
    bytes.push(0xf7, 0, 0);
    bytes.push(...makePalette());

    bytes.push(0x21, 0xff, 0x0b);
    for (const character of 'NETSCAPE2.0') {
      bytes.push(character.charCodeAt(0));
    }
    bytes.push(0x03, 0x01, 0x00, 0x00, 0x00);

    for (const frame of frames) {
      if (!(frame instanceof Uint8Array) || frame.length !== pixelCount) {
        throw new RangeError('frame size does not match GIF dimensions');
      }
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
    encodeIndexedFrames,
    rgbaToIndexed,
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  globalScope.ImageMotionGif = api;
}(typeof self !== 'undefined' ? self : globalThis));
