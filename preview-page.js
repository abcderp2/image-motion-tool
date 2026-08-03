'use strict';

(function startPreviewPage() {
  const core = window.ImageMotionCore;
  const motionModel = window.ImageMotionModel;
  const canvas = document.querySelector('#previewCanvas');
  const message = document.querySelector('#previewMessage');

  function showMessage(text) {
    if (canvas) canvas.hidden = true;
    if (message) {
      message.hidden = false;
      message.textContent = text;
    }
  }

  if (!core || !motionModel || !canvas || !message) {
    showMessage('プレビューを読み込めませんでした。');
    return;
  }

  const sourceUrl = canvas.dataset.source || '';
  const serializedSettings = canvas.dataset.settings || '';
  if (!sourceUrl.startsWith('blob:') || sourceUrl.length > 2048 || serializedSettings.length > 8192) {
    showMessage('プレビューの入力を確認できませんでした。');
    return;
  }

  let settings;
  try {
    settings = core.sanitizeSettings(JSON.parse(serializedSettings));
  } catch {
    showMessage('プレビューの設定を読み込めませんでした。');
    return;
  }

  const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
  if (!context) {
    showMessage('プレビューの描画領域を作成できませんでした。');
    return;
  }

  const source = new Image();
  source.decoding = 'async';
  let animationStart = performance.now();
  let animationFrame = 0;

  function backgroundColor() {
    switch (settings.backgroundMode) {
      case 'white': return '#ffffff';
      case 'black': return '#000000';
      case 'green': return '#00b140';
      case 'custom': return settings.backgroundColor;
      default: return null;
    }
  }

  function sourceDimensions() {
    return {
      width: source.naturalWidth || source.width,
      height: source.naturalHeight || source.height,
    };
  }

  function drawFrame(seconds) {
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    const fill = backgroundColor();
    if (fill) {
      context.fillStyle = fill;
      context.fillRect(0, 0, width, height);
    }

    const motion = motionModel.motionAt(settings, seconds);
    const sourceSize = sourceDimensions();
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

    context.save();
    context.translate(pivotX, pivotY);
    context.rotate(motion.rotation * Math.PI / 180);
    context.scale(settings.flipped ? -1 : 1, 1);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      source,
      -motion.pivotX * drawWidth,
      -motion.pivotY * drawHeight,
      drawWidth,
      drawHeight,
    );
    context.restore();
  }

  function resizeCanvas() {
    const availableWidth = Math.max(220, window.innerWidth - 32);
    const availableHeight = Math.max(220, window.innerHeight - 32);
    const renderLongEdge = Math.min(480, availableWidth, availableHeight);
    const dimensions = core.ratioDimensions(renderLongEdge, settings.canvasRatio);
    if (canvas.width !== dimensions.width || canvas.height !== dimensions.height) {
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
    }
    drawFrame((performance.now() - animationStart) / 1000);
  }

  function scheduleRender() {
    if (!animationFrame) animationFrame = requestAnimationFrame(render);
  }

  function render(now) {
    animationFrame = 0;
    if (!document.hidden) drawFrame((now - animationStart) / 1000);
    scheduleRender();
  }

  function start() {
    resizeCanvas();
    animationStart = performance.now();
    scheduleRender();
  }

  source.onload = start;
  source.onerror = () => showMessage('画像を別タブへ読み込めませんでした。');
  source.src = sourceUrl;
  window.addEventListener('resize', resizeCanvas, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      animationStart = performance.now();
      scheduleRender();
    }
  });
  window.addEventListener('pagehide', () => cancelAnimationFrame(animationFrame), { once: true });
}());
