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

console.log('motion model tests passed');
