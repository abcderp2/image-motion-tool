(function attachGifRetimer(globalScope) {
  'use strict';

  const MAX_GIF_BYTES = 15 * 1024 * 1024;
  const MAX_DIMENSION = 8192;
  const MAX_FRAME_COUNT = 4096;
  const DEFAULT_FRAME_DELAY = 10;
  const SPEED_MULTIPLIERS = Object.freeze([0.5, 0.75, 1, 1.25, 1.5, 2]);

  function asBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    throw new TypeError('GIFデータはUint8ArrayまたはArrayBufferで指定してください。');
  }

  function readAscii(bytes, offset, length) {
    let result = '';
    for (let index = 0; index < length; index += 1) result += String.fromCharCode(bytes[offset + index] || 0);
    return result;
  }

  function readU16(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  function ensureAvailable(bytes, offset, length, message) {
    if (offset < 0 || length < 0 || offset + length > bytes.length) throw new Error(message);
  }

  function colorTableBytes(packed) {
    if (!(packed & 0x80)) return 0;
    return 3 * (1 << ((packed & 0x07) + 1));
  }

  function skipSubBlocks(bytes, offset) {
    let cursor = offset;
    while (true) {
      ensureAvailable(bytes, cursor, 1, 'GIFのデータブロックが途中で終わっています。');
      const length = bytes[cursor];
      cursor += 1;
      if (length === 0) return cursor;
      ensureAvailable(bytes, cursor, length, 'GIFのデータブロックが壊れています。');
      cursor += length;
    }
  }

  function inspectGif(input) {
    const bytes = asBytes(input);
    if (bytes.length < 14) throw new Error('GIFのヘッダーが途中で終わっています。');
    if (bytes.length > MAX_GIF_BYTES) throw new Error('GIFは15MB以下にしてください。');
    const signature = readAscii(bytes, 0, 6);
    if (signature !== 'GIF87a' && signature !== 'GIF89a') throw new Error('GIFのヘッダーが不正です。');

    const width = readU16(bytes, 6);
    const height = readU16(bytes, 8);
    if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION) {
      throw new Error(`GIFの縦横は${MAX_DIMENSION}px以下にしてください。`);
    }

    const screenPacked = bytes[10];
    let cursor = 13;
    ensureAvailable(bytes, cursor, colorTableBytes(screenPacked), 'GIFの色テーブルが壊れています。');
    cursor += colorTableBytes(screenPacked);

    const delays = [];
    const delayOffsets = [];
    const imageOffsets = [];
    let pendingGraphicControl = null;
    let loopCount = null;
    let hasTransparency = false;
    let trailerOffset = -1;

    while (cursor < bytes.length) {
      const marker = bytes[cursor];
      if (marker === 0x3b) {
        trailerOffset = cursor;
        break;
      }

      if (marker === 0x2c) {
        const imageOffset = cursor;
        ensureAvailable(bytes, cursor, 10, 'GIFの画像記述子が途中で終わっています。');
        const frameWidth = readU16(bytes, cursor + 5);
        const frameHeight = readU16(bytes, cursor + 7);
        if (!frameWidth || !frameHeight || frameWidth > MAX_DIMENSION || frameHeight > MAX_DIMENSION) {
          throw new Error(`GIFフレームの縦横は${MAX_DIMENSION}px以下にしてください。`);
        }
        const imagePacked = bytes[cursor + 9];
        cursor += 10;
        const localTableLength = colorTableBytes(imagePacked);
        ensureAvailable(bytes, cursor, localTableLength, 'GIFのローカル色テーブルが壊れています。');
        cursor += localTableLength;
        ensureAvailable(bytes, cursor, 1, 'GIFのLZW情報がありません。');
        const minimumCodeSize = bytes[cursor];
        if (minimumCodeSize < 2 || minimumCodeSize > 8) throw new Error('GIFのLZW情報に対応していません。');
        cursor = skipSubBlocks(bytes, cursor + 1);

        if (delays.length >= MAX_FRAME_COUNT) throw new Error('GIFのフレーム数が多すぎます。');
        imageOffsets.push(imageOffset);
        delayOffsets.push(pendingGraphicControl ? pendingGraphicControl.delayOffset : null);
        delays.push(pendingGraphicControl ? readU16(bytes, pendingGraphicControl.delayOffset) : null);
        if (pendingGraphicControl?.transparent) hasTransparency = true;
        pendingGraphicControl = null;
        continue;
      }

      if (marker !== 0x21) throw new Error('GIFのブロック形式に対応していません。');
      ensureAvailable(bytes, cursor, 2, 'GIFの拡張ブロックが途中で終わっています。');
      const label = bytes[cursor + 1];

      if (label === 0xf9) {
        ensureAvailable(bytes, cursor, 8, 'GIFの表示時間情報が途中で終わっています。');
        if (bytes[cursor + 2] !== 4 || bytes[cursor + 7] !== 0) throw new Error('GIFの表示時間情報が壊れています。');
        pendingGraphicControl = {
          delayOffset: cursor + 4,
          transparent: Boolean(bytes[cursor + 3] & 1),
        };
        cursor += 8;
        continue;
      }

      if (label === 0xff) {
        ensureAvailable(bytes, cursor, 3, 'GIFのアプリケーション情報が途中で終わっています。');
        const headerLength = bytes[cursor + 2];
        const headerStart = cursor + 3;
        ensureAvailable(bytes, headerStart, headerLength, 'GIFのアプリケーション情報が壊れています。');
        const applicationName = readAscii(bytes, headerStart, headerLength);
        const subBlockStart = headerStart + headerLength;
        if ((applicationName === 'NETSCAPE2.0' || applicationName === 'ANIMEXTS1.0') && bytes[subBlockStart] === 3 && bytes[subBlockStart + 1] === 1) {
          ensureAvailable(bytes, subBlockStart, 5, 'GIFのループ情報が壊れています。');
          loopCount = readU16(bytes, subBlockStart + 2);
        }
        cursor = skipSubBlocks(bytes, subBlockStart);
        continue;
      }

      if (label === 0x01) {
        ensureAvailable(bytes, cursor, 3, 'GIFのテキスト情報が途中で終わっています。');
        const headerLength = bytes[cursor + 2];
        const headerStart = cursor + 3;
        ensureAvailable(bytes, headerStart, headerLength, 'GIFのテキスト情報が壊れています。');
        cursor = skipSubBlocks(bytes, headerStart + headerLength);
        continue;
      }

      cursor = skipSubBlocks(bytes, cursor + 2);
    }

    if (trailerOffset < 0) throw new Error('GIFの終了情報がありません。');
    if (!imageOffsets.length) throw new Error('GIFに画像フレームがありません。');

    return Object.freeze({
      width,
      height,
      frames: imageOffsets.length,
      delays: Object.freeze(delays),
      delayOffsets: Object.freeze(delayOffsets),
      imageOffsets: Object.freeze(imageOffsets),
      loopCount,
      hasTransparency,
      trailerOffset,
      byteLength: bytes.length,
    });
  }

  function normalizeSpeedMultiplier(value) {
    const multiplier = Number(value);
    if (!Number.isFinite(multiplier) || !SPEED_MULTIPLIERS.includes(multiplier)) {
      throw new RangeError('速度倍率を選んでください。');
    }
    return multiplier;
  }

  function scaledDelay(delay, multiplier) {
    const baseDelay = Number.isInteger(delay) ? Math.max(1, delay) : DEFAULT_FRAME_DELAY;
    return Math.max(1, Math.min(65535, Math.round(baseDelay / multiplier)));
  }

  function makeGraphicControlExtension(delay) {
    return Uint8Array.from([
      0x21, 0xf9, 0x04, 0x00,
      delay & 0xff,
      (delay >>> 8) & 0xff,
      0x00,
      0x00,
    ]);
  }

  function concatenate(chunks) {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    if (total > MAX_GIF_BYTES + MAX_FRAME_COUNT * 8) throw new Error('変更後のGIFが大きすぎます。');
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  function retimeGif(input, multiplierValue) {
    const bytes = asBytes(input);
    const info = inspectGif(bytes);
    const multiplier = normalizeSpeedMultiplier(multiplierValue);
    if (info.delayOffsets.every((offset) => offset !== null)) {
      const result = bytes.slice();
      for (let index = 0; index < info.frames; index += 1) {
        const delay = scaledDelay(info.delays[index], multiplier);
        const delayOffset = info.delayOffsets[index];
        result[delayOffset] = delay & 0xff;
        result[delayOffset + 1] = (delay >>> 8) & 0xff;
      }
      return result;
    }

    const chunks = [];
    let cursor = 0;

    for (let index = 0; index < info.frames; index += 1) {
      const imageOffset = info.imageOffsets[index];
      const chunk = bytes.slice(cursor, imageOffset);
      const delay = scaledDelay(info.delays[index], multiplier);
      const delayOffset = info.delayOffsets[index];
      if (delayOffset === null) {
        chunks.push(chunk, makeGraphicControlExtension(delay));
      } else {
        const relativeOffset = delayOffset - cursor;
        if (relativeOffset < 0 || relativeOffset + 1 >= chunk.length) throw new Error('GIFの表示時間位置を確認できませんでした。');
        chunk[relativeOffset] = delay & 0xff;
        chunk[relativeOffset + 1] = (delay >>> 8) & 0xff;
        chunks.push(chunk);
      }
      cursor = imageOffset;
    }
    chunks.push(bytes.slice(cursor));

    const result = concatenate(chunks);
    return result;
  }

  const api = Object.freeze({
    MAX_GIF_BYTES,
    MAX_DIMENSION,
    MAX_FRAME_COUNT,
    DEFAULT_FRAME_DELAY,
    SPEED_MULTIPLIERS,
    inspectGif,
    normalizeSpeedMultiplier,
    retimeGif,
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  globalScope.ImageMotionGifRetimer = api;
}(typeof self !== 'undefined' ? self : globalThis));
