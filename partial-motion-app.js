(function attachPartialMotionApp(globalScope) {
  'use strict';

  const BRUSH_SIZES = new Set([24, 40, 64]);
  const FEATHER_SIZES = new Set([0, 4, 8]);

  function option(value, text) {
    const item = document.createElement('option');
    item.value = value;
    item.textContent = text;
    return item;
  }

  function labeledSelect(labelText, id, values) {
    const label = document.createElement('label');
    label.className = 'control';
    label.htmlFor = id;
    const span = document.createElement('span');
    span.textContent = labelText;
    const select = document.createElement('select');
    select.id = id;
    for (const [value, text] of values) select.append(option(value, text));
    label.append(span, select);
    return { label, select };
  }

  function button(id, text) {
    const item = document.createElement('button');
    item.id = id;
    item.type = 'button';
    item.textContent = text;
    return item;
  }

  function buildUi() {
    const grid = document.querySelector('.controls-panel .control-grid');
    const preset = grid?.querySelector('.preset-control');
    if (!grid || !preset) throw new Error('部分モーションの操作欄を準備できませんでした。');

    const fieldset = document.createElement('fieldset');
    fieldset.className = 'export-group control-wide';
    fieldset.setAttribute('aria-describedby', 'partialMotionHelp partialMotionState');
    const legend = document.createElement('legend');
    legend.textContent = '動かす範囲';

    const selectGrid = document.createElement('div');
    selectGrid.className = 'control-grid compact-grid';
    const target = labeledSelect('対象', 'motionTarget', [
      ['full', '画像全体'],
      ['partial', '選んだ範囲'],
    ]);
    const brush = labeledSelect('ブラシ', 'partialBrushSize', [
      ['24', '小'],
      ['40', '標準'],
      ['64', '大'],
    ]);
    const feather = labeledSelect('境界', 'partialFeather', [
      ['0', 'くっきり'],
      ['4', 'なじませる'],
      ['8', 'やわらかい'],
    ]);
    selectGrid.append(target.label, brush.label, feather.label);

    const row = document.createElement('div');
    row.className = 'button-row';
    const edit = button('partialEditButton', '範囲を塗る');
    const paint = button('partialPaintButton', '塗る');
    const erase = button('partialEraseButton', '消す');
    const undo = button('partialUndoButton', '範囲を1つ戻す');
    const redo = button('partialRedoButton', '範囲をやり直す');
    const clear = button('partialClearButton', '範囲を全部消す');
    row.append(edit, paint, erase, undo, redo, clear);

    const help = document.createElement('p');
    help.id = 'partialMotionHelp';
    help.className = 'help-text';
    help.textContent = '選んだ範囲では、元画像を静止したまま残し、その上に塗った部分を重ねて動かします。大きく動かすと二重に見えるため、まず移動量18px以下、回転量8度以下から調整してください。';
    const status = document.createElement('p');
    status.id = 'partialMotionState';
    status.className = 'help-text';
    status.setAttribute('aria-live', 'polite');

    fieldset.append(legend, selectGrid, row, help, status);
    preset.after(fieldset);
    return {
      fieldset,
      target: target.select,
      brush: brush.select,
      feather: feather.select,
      edit,
      paint,
      erase,
      undo,
      redo,
      clear,
      status,
    };
  }

  function create(deps = {}) {
    const ui = buildUi();
    const mask = globalScope.ImageMotionPartialMask.create({
      motionModel: deps.motionModel,
    });
    const state = {
      target: 'full',
      tool: 'paint',
      brush: 40,
      feather: 4,
      editing: false,
      exporting: false,
      suspended: false,
      resumePlaying: false,
      pointerId: null,
      cursor: null,
    };

    const render = globalScope.ImageMotionPartialRender.create({
      mask,
      motionModel: deps.motionModel,
      core: deps.core,
      originalDrawFrame: deps.originalDrawFrame,
      backgroundColor: deps.backgroundColor,
      sourceDimensions: deps.sourceDimensions,
      getImage: deps.getImage,
      getSettings: deps.getSettings,
      getTarget: () => state.target,
      getEditing: () => state.editing,
      getSuspended: () => state.suspended,
      getCursor: () => state.cursor,
      getPreviewCanvas: () => deps.elements.canvas,
      getPreviewContext: () => deps.previewContext,
      setStatus: deps.setStatus,
    });

    function maxMaskEdge() {
      const memory = Number(navigator.deviceMemory);
      return Number.isFinite(memory) && memory <= 2 ? 640 : 1024;
    }

    function finishEditing(restorePlayback = true) {
      if (!state.editing) return;
      state.editing = false;
      state.pointerId = null;
      state.cursor = null;
      mask.end();
      deps.elements.canvas.setAttribute('aria-label', 'アニメーションプレビュー。画像を指でドラッグできます。矢印キーでも位置を変更できます。');
      if (restorePlayback && state.resumePlaying) deps.setPlaying(true);
      updateUi();
      deps.drawPreviewNow();
      deps.setStatus(mask.hasSelection()
        ? '選んだ範囲を元画像の上に重ねて動かします。'
        : '動かす範囲が空です。範囲を塗るか、画像全体へ切り替えてください。');
    }

    function startEditing() {
      if (!deps.getImage() || state.exporting) {
        deps.setStatus('先に画像を選んでください。');
        return;
      }
      state.target = 'partial';
      state.resumePlaying = deps.getPlaying();
      state.editing = true;
      state.cursor = null;
      deps.setPlaying(false);
      deps.elements.canvas.setAttribute('aria-label', '部分モーションの範囲編集中。画像上を指、ペン、またはマウスで塗れます。');
      updateUi();
      deps.drawPreviewNow();
      deps.setStatus('画像上を塗って動かす範囲を選んでください。消すボタンで選択を削れます。');
    }

    function setTarget(value) {
      state.target = value === 'partial' ? 'partial' : 'full';
      if (state.target === 'full') finishEditing();
      else if (deps.getImage() && !mask.hasSelection()) startEditing();
      updateUi();
      deps.drawPreviewNow();
    }

    function setTool(value) {
      state.tool = value === 'erase' ? 'erase' : 'paint';
      updateUi();
    }

    function eventPoint(event) {
      const point = render.pointFromEvent(event, state.brush);
      state.cursor = point?.cursor || null;
      return point;
    }

    function beginStroke(event) {
      if (!state.editing || state.exporting || !event.isPrimary) return false;
      event.preventDefault();
      const point = eventPoint(event);
      if (!point) {
        deps.drawPreviewNow();
        return true;
      }
      state.pointerId = event.pointerId;
      mask.begin(state.tool, point.lineWidth, point.maskPoint);
      try {
        deps.elements.canvas.setPointerCapture(event.pointerId);
      } catch {
        // Pointer captureが使えない環境でも通常のPointer Eventで編集を続ける。
      }
      deps.drawPreviewNow();
      updateUi();
      return true;
    }

    function continueStroke(event) {
      if (!state.editing || !event.isPrimary) return false;
      const point = eventPoint(event);
      if (state.pointerId === event.pointerId && point) {
        event.preventDefault();
        mask.move(point.maskPoint);
      }
      deps.drawPreviewNow();
      return true;
    }

    function finishStroke(event) {
      if (!state.editing) return false;
      if (state.pointerId !== null && event.pointerId !== state.pointerId) return true;
      event.preventDefault();
      state.pointerId = null;
      mask.end();
      updateUi();
      deps.drawPreviewNow();
      return true;
    }

    function leaveCanvas() {
      if (!state.editing || state.pointerId !== null) return;
      state.cursor = null;
      deps.drawPreviewNow();
    }

    function undo() {
      if (!mask.undo()) deps.setStatus('戻せる範囲編集はありません。');
      else deps.setStatus('範囲編集を1つ戻しました。');
      updateUi();
      deps.drawPreviewNow();
    }

    function redo() {
      if (!mask.redo()) deps.setStatus('やり直せる範囲編集はありません。');
      else deps.setStatus('範囲編集をやり直しました。');
      updateUi();
      deps.drawPreviewNow();
    }

    function clearSelection(keepBackup = true) {
      mask.clear(keepBackup);
      updateUi();
      deps.drawPreviewNow();
    }

    function resetSelection() {
      state.target = 'full';
      state.tool = 'paint';
      state.brush = 40;
      state.feather = 4;
      state.editing = false;
      state.resumePlaying = false;
      state.pointerId = null;
      state.cursor = null;
      mask.setFeather(4);
      clearSelection(false);
      updateUi();
    }

    function handleShortcut(event) {
      if (event.key === 'Escape' && state.editing) {
        event.preventDefault();
        finishEditing();
        return true;
      }
      if (!state.editing || !(event.ctrlKey || event.metaKey) || event.altKey) return false;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return true;
      }
      if (key === 'y') {
        event.preventDefault();
        redo();
        return true;
      }
      return false;
    }

    function acceptLoadedImage(image) {
      state.suspended = false;
      state.target = 'full';
      state.editing = false;
      mask.initialize(image, maxMaskEdge());
      updateUi();
      deps.drawPreviewNow();
    }

    function clearLoadedImage() {
      state.suspended = false;
      state.target = 'full';
      state.editing = false;
      mask.initialize(null, maxMaskEdge());
      updateUi();
    }

    function suspendForImageLoad() {
      const previous = state.suspended;
      state.suspended = true;
      return previous;
    }

    function restoreSuspension(previous) {
      state.suspended = Boolean(previous);
    }

    function setExporting(active) {
      state.exporting = Boolean(active);
      if (state.exporting) finishEditing(false);
      updateUi();
    }

    function updateUi() {
      const image = deps.getImage();
      const unavailable = !image || state.exporting;
      ui.target.value = state.target;
      ui.brush.value = String(state.brush);
      ui.feather.value = String(state.feather);
      ui.edit.textContent = state.editing ? '編集を終える' : '範囲を塗る';
      ui.edit.setAttribute('aria-pressed', String(state.editing));
      ui.paint.setAttribute('aria-pressed', String(state.tool === 'paint'));
      ui.erase.setAttribute('aria-pressed', String(state.tool === 'erase'));
      ui.target.disabled = state.exporting;
      ui.edit.disabled = unavailable || state.target !== 'partial';
      ui.paint.disabled = unavailable || !state.editing;
      ui.erase.disabled = unavailable || !state.editing;
      ui.brush.disabled = unavailable || !state.editing;
      ui.feather.disabled = unavailable || state.target !== 'partial';
      ui.undo.disabled = unavailable || !mask.canUndo();
      ui.redo.disabled = unavailable || !mask.canRedo();
      ui.clear.disabled = unavailable || !mask.hasSelection();

      if (state.target === 'full') ui.status.textContent = '現在は画像全体を動かします。';
      else if (state.editing) ui.status.textContent = '範囲編集中です。ページ移動や再読み込みをすると範囲は消えます。';
      else if (mask.hasSelection()) ui.status.textContent = '選択範囲を元画像の上に重ね描画します。';
      else ui.status.textContent = '範囲が空です。範囲を塗るボタンから画像上を塗ってください。';

      if (deps.elements.openPreviewButton) {
        deps.elements.openPreviewButton.disabled = state.exporting || !image || state.target === 'partial';
        deps.elements.openPreviewButton.title = state.target === 'partial'
          ? '部分モーションは画面内プレビューまたは保存後の別タブ表示で確認してください。'
          : '';
      }
    }

    ui.target.addEventListener('change', () => setTarget(ui.target.value));
    ui.brush.addEventListener('change', () => {
      const value = Number(ui.brush.value);
      state.brush = BRUSH_SIZES.has(value) ? value : 40;
      updateUi();
    });
    ui.feather.addEventListener('change', () => {
      const value = Number(ui.feather.value);
      state.feather = FEATHER_SIZES.has(value) ? value : 4;
      mask.setFeather(state.feather);
      updateUi();
      deps.drawPreviewNow();
    });
    ui.edit.addEventListener('click', () => {
      if (state.editing) finishEditing();
      else startEditing();
    });
    ui.paint.addEventListener('click', () => setTool('paint'));
    ui.erase.addEventListener('click', () => setTool('erase'));
    ui.undo.addEventListener('click', undo);
    ui.redo.addEventListener('click', redo);
    ui.clear.addEventListener('click', () => {
      clearSelection(true);
      deps.setStatus('選択範囲を消しました。範囲を1つ戻すボタンで復元できます。');
    });
    updateUi();

    function release() {
      clearLoadedImage();
      mask.release();
      render.release();
    }

    return Object.freeze({
      drawFrame: render.drawFrame,
      beginStroke,
      continueStroke,
      finishStroke,
      leaveCanvas,
      handleShortcut,
      setExporting,
      suspendForImageLoad,
      restoreSuspension,
      acceptLoadedImage,
      clearLoadedImage,
      resetSelection,
      updateUi,
      isEditing: () => state.editing,
      isPartial: () => state.target === 'partial',
      release,
    });
  }

  globalScope.ImageMotionPartialApp = Object.freeze({ create });
}(typeof self !== 'undefined' ? self : globalThis));
