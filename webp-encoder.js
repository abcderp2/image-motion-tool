(function attachImageMotionWebp(globalScope) {
  'use strict';

  const MAX_FRAMES = 4096;
  const MAX_DIMENSION = 8192;
  const MAX_TOTAL_PIXELS = 24_000_000;
  const MAX_INPUT_BYTES = 32 * 1024 * 1024;
  const MAX_DURATION_MS = 0xffffff;

  function fail(message) {
    throw new Error(`アニメーションWebPが不正です。${message}`);
  }

  function asBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    fail('フレームデータを読み込めません。');
  }

  function readU16LE(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  function readU24LE(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
  }

  function readU32LE(bytes, offset) {
    return (
      bytes[offset]
      | (bytes[offset + 1] << 8)
      | (bytes[offset + 2] << 16)
      | (bytes[offset + 3] << 24)
    ) >>> 0;
  }

  function writeU16LE(bytes, offset, value) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
  }

  function writeU24LE(bytes, offset, value) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
    bytes[offset + 2] = (value >>> 16) & 0xff;
  }

  function writeU32LE(bytes, offset, value) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
    bytes[offset + 2] = (value >>> 16) & 0xff;
    bytes[offset + 3] = (value >>> 24) & 0xff;
  }

  function ascii(value) {
    return Uint8Array.from(value, (character) => character.charCodeAt(0));
  }

  function readAscii(bytes, offset) {
    return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
  }

  function validFourCc(bytes, offset) {
    for (let index = 0; index < 4; index += 1) {
      const value = bytes[offset + index];
      if (value < 0x20 || value > 0x7e) return false;
    }
    return true;
  }

  function makeChunk(type, data) {
    const typeData = ascii(type);
    const paddedLength = data.length + (data.length & 1);
    const result = new Uint8Array(paddedLength + 8);
    writeU32LE(result, 0, data.length);
    result.set(typeData, 4);
    result.set(data, 8);
    return result;
  }

  function concatenate(parts, totalLength) {
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }

  function parseChunkList(bytes, start, end, context) {
    const chunks = [];
    let offset = start;
    while (offset < end) {
      if (end - offset < 8) fail(`${context}のチャンクヘッダーが途中で終わっています。`);
      if (!validFourCc(bytes, offset + 4)) fail(`${context}のチャンク名が不正です。`);
      const type = readAscii(bytes, offset + 4);
      const size = readU32LE(bytes, offset);
      const dataStart = offset + 8;
      if (size > end - dataStart) fail(`${context}のチャンク長が不正です。`);
      const dataEnd = dataStart + size;
      const next = dataEnd + (size & 1);
      if (next > end) fail(`${context}のパディングが途中で終わっています。`);
      chunks.push(Object.freeze({ type, size, data: bytes.slice(dataStart, dataEnd) }));
      offset = next;
    }
    if (offset !== end) fail(`${context}の末尾が不正です。`);
    return chunks;
  }

  function parseRiff(bytes) {
    if (bytes.length > MAX_INPUT_BYTES) fail('入力が大きすぎます。');
    if (bytes.length < 20 || readAscii(bytes, 0) !== 'RIFF' || readAscii(bytes, 8) !== 'WEBP') {
      fail('RIFF/WEBPヘッダーがありません。');
    }
    if (readU32LE(bytes, 4) !== bytes.length - 8) fail('RIFFのファイル長が一致しません。');
    return parseChunkList(bytes, 12, bytes.length, 'RIFF');
  }

  function parseVp8lDimensions(data) {
    if (data.length < 5 || data[0] !== 0x2f) fail('VP8Lデータが短いか不正です。');
    const width = 1 + (data[1] | ((data[2] & 0x3f) << 8));
    const height = 1 + ((data[2] >>> 6) | (data[3] << 2) | ((data[4] & 0x0f) << 10));
    return { width, height };
  }

  function parseVp8Dimensions(data) {
    if (data.length < 10 || data[3] !== 0x9d || data[4] !== 0x01 || data[5] !== 0x2a) {
      fail('VP8データが短いか不正です。');
    }
    return {
      width: readU16LE(data, 6) & 0x3fff,
      height: readU16LE(data, 8) & 0x3fff,
    };
  }

  function inspectWebpFrame(value, options = {}) {
    const bytes = asBytes(value);
    const maxDimension = Number.isInteger(options.maxDimension) ? options.maxDimension : MAX_DIMENSION;
    const chunks = parseRiff(bytes);
    let extendedHeader = null;
    let alphaChunk = null;
    let bitstream = null;
    let bitstreamType = '';
    for (const item of chunks) {
      if (item.type === 'VP8X') {
        if (item.size !== 10 || extendedHeader) fail('VP8Xチャンクの長さまたは数が不正です。');
        if ((item.data[0] & 0xc1) !== 0) fail('VP8Xの予約ビットが不正です。');
        if (item.data[0] & 0x02) fail('入力フレームが既にアニメーションです。');
        extendedHeader = {
          flags: item.data[0],
          width: readU24LE(item.data, 4) + 1,
          height: readU24LE(item.data, 7) + 1,
        };
      } else if (item.type === 'ALPH') {
        if (alphaChunk) fail('ALPHチャンクが重複しています。');
        alphaChunk = item;
      } else if (item.type === 'VP8 ' || item.type === 'VP8L') {
        if (bitstream) fail('画像ビットストリームが重複しています。');
        bitstream = item;
        bitstreamType = item.type;
      } else if (item.type === 'ANIM' || item.type === 'ANMF') {
        fail('入力フレームが既にアニメーションです。');
      }
    }
    if (!bitstream) fail('VP8またはVP8Lビットストリームがありません。');
    const dimensions = bitstreamType === 'VP8L'
      ? parseVp8lDimensions(bitstream.data)
      : parseVp8Dimensions(bitstream.data);
    if (!dimensions.width || !dimensions.height || dimensions.width > maxDimension || dimensions.height > maxDimension) {
      fail('フレーム寸法が安全な範囲外です。');
    }
    if (extendedHeader && (extendedHeader.width !== dimensions.width || extendedHeader.height !== dimensions.height)) {
      fail('VP8Xとビットストリームの寸法が一致しません。');
    }
    if (alphaChunk && !extendedHeader) fail('ALPHにはVP8Xが必要です。');
    const hasAlpha = Boolean(alphaChunk || (extendedHeader && (extendedHeader.flags & 0x10)));
    const frameData = [];
    if (alphaChunk) frameData.push(makeChunk('ALPH', alphaChunk.data));
    frameData.push(makeChunk(bitstreamType, bitstream.data));
    return Object.freeze({
      width: dimensions.width,
      height: dimensions.height,
      hasAlpha,
      lossless: bitstreamType === 'VP8L',
      bitstreamType,
      frameData: Object.freeze(frameData),
    });
  }

  function frameHeader(width, height, durationMs) {
    const data = new Uint8Array(16);
    writeU24LE(data, 0, 0);
    writeU24LE(data, 3, 0);
    writeU24LE(data, 6, width - 1);
    writeU24LE(data, 9, height - 1);
    writeU24LE(data, 12, durationMs);
    data[15] = 0x03;
    return data;
  }

  function animatedHeader(width, height, hasAlpha) {
    const data = new Uint8Array(10);
    data[0] = 0x02 | (hasAlpha ? 0x10 : 0);
    writeU24LE(data, 4, width - 1);
    writeU24LE(data, 7, height - 1);
    return data;
  }

  function animationControl(backgroundColor, loopCount) {
    const data = new Uint8Array(6);
    writeU32LE(data, 0, backgroundColor >>> 0);
    writeU16LE(data, 4, loopCount);
    return data;
  }

  function encodeAnimatedWebp(values, options = {}) {
    if (!Array.isArray(values) || values.length < 1 || values.length > MAX_FRAMES) {
      fail(`フレーム数は1〜${MAX_FRAMES}にしてください。`);
    }
    const frames = values.map((value) => inspectWebpFrame(value, options));
    const width = frames[0].width;
    const height = frames[0].height;
    const totalPixels = width * height * frames.length;
    const maxTotalPixels = Number.isSafeInteger(options.maxTotalPixels) ? options.maxTotalPixels : MAX_TOTAL_PIXELS;
    if (!Number.isSafeInteger(totalPixels) || totalPixels > maxTotalPixels) fail('総展開画素数が安全な範囲を超えています。');
    for (const frame of frames) {
      if (frame.width !== width || frame.height !== height) fail('フレームの画像寸法が一致しません。');
    }
    const durationMs = Number(options.durationMs);
    const loopCount = Number.isInteger(options.loopCount) ? options.loopCount : 0;
    const backgroundColor = Number.isInteger(options.backgroundColor) ? options.backgroundColor : 0;
    if (!Number.isInteger(durationMs) || durationMs < 1 || durationMs > MAX_DURATION_MS) fail('フレーム間隔が不正です。');
    if (!Number.isInteger(loopCount) || loopCount < 0 || loopCount > 65535) fail('ループ回数が不正です。');
    if (!Number.isInteger(backgroundColor) || backgroundColor < 0 || backgroundColor > 0xffffffff) fail('背景色が不正です。');

    const hasAlpha = frames.some((frame) => frame.hasAlpha);
    const parts = [
      Uint8Array.from([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]),
      makeChunk('VP8X', animatedHeader(width, height, hasAlpha)),
      makeChunk('ANIM', animationControl(backgroundColor, loopCount)),
    ];
    for (const frame of frames) {
      const frameDataLength = frame.frameData.reduce((sum, item) => sum + item.length, 0);
      const payload = new Uint8Array(16 + frameDataLength);
      payload.set(frameHeader(width, height, durationMs), 0);
      let offset = 16;
      for (const item of frame.frameData) {
        payload.set(item, offset);
        offset += item.length;
      }
      parts.push(makeChunk('ANMF', payload));
    }
    const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
    const maxOutputBytes = Number.isSafeInteger(options.maxOutputBytes) ? options.maxOutputBytes : Number.MAX_SAFE_INTEGER;
    if (!Number.isSafeInteger(totalLength) || totalLength > maxOutputBytes) fail('生成予定のアニメーションWebPが大きすぎます。');
    const result = concatenate(parts, totalLength);
    writeU32LE(result, 4, totalLength - 8);
    return result;
  }

  function inspectAnimatedWebp(value, options = {}) {
    const bytes = asBytes(value);
    const chunks = parseRiff(bytes);
    const header = chunks.find((item) => item.type === 'VP8X');
    const animation = chunks.find((item) => item.type === 'ANIM');
    const frameChunks = chunks.filter((item) => item.type === 'ANMF');
    if (!header || header.size !== 10 || !(header.data[0] & 0x02)) fail('アニメーション用VP8Xがありません。');
    if (!animation || animation.size !== 6) fail('ANIMチャンクがありません。');
    if (!frameChunks.length || frameChunks.length > MAX_FRAMES) fail('ANMFフレーム数が不正です。');
    if ((header.data[0] & 0xc1) !== 0) fail('VP8Xの予約ビットが不正です。');
    const width = readU24LE(header.data, 4) + 1;
    const height = readU24LE(header.data, 7) + 1;
    const maxDimension = Number.isInteger(options.maxDimension) ? options.maxDimension : MAX_DIMENSION;
    if (width > maxDimension || height > maxDimension) fail('キャンバス寸法が安全な範囲外です。');
    const durations = [];
    let hasAlpha = false;
    for (const frame of frameChunks) {
      if (frame.size < 16) fail('ANMFヘッダーが短すぎます。');
      const frameWidth = readU24LE(frame.data, 6) + 1;
      const frameHeight = readU24LE(frame.data, 9) + 1;
      const frameX = readU24LE(frame.data, 0) * 2;
      const frameY = readU24LE(frame.data, 3) * 2;
      const duration = readU24LE(frame.data, 12);
      if (!duration || frameX + frameWidth > width || frameY + frameHeight > height) fail('ANMFの寸法または表示時間が不正です。');
      if (frame.data[15] & 0xfc) fail('ANMFの予約ビットが不正です。');
      const subchunks = parseChunkList(frame.data, 16, frame.data.length, 'ANMF');
      let bitstreamCount = 0;
      let frameAlpha = false;
      let alphaCount = 0;
      let bitstreamInfo = null;
      for (const subchunk of subchunks) {
        if (subchunk.type === 'ALPH') {
          frameAlpha = true;
          alphaCount += 1;
        }
        if (subchunk.type === 'VP8 ' || subchunk.type === 'VP8L') {
          bitstreamCount += 1;
          bitstreamInfo = subchunk.type === 'VP8L'
            ? parseVp8lDimensions(subchunk.data)
            : parseVp8Dimensions(subchunk.data);
        }
      }
      if (bitstreamCount !== 1) fail('ANMFの画像ビットストリームが不正です。');
      if (alphaCount > 1 || (frameAlpha && subchunks.some((item) => item.type === 'VP8L'))) fail('ANMFの透過チャンクが不正です。');
      if (bitstreamInfo.width !== frameWidth || bitstreamInfo.height !== frameHeight) fail('ANMFと画像ビットストリームの寸法が一致しません。');
      if (frameAlpha) hasAlpha = true;
      durations.push(duration);
    }
    const totalPixels = width * height * frameChunks.length;
    const maxTotalPixels = Number.isSafeInteger(options.maxTotalPixels) ? options.maxTotalPixels : MAX_TOTAL_PIXELS;
    if (!Number.isSafeInteger(totalPixels) || totalPixels > maxTotalPixels) fail('総展開画素数が安全な範囲を超えています。');
    return Object.freeze({
      width,
      height,
      frames: frameChunks.length,
      durations: Object.freeze(durations),
      loopCount: readU16LE(animation.data, 4),
      hasAlpha: hasAlpha || Boolean(header.data[0] & 0x10),
      lossless: frameChunks.every((frame) => parseChunkList(frame.data, 16, frame.data.length, 'ANMF').some((item) => item.type === 'VP8L')),
    });
  }

  const api = Object.freeze({
    MAX_FRAMES,
    MAX_DIMENSION,
    MAX_DURATION_MS,
    inspectWebpFrame,
    encodeAnimatedWebp,
    inspectAnimatedWebp,
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  globalScope.ImageMotionWebp = api;
}(typeof self !== 'undefined' ? self : globalThis));
