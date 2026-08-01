import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../app-core.js');

function pngHeader(width, height) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes.buffer;
}

function jpegHeader(width, height) {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >>> 8) & 0xff, height & 0xff,
    (width >>> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
  ]).buffer;
}

function webpVp8xHeader(width, height) {
  const bytes = new Uint8Array(30);
  bytes.set([...Buffer.from('RIFF')], 0);
  new DataView(bytes.buffer).setUint32(4, 22, true);
  bytes.set([...Buffer.from('WEBPVP8X')], 8);
  new DataView(bytes.buffer).setUint32(16, 10, true);
  const w = width - 1;
  const h = height - 1;
  bytes.set([w & 0xff, (w >>> 8) & 0xff, (w >>> 16) & 0xff], 24);
  bytes.set([h & 0xff, (h >>> 8) & 0xff, (h >>> 16) & 0xff], 27);
  return bytes.buffer;
}

assert.deepEqual(core.ratioDimensions(1080, '1:1'), { width: 1080, height: 1080 });
assert.deepEqual(core.ratioDimensions(1080, '4:5'), { width: 864, height: 1080 });
assert.deepEqual(core.ratioDimensions(1080, '16:9'), { width: 1080, height: 608 });

const migrated = core.sanitizeSettings({ outputSize: 480, preset: 'orbit', duration: 5, fps: 12 });
assert.equal(migrated.gifSize, 480);
assert.equal(migrated.preset, 'orbit');
assert.equal(migrated.settingsVersion, 2);
assert.equal(core.sanitizeSettings({ preset: 'squash' }).preset, 'squash');
assert.equal(core.sanitizeSettings({ animationFormat: 'apng' }).animationFormat, 'apng');
assert.equal(core.sanitizeSettings({ animationFormat: 'webm' }).animationFormat, 'gif');

const hostile = core.sanitizeSettings({
  preset: '<script>',
  zoom: Number.POSITIVE_INFINITY,
  offsetX: 999999,
  backgroundColor: 'red',
  stillQuality: -10,
});
assert.equal(hostile.preset, core.DEFAULTS.preset);
assert.equal(hostile.zoom, core.DEFAULTS.zoom);
assert.equal(hostile.offsetX, 240);
assert.equal(hostile.backgroundColor, '#ffffff');
assert.equal(hostile.stillQuality, 0.6);

assert.deepEqual(core.parseImageHeader(pngHeader(800, 600)), { type: 'image/png', width: 800, height: 600 });
assert.deepEqual(core.parseImageHeader(jpegHeader(640, 480)), { type: 'image/jpeg', width: 640, height: 480 });
assert.deepEqual(core.parseImageHeader(webpVp8xHeader(1024, 768)), { type: 'image/webp', width: 1024, height: 768 });
assert.throws(() => core.parseImageHeader(Uint8Array.from([1, 2, 3, 4]).buffer), /PNG、JPEG、WebP/);
assert.throws(() => core.validateImageMetadata({ width: 9000, height: 10 }, 8), /8192/);
assert.throws(() => core.validateImageMetadata({ width: 5000, height: 5000 }, 2), /16メガピクセル/);

const gifEstimate = core.estimateGif({ ...core.DEFAULTS, canvasRatio: '9:16', gifSize: 480, duration: 5, fps: 12 });
assert.equal(gifEstimate.width, 270);
assert.equal(gifEstimate.height, 480);
assert.equal(gifEstimate.frames, 60);
assert.equal(gifEstimate.safe, true);

const defaultGifSettings = { ...core.DEFAULTS, fps: 10 };
const defaultDelay = core.gifFrameDelay(defaultGifSettings);
assert.equal(defaultDelay, 10);
assert.ok(core.gifFrameDelay({ ...defaultGifSettings, speed: 0.2 }) > defaultDelay);
assert.ok(core.gifFrameDelay({ ...defaultGifSettings, speed: 2 }) < defaultDelay);
assert.equal(gifEstimate.frameDelay, core.gifFrameDelay({ ...core.DEFAULTS, canvasRatio: '9:16', gifSize: 480, duration: 5, fps: 12 }));
assert.equal(gifEstimate.playbackSeconds, gifEstimate.frames * gifEstimate.frameDelay / 100);

const apngEstimate = core.estimateApng({ ...core.DEFAULTS, gifSize: 360, duration: 3, fps: 10 }, 4);
assert.equal(apngEstimate.frames, 30);
assert.equal(apngEstimate.renderPixels, 3_888_000);
assert.equal(apngEstimate.frameDelay, 10);
assert.ok(apngEstimate.estimatedMemoryBytes > apngEstimate.renderPixels);
assert.equal(apngEstimate.safe, true);
assert.equal(core.estimateApng({ ...core.DEFAULTS, gifSize: 480, duration: 5, fps: 12 }, 2).safe, false);

console.log('app-core tests passed');
