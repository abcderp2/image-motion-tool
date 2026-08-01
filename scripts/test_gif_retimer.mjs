import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const gif = require('../gif-encoder.js');
const retimer = require('../gif-retimer.js');

const palette = gif.fixedPalette();
const frames = [
  Uint8Array.from([0, 1, 2, 3]),
  Uint8Array.from([3, 2, 1, 0]),
];
const original = gif.encodeIndexedFrames({
  width: 2,
  height: 2,
  delay: 10,
  transparent: true,
  palette,
  frames,
});
const originalInfo = retimer.inspectGif(original);
assert.equal(originalInfo.width, 2);
assert.equal(originalInfo.height, 2);
assert.equal(originalInfo.frames, 2);
assert.deepEqual(originalInfo.delays, [10, 10]);
assert.equal(originalInfo.loopCount, 0);
assert.equal(originalInfo.hasTransparency, true);

for (const [multiplier, expectedDelay] of [[0.5, 20], [0.75, 13], [1, 10], [1.25, 8], [1.5, 7], [2, 5]]) {
  const changed = retimer.retimeGif(original, multiplier);
  const changedInfo = retimer.inspectGif(changed);
  assert.deepEqual(changedInfo.delays, [expectedDelay, expectedDelay]);
  assert.equal(changedInfo.loopCount, originalInfo.loopCount);
  assert.equal(changedInfo.hasTransparency, originalInfo.hasTransparency);
  assert.equal(changedInfo.frames, originalInfo.frames);
  assert.equal(changed.length, original.length);
  for (let index = 0; index < original.length; index += 1) {
    const isDelayByte = originalInfo.delayOffsets.some((offset) => index === offset || index === offset + 1);
    if (!isDelayByte) assert.equal(changed[index], original[index], `GIF data changed at byte ${index}`);
  }
}

const varied = original.slice();
varied[originalInfo.delayOffsets[0]] = 20;
varied[originalInfo.delayOffsets[0] + 1] = 0;
assert.deepEqual(retimer.inspectGif(varied).delays, [20, 10]);
assert.deepEqual(retimer.inspectGif(retimer.retimeGif(varied, 0.5)).delays, [40, 20]);

const withoutGraphicControl = [];
let cursor = 0;
for (const delayOffset of originalInfo.delayOffsets) {
  const extensionStart = delayOffset - 4;
  withoutGraphicControl.push(original.slice(cursor, extensionStart));
  cursor = extensionStart + 8;
}
withoutGraphicControl.push(original.slice(cursor));
const noControlExtension = Uint8Array.from(withoutGraphicControl.reduce((all, chunk) => [...all, ...chunk], []));
const inserted = retimer.retimeGif(noControlExtension, 2);
assert.deepEqual(retimer.inspectGif(inserted).delays, [5, 5]);
assert.equal(retimer.inspectGif(inserted).loopCount, 0);

assert.throws(() => retimer.inspectGif(Uint8Array.from([1, 2, 3])), /GIF/);
assert.throws(() => retimer.retimeGif(original, 0.6), /速度倍率/);
assert.throws(() => retimer.inspectGif(original.slice(0, -1)), /GIF/);

console.log('GIF retimer tests passed');
