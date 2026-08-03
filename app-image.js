'use strict';

async function inspectImageFile(file) {
  if (!(file instanceof File)) throw new Error('画像ファイルを選んでください。');
  if (file.size < 16) throw new Error('画像ファイルが空か壊れています。');
  if (file.size > core.LIMITS.maxFileBytes) throw new Error('画像は15MB以下にしてください。');
  const probeSize = Math.min(file.size, core.LIMITS.headerProbeBytes);
  const metadata = core.parseImageHeader(await file.slice(0, probeSize).arrayBuffer());
  core.validateImageMetadata(metadata, navigator.deviceMemory);
  return metadata;
}

async function loadImageFile(file) {
  const metadata = await inspectImageFile(file);
  const objectUrl = URL.createObjectURL(file);
  const candidate = new Image();
  candidate.decoding = 'async';
  candidate.src = objectUrl;
  try {
    await candidate.decode();
  } catch {
    URL.revokeObjectURL(objectUrl);
    throw new Error('画像を読み込めませんでした。別の画像へ書き出してから選んでください。');
  }

  const headerMatches = (candidate.naturalWidth === metadata.width && candidate.naturalHeight === metadata.height)
    || (candidate.naturalWidth === metadata.height && candidate.naturalHeight === metadata.width);
  if (!headerMatches) {
    URL.revokeObjectURL(objectUrl);
    throw new Error('画像ヘッダーと読み込み結果が一致しないため、安全のため中止しました。');
  }

  clearCurrentPreview();
  if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
  imageObjectUrl = objectUrl;
  image = candidate;
  imageMetadata = metadata;
  lastGeneratedGifSettings = null;
  clearGifPreview();
  settings.offsetX = 0;
  settings.offsetY = 0;
  lastCommittedSettings = { ...settings };
  saveSettings();
  elements.removeImageButton.disabled = false;
  elements.openPreviewButton.disabled = false;
  drawPreviewNow();
  const typeLabel = metadata.type === 'image/jpeg' ? 'JPEG' : metadata.type.split('/')[1].toUpperCase();
  setStatus(`${candidate.naturalWidth}×${candidate.naturalHeight}pxの${typeLabel}を読み込みました。保存画像から位置情報などのメタデータは引き継ぎません。`);
}

function clearImage() {
  if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
  imageObjectUrl = '';
  image = null;
  imageMetadata = null;
  lastGeneratedGifSettings = null;
  clearGifPreview();
  clearCurrentPreview();
  elements.imageInput.value = '';
  elements.removeImageButton.disabled = true;
  elements.openPreviewButton.disabled = true;
  drawPreviewNow();
  setStatus('画像を端末の作業領域から外しました。設定値だけが残っています。');
}

function prepareSourceForOutput(targetWidth, targetHeight) {
  if (!image) return null;
  const originalWidth = image.naturalWidth;
  const originalHeight = image.naturalHeight;
  const originalLongEdge = Math.max(originalWidth, originalHeight);
  const targetLongEdge = Math.max(targetWidth, targetHeight);
  const desiredLongEdge = Math.min(3072, Math.ceil(targetLongEdge * 2 * Math.max(1, settings.zoom / 100)));
  if (originalLongEdge <= desiredLongEdge) return image;

  const scale = desiredLongEdge / originalLongEdge;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(originalWidth * scale));
  canvas.height = Math.max(1, Math.round(originalHeight * scale));
  const resizeContext = canvas.getContext('2d', { alpha: true });
  resizeContext.imageSmoothingEnabled = true;
  resizeContext.imageSmoothingQuality = 'high';
  resizeContext.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function releaseCanvas(canvas) {
  if (canvas instanceof HTMLCanvasElement) {
    canvas.width = 1;
    canvas.height = 1;
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function fileTimestamp() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('このブラウザでは指定した形式で保存できませんでした。'));
    }, type, quality);
  });
}

function setExportUi(active) {
  exporting = active;
  elements.exportGifButton.disabled = active;
  elements.regenerateGifButton.disabled = active;
  elements.exportStillButton.disabled = active;
  elements.imageInput.disabled = active;
  elements.importSettingsInput.disabled = active;
  elements.gifRetimeInput.disabled = active;
  elements.gifRetimeMultiplier.disabled = active;
  elements.retimeGifButton.disabled = active;
  for (const id of controlIds) elements[id].disabled = active;
  for (const element of [
    elements.centerButton,
    elements.flipButton,
    elements.removeImageButton,
    elements.undoButton,
    elements.redoButton,
    elements.resetButton,
    elements.presetButton,
    elements.openPreviewButton,
    elements.exportSettingsButton,
  ]) element.disabled = active;
  elements.cancelExportButton.hidden = !active;
  if (!active) {
    elements.backgroundColor.disabled = settings.backgroundMode !== 'custom';
    elements.stillQuality.disabled = settings.stillFormat === 'png';
    updateAnimationFormatUi();
    elements.removeImageButton.disabled = !image;
    elements.openPreviewButton.disabled = !image;
    updateHistoryButtons();
    elements.progress.value = 0;
  }
}

async function exportStill() {
  if (!image) {
    setStatus('先に画像を選んでください。');
    return;
  }
  if (exporting) return;
  const estimate = core.estimateStill(settings);
  if (!estimate.safe) {
    setStatus('静止画像の処理量が安全上限を超えています。出力サイズを下げてください。');
    return;
  }
  if (settings.stillFormat === 'webp' && !supportsWebp) {
    setStatus('このブラウザはWebP保存に対応していません。PNGまたはJPEGを選んでください。');
    return;
  }

  setExportUi(true);
  elements.progress.value = 15;
  let prepared = null;
  const canvas = document.createElement('canvas');
  canvas.width = estimate.width;
  canvas.height = estimate.height;
  try {
    prepared = prepareSourceForOutput(estimate.width, estimate.height);
    const exportContext = canvas.getContext('2d', { alpha: true });
    const jpegBackground = settings.stillFormat === 'jpeg' && settings.backgroundMode === 'transparent' ? 'white' : undefined;
    drawFrame(exportContext, estimate.width, estimate.height, (performance.now() - animationStart) / 1000, {
      source: prepared,
      backgroundMode: jpegBackground,
    });
    elements.progress.value = 70;
    const mime = settings.stillFormat === 'jpeg' ? 'image/jpeg' : `image/${settings.stillFormat}`;
    const extension = settings.stillFormat === 'jpeg' ? 'jpg' : settings.stillFormat;
    const quality = settings.stillFormat === 'png' ? undefined : settings.stillQuality;
    const blob = await canvasToBlob(canvas, mime, quality);
    elements.progress.value = 100;
    downloadBlob(blob, `image-motion-${fileTimestamp()}.${extension}`);
    setStatus(`${extension.toUpperCase()}を保存しました。元画像の位置情報などのメタデータは含まれません。`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '静止画像を保存できませんでした。');
  } finally {
    if (prepared !== image) releaseCanvas(prepared);
    releaseCanvas(canvas);
    setExportUi(false);
  }
}
