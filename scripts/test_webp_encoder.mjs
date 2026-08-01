import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const webp = require('../webp-encoder.js');

function ascii(value) {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

function chunk(type, data) {
  const result = new Uint8Array(8 + data.length + (data.length & 1));
  const view = new DataView(result.buffer);
  result.set(ascii(type), 0);
  view.setUint32(4, data.length, true);
  result.set(data, 8);
  return result;
}

function riff(chunks) {
  const length = 12 + chunks.reduce((sum, item) => sum + item.length, 0);
  const result = new Uint8Array(length);
  result.set(ascii('RIFF'), 0);
  new DataView(result.buffer).setUint32(4, length - 8, true);
  result.set(ascii('WEBP'), 8);
  let offset = 12;
  for (const item of chunks) {
    result.set(item, offset);
    offset += item.length;
  }
  return result;
}

function vp8Data(width, height) {
  const result = new Uint8Array(10);
  result.set([0, 0, 0, 0x9d, 0x01, 0x2a], 0);
  new DataView(result.buffer).setUint16(6, width, true);
  new DataView(result.buffer).setUint16(8, height, true);
  return result;
}

function vp8lData(width, height) {
  const result = new Uint8Array(5);
  const widthMinusOne = width - 1;
  const heightMinusOne = height - 1;
  result[0] = 0x2f;
  result[1] = widthMinusOne & 0xff;
  result[2] = ((widthMinusOne >>> 8) & 0x3f) | ((heightMinusOne & 0x03) << 6);
  result[3] = (heightMinusOne >>> 2) & 0xff;
  result[4] = (heightMinusOne >>> 10) & 0x0f;
  return result;
}

function vp8xData(width, height, flags = 0x10) {
  const result = new Uint8Array(10);
  result[0] = flags;
  const widthMinusOne = width - 1;
  const heightMinusOne = height - 1;
  result.set([widthMinusOne & 0xff, (widthMinusOne >>> 8) & 0xff, (widthMinusOne >>> 16) & 0xff], 4);
  result.set([heightMinusOne & 0xff, (heightMinusOne >>> 8) & 0xff, (heightMinusOne >>> 16) & 0xff], 7);
  return result;
}

function parseTopChunks(bytes) {
  const result = [];
  let offset = 12;
  while (offset < bytes.length) {
    const type = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const size = new DataView(bytes.buffer, bytes.byteOffset + offset + 4).getUint32(0, true);
    result.push({ type, data: bytes.slice(offset + 8, offset + 8 + size) });
    offset += 8 + size + (size & 1);
  }
  return result;
}

const opaqueFrame = riff([chunk('VP8 ', vp8Data(2, 1))]);
const alphaFrame = riff([
  chunk('VP8X', vp8xData(2, 1, 0x10)),
  chunk('ALPH', Uint8Array.from([0])),
  chunk('VP8 ', vp8Data(2, 1)),
]);
const opaqueInfo = webp.inspectWebpFrame(opaqueFrame);
assert.deepEqual({ width: opaqueInfo.width, height: opaqueInfo.height, hasAlpha: opaqueInfo.hasAlpha, lossless: opaqueInfo.lossless }, {
  width: 2,
  height: 1,
  hasAlpha: false,
  lossless: false,
});
const alphaInfo = webp.inspectWebpFrame(alphaFrame);
assert.equal(alphaInfo.hasAlpha, true);
assert.equal(alphaInfo.frameData.length, 2);

const animated = webp.encodeAnimatedWebp([alphaFrame, alphaFrame], {
  durationMs: 125,
  loopCount: 0,
  backgroundColor: 0,
  maxTotalPixels: 10,
  maxOutputBytes: 100_000,
});
assert.deepEqual(Array.from(animated.subarray(0, 4)), Array.from(ascii('RIFF')));
assert.deepEqual(Array.from(animated.subarray(8, 12)), Array.from(ascii('WEBP')));
const topChunks = parseTopChunks(animated);
assert.deepEqual(topChunks.map((item) => item.type), ['VP8X', 'ANIM', 'ANMF', 'ANMF']);
assert.equal(topChunks[0].data[0] & 0x12, 0x12);
assert.equal(new DataView(topChunks[1].data.buffer, topChunks[1].data.byteOffset).getUint16(4, true), 0);
for (const frame of topChunks.slice(2)) {
  assert.equal(frame.data[12], 125);
  assert.equal(frame.data[13], 0);
  assert.equal(frame.data[14], 0);
  assert.equal(frame.data[15], 0x03);
  const data = frame.data.slice(16);
  assert.equal(String.fromCharCode(data[0], data[1], data[2], data[3]), 'ALPH');
  assert.equal(String.fromCharCode(data[10], data[11], data[12], data[13]), 'VP8 ');
}
const animatedInfo = webp.inspectAnimatedWebp(animated, { maxTotalPixels: 10 });
assert.deepEqual({ width: animatedInfo.width, height: animatedInfo.height, frames: animatedInfo.frames, loopCount: animatedInfo.loopCount, hasAlpha: animatedInfo.hasAlpha, durations: animatedInfo.durations }, {
  width: 2,
  height: 1,
  frames: 2,
  loopCount: 0,
  hasAlpha: true,
  durations: [125, 125],
});

const losslessFrame = riff([chunk('VP8L', vp8lData(2, 1))]);
const losslessAnimation = webp.encodeAnimatedWebp([losslessFrame], { durationMs: 10, maxOutputBytes: 100_000 });
assert.equal(webp.inspectAnimatedWebp(losslessAnimation).lossless, true);

const badSize = animated.slice();
new DataView(badSize.buffer).setUint32(4, badSize.length - 7, true);
assert.throws(() => webp.inspectAnimatedWebp(badSize), /ファイル長/);
assert.throws(() => webp.inspectWebpFrame(alphaFrame.slice(0, -1)), /ファイル長|チャンク|パディング/);
assert.throws(() => webp.encodeAnimatedWebp([opaqueFrame, riff([chunk('VP8 ', vp8Data(1, 1))])], { durationMs: 10 }), /寸法/);
assert.throws(() => webp.encodeAnimatedWebp([opaqueFrame], { durationMs: 0 }), /間隔/);
assert.throws(() => webp.encodeAnimatedWebp([opaqueFrame, opaqueFrame], { durationMs: 10, maxTotalPixels: 1 }), /総展開画素数/);

console.log('WebP encoder tests passed');
