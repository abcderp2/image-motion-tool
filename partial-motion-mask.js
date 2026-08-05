(function attachPartialMotionMask(globalScope) {
  'use strict';

  const MAX_EDIT_STROKES = 40;
  const MAX_STROKE_POINTS = 4096;
  const SAMPLE_EDGE = 32;

  function canvas() {
    return document.createElement('canvas');
  }

  function resetCanvas(target, width, height) {
    target.width = Math.max(1, Math.floor(width));
    target.height = Math.max(1, Math.floor(height));
  }

  function releaseCanvas(target) {
    target.width = 1;
    target.height = 1;
  }

  function create(options = {}) {
    const model = options.motionModel;
    if (!model || typeof model.maskDimensions !== 'function') {
      throw new Error('部分モーション用の寸法計算を利用できません。');
    }

    const state = {
      mask: canvas(),
      base: canvas(),
      feather: canvas(),
      sample: canvas(),
      maskContext: null,
      baseContext: null,
      featherContext: null,
      sampleContext: null,
      strokes: [],
      redoStrokes: [],
      activeStroke: null,
      clearBackup: null,
      redoClear: false,
      featherSize: 4,
      dirty: true,
      selected: false,
    };

    resetCanvas(state.sample, SAMPLE_EDGE, SAMPLE_EDGE);
    state.sampleContext = state.sample.getContext('2d', {
      alpha: true,
      willReadFrequently: true,
    });

    function initialize(source, maxLongEdge) {
      state.strokes = [];
      state.redoStrokes = [];
      state.activeStroke = null;
      state.clearBackup = null;
      state.redoClear = false;
      state.selected = false;
      state.dirty = true;

      if (!source) {
        for (const target of [state.mask, state.base, state.feather]) releaseCanvas(target);
        state.maskContext = null;
        state.baseContext = null;
        state.featherContext = null;
        return;
      }

      const dimensions = model.maskDimensions(
        source.naturalWidth || source.width,
        source.naturalHeight || source.height,
        maxLongEdge,
        786432,
      );
      for (const target of [state.mask, state.base, state.feather]) {
        resetCanvas(target, dimensions.width, dimensions.height);
      }
      state.maskContext = state.mask.getContext('2d', { alpha: true });
      state.baseContext = state.base.getContext('2d', { alpha: true });
      state.featherContext = state.feather.getContext('2d', { alpha: true });
      for (const context of [state.maskContext, state.baseContext, state.featherContext]) {
        if (!context) throw new Error('部分モーション用の作業領域を確保できませんでした。');
        context.clearRect(0, 0, dimensions.width, dimensions.height);
      }
    }

    function paintStroke(context, stroke) {
      if (!stroke || stroke.points.length === 0) return;
      context.globalCompositeOperation = stroke.tool === 'erase'
        ? 'destination-out'
        : 'source-over';
      context.strokeStyle = '#ffffff';
      context.fillStyle = '#ffffff';
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.lineWidth = stroke.width;
      const first = stroke.points[0];
      context.beginPath();
      context.arc(first.x, first.y, stroke.width / 2, 0, Math.PI * 2);
      context.fill();
      if (stroke.points.length < 2) return;
      context.beginPath();
      context.moveTo(first.x, first.y);
      for (let index = 1; index < stroke.points.length; index += 1) {
        const point = stroke.points[index];
        context.lineTo(point.x, point.y);
      }
      context.stroke();
    }

    function rebuild() {
      if (!state.maskContext || !state.baseContext) return;
      const context = state.maskContext;
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalCompositeOperation = 'source-over';
      context.clearRect(0, 0, state.mask.width, state.mask.height);
      context.drawImage(state.base, 0, 0);
      for (const stroke of state.strokes) paintStroke(context, stroke);
      context.restore();
      state.dirty = true;
    }

    function flattenIfNeeded() {
      if (state.strokes.length < MAX_EDIT_STROKES || !state.baseContext) return;
      state.baseContext.clearRect(0, 0, state.base.width, state.base.height);
      state.baseContext.drawImage(state.mask, 0, 0);
      state.strokes = [];
      state.redoStrokes = [];
    }

    function detectSelection() {
      if (!state.sampleContext || !state.maskContext) return false;
      const context = state.sampleContext;
      context.clearRect(0, 0, SAMPLE_EDGE, SAMPLE_EDGE);
      context.drawImage(state.mask, 0, 0, SAMPLE_EDGE, SAMPLE_EDGE);
      const pixels = context.getImageData(0, 0, SAMPLE_EDGE, SAMPLE_EDGE).data;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] > 0) return true;
      }
      return false;
    }

    function finishChange() {
      state.selected = detectSelection();
      state.dirty = true;
    }

    function begin(tool, width, point) {
      if (!state.maskContext || !point) return false;
      flattenIfNeeded();
      state.redoStrokes = [];
      state.clearBackup = null;
      state.redoClear = false;
      state.activeStroke = {
        tool: tool === 'erase' ? 'erase' : 'paint',
        width: Math.max(1, Number(width) || 1),
        points: [{ x: point.x, y: point.y }],
      };
      state.strokes.push(state.activeStroke);
      rebuild();
      return true;
    }

    function move(point) {
      const stroke = state.activeStroke;
      if (!stroke || !point || stroke.points.length >= MAX_STROKE_POINTS) return false;
      const previous = stroke.points[stroke.points.length - 1];
      const dx = point.x - previous.x;
      const dy = point.y - previous.y;
      if (dx * dx + dy * dy < 0.25) return false;
      stroke.points.push({ x: point.x, y: point.y });
      rebuild();
      return true;
    }

    function end() {
      if (!state.activeStroke) return false;
      state.activeStroke = null;
      finishChange();
      return true;
    }

    function undo() {
      if (state.strokes.length > 0) {
        state.redoStrokes.push(state.strokes.pop());
        rebuild();
      } else if (state.clearBackup && state.maskContext && state.baseContext) {
        state.maskContext.putImageData(state.clearBackup, 0, 0);
        state.baseContext.clearRect(0, 0, state.base.width, state.base.height);
        state.baseContext.drawImage(state.mask, 0, 0);
        state.clearBackup = null;
        state.redoClear = true;
        state.dirty = true;
      } else {
        return false;
      }
      finishChange();
      return true;
    }

    function redo() {
      if (state.redoStrokes.length > 0) {
        state.strokes.push(state.redoStrokes.pop());
        rebuild();
      } else if (state.redoClear) {
        clear(false);
        state.redoClear = false;
      } else {
        return false;
      }
      finishChange();
      return true;
    }

    function clear(keepBackup = true) {
      if (!state.maskContext || !state.baseContext) return false;
      if (keepBackup && state.selected) {
        try {
          state.clearBackup = state.maskContext.getImageData(
            0,
            0,
            state.mask.width,
            state.mask.height,
          );
        } catch {
          state.clearBackup = null;
        }
      } else if (!keepBackup) {
        state.clearBackup = null;
      }
      state.maskContext.clearRect(0, 0, state.mask.width, state.mask.height);
      state.baseContext.clearRect(0, 0, state.base.width, state.base.height);
      state.strokes = [];
      state.redoStrokes = [];
      state.activeStroke = null;
      state.selected = false;
      state.dirty = true;
      return true;
    }

    function featherCanvas() {
      if (!state.featherContext) return state.mask;
      if (!state.dirty) return state.feather;
      const context = state.featherContext;
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalCompositeOperation = 'source-over';
      context.clearRect(0, 0, state.feather.width, state.feather.height);
      const blur = state.featherSize * Math.max(state.feather.width, state.feather.height) / 360;
      if (blur > 0 && 'filter' in context) {
        context.filter = `blur(${Math.min(32, blur).toFixed(2)}px)`;
        context.drawImage(state.mask, 0, 0);
        context.filter = 'none';
      }
      context.drawImage(state.mask, 0, 0);
      context.restore();
      state.dirty = false;
      return state.feather;
    }

    function setFeather(value) {
      state.featherSize = [0, 4, 8].includes(Number(value)) ? Number(value) : 4;
      state.dirty = true;
    }

    function canUndo() {
      return state.strokes.length > 0 || Boolean(state.clearBackup);
    }

    function canRedo() {
      return state.redoStrokes.length > 0 || state.redoClear;
    }

    function release() {
      for (const target of [state.mask, state.base, state.feather, state.sample]) {
        releaseCanvas(target);
      }
      state.maskContext = null;
      state.baseContext = null;
      state.featherContext = null;
      state.sampleContext = null;
    }

    return Object.freeze({
      initialize,
      begin,
      move,
      end,
      undo,
      redo,
      clear,
      setFeather,
      featherCanvas,
      guideCanvas: () => state.mask,
      width: () => state.mask.width,
      height: () => state.mask.height,
      hasSelection: () => state.selected,
      canUndo,
      canRedo,
      release,
    });
  }

  globalScope.ImageMotionPartialMask = Object.freeze({ create });
}(typeof self !== 'undefined' ? self : globalThis));
