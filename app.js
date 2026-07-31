'use strict';

if (window.top !== window.self) {
  document.documentElement.textContent = 'このツールは埋め込み表示では利用できません。公式ページを直接開いてください。';
  throw new Error('Embedded use is blocked.');
}

const core = window.ImageMotionCore;
const gifApi = window.ImageMotionGif;
if (!core || !gifApi) throw new Error('必要な処理ファイルを読み込めませんでした。');

const elements = {
  imageInput: document.querySelector('#imageInput'),
  importSettingsInput: document.querySelector('#importSettingsInput'),
  canvas: document.querySelector('#previewCanvas'),
  canvasShell: document.querySelector('.canvas-shell'),
  playButton: document.querySelector('#playButton'),
  centerButton: document.querySelector('#centerButton'),
  flipButton: document.querySelector('#flipButton'),
  removeImageButton: document.querySelector('#removeImageButton'),
  undoButton: document.querySelector('#undoButton'),
  redoButton: document.querySelector('#redoButton'),
  resetButton: document.querySelector('#resetButton'),
  exportGifButton: document.querySelector('#exportGifButton'),
  exportStillButton: document.querySelector('#exportStillButton'),
  cancelExportButton: document.querySelector('#cancelExportButton'),
  exportSettingsButton: document.querySelector('#exportSettingsButton'),
  progress: document.querySelector('#exportProgress'),
  status: document.querySelector('#status'),
  gifEstimate: document.querySelector('#gifEstimate'),
  stillEstimate: document.querySelector('#stillEstimate'),
  backgroundColor: document.querySelector('#backgroundColor'),
  stillQuality: document.querySelector('#stillQuality'),
  stillFormat: document.querySelector('#stillFormat'),
};

const controlIds = [
  'preset', 'amplitude', 'speed', 'rotation', 'pulse', 'zoom', 'reverse', 'loopCycles',
  'canvasRatio', 'gifSize', 'duration', 'fps', 'gifQuality', 'stillSize', 'stillFormat',
  'stillQuality', 'backgroundMode', 'backgroundColor',
];
for (const id of controlIds) elements[id] = document.querySelector(`#${id}`);

const outputs = {
  amplitude: document.querySelector('#amplitudeValue'),
  speed: document.querySelector('#speedValue'),
  rotation: document.querySelector('#rotationValue'),
  pulse: document.querySelector('#pulseValue'),
  zoom: document.querySelector('#zoomValue'),
  stillQuality: document.querySelector('#stillQualityValue'),
};

const context = elements.canvas.getContext('2d', { alpha: true, desynchronized: true });
let settings = loadSettings();
let lastCommittedSettings = { ...settings };
let image = null;
let imageMetadata = null;
let imageObjectUrl = '';
let playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let animationStart = performance.now();
let animationFrame = 0;
let dragging = null;
let exportCancelled = false;
let exporting = false;
let activeWorker = null;
let activeWorkerReject = null;
const undoStack = [];
const redoStack = [];
const supportsWebp = detectWebpSupport();

function detectWebpSupport() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
}

function loadSettings() {
  for (const key of [core.STORAGE_KEY, core.LEGACY_STORAGE_KEY]) {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) continue;
      const sanitized = core.sanitizeSettings(JSON.parse(stored));
      if (key === core.LEGACY_STORAGE_KEY) {
        localStorage.setItem(core.STORAGE_KEY, JSON.stringify(sanitized));
        localStorage.removeItem(core.LEGACY_STORAGE_KEY);
      }
      return sanitized;
    } catch {
      // 壊れた設定は無視し、既定値で続行する。
    }
  }
  return { ...core.DEFAULTS };
}

function saveSettings() {
  try {
    localStorage.setItem(core.STORAGE_KEY, JSON.stringify(settings));
  } catch {
    setStatus('設定をブラウザへ保存できませんでした。ツール自体は利用できます。');
  }
}

function setStatus(message) {
  elements.status.textContent = message;
}

function applySettingsToControls() {
  for (const id of controlIds) {
    const element = elements[id];
    if (!element) continue;
    if (element.type === 'checkbox') element.checked = Boolean(settings[id]);
    else element.value = String(settings[id]);
  }
  elements.backgroundColor.disabled = settings.backgroundMode !== 'custom';
  elements.stillQuality.disabled = settings.stillFormat === 'png';
  elements.flipButton.setAttribute('aria-pressed', String(settings.flipped));
  updateOutputs();
  updateEstimates();
  updateHistoryButtons();
}

function readControls() {
  const candidate = { ...settings };
  for (const id of controlIds) {
    const element = elements[id];
    candidate[id] = element.type === 'checkbox' ? element.checked : element.value;
  }
  settings = core.sanitizeSettings(candidate);
  elements.backgroundColor.disabled = settings.backgroundMode !== 'custom';
  elements.stillQuality.disabled = settings.stillFormat === 'png';
  updateOutputs();
  updateEstimates();
  saveSettings();
}

function updateOutputs() {
  outputs.amplitude.value = `${Math.round(settings.amplitude)} px`;
  outputs.speed.value = `${settings.speed.toFixed(2)} 回毎秒`;
  outputs.rotation.value = `${Math.round(settings.rotation)} 度`;
  outputs.pulse.value = `${Math.round(settings.pulse)} %`;
  outputs.zoom.value = `${Math.round(settings.zoom)} %`;
  outputs.stillQuality.value = `${Math.round(settings.stillQuality * 100)} %`;
}

function updateEstimates() {
  const gif = core.estimateGif(settings);
  const qualityText = { fast: '軽量', balanced: '標準', high: '高画質' }[settings.gifQuality];
  elements.gifEstimate.textContent = `${gif.width}×${gif.height}px、${gif.frames}フレーム、色品質 ${qualityText}。${gif.safe ? '安全上限内です。' : '処理量が上限を超えています。'}`;
  const still = core.estimateStill(settings);
  const formatText = settings.stillFormat === 'jpeg' ? 'JPEG' : settings.stillFormat.toUpperCase();
  elements.stillEstimate.textContent = `${still.width}×${still.height}px、${formatText}。${still.safe ? '安全上限内です。' : '処理量が上限を超えています。'}`;
}

function updateHistoryButtons() {
  elements.undoButton.disabled = undoStack.length === 0;
  elements.redoButton.disabled = redoStack.length === 0;
}

function commitSettings(previousSettings) {
  const previous = core.sanitizeSettings(previousSettings);
  if (core.settingsEqual(previous, settings)) {
    lastCommittedSettings = { ...settings };
    return;
  }
  undoStack.push(previous);
  if (undoStack.length > core.LIMITS.maxHistoryEntries) undoStack.shift();
  redoStack.length = 0;
  lastCommittedSettings = { ...settings };
  saveSettings();
  updateHistoryButtons();
}

function mutateSettings(mutator) {
  const previous = { ...settings };
  const candidate = { ...settings };
  mutator(candidate);
  settings = core.sanitizeSettings(candidate);
  commitSettings(previous);
  applySettingsToControls();
  resizePreview();
  drawPreviewNow();
}

function undo() {
  const previous = undoStack.pop();
  if (!previous) return;
  redoStack.push({ ...settings });
  settings = core.sanitizeSettings(previous);
  lastCommittedSettings = { ...settings };
  saveSettings();
  applySettingsToControls();
  resizePreview();
  drawPreviewNow();
  setStatus('操作を1つ戻しました。');
}

function redo() {
  const next = redoStack.pop();
  if (!next) return;
  undoStack.push({ ...settings });
  settings = core.sanitizeSettings(next);
  lastCommittedSettings = { ...settings };
  saveSettings();
  applySettingsToControls();
  resizePreview();
  drawPreviewNow();
  setStatus('操作をやり直しました。');
}

function backgroundColor(overrideMode) {
  const mode = overrideMode || settings.backgroundMode;
  switch (mode) {
    case 'white': return '#ffffff';
    case 'black': return '#000000';
    case 'green': return '#00b140';
    case 'custom': return settings.backgroundColor;
    default: return null;
  }
}

function motionAt(seconds, forExport = false) {
  const direction = settings.reverse ? -1 : 1;
  const cycle = forExport
    ? (seconds / settings.duration) * settings.loopCycles * Math.PI * 2 * direction
    : seconds * settings.speed * Math.PI * 2 * direction;
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
    case 'zoom':
      scale = 1 + ((Math.sin(cycle) + 1) / 2) * settings.pulse / 100;
      break;
    case 'pendulum':
      y = Math.abs(Math.sin(cycle)) * amount * 0.12;
      rotation = Math.sin(cycle) * settings.rotation;
      break;
    default:
      y = Math.sin(cycle) * amount;
      rotation = Math.sin(cycle) * settings.rotation * 0.3;
      scale = 1 + Math.sin(cycle) * settings.pulse / 200;
      break;
  }
  return { x, y, rotation, scale };
}

function sourceDimensions(source) {
  return {
    width: source.naturalWidth || source.width,
    height: source.naturalHeight || source.height,
  };
}

function drawFrame(targetContext, width, height, seconds, options = {}) {
  targetContext.clearRect(0, 0, width, height);
  const fill = backgroundColor(options.backgroundMode);
  if (fill) {
    targetContext.fillStyle = fill;
    targetContext.fillRect(0, 0, width, height);
  }

  const source = options.source || image;
  if (!source) {
    targetContext.save();
    targetContext.fillStyle = '#526174';
    targetContext.textAlign = 'center';
    targetContext.textBaseline = 'middle';
    targetContext.font = `${Math.max(14, Math.round(Math.max(width, height) / 22))}px system-ui, sans-serif`;
    targetContext.fillText('画像を選んでください', width / 2, height / 2);
    targetContext.restore();
    return;
  }

  const motion = motionAt(seconds, Boolean(options.forExport));
  const sourceSize = sourceDimensions(source);
  const fitScale = Math.min(width / sourceSize.width, height / sourceSize.height);
  const zoomScale = fitScale * settings.zoom / 100 * motion.scale;
  const drawWidth = sourceSize.width * zoomScale;
  const drawHeight = sourceSize.height * zoomScale;
  const positionScale = Math.max(width, height) / 360;
  const centerX = width / 2 + (settings.offsetX + motion.x) * positionScale;
  const centerY = height / 2 + (settings.offsetY + motion.y) * positionScale;

  targetContext.save();
  targetContext.translate(centerX, centerY);
  targetContext.rotate(motion.rotation * Math.PI / 180);
  targetContext.scale(settings.flipped ? -1 : 1, 1);
  targetContext.imageSmoothingEnabled = true;
  targetContext.imageSmoothingQuality = 'high';
  targetContext.drawImage(source, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  targetContext.restore();
}

function drawPreviewNow() {
  drawFrame(context, elements.canvas.width, elements.canvas.height, (performance.now() - animationStart) / 1000);
}

function render(now) {
  if (playing) drawFrame(context, elements.canvas.width, elements.canvas.height, (now - animationStart) / 1000);
  animationFrame = requestAnimationFrame(render);
}

function resizePreview() {
  const available = Math.max(220, elements.canvasShell.clientWidth - 24);
  const displayLongEdge = core.clamp(Math.floor(available), 220, 560);
  const display = core.ratioDimensions(displayLongEdge, settings.canvasRatio);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const internal = core.ratioDimensions(Math.round(displayLongEdge * pixelRatio), settings.canvasRatio);
  if (elements.canvas.width !== internal.width || elements.canvas.height !== internal.height) {
    elements.canvas.width = internal.width;
    elements.canvas.height = internal.height;
  }
  elements.canvas.style.width = `${display.width}px`;
  elements.canvas.style.height = `${display.height}px`;
  drawPreviewNow();
}
