(function attachImageMotionApng(globalScope) {
  'use strict';

  const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const MAX_CHUNK_PAYLOAD = 1024 * 1024;
  const MAX_FRAMES = 4096;
  const MAX_DIMENSION = 8192;
  const MAX_TOTAL_PIXELS = 24_000_000;
  const APNG_DISPOSE_OP_NONE = 0;
  const APNG_BLEND_OP_SOURCE = 0;
  const CRC_TABLE = new Uint32Array(256);

  for (let index = 0; index < CRC_TABLE.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    }
    CRC_TABLE[index] = value >>> 0;
  }

  function fail(message) {
    throw new Error(`APNGデータが不正です。${message}`);
  }

  function asBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    fail('フレームデータを読み込めません。');
  }

  function readU32(bytes, offset) {
    return (
      bytes[offset] * 0x1000000
      + bytes[offset + 1] * 0x10000
      + bytes[offset + 2] * 0x100
      + bytes[offset + 3]
    );
  }

  function readU16(bytes, offset) {
    return bytes[offset] * 0x100 + bytes[offset + 1];
  }

  function writeU16(bytes, offset, value) {
    bytes[offset] = (value >>> 8) & 0xff;
    bytes[offset + 1] = value & 0xff;
  }

  function writeU32(bytes, offset, value) {
    bytes[offset] = (value >>> 24) & 0xff;
    bytes[offset + 1] = (value >>> 16) & 0xff;
    bytes[offset + 2] = (value >>> 8) & 0xff;
    bytes[offset + 3] = value & 0xff;
  }

  function typeBytes(type) {
    return Uint8Array.from(type, (character) => character.charCodeAt(0));
  }

  function isChunkType(bytes, offset) {
    for (let index = 0; index < 4; index += 1) {
      const value = bytes[offset + index];
      if (!((value >= 65 && value <= 90) || (value >= 97 && value <= 122))) return false;
    }
    return true;
  }

  function readType(bytes, offset) {
    return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
  }

  function crc32(type, data) {
    let value = 0xffffffff;
    for (const byte of type) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
    for (const byte of data) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
    return (value ^ 0xffffffff) >>> 0;
  }

  function chunk(type, data) {
    const typeData = typeBytes(type);
    const result = new Uint8Array(data.length + 12);
    writeU32(result, 0, data.length);
    result.set(typeData, 4);
    result.set(data, 8);
    writeU32(result, data.length + 8, crc32(typeData, data));
    return result;
  }

  function concat(parts, totalLength) {
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }

  function inspectIhdr(data, maxDimension) {
    if (data.length !== 13) fail('IHDRの長さが不正です。');
    const width = readU32(data, 0);
    const height = readU32(data, 4);
    if (!width || !height || width > maxDimension || height > maxDimension) fail('画像寸法が安全な範囲外です。');
    if (data[8] !== 8 || data[9] !== 6 || data[10] !== 0 || data[11] !== 0 || data[12] !== 0) {
      fail('8ビットRGBAのPNGだけを扱えます。');
    }
    return Object.freeze({ width, height });
  }

  function parsePng(value, options = {}) {
    const bytes = asBytes(value);
    const maxDimension = Number.isInteger(options.maxDimension) ? options.maxDimension : MAX_DIMENSION;
    if (bytes.length < 33) fail('ファイルが短すぎます。');
    if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) fail('PNGシグネチャがありません。');

    let offset = PNG_SIGNATURE.length;
    let chunkIndex = 0;
    let sawIhdr = false;
    let sawIdat = false;
    let sawIend = false;
    let ihdr = null;
    const idatChunks = [];
    let idatBytes = 0;

    while (offset < bytes.length) {
      if (bytes.length - offset < 12) fail('チャンクヘッダーが途中で終わっています。');
      const length = readU32(bytes, offset);
      if (length > 0x7fffffff || length > bytes.length - offset - 12) fail('チャンク長が不正です。');
      const typeOffset = offset + 4;
      if (!isChunkType(bytes, typeOffset)) fail('チャンク名が不正です。');
      const type = readType(bytes, typeOffset);
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      const data = bytes.subarray(dataStart, dataEnd);
      const expectedCrc = readU32(bytes, dataEnd);
      const actualCrc = crc32(bytes.subarray(typeOffset, typeOffset + 4), data);
      if (expectedCrc !== actualCrc) fail(`CRCが不正です（${type}）。`);

      if (chunkIndex === 0 && type !== 'IHDR') fail('IHDRが先頭にありません。');
      if (type === 'IHDR') {
        if (sawIhdr) fail('IHDRの長さが不正です。');
        inspectIhdr(data, maxDimension);
        ihdr = data;
        sawIhdr = true;
      } else if (type === 'IDAT') {
        if (!sawIhdr || sawIend || length === 0) fail('IDATの位置または長さが不正です。');
        sawIdat = true;
        idatBytes += data.length;
        if (idatBytes > 0x7fffffff) fail('画像データが大きすぎます。');
        idatChunks.push(data);
      } else if (type === 'IEND') {
        if (length !== 0 || !sawIhdr || !sawIdat || sawIend) fail('IENDの位置または長さが不正です。');
        sawIend = true;
      } else {
        const isCritical = bytes[typeOffset] >= 65 && bytes[typeOffset] <= 90;
        if (isCritical && type !== 'PLTE') fail(`未対応の重要チャンクがあります（${type}）。`);
      }

      offset = dataEnd + 4;
      chunkIndex += 1;
      if (sawIend) {
        if (offset !== bytes.length) fail('IENDの後ろにデータがあります。');
        break;
      }
    }

    if (!sawIhdr || !sawIdat || !sawIend || !ihdr) fail('必要なPNGチャンクがありません。');
    return Object.freeze({
      width: readU32(ihdr, 0),
      height: readU32(ihdr, 4),
      bitDepth: ihdr[8],
      colorType: ihdr[9],
      ihdr,
      idatChunks: Object.freeze(idatChunks),
      idatBytes,
    });
  }

  function inspectApng(value, options = {}) {
    const bytes = asBytes(value);
    const maxDimension = Number.isInteger(options.maxDimension) ? options.maxDimension : MAX_DIMENSION;
    if (bytes.length < 57) fail('APNGファイルが短すぎます。');
    if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) fail('PNGシグネチャがありません。');

    let offset = PNG_SIGNATURE.length;
    let chunkIndex = 0;
    let sawIhdr = false;
    let sawAnimationControl = false;
    let sawFirstFrameData = false;
    let sawIend = false;
    let width = 0;
    let height = 0;
    let declaredFrameCount = 0;
    let numPlays = 0;
    let expectedSequence = 0;
    let currentFrame = null;
    const frames = [];

    while (offset < bytes.length) {
      if (bytes.length - offset < 12) fail('チャンクヘッダーが途中で終わっています。');
      const length = readU32(bytes, offset);
      if (length > 0x7fffffff || length > bytes.length - offset - 12) fail('チャンク長が不正です。');
      const typeOffset = offset + 4;
      if (!isChunkType(bytes, typeOffset)) fail('チャンク名が不正です。');
      const type = readType(bytes, typeOffset);
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      const data = bytes.subarray(dataStart, dataEnd);
      const expectedCrc = readU32(bytes, dataEnd);
      const actualCrc = crc32(bytes.subarray(typeOffset, typeOffset + 4), data);
      if (expectedCrc !== actualCrc) fail(`CRCが不正です（${type}）。`);

      if (chunkIndex === 0 && type !== 'IHDR') fail('IHDRが先頭にありません。');
      if (type === 'IHDR') {
        if (sawIhdr) fail('IHDRが重複しています。');
        const ihdr = inspectIhdr(data, maxDimension);
        width = ihdr.width;
        height = ihdr.height;
        sawIhdr = true;
      } else if (type === 'acTL') {
        if (!sawIhdr || sawAnimationControl || sawFirstFrameData || frames.length !== 0 || length !== 8) {
          fail('acTLの位置または長さが不正です。');
        }
        declaredFrameCount = readU32(data, 0);
        numPlays = readU32(data, 4);
        if (!declaredFrameCount || declaredFrameCount > MAX_FRAMES) fail('APNGのフレーム数が不正です。');
        sawAnimationControl = true;
      } else if (type === 'fcTL') {
        if (!sawAnimationControl || sawIend || length !== 26) fail('fcTLの位置または長さが不正です。');
        if (frames.length === 0 ? sawFirstFrameData : !sawFirstFrameData) fail('fcTLの順序が不正です。');
        if (currentFrame && currentFrame.dataChunks === 0) fail('フレーム画像データがありません。');
        if (frames.length >= declaredFrameCount) fail('fcTLの数が多すぎます。');
        if (readU32(data, 0) !== expectedSequence) fail('APNGのフレーム順序が不正です。');
        expectedSequence += 1;
        const frameWidth = readU32(data, 4);
        const frameHeight = readU32(data, 8);
        if (frameWidth !== width || frameHeight !== height || readU32(data, 12) !== 0 || readU32(data, 16) !== 0) {
          fail('APNGフレームの寸法または位置が不正です。');
        }
        const delayNumerator = readU16(data, 20);
        const delayDenominator = readU16(data, 22);
        if (!delayNumerator || !delayDenominator) fail('APNGの表示時間が不正です。');
        if (data[24] !== APNG_DISPOSE_OP_NONE || data[25] !== APNG_BLEND_OP_SOURCE) {
          fail('APNGフレームの合成方式が不正です。');
        }
        currentFrame = { delayNumerator, delayDenominator, dataChunks: 0 };
        frames.push(currentFrame);
      } else if (type === 'IDAT') {
        if (!sawAnimationControl || !currentFrame || frames.length !== 1 || sawIend || length === 0) {
          fail('IDATの位置または長さが不正です。');
        }
        sawFirstFrameData = true;
        currentFrame.dataChunks += 1;
      } else if (type === 'fdAT') {
        if (!sawAnimationControl || !currentFrame || frames.length < 2 || !sawFirstFrameData || sawIend || length <= 4) {
          fail('fdATの位置または長さが不正です。');
        }
        if (readU32(data, 0) !== expectedSequence) fail('APNGのフレーム順序が不正です。');
        expectedSequence += 1;
        currentFrame.dataChunks += 1;
      } else if (type === 'IEND') {
        if (length !== 0 || !sawIhdr || !sawAnimationControl || !sawFirstFrameData || !currentFrame || currentFrame.dataChunks === 0 || sawIend) {
          fail('IENDの位置または長さが不正です。');
        }
        if (frames.length !== declaredFrameCount) fail('APNGのフレーム数が一致しません。');
        sawIend = true;
      } else {
        const isCritical = bytes[typeOffset] >= 65 && bytes[typeOffset] <= 90;
        if (isCritical) fail(`未対応の重要チャンクがあります（${type}）。`);
      }

      offset = dataEnd + 4;
      chunkIndex += 1;
      if (sawIend) {
        if (offset !== bytes.length) fail('IENDの後ろにデータがあります。');
        break;
      }
    }

    if (!sawIhdr || !sawAnimationControl || !sawFirstFrameData || !sawIend) fail('必要なAPNGチャンクがありません。');
    return Object.freeze({
      width,
      height,
      frameCount: frames.length,
      numPlays,
      frames: Object.freeze(frames.map((frame) => Object.freeze({
        delayNumerator: frame.delayNumerator,
        delayDenominator: frame.delayDenominator,
      }))),
    });
  }

  function appendFrameData(parts, frame, type, sequence) {
    const chunkLimit = type === 'fdAT' ? MAX_CHUNK_PAYLOAD - 4 : MAX_CHUNK_PAYLOAD;
    for (const idat of frame.idatChunks) {
      for (let offset = 0; offset < idat.length; offset += chunkLimit) {
        const data = idat.subarray(offset, Math.min(idat.length, offset + chunkLimit));
        if (type === 'IDAT') {
          parts.push(chunk('IDAT', data));
        } else {
          const fdAT = new Uint8Array(data.length + 4);
          writeU32(fdAT, 0, sequence.value);
          sequence.value += 1;
          fdAT.set(data, 4);
          parts.push(chunk('fdAT', fdAT));
        }
      }
    }
  }

  function frameControl(sequence, width, height, delayNumerator, delayDenominator) {
    const data = new Uint8Array(26);
    writeU32(data, 0, sequence);
    writeU32(data, 4, width);
    writeU32(data, 8, height);
    writeU32(data, 12, 0);
    writeU32(data, 16, 0);
    writeU16(data, 20, delayNumerator);
    writeU16(data, 22, delayDenominator);
    // Every frame replaces the full canvas. Keeping the completed frame avoids
    // requiring decoders to clear an intermediate canvas before the next frame.
    data[24] = APNG_DISPOSE_OP_NONE;
    data[25] = APNG_BLEND_OP_SOURCE;
    return data;
  }

  function encodeApng(values, options = {}) {
    if (!Array.isArray(values) || values.length < 1 || values.length > MAX_FRAMES) {
      fail(`フレーム数は1〜${MAX_FRAMES}にしてください。`);
    }
    const parsedFrames = values.map((value) => parsePng(value, options));
    const width = parsedFrames[0].width;
    const height = parsedFrames[0].height;
    const totalPixels = width * height * parsedFrames.length;
    const maxTotalPixels = Number.isSafeInteger(options.maxTotalPixels) ? options.maxTotalPixels : MAX_TOTAL_PIXELS;
    if (!Number.isSafeInteger(totalPixels) || totalPixels > maxTotalPixels) fail('総展開画素数が安全な範囲を超えています。');
    for (const frame of parsedFrames) {
      if (frame.width !== width || frame.height !== height) fail('フレームの画像寸法が一致しません。');
    }

    const delayNumerator = Number(options.delayNumerator);
    const delayDenominator = Number(options.delayDenominator);
    const numPlays = Number.isInteger(options.numPlays) ? options.numPlays : 0;
    if (!Number.isInteger(delayNumerator) || delayNumerator < 1 || delayNumerator > 65535) fail('フレーム間隔が不正です。');
    if (!Number.isInteger(delayDenominator) || delayDenominator < 1 || delayDenominator > 65535) fail('時間の分母が不正です。');
    if (!Number.isInteger(numPlays) || numPlays < 0 || numPlays > 65535) fail('ループ回数が不正です。');

    const parts = [PNG_SIGNATURE.slice()];
    const animationControl = new Uint8Array(8);
    writeU32(animationControl, 0, parsedFrames.length);
    writeU32(animationControl, 4, numPlays);
    parts.push(chunk('IHDR', parsedFrames[0].ihdr));
    parts.push(chunk('acTL', animationControl));
    const sequence = { value: 0 };
    for (let index = 0; index < parsedFrames.length; index += 1) {
      const frame = parsedFrames[index];
      parts.push(chunk('fcTL', frameControl(sequence.value, width, height, delayNumerator, delayDenominator)));
      sequence.value += 1;
      appendFrameData(parts, frame, index === 0 ? 'IDAT' : 'fdAT', sequence);
    }
    parts.push(chunk('IEND', new Uint8Array(0)));
    const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
    const maxOutputBytes = Number.isSafeInteger(options.maxOutputBytes) ? options.maxOutputBytes : Number.MAX_SAFE_INTEGER;
    if (totalLength > maxOutputBytes) fail('生成予定のAPNGが大きすぎます。サイズ、長さ、滑らかさを下げてください。');
    return concat(parts, totalLength);
  }

  const api = Object.freeze({
    MAX_FRAMES,
    MAX_DIMENSION,
    parsePng,
    inspectPng: parsePng,
    inspectApng,
    encodeApng,
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  globalScope.ImageMotionApng = api;
}(typeof self !== 'undefined' ? self : globalThis));
