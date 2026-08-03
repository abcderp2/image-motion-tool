import assert from 'node:assert/strict';
import { deflateSync, inflateSync } from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const apng = require('../apng-encoder.js');

const SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  crcTable[index] = value >>> 0;
}

function crc32(type, data) {
  let value = 0xffffffff;
  for (const byte of [...type, ...data]) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Uint8Array.from(type, (value) => value.charCodeAt(0));
  const result = new Uint8Array(data.length + 12);
  const view = new DataView(result.buffer);
  view.setUint32(0, data.length);
  result.set(typeBytes, 4);
  result.set(data, 8);
  view.setUint32(data.length + 8, crc32(typeBytes, data));
  return result;
}

function pngFrame(width, height, rgba) {
  const scanlines = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    scanlines[y * (width * 4 + 1)] = 0;
    scanlines.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const compressed = new Uint8Array(deflateSync(scanlines));
  const result = new Uint8Array(8 + 25 + compressed.length + 12 + 12);
  result.set(SIGNATURE, 0);
  result.set(chunk('IHDR', ihdr), 8);
  result.set(chunk('IDAT', compressed), 8 + 25);
  result.set(chunk('IEND', new Uint8Array(0)), 8 + 25 + compressed.length + 12);
  return result;
}

function parseChunks(bytes) {
  const chunks = [];
  let offset = 8;
  while (offset < bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.length - offset);
    const length = view.getUint32(0);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const data = bytes.slice(offset + 8, offset + 8 + length);
    chunks.push({ type, data });
    offset += length + 12;
  }
  return chunks;
}

function embeddedFrameData(chunks, frameIndex) {
  const idat = chunks.filter((item) => item.type === (frameIndex === 0 ? 'IDAT' : 'fdAT'))
    .map((item) => frameIndex === 0 ? item.data : item.data.slice(4));
  const result = new Uint8Array(idat.reduce((sum, item) => sum + item.length, 0));
  let offset = 0;
  for (const item of idat) {
    result.set(item, offset);
    offset += item.length;
  }
  return result;
}

const firstRgba = Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 128]);
const secondRgba = Uint8Array.from([0, 0, 255, 0, 255, 255, 255, 255]);
const first = pngFrame(2, 1, firstRgba);
const second = pngFrame(2, 1, secondRgba);
const firstInfo = apng.inspectPng(first);
assert.deepEqual({ width: firstInfo.width, height: firstInfo.height, bitDepth: firstInfo.bitDepth, colorType: firstInfo.colorType }, {
  width: 2,
  height: 1,
  bitDepth: 8,
  colorType: 6,
});

const encoded = apng.encodeApng([first, second], {
  delayNumerator: 13,
  delayDenominator: 100,
  numPlays: 0,
  maxTotalPixels: 10,
  maxOutputBytes: 100_000,
});
assert.deepEqual(Array.from(encoded.subarray(0, 8)), Array.from(SIGNATURE));
const chunks = parseChunks(encoded);
assert.deepEqual(chunks.map((item) => item.type), ['IHDR', 'acTL', 'fcTL', 'IDAT', 'fcTL', 'fdAT', 'IEND']);
assert.equal(new DataView(chunks[1].data.buffer, chunks[1].data.byteOffset).getUint32(0), 2);
assert.equal(new DataView(chunks[1].data.buffer, chunks[1].data.byteOffset).getUint32(4), 0);
assert.equal(new DataView(chunks[2].data.buffer, chunks[2].data.byteOffset).getUint16(20), 13);
assert.equal(new DataView(chunks[2].data.buffer, chunks[2].data.byteOffset).getUint16(22), 100);
assert.equal(chunks[2].data[24], 0);
assert.equal(chunks[2].data[25], 0);
assert.equal(new DataView(chunks[4].data.buffer, chunks[4].data.byteOffset).getUint32(0), 1);
assert.equal(chunks[4].data[24], 0);
assert.equal(chunks[4].data[25], 0);

const inspection = apng.inspectApng(encoded);
assert.deepEqual({
  width: inspection.width,
  height: inspection.height,
  frameCount: inspection.frameCount,
  numPlays: inspection.numPlays,
}, {
  width: 2,
  height: 1,
  frameCount: 2,
  numPlays: 0,
});
assert.deepEqual(inspection.frames, [
  { delayNumerator: 13, delayDenominator: 100 },
  { delayNumerator: 13, delayDenominator: 100 },
]);

const thirtyFrames = Array.from({ length: 30 }, (_, index) => (index % 2 === 0 ? first : second));
const thirtyFrameAnimation = apng.encodeApng(thirtyFrames, {
  delayNumerator: 10,
  delayDenominator: 100,
  numPlays: 0,
  maxTotalPixels: 100,
});
const thirtyFrameInspection = apng.inspectApng(thirtyFrameAnimation);
assert.equal(thirtyFrameInspection.frameCount, 30);
assert.equal(thirtyFrameInspection.numPlays, 0);
assert.ok(thirtyFrameInspection.frames.every((frame) => (
  frame.delayNumerator === 10 && frame.delayDenominator === 100
)));

const firstDecoded = new Uint8Array(inflateSync(embeddedFrameData(chunks, 0)));
const secondDecoded = new Uint8Array(inflateSync(embeddedFrameData(chunks, 1)));
assert.deepEqual(Array.from(firstDecoded), Array.from([0, ...firstRgba]));
assert.deepEqual(Array.from(secondDecoded), Array.from([0, ...secondRgba]));

const damaged = first.slice();
damaged[damaged.length - 1] ^= 1;
assert.throws(() => apng.inspectPng(damaged), /CRC/);
assert.throws(() => apng.encodeApng([first, second.slice(0, -1)], { delayNumerator: 10, delayDenominator: 100 }), /IEND|チャンク/);
assert.throws(() => apng.encodeApng([first, pngFrame(1, 1, Uint8Array.from([0, 0, 0, 255]))], { delayNumerator: 10, delayDenominator: 100 }), /寸法/);
assert.throws(() => apng.encodeApng([first], { delayNumerator: 0, delayDenominator: 100 }), /間隔/);
assert.throws(() => apng.encodeApng([first, second], { delayNumerator: 10, delayDenominator: 100, maxTotalPixels: 1 }), /総展開画素数/);
assert.throws(() => apng.inspectPng(Uint8Array.from([137, 80, 78, 71])), /短すぎ|シグネチャ/);
assert.throws(() => apng.inspectApng(first), /acTL|APNG/);

console.log('APNG encoder tests passed');
