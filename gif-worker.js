'use strict';

importScripts('gif-encoder.js?v=2');

self.addEventListener('message', (event) => {
  try {
    const frames = event.data.frames.map((buffer) => new Uint8Array(buffer));
    const palette = new Uint8Array(event.data.palette);
    const encoded = self.ImageMotionGif.encodeIndexedFrames({
      width: event.data.width,
      height: event.data.height,
      delay: event.data.delay,
      transparent: event.data.transparent,
      palette,
      frames,
    });
    self.postMessage({ ok: true, buffer: encoded.buffer }, [encoded.buffer]);
  } catch (error) {
    self.postMessage({ ok: false, message: error instanceof Error ? error.message : 'GIFを生成できませんでした。' });
  }
});
