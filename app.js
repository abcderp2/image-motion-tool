'use strict';

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_DIMENSION = 8192;
const MAX_PIXELS = 32_000_000;
const MAX_RENDER_PIXELS = 14_000_000;
const STORAGE_KEY = 'image-motion-tool-settings-v1';
const DEFAULTS = Object.freeze({
  preset: 'float',
  amplitude: 18,
  speed: 0.75,
  rotation: 4,
  pulse: 4,
  zoom: 88,
  outputSize: 360,
  duration: 3,
  fps: 10,
  backgroundMode: 'transparent',
  backgroundColor: '#ffffff',
  offsetX: 0,
  offsetY: 0,
  flipped: false,
});

const elements = {
  imageInput: document.querySelector('#imageInput'),
  importSettingsInput: document.querySelector('#importSettingsInput'),
  canvas: document.querySelector('#previewCanvas'),
  playButton: document.querySelector('#playButton'),
  centerButton: document.querySelector('#centerButton'),
  flipButton: document.querySelector('#flipButton'),
  resetButton: document.querySelector('#resetButton'),
  exportGifButton: document.querySelector('#exportGifButton'),
  exportPngButton: document.querySelector('#exportPngButton'),
  cancelExportButton: document.querySelector('#cancelExportButton'),
  exportSettingsButton: document.querySelector('#exportSettingsButton'),
  progress: document.querySelector('#exportProgress'),
  status: document.querySelector('#status'),
  frameEstimate: document.querySelector('#frameEstimate'),
  backgroundColor: document.querySelector('#backgroundColor'),
};

const controlIds = ['preset', 'amplitude', 'speed', 'rotation', 'pulse', 'zoom', 'outputSize', 'duration', 'fps', 'backgroundMode'];
for (const id of controlIds) {
  elements[id] = document.querySelector(`#${id}`);
}

const outputs = {
  amplitude: document.querySelector('#amplitudeValue'),
  speed: document.querySelector('#speedValue'),
  rotation: document.querySelector('#rotationValue'),
  pulse: document.querySelector('#pulseValue'),
  zoom: document.querySelector('#zoomValue'),
};

const context = elements.canvas.getContext('2d', { alpha: true, desynchronized: true });
let settings = loadSettings();
let image = null;
let imageObjectUrl = '';
let playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let animationStart = performance.now();
let animationFrame = 0;
let dragging = null;
let exportCancelled = false;
let exporting = false;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function sanitizeSettings(candidate) {
  const result = { ...DEFAULTS };
  const presets = new Set(['float', 'bounce', 'shake', 'sway', 'orbit', 'breathe']);
  const backgrounds = new Set(['transparent', 'white', 'black', 'green', 'custom']);
  result.preset = presets.has(candidate.preset) ? candidate.preset : DEFAULTS.preset;
  result.amplitude = clamp(Number(candidate.amplitude) || DEFAULTS.amplitude, 0, 60);
  result.speed = clamp(Number(candidate.speed) || DEFAULTS.speed, 0.2, 2);
  result.rotation = clamp(Number(candidate.rotation) || 0, 0, 18);
  result.pulse = clamp(Number(candidate.pulse) || 0, 0, 12);
  result.zoom = clamp(Number(candidate.zoom) || DEFAULTS.zoom, 40, 140);
  result.outputSize = [256, 360, 480].includes(Number(candidate.outputSize)) ? Number(candidate.outputSize) : DEFAULTS.outputSize;
  result.duration = [2, 3, 4, 5].includes(Number(candidate.duration)) ? Number(candidate.duration) : DEFAULTS.duration;
  result.fps = [8, 10, 12].includes(Number(candidate.fps)) ? Number(candidate.fps) : DEFAULTS.fps;
  result.backgroundMode = backgrounds.has(candidate.backgroundMode) ? candidate.backgroundMode : DEFAULTS.backgroundMode;
  result.backgroundColor = /^#[0-9a-f]{6}$/i.test(candidate.backgroundColor || '') ? candidate.backgroundColor : DEFAULTS.backgroundColor;
  result.offsetX = clamp(Number(candidate.offsetX) || 0, -180, 180);
  result.offsetY = clamp(Number(candidate.offsetY) || 0, -180, 180);
  result.flipped = Boolean(candidate.flipped);
  return result;
}

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return sanitizeSettings(stored);
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    setStatus('設定をブラウザへ保存できませんでした。ツール自体は利用できます。');
  }
}

function applySettingsToControls() {
  for (const id of controlIds) {
    elements[id].value = String(settings[id]);
  }
  elements.backgroundColor.value = settings.backgroundColor;
  elements.backgroundColor.disabled = settings.backgroundMode !== 'custom';
  elements.flipButton.setAttribute('aria-pressed', String(settings.flipped));
  updateOutputs();
  updateEstimate();
}

function readControls() {
  settings = sanitizeSettings({
    ...settings,
    preset: elements.preset.value,
    amplitude: elements.amplitude.value,
    speed: elements.speed.value,
    rotation: elements.rotation.value,
    pulse: elements.pulse.value,
    zoom: elements.zoom.value,
    outputSize: elements.outputSize.value,
    duration: elements.duration.value,
    fps: elements.fps.value,
    backgroundMode: elements.backgroundMode.value,
    backgroundColor: elements.backgroundColor.value,
  });
  elements.backgroundColor.disabled = settings.backgroundMode !== 'custom';
  updateOutputs();
  updateEstimate();
  saveSettings();
}

function updateOutputs() {
  outputs.amplitude.value = `${Math.round(settings.amplitude)} px`;
  outputs.speed.value = `${settings.speed.toFixed(2)} 回毎秒`;
  outputs.rotation.value = `${Math.round(settings.rotation)} 度`;
  outputs.pulse.value = `${Math.round(settings.pulse)} %`;
  outputs.zoom.value = `${Math.round(settings.zoom)} %`;
}

function updateEstimate() {
  const frames = settings.duration * settings.fps;
  const megapixels = (settings.outputSize * settings.outputSize * frames) / 1_000_000;
  elements.frameEstimate.textContent = `${frames}フレーム、処理量の目安 ${megapixels.toFixed(1)}メガピクセル`;
}

function setStatus(message) {
  elements.status.textContent = message;
}

function backgroundColor() {
  switch (settings.backgroundMode) {
    case 'white': return '#ffffff';
    case 'black': return '#000000';
    case 'green': return '#00b140';
    case 'custom': return settings.backgroundColor;
    default: return null;
  }
}

function motionAt(seconds) {
  const cycle = seconds * settings.speed * Math.PI * 2;
  const amount = settings.amplitude;
  let x = 0;
  let y = 0;
  let rotation = 0;
  let scale = 1;

  switch (settings.preset) {
    case 'bounce':
      y = -Math.abs(Math.sin(cycle)) * amount;
      rotation = Math.sin(cycle) * settings.rotation * 0.35;
      break;
    case 'shake':
      x = Math.sin(cycle * 5) * amount * 0.45;
      y = Math.sin(cycle * 7) * amount * 0.18;
      rotation = Math.sin(cycle * 6) * settings.rotation;
      break;
    case 'sway':
      x = Math.sin(cycle) * amount * 0.35;
      rotation = Math.sin(cycle) * settings.rotation;
      break;
    case 'orbit':
      x = Math.cos(cycle) * amount;
      y = Math.sin(cycle) * amount;
      rotation = Math.sin(cycle) * settings.rotation * 0.4;
      break;
    case 'breathe':
      y = Math.sin(cycle) * amount * 0.12;
      scale = 1 + Math.sin(cycle) * settings.pulse / 100;
      break;
    default:
      y = Math.sin(cycle) * amount;
      rotation = Math.sin(cycle) * settings.rotation * 0.3;
      scale = 1 + Math.sin(cycle) * settings.pulse / 200;
      break;
  }

  return { x, y, rotation, scale };
}

function drawFrame(targetContext, width, height, seconds) {
  targetContext.clearRect(0, 0, width, height);
  const fill = backgroundColor();
  if (fill) {
    targetContext.fillStyle = fill;
    targetContext.fillRect(0, 0, width, height);
  }

  if (!image) {
    targetContext.save();
    targetContext.fillStyle = '#526174';
    targetContext.textAlign = 'center';
    targetContext.textBaseline = 'middle';
    targetContext.font = `${Math.max(14, Math.round(width / 22))}px system-ui, sans-serif`;
    targetContext.fillText('画像を選んでください', width / 2, height / 2);
    targetContext.restore();
    return;
  }

  const motion = motionAt(seconds);
  const fitScale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const zoomScale = fitScale * settings.zoom / 100 * motion.scale;
  const drawWidth = image.naturalWidth * zoomScale;
  const drawHeight = image.naturalHeight * zoomScale;
  const positionScale = width / 360;
  const centerX = width / 2 + (settings.offsetX + motion.x) * positionScale;
  const centerY = height / 2 + (settings.offsetY + motion.y) * positionScale;

  targetContext.save();
  targetContext.translate(centerX, centerY);
  targetContext.rotate(motion.rotation * Math.PI / 180);
  targetContext.scale(settings.flipped ? -1 : 1, 1);
  targetContext.imageSmoothingEnabled = true;
  targetContext.imageSmoothingQuality = 'high';
  targetContext.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  targetContext.restore();
}

function render(now) {
  if (playing) {
    drawFrame(context, elements.canvas.width, elements.canvas.height, (now - animationStart) / 1000);
  }
  animationFrame = requestAnimationFrame(render);
}

function validateImageFile(file) {
  const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
  if (!allowedTypes.has(file.type)) {
    throw new Error('PNG、JPEG、WebPの画像を選んでください。SVGは読み込みません。');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('画像は15MB以下にしてください。');
  }
}

async function loadImageFile(file) {
  validateImageFile(file);
  const objectUrl = URL.createObjectURL(file);
  const candidate = new Image();
  candidate.decoding = 'async';
  candidate.src = objectUrl;
  try {
    await candidate.decode();
  } catch {
    URL.revokeObjectURL(objectUrl);
    throw new Error('画像を読み込めませんでした。別の画像を選んでください。');
  }
  if (candidate.naturalWidth > MAX_DIMENSION || candidate.naturalHeight > MAX_DIMENSION || candidate.naturalWidth * candidate.naturalHeight > MAX_PIXELS) {
    URL.revokeObjectURL(objectUrl);
    throw new Error('画像が大きすぎます。縦横8192px以下、合計3200万画素以下にしてください。');
  }
  if (imageObjectUrl) {
    URL.revokeObjectURL(imageObjectUrl);
  }
  imageObjectUrl = objectUrl;
  image = candidate;
  settings.offsetX = 0;
  settings.offsetY = 0;
  saveSettings();
  drawFrame(context, elements.canvas.width, elements.canvas.height, 0);
  setStatus(`${candidate.naturalWidth}×${candidate.naturalHeight}pxの画像を読み込みました。`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function fileTimestamp() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ];
  return parts.join('');
}

function canvasToBlob(canvas, type) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('画像を保存できませんでした。'));
    }, type);
  });
}

async function exportPng() {
  if (!image) {
    setStatus('先に画像を選んでください。');
    return;
  }
  const size = settings.outputSize;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const exportContext = canvas.getContext('2d', { alpha: true });
  drawFrame(exportContext, size, size, (performance.now() - animationStart) / 1000);
  const blob = await canvasToBlob(canvas, 'image/png');
  downloadBlob(blob, `image-motion-${fileTimestamp()}.png`);
  setStatus('PNGを保存しました。');
}

function nextTask() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function buildIndexedFrames() {
  const size = settings.outputSize;
  const totalFrames = settings.duration * settings.fps;
  if (size * size * totalFrames > MAX_RENDER_PIXELS) {
    throw new Error('処理量が大きすぎます。出力サイズ、長さ、滑らかさを下げてください。');
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const exportContext = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  const frames = [];
  for (let index = 0; index < totalFrames; index += 1) {
    if (exportCancelled) {
      throw new DOMException('生成を中止しました。', 'AbortError');
    }
    drawFrame(exportContext, size, size, index / settings.fps);
    const rgba = exportContext.getImageData(0, 0, size, size).data;
    frames.push(window.ImageMotionGif.rgbaToIndexed(rgba, settings.backgroundMode === 'transparent'));
    elements.progress.value = Math.round(((index + 1) / totalFrames) * 75);
    setStatus(`GIF用フレームを作成中 ${index + 1}/${totalFrames}`);
    if (index % 2 === 1) {
      await nextTask();
    }
  }
  return frames;
}

function encodeWithWorker(frames) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker('gif-worker.js?v=1');
    } catch (error) {
      reject(error);
      return;
    }
    const buffers = frames.map((frame) => frame.buffer);
    worker.addEventListener('message', (event) => {
      worker.terminate();
      if (!event.data.ok) {
        reject(new Error(event.data.message));
        return;
      }
      resolve(new Uint8Array(event.data.buffer));
    }, { once: true });
    worker.addEventListener('error', (event) => {
      worker.terminate();
      reject(new Error(event.message || 'WorkerでGIFを生成できませんでした。'));
    }, { once: true });
    worker.postMessage({
      width: settings.outputSize,
      height: settings.outputSize,
      delay: Math.max(1, Math.round(100 / settings.fps)),
      transparent: settings.backgroundMode === 'transparent',
      frames: buffers,
    }, buffers);
  });
}

async function encodeGif(frames) {
  if ('Worker' in window && location.protocol !== 'file:') {
    try {
      return await encodeWithWorker(frames);
    } catch {
      setStatus('互換処理でGIFを仕上げています。');
    }
  }
  await nextTask();
  return window.ImageMotionGif.encodeIndexedFrames({
    width: settings.outputSize,
    height: settings.outputSize,
    delay: Math.max(1, Math.round(100 / settings.fps)),
    transparent: settings.backgroundMode === 'transparent',
    frames,
  });
}

async function exportGif() {
  if (!image) {
    setStatus('先に画像を選んでください。');
    return;
  }
  if (exporting) return;
  exporting = true;
  exportCancelled = false;
  elements.exportGifButton.disabled = true;
  elements.exportPngButton.disabled = true;
  elements.cancelExportButton.hidden = false;
  elements.progress.value = 0;
  try {
    const frames = await buildIndexedFrames();
    if (exportCancelled) throw new DOMException('生成を中止しました。', 'AbortError');
    elements.progress.value = 80;
    setStatus('GIFを圧縮しています。');
    const gif = await encodeGif(frames);
    elements.progress.value = 100;
    downloadBlob(new Blob([gif], { type: 'image/gif' }), `image-motion-${fileTimestamp()}.gif`);
    setStatus('GIFを保存しました。');
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      setStatus('GIF生成を中止しました。');
    } else {
      setStatus(error instanceof Error ? error.message : 'GIFを生成できませんでした。');
    }
  } finally {
    exporting = false;
    elements.exportGifButton.disabled = false;
    elements.exportPngButton.disabled = false;
    elements.cancelExportButton.hidden = true;
  }
}

function exportSettings() {
  const blob = new Blob([`${JSON.stringify(settings, null, 2)}\n`], { type: 'application/json' });
  downloadBlob(blob, `image-motion-settings-${fileTimestamp()}.json`);
  setStatus('設定JSONを保存しました。画像データは含まれません。');
}

async function importSettings(file) {
  if (file.size > 100_000) throw new Error('設定ファイルが大きすぎます。');
  const parsed = JSON.parse(await file.text());
  settings = sanitizeSettings(parsed);
  saveSettings();
  applySettingsToControls();
  drawFrame(context, elements.canvas.width, elements.canvas.height, 0);
  setStatus('設定を読み込みました。');
}

function resetSettings() {
  settings = { ...DEFAULTS };
  saveSettings();
  applySettingsToControls();
  drawFrame(context, elements.canvas.width, elements.canvas.height, 0);
  setStatus('設定を初期値へ戻しました。');
}

function resizePreview() {
  const displaySize = clamp(Math.floor(elements.canvas.parentElement.clientWidth - 24), 240, 560);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const internalSize = Math.round(displaySize * pixelRatio);
  if (elements.canvas.width !== internalSize) {
    elements.canvas.width = internalSize;
    elements.canvas.height = internalSize;
    drawFrame(context, internalSize, internalSize, 0);
  }
}

for (const id of controlIds) {
  elements[id].addEventListener('input', readControls);
  elements[id].addEventListener('change', readControls);
}
elements.backgroundColor.addEventListener('input', readControls);

elements.imageInput.addEventListener('change', async () => {
  const file = elements.imageInput.files?.[0];
  elements.imageInput.value = '';
  if (!file) return;
  try {
    await loadImageFile(file);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '画像を読み込めませんでした。');
  }
});

elements.importSettingsInput.addEventListener('change', async () => {
  const file = elements.importSettingsInput.files?.[0];
  elements.importSettingsInput.value = '';
  if (!file) return;
  try {
    await importSettings(file);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '設定を読み込めませんでした。');
  }
});

elements.playButton.addEventListener('click', () => {
  playing = !playing;
  elements.playButton.textContent = playing ? '一時停止' : '再生';
  elements.playButton.setAttribute('aria-pressed', String(!playing));
  if (playing) animationStart = performance.now();
  else drawFrame(context, elements.canvas.width, elements.canvas.height, 0);
});

elements.centerButton.addEventListener('click', () => {
  settings.offsetX = 0;
  settings.offsetY = 0;
  saveSettings();
  drawFrame(context, elements.canvas.width, elements.canvas.height, 0);
});

elements.flipButton.addEventListener('click', () => {
  settings.flipped = !settings.flipped;
  elements.flipButton.setAttribute('aria-pressed', String(settings.flipped));
  saveSettings();
});

elements.resetButton.addEventListener('click', resetSettings);
elements.exportGifButton.addEventListener('click', exportGif);
elements.exportPngButton.addEventListener('click', () => exportPng().catch((error) => setStatus(error.message)));
elements.cancelExportButton.addEventListener('click', () => { exportCancelled = true; });
elements.exportSettingsButton.addEventListener('click', exportSettings);

elements.canvas.addEventListener('pointerdown', (event) => {
  if (!image || exporting) return;
  elements.canvas.setPointerCapture(event.pointerId);
  dragging = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, startX: settings.offsetX, startY: settings.offsetY };
});
elements.canvas.addEventListener('pointermove', (event) => {
  if (!dragging || dragging.pointerId !== event.pointerId) return;
  const rect = elements.canvas.getBoundingClientRect();
  settings.offsetX = clamp(dragging.startX + (event.clientX - dragging.x) * 360 / rect.width, -180, 180);
  settings.offsetY = clamp(dragging.startY + (event.clientY - dragging.y) * 360 / rect.height, -180, 180);
});
elements.canvas.addEventListener('pointerup', (event) => {
  if (dragging?.pointerId === event.pointerId) {
    dragging = null;
    saveSettings();
  }
});
elements.canvas.addEventListener('pointercancel', () => { dragging = null; });
elements.canvas.addEventListener('keydown', (event) => {
  const step = event.shiftKey ? 10 : 2;
  if (event.key === 'ArrowLeft') settings.offsetX -= step;
  else if (event.key === 'ArrowRight') settings.offsetX += step;
  else if (event.key === 'ArrowUp') settings.offsetY -= step;
  else if (event.key === 'ArrowDown') settings.offsetY += step;
  else return;
  event.preventDefault();
  settings.offsetX = clamp(settings.offsetX, -180, 180);
  settings.offsetY = clamp(settings.offsetY, -180, 180);
  saveSettings();
});

window.addEventListener('resize', resizePreview, { passive: true });
window.addEventListener('beforeunload', () => {
  cancelAnimationFrame(animationFrame);
  if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
});

applySettingsToControls();
elements.playButton.textContent = playing ? '一時停止' : '再生';
resizePreview();
animationFrame = requestAnimationFrame(render);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js?v=1').catch(() => {
      setStatus('オフライン保存を有効にできませんでした。通常利用はできます。');
    });
  }, { once: true });
}
