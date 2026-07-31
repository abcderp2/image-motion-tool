'use strict';

function nextTask() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function gifQualityOptions() {
  switch (settings.gifQuality) {
    case 'high': return { adaptive: true, stride: 6, colors: 255, dither: 'ordered' };
    case 'balanced': return { adaptive: true, stride: 12, colors: 192, dither: 'none' };
    default: return { adaptive: false, stride: 1, colors: 256, dither: 'none' };
  }
}

function ensureNotCancelled() {
  if (exportCancelled) throw new DOMException('生成を中止しました。', 'AbortError');
}

async function buildGifPalette(canvas, exportContext, prepared, estimate, quality) {
  if (!quality.adaptive) return gifApi.fixedPalette();
  const histogram = gifApi.createColorHistogram();
  for (let index = 0; index < estimate.frames; index += 1) {
    ensureNotCancelled();
    drawFrame(exportContext, estimate.width, estimate.height, index / settings.fps, { source: prepared, forExport: true });
    const rgba = exportContext.getImageData(0, 0, estimate.width, estimate.height).data;
    gifApi.addRgbaToHistogram(histogram, rgba, {
      transparent: settings.backgroundMode === 'transparent',
      stride: quality.stride,
    });
    elements.progress.value = Math.round(((index + 1) / estimate.frames) * 30);
    setStatus(`GIFの色を分析中 ${index + 1}/${estimate.frames}`);
    if (index % 2 === 1) await nextTask();
  }
  ensureNotCancelled();
  return gifApi.paletteFromHistogram(histogram, {
    transparent: settings.backgroundMode === 'transparent',
    maxColors: quality.colors,
  });
}

async function buildIndexedFrames(exportContext, prepared, estimate, palette, quality) {
  const frames = [];
  const progressStart = quality.adaptive ? 32 : 5;
  const progressRange = quality.adaptive ? 43 : 70;
  for (let index = 0; index < estimate.frames; index += 1) {
    ensureNotCancelled();
    drawFrame(exportContext, estimate.width, estimate.height, index / settings.fps, { source: prepared, forExport: true });
    const rgba = exportContext.getImageData(0, 0, estimate.width, estimate.height).data;
    frames.push(gifApi.rgbaToIndexed(rgba, {
      transparent: settings.backgroundMode === 'transparent',
      palette,
      width: estimate.width,
      dither: quality.dither,
    }));
    elements.progress.value = Math.round(progressStart + ((index + 1) / estimate.frames) * progressRange);
    setStatus(`GIF用フレームを作成中 ${index + 1}/${estimate.frames}`);
    if (index % 2 === 1) await nextTask();
  }
  return frames;
}

function encodeWithWorker(frames, palette, estimate) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker('gif-worker.js?v=2');
    } catch (error) {
      reject(error);
      return;
    }
    activeWorker = worker;
    activeWorkerReject = reject;
    const buffers = frames.map((frame) => frame.buffer);
    worker.addEventListener('message', (event) => {
      activeWorker = null;
      activeWorkerReject = null;
      worker.terminate();
      if (!event.data.ok) {
        reject(new Error(event.data.message));
        return;
      }
      resolve(new Uint8Array(event.data.buffer));
    }, { once: true });
    worker.addEventListener('error', (event) => {
      activeWorker = null;
      activeWorkerReject = null;
      worker.terminate();
      reject(new Error(event.message || 'WorkerでGIFを生成できませんでした。'));
    }, { once: true });
    worker.postMessage({
      width: estimate.width,
      height: estimate.height,
      delay: Math.max(1, Math.round(100 / settings.fps)),
      transparent: settings.backgroundMode === 'transparent',
      palette: palette.buffer,
      frames: buffers,
    }, [palette.buffer, ...buffers]);
  });
}

async function encodeGif(frames, palette, estimate) {
  if (typeof Worker === 'function' && location.protocol !== 'file:') {
    try {
      return await encodeWithWorker(frames, palette, estimate);
    } catch (error) {
      const buffersIntact = palette.byteLength > 0 && frames.every((frame) => frame.byteLength > 0);
      if (!buffersIntact) throw error;
      setStatus('互換処理でGIFを仕上げています。');
    }
  }
  await nextTask();
  return gifApi.encodeIndexedFrames({
    width: estimate.width,
    height: estimate.height,
    delay: Math.max(1, Math.round(100 / settings.fps)),
    transparent: settings.backgroundMode === 'transparent',
    palette,
    frames,
  });
}

async function exportGif() {
  if (!image) {
    setStatus('先に画像を選んでください。');
    return;
  }
  if (exporting) return;
  const estimate = core.estimateGif(settings);
  if (!estimate.safe) {
    setStatus('GIFの処理量が安全上限を超えています。サイズ、長さ、滑らかさを下げてください。');
    return;
  }

  exportCancelled = false;
  setExportUi(true);
  elements.progress.value = 0;
  const canvas = document.createElement('canvas');
  canvas.width = estimate.width;
  canvas.height = estimate.height;
  const exportContext = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  let prepared = null;
  try {
    prepared = prepareSourceForOutput(estimate.width, estimate.height);
    const quality = gifQualityOptions();
    const palette = await buildGifPalette(canvas, exportContext, prepared, estimate, quality);
    ensureNotCancelled();
    const frames = await buildIndexedFrames(exportContext, prepared, estimate, palette, quality);
    ensureNotCancelled();
    elements.progress.value = 80;
    setStatus('GIFを圧縮しています。');
    const encoded = await encodeGif(frames, palette, estimate);
    ensureNotCancelled();
    elements.progress.value = 100;
    downloadBlob(new Blob([encoded], { type: 'image/gif' }), `image-motion-${fileTimestamp()}.gif`);
    setStatus('継ぎ目が目立ちにくいGIFを保存しました。');
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') setStatus('GIF生成を中止しました。');
    else setStatus(error instanceof Error ? error.message : 'GIFを生成できませんでした。');
  } finally {
    activeWorker = null;
    activeWorkerReject = null;
    if (prepared !== image) releaseCanvas(prepared);
    releaseCanvas(canvas);
    setExportUi(false);
  }
}

function cancelExport() {
  exportCancelled = true;
  if (activeWorker) {
    activeWorker.terminate();
    activeWorker = null;
    const reject = activeWorkerReject;
    activeWorkerReject = null;
    if (reject) reject(new DOMException('生成を中止しました。', 'AbortError'));
  }
  setStatus('生成を中止しています。');
}

function exportSettings() {
  const payload = {
    app: 'image-motion-tool',
    settingsVersion: core.SETTINGS_VERSION,
    settings,
  };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
  downloadBlob(blob, `image-motion-settings-${fileTimestamp()}.json`);
  setStatus('設定JSONを保存しました。画像データは含まれません。');
}

async function importSettings(file) {
  if (!(file instanceof File)) throw new Error('設定JSONを選んでください。');
  if (file.size > core.LIMITS.maxSettingsBytes) throw new Error('設定ファイルが大きすぎます。');
  const parsed = JSON.parse(await file.text());
  const candidate = core.isPlainObject(parsed) && core.isPlainObject(parsed.settings) ? parsed.settings : parsed;
  if (!core.isPlainObject(candidate)) throw new Error('設定JSONの形式が正しくありません。');
  const previous = { ...settings };
  settings = core.sanitizeSettings(candidate);
  commitSettings(previous);
  applySettingsToControls();
  resizePreview();
  drawPreviewNow();
  setStatus('設定を安全な範囲へ調整して読み込みました。');
}

function resetSettings() {
  const previous = { ...settings };
  settings = { ...core.DEFAULTS };
  commitSettings(previous);
  applySettingsToControls();
  resizePreview();
  drawPreviewNow();
  setStatus('設定を初期値へ戻しました。取り消しで元に戻せます。');
}
