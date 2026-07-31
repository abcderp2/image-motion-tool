'use strict';

importScripts('gif-encoder.js?v=1');

self.addEventListener('message', (event) => {
  try {
    const payload = event.data;
    const frames = payload.frames.map((buffer) => new Uint8Array(buffer));
    const gif = self.ImageMotionGif.encodeIndexedFrames({
      width: payload.width,
      height: payload.height,
      delay: payload.delay,
      transparent: payload.transparent,
      frames,
    });
    self.postMessage({ ok: true, buffer: gif.buffer }, [gif.buffer]);
  } catch (error) {
    self.postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) });
  }
});
