import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const motionModel = require('../motion-model.js');
const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
for (const asset of ['partial-motion-mask.js?v=1', 'partial-motion-render.js?v=1', 'partial-motion-app.js?v=1']) {
  assert.ok(serviceWorker.includes(asset), `sw.js must cache ${asset}`);
}

const files = [
  'partial-motion-mask.js',
  'partial-motion-render.js',
  'partial-motion-app.js',
  'app-events.js',
];
const sources = new Map();
for (const file of files) {
  sources.set(file, await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));
}

for (const [file, source] of sources) {
  assert.equal(/\binnerHTML\s*=/.test(source), false, `${file} must not assign innerHTML`);
  assert.equal(/\beval\s*\(/.test(source), false, `${file} must not use eval`);
  assert.equal(/new\s+Function\s*\(/.test(source), false, `${file} must not use new Function`);
  assert.equal(/XMLHttpRequest|fetch\s*\(/.test(source), false, `${file} must not send image data`);
}
assert.match(sources.get('partial-motion-render.js'), /destination-in/);
assert.match(sources.get('partial-motion-app.js'), /元画像を静止したまま残し/);
assert.match(sources.get('app-events.js'), /url\.origin !== location\.origin/);
assert.match(sources.get('app-events.js'), /PARTIAL_MOTION_SCRIPTS\.includes/);

class FakeCanvas {
  constructor() {
    this.width = 1;
    this.height = 1;
    this.nonEmpty = false;
    this.context = new FakeContext(this);
  }
  getContext() {
    return this.context;
  }
}

class FakeContext {
  constructor(canvas) {
    this.canvas = canvas;
    this.globalCompositeOperation = 'source-over';
    this.filter = 'none';
  }
  save() {}
  restore() {}
  setTransform() {}
  beginPath() {}
  arc() {}
  moveTo() {}
  lineTo() {}
  clearRect() {
    this.canvas.nonEmpty = false;
  }
  drawImage(source) {
    this.canvas.nonEmpty = Boolean(source.nonEmpty);
  }
  fill() {
    this.canvas.nonEmpty = this.globalCompositeOperation !== 'destination-out';
  }
  stroke() {
    this.canvas.nonEmpty = this.globalCompositeOperation !== 'destination-out';
  }
  getImageData() {
    const data = new Uint8ClampedArray(4 * 32 * 32);
    if (this.canvas.nonEmpty) data[3] = 255;
    return { data, nonEmpty: this.canvas.nonEmpty };
  }
  putImageData(imageData) {
    this.canvas.nonEmpty = Boolean(imageData.nonEmpty || imageData.data?.[3]);
  }
}

const context = {
  document: {
    createElement(name) {
      assert.equal(name, 'canvas');
      return new FakeCanvas();
    },
  },
  Math,
  Number,
  Object,
  Set,
  Uint8ClampedArray,
};
context.self = context;
context.globalThis = context;
vm.runInNewContext(sources.get('partial-motion-mask.js'), context, {
  filename: 'partial-motion-mask.js',
});

const mask = context.ImageMotionPartialMask.create({ motionModel });
mask.initialize({ naturalWidth: 4000, naturalHeight: 2000 }, 640);
assert.equal(mask.width(), 640);
assert.equal(mask.height(), 320);
assert.equal(mask.hasSelection(), false);
assert.equal(mask.begin('paint', 20, { x: 10, y: 10 }), true);
assert.equal(mask.move({ x: 20, y: 20 }), true);
assert.equal(mask.end(), true);
assert.equal(mask.hasSelection(), true);
assert.equal(mask.canUndo(), true);
assert.equal(mask.undo(), true);
assert.equal(mask.hasSelection(), false);
assert.equal(mask.canRedo(), true);
assert.equal(mask.redo(), true);
assert.equal(mask.hasSelection(), true);
mask.setFeather(8);
assert.equal(mask.featherCanvas().width, 640);
assert.equal(mask.clear(true), true);
assert.equal(mask.hasSelection(), false);
assert.equal(mask.undo(), true);
assert.equal(mask.hasSelection(), true);
assert.equal(mask.redo(), true);
assert.equal(mask.hasSelection(), false);
mask.release();
assert.equal(mask.width(), 1);
assert.equal(mask.height(), 1);

console.log('partial motion tests passed');
