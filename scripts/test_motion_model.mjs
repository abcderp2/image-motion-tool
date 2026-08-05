import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const motionModel = require('../motion-model.js');

const base = {
  preset: 'sway',
  amplitude: 18,
  speed: 1,
  rotation: 10,
  pulse: 10,
  reverse: false,
  duration: 4,
  loopCycles: 1,
};

const quarterSecond = 0.25;
const sway = motionModel.motionAt(base, quarterSecond);
assert.equal(sway.x, 0);
assert.equal(sway.y, 0);
assert.equal(sway.rotation, 10);
assert.equal(sway.pivotY, 0.96);

const pendulum = motionModel.motionAt({ ...base, preset: 'pendulum' }, quarterSecond);
assert.equal(pendulum.rotation, 10);
assert.equal(pendulum.pivotY, 0.04);
assert.equal(pendulum.y, 0);

const reversedPendulum = motionModel.motionAt({ ...base, preset: 'pendulum', reverse: true }, quarterSecond);
assert.equal(reversedPendulum.rotation, -10);

const breatheStart = motionModel.motionAt({ ...base, preset: 'breathe' }, 0);
const breathePeak = motionModel.motionAt({ ...base, preset: 'breathe' }, 0.5);
assert.equal(breatheStart.scaleX, 1);
assert.equal(breatheStart.scaleY, 1);
assert.ok(breathePeak.scaleY > breathePeak.scaleX);
assert.ok(breathePeak.scaleX > 1);
assert.equal(breathePeak.pivotY, 0.92);

const zoomStart = motionModel.motionAt({ ...base, preset: 'zoom' }, 0);
const zoomPeak = motionModel.motionAt({ ...base, preset: 'zoom' }, 0.5);
const zoomEnd = motionModel.motionAt({ ...base, preset: 'zoom' }, 1);
assert.equal(zoomStart.scaleX, 1);
assert.equal(zoomStart.scaleY, 1);
assert.equal(zoomPeak.scaleX, 1.1);
assert.equal(zoomPeak.scaleY, 1.1);
assert.ok(Math.abs(zoomEnd.scaleX - 1) < 1e-12);

const exportStart = motionModel.motionAt({ ...base, preset: 'zoom' }, 0, true);
const exportMiddle = motionModel.motionAt({ ...base, preset: 'zoom' }, 2, true);
const exportEnd = motionModel.motionAt({ ...base, preset: 'zoom' }, 4, true);
assert.equal(exportStart.scaleX, 1);
assert.equal(exportMiddle.scaleX, 1.1);
assert.ok(Math.abs(exportEnd.scaleX - 1) < 1e-12);

function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) <= 1e-9, `${message}: ${actual} !== ${expected}`);
}

const squashSettings = {
  ...base,
  preset: 'squash',
  amplitude: 20,
  pulse: 10,
  speed: 1,
  loopCycles: 2,
};
const squashStart = motionModel.motionAt(squashSettings, 0);
const squashPeak = motionModel.motionAt(squashSettings, 0.5);
const squashEnd = motionModel.motionAt(squashSettings, 1);
assertClose(squashStart.pivotY, 0.92, 'squash pivotY');
assertClose(squashPeak.pivotX, 0.5, 'squash pivotX');
assertClose(squashPeak.rotation, 0, 'squash rotation');
assert.ok(squashPeak.scaleX > 1);
assert.ok(squashPeak.scaleY < 1);
assert.equal(squashStart.scaleX, 1);
assert.equal(squashStart.scaleY, 1);
assert.equal(squashEnd.scaleX, 1);
assert.equal(squashEnd.scaleY, 1);
assertClose(squashEnd.x, squashStart.x, 'squash preview end x');
assertClose(squashEnd.y, squashStart.y, 'squash preview end y');

const reversedSquashStart = motionModel.motionAt({ ...squashSettings, reverse: true }, 0);
const reversedSquashEnd = motionModel.motionAt({ ...squashSettings, reverse: true }, 1);
for (const value of Object.values(reversedSquashStart)) assert.ok(Number.isFinite(value));
for (const value of Object.values(reversedSquashEnd)) assert.ok(Number.isFinite(value));
assertClose(reversedSquashEnd.scaleX, reversedSquashStart.scaleX, 'reversed squash scaleX');
assertClose(reversedSquashEnd.scaleY, reversedSquashStart.scaleY, 'reversed squash scaleY');
assertClose(reversedSquashEnd.x, reversedSquashStart.x, 'reversed squash end x');
assertClose(reversedSquashEnd.y, reversedSquashStart.y, 'reversed squash end y');

const squashExportStart = motionModel.motionAt(squashSettings, 0, true);
const squashExportEnd = motionModel.motionAt(squashSettings, squashSettings.duration, true);
for (const key of ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'pivotX', 'pivotY']) {
  assertClose(squashExportEnd[key], squashExportStart[key], `squash export loop ${key}`);
}
const reversedSquashExportStart = motionModel.motionAt({ ...squashSettings, reverse: true }, 0, true);
const reversedSquashExportEnd = motionModel.motionAt({ ...squashSettings, reverse: true }, squashSettings.duration, true);
for (const key of ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'pivotX', 'pivotY']) {
  assertClose(reversedSquashExportEnd[key], reversedSquashExportStart[key], `reversed squash export loop ${key}`);
}

const staticGeometry = motionModel.staticGeometry(
  { zoom: 100, offsetX: 0, offsetY: 0, flipped: false },
  400,
  200,
  360,
  360,
);
assert.equal(staticGeometry.drawWidth, 360);
assert.equal(staticGeometry.drawHeight, 180);
assert.equal(staticGeometry.left, 0);
assert.equal(staticGeometry.top, 90);

const sourcePoint = motionModel.sourcePointAt(
  { zoom: 100, offsetX: 0, offsetY: 0, flipped: false },
  400,
  200,
  360,
  360,
  90,
  135,
);
assert.ok(sourcePoint);
assertClose(sourcePoint.x, 0.25, 'source point x');
assertClose(sourcePoint.y, 0.25, 'source point y');
assert.equal(motionModel.sourcePointAt(
  { zoom: 100, offsetX: 0, offsetY: 0, flipped: false },
  400,
  200,
  360,
  360,
  90,
  40,
), null);

const flippedPoint = motionModel.sourcePointAt(
  { zoom: 100, offsetX: 0, offsetY: 0, flipped: true },
  400,
  200,
  360,
  360,
  90,
  135,
);
assert.ok(flippedPoint);
assertClose(flippedPoint.x, 0.75, 'flipped source point x');

const frameGeometry = motionModel.frameGeometry(
  { zoom: 100, offsetX: 0, offsetY: 0, flipped: false },
  400,
  200,
  360,
  360,
  { x: 18, y: -9, rotation: 5, scaleX: 1.1, scaleY: 0.9, pivotX: 0.5, pivotY: 1 },
);
assertClose(frameGeometry.centerX, 198, 'frame center x');
assertClose(frameGeometry.centerY, 171, 'frame center y');
assertClose(frameGeometry.drawWidth, 396, 'frame draw width');
assertClose(frameGeometry.drawHeight, 162, 'frame draw height');
assertClose(frameGeometry.pivotX, 198, 'frame pivot x');
assertClose(frameGeometry.pivotY, 261, 'frame pivot y');
assert.equal(frameGeometry.rotation, 5);

const normalMask = motionModel.maskDimensions(4000, 2000, 1024, 786432);
assert.equal(normalMask.width, 1024);
assert.equal(normalMask.height, 512);
assert.ok(normalMask.width * normalMask.height <= 786432);
const lowMemoryMask = motionModel.maskDimensions(4000, 3000, 640, 786432);
assert.equal(Math.max(lowMemoryMask.width, lowMemoryMask.height), 640);
assert.ok(lowMemoryMask.width * lowMemoryMask.height <= 786432);
const smallMask = motionModel.maskDimensions(320, 240, 1024, 786432);
assert.deepEqual(smallMask, { width: 320, height: 240, scale: 1 });

console.log('motion model tests passed');
