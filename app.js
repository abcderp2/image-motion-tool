'use strict';

if (window.top !== window.self) {
  document.documentElement.textContent = 'このツールは埋め込み表示では利用できません。公式ページを直接開いてください。';
  throw new Error('Embedded use is blocked.');
}

const core = window.ImageMotionCore;
const motionModel = window.ImageMotionModel;
const gifApi = window.ImageMotionGif;
const gifRetimer = window.ImageMotionGifRetimer;
if (!core || !motionModel || !gifApi || !gifRetimer) throw new Error('必要な処理ファイルを読み込めませんでした。');

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
  openGifPreviewLink: document.querySelector('#openGifPreviewLink'),
  gifPreviewHelp: document.querySelector('#gifPreviewHelp'),
  regenerateGifButton: document.querySelector('#regenerateGifButton'),
  regenerateGifHelp: document.querySelector('#regenerateGifHelp'),
  gifRetimeInput: document.querySelector('#gifRetimeInput'),
  gifRetimeControls: document.querySelector('#gifRetimeControls'),
  gifRetimeMultiplier: document.querySelector('#gifRetimeMultiplier'),
  gifRetimeInfo: document.querySelector('#gifRetimeInfo'),
  retimeGifButton: document.querySelector('#retimeGifButton'),
  openRetimedGifPreviewLink: document.querySelector('#openRetimedGifPreviewLink'),
  gifRetimePreviewHelp: document.querySelector('#gifRetimePreviewHelp'),
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
  'canvasRatio', 'animationFormat', 'gifSize', 'duration', 'fps', 'gifQuality', 'stillSize', 'stillFormat',
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
let lastGeneratedGifSettings = null;
let image = null;
let imageMetadata = null;
let imageObjectUrl = '';
let gifPreviewObjectUrl = '';
let gifPreviewFormat = 'gif';
let retimedGifPreviewObjectUrl = '';
let gifRetimeBytes = null;
let gifRetimeInfo = null;
let gifRetimeFileName = '';
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

function clearGifPreview() {
  if (gifPreviewObjectUrl) URL.revokeObjectURL(gifPreviewObjectUrl);
  gifPreviewObjectUrl = '';
  gifPreviewFormat = 'gif';
  elements.openGifPreviewLink.removeAttribute('href');
  elements.openGifPreviewLink.hidden = true;
  elements.openGifPreviewLink.textContent = '保存したアニメーションを別タブで開く';
  elements.gifPreviewHelp.hidden = true;
  hideGifRegeneration();
}

function hideGifRegeneration() {
  elements.regenerateGifButton.hidden = true;
  elements.regenerateGifHelp.hidden = true;
}

function setGifPreview(blob, format = 'gif') {
  clearGifPreview();
  gifPreviewObjectUrl = URL.createObjectURL(blob);
  gifPreviewFormat = format;
  elements.openGifPreviewLink.href = gifPreviewObjectUrl;
  const formatLabel = format === 'apng' ? 'APNG' : 'GIF';
  elements.openGifPreviewLink.textContent = `保存した${formatLabel}を別タブで開く`;
  elements.gifPreviewHelp.textContent = format === 'apng'
    ? '生成したAPNGそのものを別タブで表示します。APNGのアニメーション表示はブラウザにより異なるため、表示できない場合も保存ファイルは利用できます。一時URLは次の生成時またはページを閉じた時に破棄します。'
    : '生成したGIFそのものを別タブで表示します。ブラウザのピンチ操作や拡大機能で確認できます。一時URLは次の生成時またはページを閉じた時に破棄します。';
  elements.openGifPreviewLink.hidden = false;
  elements.gifPreviewHelp.hidden = false;
  elements.regenerateGifButton.hidden = format !== 'gif' || !lastGeneratedGifSettings;
  elements.regenerateGifHelp.hidden = format !== 'gif' || !lastGeneratedGifSettings;
}

function clearRetimedGifPreview() {
  if (retimedGifPreviewObjectUrl) URL.revokeObjectURL(retimedGifPreviewObjectUrl);
  retimedGifPreviewObjectUrl = '';
  elements.openRetimedGifPreviewLink.removeAttribute('href');
  elements.openRetimedGifPreviewLink.hidden = true;
  elements.gifRetimePreviewHelp.hidden = true;
}

function setGifRetimeSource(bytes, info, fileName) {
  gifRetimeBytes = bytes;
  gifRetimeInfo = info;
  gifRetimeFileName = fileName;
  clearRetimedGifPreview();
  elements.gifRetimeMultiplier.value = '1';
  elements.gifRetimeControls.hidden = false;
  const loopText = info.loopCount === 0
    ? '無限ループ'
    : info.loopCount === null
      ? 'ループ情報を保持'
      : `${info.loopCount}回ループ`;
  const transparencyText = info.hasTransparency ? '透過あり' : '透過なし';
  elements.gifRetimeInfo.textContent = `${info.width}×${info.height}px、${info.frames}フレーム、${transparencyText}、${loopText}。速度倍率を選んで保存できます。`;
}

function setRetimedGifPreview(blob) {
  clearRetimedGifPreview();
  retimedGifPreviewObjectUrl = URL.createObjectURL(blob);
  elements.openRetimedGifPreviewLink.href = retimedGifPreviewObjectUrl;
  elements.openRetimedGifPreviewLink.hidden = false;
  elements.gifRetimePreviewHelp.hidden = false;
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
  updateAnimationFormatUi();
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
  updateAnimationFormatUi();
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

function updateAnimationFormatUi() {
  const isApng = settings.animationFormat === 'apng';
  const qualityControl = elements.gifQuality?.closest('label');
  if (qualityControl) qualityControl.hidden = isApng;
  elements.exportGifButton.textContent = isApng ? 'APNGを保存' : 'GIFを保存';
  const canRegenerate = !isApng && gifPreviewFormat === 'gif' && Boolean(lastGeneratedGifSettings);
  elements.regenerateGifButton.hidden = !canRegenerate;
  elements.regenerateGifHelp.hidden = !canRegenerate;
}

function updateEstimates() {
  const animation = settings.animationFormat === 'apng'
    ? core.estimateApng(settings, navigator.deviceMemory)
    : core.estimateGif(settings);
  const formatText = settings.animationFormat === 'apng' ? 'APNG' : 'GIF';
  const qualityText = { fast: '軽量', balanced: '標準', high: '高画質' }[settings.gifQuality];
  const detail = settings.animationFormat === 'apng'
    ? `総処理画素 ${(animation.renderPixels / 1_000_000).toFixed(1)}MP、推定メモリ ${(animation.estimatedMemoryBytes / 1_048_576).toFixed(1)}MB`
    : `色品質 ${qualityText}`;
  elements.gifEstimate.textContent = `${formatText} ${animation.width}×${animation.height}px、再生約${animation.playbackSeconds.toFixed(1)}秒、${animation.frames}フレーム、${detail}。${animation.safe ? '安全上限内です。' : '処理量または推定メモリが上限を超えています。'}`;
  const still = core.estimateStill(settings);
  const stillFormatText = settings.stillFormat === 'jpeg' ? 'JPEG' : settings.stillFormat.toUpperCase();
  elements.stillEstimate.textContent = `${still.width}×${still.height}px、${stillFormatText}。${still.safe ? '安全上限内です。' : '処理量が上限を超えています。'}`;
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

  const motion = motionModel.motionAt(settings, seconds, Boolean(options.forExport));
  const sourceSize = sourceDimensions(source);
  const fitScale = Math.min(width / sourceSize.width, height / sourceSize.height);
  const baseScale = fitScale * settings.zoom / 100;
  const baseDrawWidth = sourceSize.width * baseScale;
  const baseDrawHeight = sourceSize.height * baseScale;
  const drawWidth = baseDrawWidth * motion.scaleX;
  const drawHeight = baseDrawHeight * motion.scaleY;
  const positionScale = Math.max(width, height) / 360;
  const centerX = width / 2 + (settings.offsetX + motion.x) * positionScale;
  const centerY = height / 2 + (settings.offsetY + motion.y) * positionScale;
  const pivotX = centerX + (motion.pivotX - 0.5) * baseDrawWidth;
  const pivotY = centerY + (motion.pivotY - 0.5) * baseDrawHeight;

  targetContext.save();
  targetContext.translate(pivotX, pivotY);
  targetContext.rotate(motion.rotation * Math.PI / 180);
  targetContext.scale(settings.flipped ? -1 : 1, 1);
  targetContext.imageSmoothingEnabled = true;
  targetContext.imageSmoothingQuality = 'high';
  targetContext.drawImage(
    source,
    -motion.pivotX * drawWidth,
    -motion.pivotY * drawHeight,
    drawWidth,
    drawHeight,
  );
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
