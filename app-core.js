(function attachImageMotionCore(globalScope) {
  'use strict';

  const SETTINGS_VERSION = 2;
  const STORAGE_KEY = 'image-motion-tool-settings-v2';
  const LEGACY_STORAGE_KEY = 'image-motion-tool-settings-v1';

  const LIMITS = Object.freeze({
    maxFileBytes: 15 * 1024 * 1024,
    maxDimension: 8192,
    maxPixelsLowMemory: 16_000_000,
    maxPixelsDefault: 24_000_000,
    maxPixelsHighMemory: 32_000_000,
    maxGifRenderPixels: 14_000_000,
    maxStillPixels: 4_000_000,
    maxSettingsBytes: 100_000,
    maxHistoryEntries: 30,
    headerProbeBytes: 1024 * 1024,
  });

  const DEFAULTS = Object.freeze({
    settingsVersion: SETTINGS_VERSION,
    preset: 'float',
    amplitude: 18,
    speed: 0.75,
    rotation: 4,
    pulse: 4,
    zoom: 88,
    reverse: false,
    loopCycles: 2,
    canvasRatio: '1:1',
    gifSize: 360,
    duration: 3,
    fps: 10,
    gifQuality: 'balanced',
    stillSize: 1080,
    stillFormat: 'png',
    stillQuality: 0.9,
    backgroundMode: 'transparent',
    backgroundColor: '#ffffff',
    offsetX: 0,
    offsetY: 0,
    flipped: false,
  });

  const RATIO_MAP = Object.freeze({
    '1:1': [1, 1],
    '4:5': [4, 5],
    '9:16': [9, 16],
    '16:9': [16, 9],
  });

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function sanitizeSettings(candidate) {
    const source = isPlainObject(candidate) ? candidate : {};
    const result = { ...DEFAULTS };
    const presets = new Set(['float', 'bounce', 'shake', 'sway', 'orbit', 'breathe', 'zoom', 'pendulum', 'squash']);
    const backgrounds = new Set(['transparent', 'white', 'black', 'green', 'custom']);
    const ratios = new Set(Object.keys(RATIO_MAP));
    const gifQualities = new Set(['fast', 'balanced', 'high']);
    const stillFormats = new Set(['png', 'jpeg', 'webp']);

    result.settingsVersion = SETTINGS_VERSION;
    result.preset = presets.has(source.preset) ? source.preset : DEFAULTS.preset;
    result.amplitude = clamp(finiteNumber(source.amplitude, DEFAULTS.amplitude), 0, 60);
    result.speed = clamp(finiteNumber(source.speed, DEFAULTS.speed), 0.2, 2);
    result.rotation = clamp(finiteNumber(source.rotation, DEFAULTS.rotation), 0, 24);
    result.pulse = clamp(finiteNumber(source.pulse, DEFAULTS.pulse), 0, 16);
    result.zoom = clamp(finiteNumber(source.zoom, DEFAULTS.zoom), 40, 180);
    result.reverse = Boolean(source.reverse);
    result.loopCycles = [1, 2, 3, 4].includes(Number(source.loopCycles)) ? Number(source.loopCycles) : DEFAULTS.loopCycles;
    result.canvasRatio = ratios.has(source.canvasRatio) ? source.canvasRatio : DEFAULTS.canvasRatio;

    const legacyOutputSize = Number(source.outputSize);
    const gifSizeSource = source.gifSize === undefined ? legacyOutputSize : Number(source.gifSize);
    result.gifSize = [256, 360, 480].includes(gifSizeSource) ? gifSizeSource : DEFAULTS.gifSize;
    result.duration = [2, 3, 4, 5].includes(Number(source.duration)) ? Number(source.duration) : DEFAULTS.duration;
    result.fps = [8, 10, 12].includes(Number(source.fps)) ? Number(source.fps) : DEFAULTS.fps;
    result.gifQuality = gifQualities.has(source.gifQuality) ? source.gifQuality : DEFAULTS.gifQuality;

    result.stillSize = [480, 720, 1080, 1440].includes(Number(source.stillSize)) ? Number(source.stillSize) : DEFAULTS.stillSize;
    result.stillFormat = stillFormats.has(source.stillFormat) ? source.stillFormat : DEFAULTS.stillFormat;
    result.stillQuality = clamp(finiteNumber(source.stillQuality, DEFAULTS.stillQuality), 0.6, 1);
    result.backgroundMode = backgrounds.has(source.backgroundMode) ? source.backgroundMode : DEFAULTS.backgroundMode;
    result.backgroundColor = /^#[0-9a-f]{6}$/i.test(String(source.backgroundColor || '')) ? String(source.backgroundColor) : DEFAULTS.backgroundColor;
    result.offsetX = clamp(finiteNumber(source.offsetX, 0), -240, 240);
    result.offsetY = clamp(finiteNumber(source.offsetY, 0), -240, 240);
    result.flipped = Boolean(source.flipped);
    return result;
  }

  function settingsEqual(left, right) {
    return JSON.stringify(sanitizeSettings(left)) === JSON.stringify(sanitizeSettings(right));
  }

  function gifFrameDelay(settings) {
    const safe = sanitizeSettings(settings);
    const speedRatio = safe.speed / DEFAULTS.speed;
    // GIFのdelayは100分の1秒単位。既定速度の再生時間を保ったまま速さを反映する。
    return Math.max(1, Math.round(100 / (safe.fps * speedRatio)));
  }

  function ratioDimensions(longEdge, ratioName) {
    const edge = Math.max(1, Math.round(Number(longEdge) || 1));
    const ratio = RATIO_MAP[ratioName] || RATIO_MAP['1:1'];
    const [ratioWidth, ratioHeight] = ratio;
    if (ratioWidth === ratioHeight) return { width: edge, height: edge };
    if (ratioWidth > ratioHeight) {
      return { width: edge, height: Math.max(1, Math.round(edge * ratioHeight / ratioWidth)) };
    }
    return { width: Math.max(1, Math.round(edge * ratioWidth / ratioHeight)), height: edge };
  }

  function effectiveInputPixelLimit(deviceMemory) {
    const memory = Number(deviceMemory);
    if (Number.isFinite(memory) && memory <= 2) return LIMITS.maxPixelsLowMemory;
    if (Number.isFinite(memory) && memory >= 8) return LIMITS.maxPixelsHighMemory;
    return LIMITS.maxPixelsDefault;
  }

  function estimateGif(settings) {
    const safe = sanitizeSettings(settings);
    const dimensions = ratioDimensions(safe.gifSize, safe.canvasRatio);
    const frames = safe.duration * safe.fps;
    const renderPixels = dimensions.width * dimensions.height * frames;
    const frameBytes = renderPixels;
    const palettePasses = safe.gifQuality === 'fast' ? 1 : 2;
    const frameDelay = gifFrameDelay(safe);
    return {
      ...dimensions,
      frames,
      renderPixels,
      frameBytes,
      palettePasses,
      frameDelay,
      playbackSeconds: frames * frameDelay / 100,
      safe: renderPixels <= LIMITS.maxGifRenderPixels,
    };
  }

  function estimateStill(settings) {
    const safe = sanitizeSettings(settings);
    const dimensions = ratioDimensions(safe.stillSize, safe.canvasRatio);
    const pixels = dimensions.width * dimensions.height;
    return { ...dimensions, pixels, safe: pixels <= LIMITS.maxStillPixels };
  }

  function readAscii(bytes, offset, length) {
    let result = '';
    for (let index = 0; index < length; index += 1) {
      result += String.fromCharCode(bytes[offset + index] || 0);
    }
    return result;
  }

  function readU16BE(bytes, offset) {
    return (bytes[offset] << 8) | bytes[offset + 1];
  }

  function readU16LE(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  function readU24LE(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
  }

  function readU32LE(bytes, offset) {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  }

  function parsePng(bytes) {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (bytes.length < 24 || signature.some((value, index) => bytes[index] !== value)) return null;
    if (readAscii(bytes, 12, 4) !== 'IHDR') throw new Error('PNGのヘッダーが不正です。');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { type: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
  }

  function parseJpeg(bytes) {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    let offset = 2;
    while (offset + 3 < bytes.length) {
      while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      if (offset >= bytes.length) break;
      const marker = bytes[offset];
      offset += 1;
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker >= 0xd0 && marker <= 0xd7) continue;
      if (offset + 1 >= bytes.length) break;
      const segmentLength = readU16BE(bytes, offset);
      if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
      if (sofMarkers.has(marker)) {
        if (segmentLength < 7) throw new Error('JPEGのヘッダーが不正です。');
        return {
          type: 'image/jpeg',
          height: readU16BE(bytes, offset + 3),
          width: readU16BE(bytes, offset + 5),
        };
      }
      offset += segmentLength;
    }
    throw new Error('JPEGの寸法を安全に確認できませんでした。画像を書き出し直してから選んでください。');
  }

  function parseWebp(bytes) {
    if (bytes.length < 30 || readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 4) !== 'WEBP') return null;
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const chunkType = readAscii(bytes, offset, 4);
      const chunkSize = readU32LE(bytes, offset + 4);
      const payload = offset + 8;
      if (payload + chunkSize > bytes.length) break;
      if (chunkType === 'VP8X') {
        if (chunkSize < 10) throw new Error('WebPのヘッダーが不正です。');
        return { type: 'image/webp', width: readU24LE(bytes, payload + 4) + 1, height: readU24LE(bytes, payload + 7) + 1 };
      }
      if (chunkType === 'VP8L') {
        if (chunkSize < 5 || bytes[payload] !== 0x2f) throw new Error('WebPのヘッダーが不正です。');
        const b1 = bytes[payload + 1];
        const b2 = bytes[payload + 2];
        const b3 = bytes[payload + 3];
        const b4 = bytes[payload + 4];
        return {
          type: 'image/webp',
          width: 1 + (b1 | ((b2 & 0x3f) << 8)),
          height: 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)),
        };
      }
      if (chunkType === 'VP8 ') {
        if (chunkSize < 10 || bytes[payload + 3] !== 0x9d || bytes[payload + 4] !== 0x01 || bytes[payload + 5] !== 0x2a) {
          throw new Error('WebPのヘッダーが不正です。');
        }
        return {
          type: 'image/webp',
          width: readU16LE(bytes, payload + 6) & 0x3fff,
          height: readU16LE(bytes, payload + 8) & 0x3fff,
        };
      }
      offset = payload + chunkSize + (chunkSize % 2);
    }
    throw new Error('WebPの寸法を安全に確認できませんでした。');
  }

  function parseImageHeader(arrayBuffer) {
    if (!(arrayBuffer instanceof ArrayBuffer)) throw new TypeError('画像ヘッダーはArrayBufferで指定してください。');
    const bytes = new Uint8Array(arrayBuffer);
    const parsed = parsePng(bytes) || parseJpeg(bytes) || parseWebp(bytes);
    if (!parsed) throw new Error('PNG、JPEG、WebPの画像を選んでください。SVGや不明な形式は読み込みません。');
    if (!Number.isInteger(parsed.width) || !Number.isInteger(parsed.height) || parsed.width < 1 || parsed.height < 1) {
      throw new Error('画像の寸法が不正です。');
    }
    return Object.freeze(parsed);
  }

  function validateImageMetadata(metadata, deviceMemory) {
    const maxPixels = effectiveInputPixelLimit(deviceMemory);
    if (metadata.width > LIMITS.maxDimension || metadata.height > LIMITS.maxDimension) {
      throw new Error(`画像は縦横${LIMITS.maxDimension}px以下にしてください。`);
    }
    const pixels = metadata.width * metadata.height;
    if (!Number.isSafeInteger(pixels) || pixels > maxPixels) {
      const megapixels = Math.round(maxPixels / 1_000_000);
      throw new Error(`この端末では合計${megapixels}メガピクセル以下の画像を使用してください。`);
    }
    return { pixels, maxPixels };
  }

  function detectedTypeExtension(type) {
    if (type === 'image/jpeg') return 'jpg';
    if (type === 'image/webp') return 'webp';
    return 'png';
  }

  const api = Object.freeze({
    SETTINGS_VERSION,
    STORAGE_KEY,
    LEGACY_STORAGE_KEY,
    LIMITS,
    DEFAULTS,
    RATIO_MAP,
    clamp,
    isPlainObject,
    sanitizeSettings,
    settingsEqual,
    gifFrameDelay,
    ratioDimensions,
    effectiveInputPixelLimit,
    estimateGif,
    estimateStill,
    parseImageHeader,
    validateImageMetadata,
    detectedTypeExtension,
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  globalScope.ImageMotionCore = api;
}(typeof self !== 'undefined' ? self : globalThis));
