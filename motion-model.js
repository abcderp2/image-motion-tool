(function attachImageMotionModel(globalScope) {
  'use strict';

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
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
      default:
        y = wave * amount;
        rotation = wave * rotationAmount * 0.3;
        scaleX = 1 + wave * pulseAmount / 200;
        scaleY = scaleX;
        break;
    }

    return { x, y, rotation, scaleX, scaleY, pivotX, pivotY };
  }

  const api = Object.freeze({ motionAt });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  globalScope.ImageMotionModel = api;
}(typeof self !== 'undefined' ? self : globalThis));
