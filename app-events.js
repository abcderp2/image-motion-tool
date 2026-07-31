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
}

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
  else drawPreviewNow();
});

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
  if (activeWorker) activeWorker.terminate();
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('sw.js?v=4', {
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
elements.playButton.textContent = playing ? '一時停止' : '再生';
elements.playButton.setAttribute('aria-pressed', String(!playing));
resizePreview();
animationFrame = requestAnimationFrame(render);
