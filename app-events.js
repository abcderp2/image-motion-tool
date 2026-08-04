'use strict';

for (const id of controlIds) {
  const element = elements[id];
  element.addEventListener('input', () => {
    readControls();
    if (id === 'canvasRatio') resizePreview();
    else drawPreviewNow();
  });
  element.addEventListener('change', () => {
    readControls();
    commitSettings(lastCommittedSettings);
    if (id === 'canvasRatio') resizePreview();
    else drawPreviewNow();
  });
}

if (!supportsWebp) {
  const webpOption = elements.stillFormat.querySelector('option[value="webp"]');
  if (webpOption) webpOption.disabled = true;
  const animationWebpOption = elements.animationFormat.querySelector('option[value="webp"]');
  if (animationWebpOption) animationWebpOption.disabled = true;
  if (settings.animationFormat === 'webp') {
    settings = core.sanitizeSettings({ ...settings, animationFormat: 'gif' });
    saveSettings();
  }
}

const originalSetStatus = setStatus;
function normalizeUserMessage(message) {
  return String(message)
    .replace(
      'Canvas標準のWebP非可逆圧縮を使用しています。',
      'CanvasのWebP出力を使用しています。端末や表示アプリによって再生できない場合はGIFまたはAPNGを使用してください。',
    )
    .replace(
      '別タブで元のGIFを開き、',
      '別タブで保存したGIFを開き、',
    );
}
setStatus = function setNormalizedStatus(message) {
  originalSetStatus(normalizeUserMessage(message));
};

const originalSetGifPreview = setGifPreview;
setGifPreview = function setCompatibleGifPreview(blob, format = 'gif') {
  originalSetGifPreview(blob, format);
  if (format === 'apng') {
    elements.gifPreviewHelp.textContent = '生成したAPNGそのものを別タブで表示します。動かない場合もファイル破損とは限りません。APNG対応ブラウザまたはアプリで確認してください。一時URLは次の生成時またはページを閉じた時に破棄します。';
  } else if (format === 'webp') {
    elements.gifPreviewHelp.textContent = '生成したアニメーションWebPそのものを別タブで表示します。動かない場合もファイル破損とは限りません。アニメーションWebP対応ブラウザまたはアプリで確認してください。一時URLは次の生成時またはページを閉じた時に破棄します。';
  }
};

function updateCompatibilityGuidance() {
  const estimate = document.querySelector('#gifEstimate');
  const animationHelp = estimate?.nextElementSibling;
  if (animationHelp) {
    animationHelp.textContent = '動きの速さを上げると、アニメーションの再生時間は短くなります。GIFの高画質では色を細かく分析し、細かな粒状の補正は使いません。APNGはフルカラーと透過を保ちます。アニメーションWebPはCanvasのWebP出力を指定画質で使います。端末、OS、ブラウザ、表示アプリの組み合わせによっては正常に生成または再生できない場合があります。その場合はGIFまたはAPNGを選んでください。性能が控えめな端末では、小さいサイズ、短い長さ、低いfpsから試してください。';
  }
  const apngHelp = document.querySelector('#apngCompatibilityHelp');
  if (apngHelp) {
    apngHelp.textContent = 'APNGを選んだ場合、対応ブラウザでは動きますが、写真アプリやファイルアプリがAPNG再生に対応していないと静止画として表示されます。動かない場合もファイル破損とは限りません。APNG対応ブラウザまたはアプリで確認してください。';
  }
  const previewHelp = document.querySelector('#gifPreviewHelp');
  if (previewHelp) {
    previewHelp.textContent = '生成したファイルそのものを別タブで表示します。動かない場合もファイル破損とは限りません。保存形式に対応したブラウザまたはアプリで確認してください。一時URLは次の生成時またはページを閉じた時に破棄します。';
  }
}
updateCompatibilityGuidance();

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

elements.gifRetimeInput.addEventListener('change', async () => {
  const file = elements.gifRetimeInput.files?.[0];
  elements.gifRetimeInput.value = '';
  if (!file) return;
  try {
    await loadGifForRetiming(file);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'GIFを読み込めませんでした。');
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
  setPlaying(!playing);
  if (!playing) drawPreviewNow();
});

for (const item of presetItems) {
  item.addEventListener('click', () => {
    if (exporting) return;
    const option = PRESET_OPTIONS.find((candidate) => candidate.value === item.dataset.presetValue);
    if (!option) return;
    mutateSettings((candidate) => { candidate.preset = option.value; });
    setStatus(`${option.label}へ切り替えました。`);
  });
}

elements.openPreviewButton.addEventListener('click', openCurrentPreviewInNewTab);

elements.centerButton.addEventListener('click', () => {
  mutateSettings((candidate) => {
    candidate.offsetX = 0;
    candidate.offsetY = 0;
  });
  setStatus('画像を中央へ戻しました。');
});

elements.flipButton.addEventListener('click', () => {
  mutateSettings((candidate) => { candidate.flipped = !candidate.flipped; });
  setStatus(settings.flipped ? '画像を左右反転しました。' : '左右反転を解除しました。');
});

elements.removeImageButton.addEventListener('click', clearImage);
elements.undoButton.addEventListener('click', undo);
elements.redoButton.addEventListener('click', redo);
elements.resetButton.addEventListener('click', resetSettings);
elements.exportGifButton.addEventListener('click', exportGif);
elements.regenerateGifButton.addEventListener('click', regenerateGifWithSpeed);
elements.retimeGifButton.addEventListener('click', exportRetimedGif);
elements.exportStillButton.addEventListener('click', exportStill);
elements.cancelExportButton.addEventListener('click', cancelExport);
elements.exportSettingsButton.addEventListener('click', exportSettings);

elements.canvas.addEventListener('pointerdown', (event) => {
  if (!image || exporting) return;
  elements.canvas.setPointerCapture(event.pointerId);
  dragging = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: settings.offsetX,
    offsetY: settings.offsetY,
    previous: { ...settings },
  };
});

elements.canvas.addEventListener('pointermove', (event) => {
  if (!dragging || dragging.pointerId !== event.pointerId) return;
  const rect = elements.canvas.getBoundingClientRect();
  const scale = 360 / Math.max(rect.width, rect.height);
  settings.offsetX = core.clamp(dragging.offsetX + (event.clientX - dragging.startX) * scale, -240, 240);
  settings.offsetY = core.clamp(dragging.offsetY + (event.clientY - dragging.startY) * scale, -240, 240);
  saveSettings();
  drawPreviewNow();
});

function finishDragging(event) {
  if (!dragging || dragging.pointerId !== event.pointerId) return;
  const previous = dragging.previous;
  dragging = null;
  commitSettings(previous);
  setStatus('画像の位置を変更しました。');
}

elements.canvas.addEventListener('pointerup', finishDragging);
elements.canvas.addEventListener('pointercancel', finishDragging);

elements.canvas.addEventListener('keydown', (event) => {
  if (exporting) return;
  const movement = event.shiftKey ? 10 : 2;
  const delta = {
    ArrowLeft: [-movement, 0],
    ArrowRight: [movement, 0],
    ArrowUp: [0, -movement],
    ArrowDown: [0, movement],
  }[event.key];
  if (!delta || !image) return;
  event.preventDefault();
  mutateSettings((candidate) => {
    candidate.offsetX += delta[0];
    candidate.offsetY += delta[1];
  });
});

document.addEventListener('keydown', (event) => {
  if (exporting) return;
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  if (event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
  } else if (event.key.toLowerCase() === 'y') {
    event.preventDefault();
    redo();
  }
});

window.addEventListener('resize', resizePreview, { passive: true });
window.addEventListener('pagehide', () => {
  cancelAnimationFrame(animationFrame);
  if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
  clearGifPreview();
  clearRetimedGifPreview();
  clearCurrentPreview();
  if (activeWorker) activeWorker.terminate();
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('sw.js?v=21', {
        scope: './',
        updateViaCache: 'none',
      });
      await registration.update();
    } catch {
      setStatus('オフライン起動の準備に失敗しました。通常の利用は続けられます。');
    }
  }, { once: true });
}

applySettingsToControls();
elements.removeImageButton.disabled = true;
elements.openPreviewButton.disabled = true;
elements.playButton.textContent = playing ? '一時停止' : '再生';
elements.playButton.setAttribute('aria-pressed', String(!playing));
resizePreview();
animationFrame = requestAnimationFrame(render);
