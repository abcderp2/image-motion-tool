import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const gif = require('../gif-encoder.js');

function readU16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function skipSubBlocks(bytes, offset) {
  while (true) {
    assert.ok(offset < bytes.length, 'GIF sub-block is truncated');
    const length = bytes[offset];
    offset += 1;
    if (length === 0) return offset;
    offset += length;
    assert.ok(offset <= bytes.length, 'GIF sub-block exceeds file length');
  }
}

function parseFrameControls(encoded) {
  const bytes = encoded instanceof Uint8Array ? encoded : new Uint8Array(encoded);
  assert.equal(Buffer.from(bytes.subarray(0, 6)).toString('ascii'), 'GIF89a');
  let offset = 13;
  const logicalPacked = bytes[10];
  if (logicalPacked & 0x80) offset += 3 * (1 << ((logicalPacked & 0x07) + 1));

  const controls = [];
  let pendingControl = null;
  while (offset < bytes.length) {
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      const label = bytes[offset];
      offset += 1;
      if (label === 0xf9) {
        assert.equal(bytes[offset], 4, 'graphic control block must be four bytes');
        const packed = bytes[offset + 1];
        pendingControl = {
          disposal: (packed >>> 2) & 0x07,
          transparent: Boolean(packed & 0x01),
          transparentIndex: bytes[offset + 4],
        };
        offset += 6;
      } else {
        offset = skipSubBlocks(bytes, offset);
      }
      continue;
    }
    assert.equal(marker, 0x2c, `unexpected GIF marker ${marker}`);
    assert.ok(pendingControl, 'image frame is missing a graphic control extension');
    controls.push(pendingControl);
    pendingControl = null;
    const framePacked = bytes[offset + 8];
    offset += 9;
    if (framePacked & 0x80) offset += 3 * (1 << ((framePacked & 0x07) + 1));
    offset += 1;
    offset = skipSubBlocks(bytes, offset);
  }
  return controls;
}

const palette = new Uint8Array(256 * 3);
palette.set([0, 0, 0], 0);
palette.set([255, 0, 0], 3);
const frames = [
  Uint8Array.of(1, 0, 0),
  Uint8Array.of(0, 1, 0),
  Uint8Array.of(0, 0, 1),
];

const transparentGif = gif.encodeIndexedFrames({
  width: 3,
  height: 1,
  delay: 10,
  transparent: true,
  palette,
  frames,
});
const transparentControls = parseFrameControls(transparentGif);
assert.equal(transparentControls.length, frames.length);
for (const control of transparentControls) {
  assert.equal(control.transparent, true);
  assert.equal(control.transparentIndex, 0);
  assert.equal(control.disposal, 2, 'transparent full frames must clear the previous frame');
}

const displayed = [];
const canvas = new Uint8Array(3);
for (let index = 0; index < frames.length; index += 1) {
  const frame = frames[index];
  const control = transparentControls[index];
  for (let pixel = 0; pixel < frame.length; pixel += 1) {
    if (control.transparent && frame[pixel] === control.transparentIndex) continue;
    canvas[pixel] = frame[pixel];
  }
  displayed.push(Uint8Array.from(canvas));
  if (control.disposal === 2) canvas.fill(0);
}
assert.deepEqual(displayed, frames, 'transparent animation must not retain earlier positions');

const opaqueGif = gif.encodeIndexedFrames({
  width: 3,
  height: 1,
  delay: 10,
  transparent: false,
  palette,
  frames,
});
for (const control of parseFrameControls(opaqueGif)) {
  assert.equal(control.transparent, false);
  assert.equal(control.disposal, 1);
}

console.log('GIF transparency disposal tests passed');
