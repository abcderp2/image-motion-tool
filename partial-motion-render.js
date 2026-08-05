(function attachPartialMotionRender(globalScope) {
  'use strict';

  function canvas() {
    return document.createElement('canvas');
  }

  function resetCanvas(target, width, height) {
    target.width = Math.max(1, Math.floor(width));
    target.height = Math.max(1, Math.floor(height));
  }

  function create(options = {}) {
    const mask = options.mask;
    const model = options.motionModel;
    const originalDrawFrame = options.originalDrawFrame;
    if (!mask || !model || typeof originalDrawFrame !== 'function') {
      throw new Error('部分モーションの描画処理を準備できませんでした。');
    }

    const workCanvas = canvas();
    let workContext = null;
    let failureReported = false;

    function source() {
      return options.getImage();
    }

    function settings() {
      return options.getSettings();
    }

    function dimensions(value) {
      return options.sourceDimensions(value);
    }

    function ensureWorkCanvas(width, height) {
      const safeWidth = Math.max(1, Math.floor(width));
      const safeHeight = Math.max(1, Math.floor(height));
      if (workCanvas.width !== safeWidth || workCanvas.height !== safeHeight) {
        resetCanvas(workCanvas, safeWidth, safeHeight);
        workContext = workCanvas.getContext('2d', { alpha: true });
      }
      if (!workContext) throw new Error('部分モーション用の描画領域を確保できませんでした。');
      return workContext;
    }

    function drawStatic(targetContext, imageSource, width, height) {
      const size = dimensions(imageSource);
      const geometry = model.staticGeometry(
        settings(),
        size.width,
        size.height,
        width,
        height,
      );
      targetContext.save();
      targetContext.translate(geometry.centerX, geometry.centerY);
      targetContext.scale(geometry.flipped ? -1 : 1, 1);
      targetContext.imageSmoothingEnabled = true;
      targetContext.imageSmoothingQuality = 'high';
      targetContext.drawImage(
        imageSource,
        -geometry.drawWidth / 2,
        -geometry.drawHeight / 2,
        geometry.drawWidth,
        geometry.drawHeight,
      );
      targetContext.restore();
      return geometry;
    }

    function drawGuide(targetContext, geometry) {
      const guide = mask.guideCanvas();
      targetContext.save();
      targetContext.translate(geometry.centerX, geometry.centerY);
      targetContext.scale(geometry.flipped ? -1 : 1, 1);
      targetContext.globalCompositeOperation = 'difference';
      targetContext.globalAlpha = 0.55;
      targetContext.drawImage(
        guide,
        -geometry.drawWidth / 2,
        -geometry.drawHeight / 2,
        geometry.drawWidth,
        geometry.drawHeight,
      );
      targetContext.restore();

      const cursor = options.getCursor();
      if (!cursor) return;
      targetContext.save();
      targetContext.globalCompositeOperation = 'difference';
      targetContext.strokeStyle = '#ffffff';
      targetContext.lineWidth = Math.max(2, Math.max(widthOfPreview(), heightOfPreview()) / 360);
      targetContext.beginPath();
      targetContext.arc(cursor.x, cursor.y, cursor.radius, 0, Math.PI * 2);
      targetContext.stroke();
      targetContext.restore();
    }

    function widthOfPreview() {
      return options.getPreviewCanvas().width;
    }

    function heightOfPreview() {
      return options.getPreviewCanvas().height;
    }

    function applyMask(context, width, height, seconds, frameOptions, imageSource) {
      const motion = model.motionAt(settings(), seconds, Boolean(frameOptions.forExport));
      const size = dimensions(imageSource);
      const geometry = model.frameGeometry(
        settings(),
        size.width,
        size.height,
        width,
        height,
        motion,
      );
      const feather = mask.featherCanvas();
      context.save();
      context.globalCompositeOperation = 'destination-in';
      context.translate(geometry.pivotX, geometry.pivotY);
      context.rotate(geometry.rotation * Math.PI / 180);
      context.scale(geometry.flipped ? -1 : 1, 1);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(
        feather,
        -geometry.pivotXRatio * geometry.drawWidth,
        -geometry.pivotYRatio * geometry.drawHeight,
        geometry.drawWidth,
        geometry.drawHeight,
      );
      context.restore();
    }

    function drawFrame(targetContext, width, height, seconds, frameOptions = {}) {
      const imageSource = frameOptions.source || source();
      if (
        !imageSource
        || options.getSuspended()
        || options.getTarget() !== 'partial'
      ) {
        originalDrawFrame(targetContext, width, height, seconds, frameOptions);
        return;
      }

      targetContext.clearRect(0, 0, width, height);
      const fill = options.backgroundColor(frameOptions.backgroundMode);
      if (fill) {
        targetContext.fillStyle = fill;
        targetContext.fillRect(0, 0, width, height);
      }
      const staticGeometry = drawStatic(targetContext, imageSource, width, height);
      if (options.getEditing() && targetContext === options.getPreviewContext()) {
        drawGuide(targetContext, staticGeometry);
        return;
      }
      if (!mask.hasSelection()) return;

      try {
        const context = ensureWorkCanvas(width, height);
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.globalCompositeOperation = 'source-over';
        context.clearRect(0, 0, width, height);
        originalDrawFrame(context, width, height, seconds, {
          ...frameOptions,
          source: imageSource,
          backgroundMode: 'transparent',
        });
        applyMask(context, width, height, seconds, frameOptions, imageSource);
        targetContext.drawImage(workCanvas, 0, 0);
        failureReported = false;
      } catch {
        if (!failureReported && targetContext === options.getPreviewContext()) {
          failureReported = true;
          options.setStatus('端末の作業メモリを確保できないため、部分モーションの重ね描画を省略しました。出力サイズを下げるか、画像全体へ切り替えてください。');
        }
      }
    }

    function pointFromEvent(event, brushCssPixels) {
      const imageSource = source();
      if (!imageSource) return null;
      const preview = options.getPreviewCanvas();
      const rect = preview.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const canvasX = (event.clientX - rect.left) * preview.width / rect.width;
      const canvasY = (event.clientY - rect.top) * preview.height / rect.height;
      const size = dimensions(imageSource);
      const point = model.sourcePointAt(
        settings(),
        size.width,
        size.height,
        preview.width,
        preview.height,
        canvasX,
        canvasY,
      );
      if (!point) return null;
      const displayImageWidth = point.geometry.drawWidth * rect.width / preview.width;
      const lineWidth = options.core.clamp(
        brushCssPixels * mask.width() / Math.max(1, displayImageWidth),
        1,
        Math.max(mask.width(), mask.height()) / 3,
      );
      return {
        maskPoint: {
          x: point.x * mask.width(),
          y: point.y * mask.height(),
        },
        cursor: {
          x: canvasX,
          y: canvasY,
          radius: brushCssPixels * preview.width / rect.width / 2,
        },
        lineWidth,
      };
    }

    function release() {
      workCanvas.width = 1;
      workCanvas.height = 1;
      workContext = null;
    }

    return Object.freeze({ drawFrame, pointFromEvent, release });
  }

  globalScope.ImageMotionPartialRender = Object.freeze({ create });
}(typeof self !== 'undefined' ? self : globalThis));
