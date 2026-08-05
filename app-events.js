'use strict';

const PARTIAL_MOTION_SCRIPTS = Object.freeze([
  'partial-motion-mask.js?v=1',
  'partial-motion-render.js?v=1',
  'partial-motion-app.js?v=1',
]);

function loadLocalScript(source) {
  return new Promise((resolve, reject) => {
    const url = new URL(source, location.href);
    if (url.origin !== location.origin || !PARTIAL_MOTION_SCRIPTS.includes(source)) {
      reject(new Error('許可されていない追加スクリプトです。'));
      return;
    }
    const script = document.createElement('script');
    script.src = source;
    script.async = false;
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', () => reject(new Error(`${source}を読み込めませんでした。`)), { once: true });
    document.head.append(script);
  });
}

function fallbackPartialMotion() {
  return Object.freeze({
    drawFrame,
    beginStroke: () => false,
    continueStroke: () => false,
    finishStroke: () => false,
    leaveCanvas: () => undefined,
    handleShortcut: () => false,
    setExporting: () => undefined,
    suspendForImageLoad: () => false,
    restoreSuspension: () => undefined,
    acceptLoadedImage: () => undefined,
    clearLoadedImage: () => undefined,
    resetSelection: () => undefined,
    updateUi: () => undefined,
    isEditing: () => false,
    isPartial: () => false,
    release: () => undefined,
  });
}

async function createPartialMotion() {
  try {
    for (const source of PARTIAL_MOTION_SCRIPTS) await loadLocalScript(source);
    const controller = ImageMotionPartialApp.create({
      core,
      motionModel,
      originalDrawFrame: drawFrame,
      backgroundColor,
      sourceDimensions,
      getImage: () => image,
      getSettings: () => settings,
      getPlaying: () => playing,
      setPlaying,
      elements,
      previewContext: context,
      setStatus,
      drawPreviewNow,
    });
    drawFrame = controller.drawFrame;
    return controller;
  } catch (error) {
    setStatus(`部分モーションを準備できませんでした。画像全体の機能は利用できます。${error instanceof Error ? ` ${error.message}` : ''}`);
    return fallbackPartialMotion();
  }
}

async function initializeAppEvents() {
  const partialMotion = await createPartialMotion();
  const originalLoadImageFile = loadImageFile;
  loadImageFile = async function loadImageFileWithPartialMotion(file) {
    const previousSuspension = partialMotion.suspendForImageLoad();
    try {
      await originalLoadImageFile(file);
      partialMotion.acceptLoadedImage(image);
    } catch (error) {
      partialMotion.restoreSuspension(previousSuspension);
      throw error;
    }
  };

  const originalClearImage = clearImage;
  clearImage = function clearImageWithPartialMotion() {
    partialMotion.clearLoadedImage();
    originalClearImage();
    partialMotion.updateUi();
  };

  const originalSetExportUi = setExportUi;
  setExportUi = function setExportUiWithPartialMotion(active) {
    originalSetExportUi(active);
    partialMotion.setExporting(active);
  };

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
    if (partialMotion.isEditing()) return;
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

  elements.openPreviewButton.addEventListener('click', () => {
    if (partialMotion.isPartial()) {
      setStatus('部分モーションは画面内プレビュー、または保存後の別タブ表示で確認してください。');
      return;
    }
    openCurrentPreviewInNewTab();
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
  elements.resetButton.addEventListener('click', () => {
    resetSettings();
    partialMotion.resetSelection();
  });
  elements.exportGifButton.addEventListener('click', exportGif);
  elements.regenerateGifButton.addEventListener('click', regenerateGifWithSpeed);
  elements.retimeGifButton.addEventListener('click', exportRetimedGif);
  elements.exportStillButton.addEventListener('click', exportStill);
  elements.cancelExportButton.addEventListener('click', cancelExport);
  elements.exportSettingsButton.addEventListener('click', exportSettings);

  elements.canvas.addEventListener('pointerdown', (event) => {
    if (partialMotion.beginStroke(event)) return;
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
    if (partialMotion.continueStroke(event)) return;
    if (!dragging || dragging.pointerId !== event.pointerId) return;
    const rect = elements.canvas.getBoundingClientRect();
    const scale = 360 / Math.max(rect.width, rect.height);
    settings.offsetX = core.clamp(dragging.offsetX + (event.clientX - dragging.startX) * scale, -240, 240);
    settings.offsetY = core.clamp(dragging.offsetY + (event.clientY - dragging.startY) * scale, -240, 240);
    saveSettings();
    drawPreviewNow();
  });

  function finishDragging(event) {
    if (partialMotion.finishStroke(event)) return;
    if (!dragging || dragging.pointerId !== event.pointerId) return;
    const previous = dragging.previous;
    dragging = null;
    commitSettings(previous);
    setStatus('画像の位置を変更しました。');
  }

  elements.canvas.addEventListener('pointerup', finishDragging);
  elements.canvas.addEventListener('pointercancel', finishDragging);
  elements.canvas.addEventListener('pointerleave', partialMotion.leaveCanvas);

  elements.canvas.addEventListener('keydown', (event) => {
    if (partialMotion.handleShortcut(event)) return;
    if (exporting || partialMotion.isEditing()) return;
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
    if (partialMotion.handleShortcut(event)) return;
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

  window.addEventListener('resize', () => {
    resizePreview();
    partialMotion.updateUi();
  }, { passive: true });
  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(animationFrame);
    if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
    clearGifPreview();
    clearRetimedGifPreview();
    clearCurrentPreview();
    partialMotion.release();
    if (activeWorker) activeWorker.terminate();
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('sw.js?v=22', {
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
  partialMotion.updateUi();
  resizePreview();
  animationFrame = requestAnimationFrame(render);
}

initializeAppEvents().catch((error) => {
  setStatus(error instanceof Error ? error.message : '操作イベントを準備できませんでした。');
});
