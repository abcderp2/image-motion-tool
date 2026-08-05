(function attachImageMotionModel(globalScope) {
  'use strict';

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function positiveNumber(value, fallback) {
    return Math.max(1, finiteNumber(value, fallback));
  }

  const SQUASH_KEYFRAMES = Object.freeze([
    0,
    0.3,
    0.5,
    0.8,
    1,
    0.8,
    0.5,
    0.3,
    0,
  ]);

  function sampleLoopKeyframes(values, phase) {
    const wrappedPhase = ((phase % 1) + 1) % 1;
    const position = wrappedPhase * (values.length - 1);
    const index = Math.min(values.length - 2, Math.floor(position));
    const mix = position - index;

    return (
      values[index] +
      (values[index + 1] - values[index]) * mix
    );
  }

  function motionAt(settings, seconds, forExport = false) {
    const safe = settings && typeof settings === 'object' ? settings : {};
    const direction = safe.reverse ? -1 : 1;
    const duration = Math.max(0.001, finiteNumber(safe.duration, 3));
    const loopCycles = Math.max(1, finiteNumber(safe.loopCycles, 2));
    const speed = Math.max(0, finiteNumber(safe.speed, 0.75));
    const elapsed = finiteNumber(seconds, 0);
    const cycle = forExport
      ? (elapsed / duration) * loopCycles * Math.PI * 2 * direction
      : elapsed * speed * Math.PI * 2 * direction;
    const squashPhase = cycle / (Math.PI * 2);
    const squashAmount = sampleLoopKeyframes(
      SQUASH_KEYFRAMES,
      squashPhase,
    );
    const amount = Math.max(0, finiteNumber(safe.amplitude, 18));
    const rotationAmount = Math.max(0, finiteNumber(safe.rotation, 4));
    const pulseAmount = Math.max(0, finiteNumber(safe.pulse, 4));
    const wave = Math.sin(cycle);
    const riseAndReturn = (1 - Math.cos(cycle)) / 2;

    let x = 0;
    let y = 0;
    let rotation = 0;
    let scaleX = 1;
    let scaleY = 1;
    let pivotX = 0.5;
    let pivotY = 0.5;

    switch (safe.preset) {
      case 'bounce':
        y = -Math.abs(wave) * amount;
        rotation = wave * rotationAmount * 0.35;
        break;
      case 'shake':
        x = Math.sin(cycle * 5) * amount * 0.45;
        y = Math.sin(cycle * 7) * amount * 0.18;
        rotation = Math.sin(cycle * 6) * rotationAmount;
        break;
      case 'sway':
        rotation = wave * rotationAmount;
        pivotY = 0.96;
        break;
      case 'orbit':
        x = Math.cos(cycle) * amount;
        y = wave * amount;
        rotation = wave * rotationAmount * 0.4;
        break;
      case 'breathe':
        scaleX = 1 + riseAndReturn * pulseAmount / 250;
        scaleY = 1 + riseAndReturn * pulseAmount / 125;
        pivotY = 0.92;
        break;
      case 'zoom':
        scaleX = 1 + riseAndReturn * pulseAmount / 100;
        scaleY = scaleX;
        break;
      case 'pendulum':
        rotation = wave * rotationAmount;
        pivotY = 0.04;
        break;
      case 'squash':
        scaleX =
          1 +
          squashAmount *
          pulseAmount /
          100;

        scaleY = Math.max(
          0.72,
          1 -
            squashAmount *
            pulseAmount /
            120,
        );

        x =
          -squashAmount *
          amount *
          0.45;

        y =
          squashAmount *
          amount *
          1.5;

        rotation = 0;

        pivotX = 0.5;
        pivotY = 0.92;
        break;
      default:
        y = wave * amount;
        rotation = wave * rotationAmount * 0.3;
        scaleX = 1 + wave * pulseAmount / 200;
        scaleY = scaleX;
        break;
    }

    return { x, y, rotation, scaleX, scaleY, pivotX, pivotY };
  }

  function staticGeometry(settings, sourceWidth, sourceHeight, width, height) {
    const safe = settings && typeof settings === 'object' ? settings : {};
    const safeSourceWidth = positiveNumber(sourceWidth, 1);
    const safeSourceHeight = positiveNumber(sourceHeight, 1);
    const safeWidth = positiveNumber(width, 1);
    const safeHeight = positiveNumber(height, 1);
    const fitScale = Math.min(safeWidth / safeSourceWidth, safeHeight / safeSourceHeight);
    const zoom = Math.max(0.01, finiteNumber(safe.zoom, 100) / 100);
    const drawWidth = safeSourceWidth * fitScale * zoom;
    const drawHeight = safeSourceHeight * fitScale * zoom;
    const positionScale = Math.max(safeWidth, safeHeight) / 360;
    const centerX = safeWidth / 2 + finiteNumber(safe.offsetX, 0) * positionScale;
    const centerY = safeHeight / 2 + finiteNumber(safe.offsetY, 0) * positionScale;

    return {
      centerX,
      centerY,
      drawWidth,
      drawHeight,
      left: centerX - drawWidth / 2,
      top: centerY - drawHeight / 2,
      flipped: Boolean(safe.flipped),
    };
  }

  function frameGeometry(settings, sourceWidth, sourceHeight, width, height, motion) {
    const base = staticGeometry(settings, sourceWidth, sourceHeight, width, height);
    const safeMotion = motion && typeof motion === 'object' ? motion : {};
    const pivotXRatio = finiteNumber(safeMotion.pivotX, 0.5);
    const pivotYRatio = finiteNumber(safeMotion.pivotY, 0.5);
    const drawWidth = base.drawWidth * finiteNumber(safeMotion.scaleX, 1);
    const drawHeight = base.drawHeight * finiteNumber(safeMotion.scaleY, 1);
    const positionScale = Math.max(positiveNumber(width, 1), positiveNumber(height, 1)) / 360;
    const centerX = base.centerX + finiteNumber(safeMotion.x, 0) * positionScale;
    const centerY = base.centerY + finiteNumber(safeMotion.y, 0) * positionScale;

    return {
      ...base,
      centerX,
      centerY,
      drawWidth,
      drawHeight,
      pivotXRatio,
      pivotYRatio,
      pivotX: centerX + (pivotXRatio - 0.5) * base.drawWidth,
      pivotY: centerY + (pivotYRatio - 0.5) * base.drawHeight,
      rotation: finiteNumber(safeMotion.rotation, 0),
    };
  }

  function sourcePointAt(settings, sourceWidth, sourceHeight, width, height, x, y) {
    const geometry = staticGeometry(settings, sourceWidth, sourceHeight, width, height);
    const safeX = finiteNumber(x, Number.NaN);
    const safeY = finiteNumber(y, Number.NaN);
    if (!Number.isFinite(safeX) || !Number.isFinite(safeY)) return null;
    let unitX = (safeX - geometry.left) / geometry.drawWidth;
    const unitY = (safeY - geometry.top) / geometry.drawHeight;
    if (unitX < 0 || unitX > 1 || unitY < 0 || unitY > 1) return null;
    if (geometry.flipped) unitX = 1 - unitX;
    return { x: unitX, y: unitY, geometry };
  }

  function maskDimensions(sourceWidth, sourceHeight, maxLongEdge = 1024, maxPixels = 786432) {
    const width = positiveNumber(sourceWidth, 1);
    const height = positiveNumber(sourceHeight, 1);
    const safeLongEdge = Math.max(64, finiteNumber(maxLongEdge, 1024));
    const safeMaxPixels = Math.max(4096, finiteNumber(maxPixels, 786432));
    const longScale = Math.min(1, safeLongEdge / Math.max(width, height));
    const pixelScale = Math.min(1, Math.sqrt(safeMaxPixels / (width * height)));
    const scale = Math.min(longScale, pixelScale);
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
      scale,
    };
  }

  const api = Object.freeze({
    motionAt,
    staticGeometry,
    frameGeometry,
    sourcePointAt,
    maskDimensions,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  globalScope.ImageMotionModel = api;
}(typeof self !== 'undefined' ? self : globalThis));
