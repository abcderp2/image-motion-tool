'use strict';

function nextTask() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function gifQualityOptions() {
  switch (settings.gifQuality) {
    case 'high': return { adaptive: true, stride: 2, colors: 256, refineIterations: 2, dither: 'none', ditherStrength: 0 };
    case 'balanced': return { adaptive: true, stride: 8, colors: 256, refineIterations: 0, dither: 'none', ditherStrength: 0 };
    default: return { adaptive: false, stride: 1, colors: 256, refineIterations: 0, dither: 'none', ditherStrength: 0 };
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
    refineIterations: quality.refineIterations,
  });
}

async function buildIndexedFrames(exportContext, prepared, estimate, palette, quality) {
  const frames = [];
  const progressStart = quality.adaptive ? 32 : 5;
  const progressRange = quality.adaptive ? 43 : 70;
  const transparent = settings.backgroundMode === 'transparent';
  const lookup = gifApi.createPaletteLookup(palette, { transparent });
  for (let index = 0; index < estimate.frames; index += 1) {
    ensureNotCancelled();
    drawFrame(exportContext, estimate.width, estimate.height, index / settings.fps, { source: prepared, forExport: true });
    const rgba = exportContext.getImageData(0, 0, estimate.width, estimate.height).data;
    frames.push(gifApi.rgbaToIndexed(rgba, {
      transparent,
      palette,
      lookup,
      width: estimate.width,
      dither: quality.dither,
      ditherStrength: quality.ditherStrength,
    }));
    elements.progress.value = Math.round(progressStart + ((index + 1) / estimate.frames) * progressRange);
    setStatus(`GIF用フレームを作成中 ${index + 1}/${estimate.frames}`);
    if (index % 2 === 1) await nextTask();
  }
  return frames;
}

async function buildPngFrames(canvas, exportContext, prepared, estimate) {
  const frames = [];
  for (let index = 0; index < estimate.frames; index += 1) {
    ensureNotCancelled();
    drawFrame(exportContext, estimate.width, estimate.height, index / settings.fps, { source: prepared, forExport: true });
    const blob = await canvasToBlob(canvas, 'image/png');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const info = window.ImageMotionApng.inspectPng(bytes, { maxDimension: core.LIMITS.maxDimension });
    if (info.width !== estimate.width || info.height !== estimate.height) {
      throw new Error('APNG用フレームの画像寸法が一致しません。');
    }
    frames.push(bytes);
    elements.progress.value = Math.round(5 + ((index + 1) / estimate.frames) * 70);
    setStatus(`APNG用フレームを作成中 ${index + 1}/${estimate.frames}`);
    if (index % 2 === 1) await nextTask();
  }
  ensureNotCancelled();
  return frames;
}

async function buildWebpFrames(canvas, exportContext, prepared, estimate) {
  const frames = [];
  for (let index = 0; index < estimate.frames; index += 1) {
    ensureNotCancelled();
    drawFrame(exportContext, estimate.width, estimate.height, index / settings.fps, { source: prepared, forExport: true });
    const blob = await canvasToBlob(canvas, 'image/webp', settings.webpQuality);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const info = window.ImageMotionWebp.inspectWebpFrame(bytes, { maxDimension: core.LIMITS.maxDimension });
    if (info.width !== estimate.width || info.height !== estimate.height) {
      throw new Error('アニメーションWebP用フレームの画像寸法が一致しません。');
    }
    frames.push(bytes);
    elements.progress.value = Math.round(5 + ((index + 1) / estimate.frames) * 70);
    setStatus(`アニメーションWebP用フレームを作成中 ${index + 1}/${estimate.frames}`);
    if (index % 2 === 1) await nextTask();
  }
  ensureNotCancelled();
  return frames;
}

function encodeWithWorker(frames, palette, estimate) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker('gif-worker.js?v=5');
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
      delay: core.gifFrameDelay(settings),
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
    delay: core.gifFrameDelay(settings),
    transparent: settings.backgroundMode === 'transparent',
    palette,
    frames,
  });
}

function roundedDelayMessage(settingsValue, delay) {
  const safe = core.sanitizeSettings(settingsValue);
  const exact = 100 / (safe.fps * (safe.speed / core.DEFAULTS.speed));
  return Math.abs(exact - delay) > 1e-9
    ? `フレーム間隔を${delay}百分の1秒へ安全に丸めました。`
    : 'フレーム間隔は設定値どおりです。';
}

async function exportApng() {
  if (!image) {
    setStatus('先に画像を選んでください。');
    return;
  }
  if (exporting) return;
  const estimate = core.estimateApng(settings, navigator.deviceMemory);
  if (!estimate.safe) {
    setStatus('APNGの処理量、推定メモリ、または生成予定サイズが安全上限を超えています。サイズ、長さ、滑らかさを下げてください。');
    return;
  }
  const apngApi = window.ImageMotionApng;
  if (!apngApi) {
    setStatus('APNG処理を読み込めませんでした。ページを更新して再試行してください。');
    return;
  }

  exportCancelled = false;
  setExportUi(true);
  elements.progress.value = 0;
  const canvas = document.createElement('canvas');
  canvas.width = estimate.width;
  canvas.height = estimate.height;
  const exportContext = canvas.getContext('2d', { alpha: true });
  let prepared = null;
  let frames = null;
  try {
    prepared = prepareSourceForOutput(estimate.width, estimate.height);
    frames = await buildPngFrames(canvas, exportContext, prepared, estimate);
    ensureNotCancelled();
    elements.progress.value = 80;
    setStatus('APNGのチャンクを組み立てています。');
    const encoded = apngApi.encodeApng(frames, {
      delayNumerator: estimate.frameDelay,
      delayDenominator: 100,
      numPlays: 0,
      maxDimension: core.LIMITS.maxDimension,
      maxTotalPixels: estimate.maxRenderPixels,
      maxOutputBytes: estimate.maxOutputBytes,
    });
    ensureNotCancelled();
    elements.progress.value = 100;
    const blob = new Blob([encoded], { type: 'image/apng' });
    lastGeneratedGifSettings = null;
    setGifPreview(blob, 'apng');
    downloadBlob(blob, `image-motion-${fileTimestamp()}.png`);
    setStatus(`APNGを保存しました。${roundedDelayMessage(settings, estimate.frameDelay)}表示できない環境では保存したPNGを利用できます。`);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') setStatus('APNG生成を中止しました。');
    else setStatus(error instanceof Error ? error.message : 'APNGを生成できませんでした。');
  } finally {
    frames = null;
    if (prepared !== image) releaseCanvas(prepared);
    releaseCanvas(canvas);
    setExportUi(false);
  }
}

function webpBackgroundColor() {
  const color = backgroundColor();
  if (!color) return 0;
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return 0;
  const rgb = Number.parseInt(match[1], 16);
  const red = (rgb >>> 16) & 0xff;
  const green = (rgb >>> 8) & 0xff;
  const blue = rgb & 0xff;
  return (blue | (green << 8) | (red << 16) | (0xff << 24)) >>> 0;
}

async function exportAnimatedWebp() {
  if (!image) {
    setStatus('先に画像を選んでください。');
    return;
  }
  if (exporting) return;
  if (!supportsWebp) {
    setStatus('このブラウザはWebP保存に対応していません。GIFまたはAPNGを選んでください。');
    return;
  }
  const estimate = core.estimateWebp(settings, navigator.deviceMemory);
  if (!estimate.safe) {
    setStatus('アニメーションWebPの処理量、推定メモリ、または生成予定サイズが安全上限を超えています。サイズ、長さ、滑らかさを下げてください。');
    return;
  }
  const webpApi = window.ImageMotionWebp;
  if (!webpApi) {
    setStatus('アニメーションWebP処理を読み込めませんでした。ページを更新して再試行してください。');
    return;
  }

  exportCancelled = false;
  setExportUi(true);
  elements.progress.value = 0;
  const canvas = document.createElement('canvas');
  canvas.width = estimate.width;
  canvas.height = estimate.height;
  const exportContext = canvas.getContext('2d', { alpha: true });
  let prepared = null;
  let frames = null;
  try {
    prepared = prepareSourceForOutput(estimate.width, estimate.height);
    frames = await buildWebpFrames(canvas, exportContext, prepared, estimate);
    ensureNotCancelled();
    elements.progress.value = 80;
    setStatus('アニメーションWebPのRIFFチャンクを組み立てています。');
    const encoded = webpApi.encodeAnimatedWebp(frames, {
      durationMs: estimate.frameDelay * 10,
      loopCount: 0,
      backgroundColor: webpBackgroundColor(),
      maxDimension: core.LIMITS.maxDimension,
      maxTotalPixels: estimate.maxRenderPixels,
      maxOutputBytes: estimate.maxOutputBytes,
    });
    ensureNotCancelled();
    elements.progress.value = 100;
    const blob = new Blob([encoded], { type: 'image/webp' });
    lastGeneratedGifSettings = null;
    setGifPreview(blob, 'webp');
    downloadBlob(blob, `image-motion-${fileTimestamp()}.webp`);
    setStatus(`アニメーションWebPを保存しました。${roundedDelayMessage(settings, estimate.frameDelay)}Canvas標準のWebP非可逆圧縮を使用しています。`);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') setStatus('アニメーションWebP生成を中止しました。');
    else setStatus(error instanceof Error ? error.message : 'アニメーションWebPを生成できませんでした。');
  } finally {
    frames = null;
    if (prepared !== image) releaseCanvas(prepared);
    releaseCanvas(canvas);
    setExportUi(false);
  }
}

async function exportGif() {
  if (settings.animationFormat === 'apng') {
    await exportApng();
    return;
  }
  if (settings.animationFormat === 'webp') {
    await exportAnimatedWebp();
    return;
  }
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
    const gifBlob = new Blob([encoded], { type: 'image/gif' });
    lastGeneratedGifSettings = core.sanitizeSettings(settings);
    setGifPreview(gifBlob, 'gif');
    downloadBlob(gifBlob, `image-motion-${fileTimestamp()}.gif`);
    setStatus('GIFを保存しました。別タブで元のGIFを開き、拡大して確認できます。');
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

async function regenerateGifWithSpeed() {
  if (!lastGeneratedGifSettings) {
    setStatus('先にGIFを保存してください。');
    return;
  }
  if (!image) {
    setStatus('先に画像を選んでください。');
    return;
  }
  if (exporting) return;

  const currentSpeed = core.sanitizeSettings(settings).speed;
  const previousSettings = { ...settings };
  settings = core.sanitizeSettings({
    ...lastGeneratedGifSettings,
    speed: currentSpeed,
    animationFormat: 'gif',
  });
  commitSettings(previousSettings);
  applySettingsToControls();
  resizePreview();
  drawPreviewNow();
  setStatus('最後に生成した設定を使い、速度だけを変えてGIFを再生成しています。');
  await exportGif();
}

async function loadGifForRetiming(file) {
  if (!(file instanceof File)) throw new Error('GIFファイルを選んでください。');
  if (file.size < 14) throw new Error('GIFファイルが空か壊れています。');
  if (file.size > core.LIMITS.maxFileBytes) throw new Error('GIFは15MB以下にしてください。');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = gifRetimer.inspectGif(bytes);
  setGifRetimeSource(bytes, info, file.name);
  setStatus(`${info.width}×${info.height}px、${info.frames}フレームのGIFを読み込みました。フレーム画像は変更せず表示時間だけを変更できます。`);
}

function safeGifFileStem(fileName) {
  const stem = String(fileName || 'image-motion').replace(/\.[^.]+$/, '');
  const safe = stem.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  return safe || 'image-motion';
}

async function exportRetimedGif() {
  if (!(gifRetimeBytes instanceof Uint8Array) || !gifRetimeInfo) {
    setStatus('先に速度を変更するGIFを選んでください。');
    return;
  }
  if (exporting) return;

  exportCancelled = false;
  setExportUi(true);
  elements.progress.value = 15;
  try {
    await nextTask();
    ensureNotCancelled();
    const multiplier = gifRetimer.normalizeSpeedMultiplier(elements.gifRetimeMultiplier.value);
    const encoded = gifRetimer.retimeGif(gifRetimeBytes, multiplier);
    ensureNotCancelled();
    elements.progress.value = 100;
    const blob = new Blob([encoded], { type: 'image/gif' });
    setRetimedGifPreview(blob);
    const multiplierLabel = String(multiplier).replace('.', '_');
    downloadBlob(blob, `${safeGifFileStem(gifRetimeFileName)}-speed-${multiplierLabel}x.gif`);
    setStatus(`GIFを速度${multiplier}倍で保存しました。フレーム画像と元の透過・ループ情報は変更していません。`);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') setStatus('GIFの速度変更を中止しました。');
    else setStatus(error instanceof Error ? error.message : 'GIFの速度を変更できませんでした。');
  } finally {
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
