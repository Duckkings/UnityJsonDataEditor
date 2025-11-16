(() => {
  // 数据结构：模板列表
  const templates = [];
  let templateUidCounter = 0;
  let lastSavedStructureSnapshot = new Map();
  let currentTemplateIndex = -1;
  let currentInstanceIndex = -1;
  let directoryHandle = null;
  let csharpHandle = null;
  let dataEntityHandle = null;
  let modelStructHandle = null;
  let editorHandle = null;
  let trashHandle = null;
  const TRASH_FOLDER_NAME = 'toilet';
  const pendingTemplateDeletions = new Map();
  let trashButtonBaseLabel = '垃圾箱';
  let trashSelectedTemplateName = null;
  // 剪贴板，用于复制粘贴不同类型的条目
  // { type: 'template' | 'instance' | 'param', items: Array<any>, extra?: any }
  let copyBuffer = null;

  // 选择集：模板、实例、参数
  const selectedTemplates = new Set();
  const selectedInstances = new Set();
  const selectedParams = new Set();
  let exportSelectionMode = false;
  const exportSelections = new Map();
  let exportTemplateAnchorIndex = null;
  // Shift-点击范围选择锚点
  let anchorTemplate = null;
  let anchorInstance = null;
  let anchorParam = null;
  // 最近操作的栏目类型，用于快捷键判断
  let lastSelectedCategory = null;
  // 当前正在编辑的参数索引，-1 表示新建
  let editingParamIndex = -1;
  // 缓存当前模板的索引重复信息，便于在索引跳转时复用
  let lastDuplicateIndexInfo = null;
  const EDIT_MODES = { CLASSIC: 'classic', SHEET: 'sheet' };
  let currentEditMode = EDIT_MODES.CLASSIC;
  let sheetActiveTemplateIndex = -1;
  let sheetActiveInstanceIndex = -1;
  let sheetRenderedTemplateIndex = -1;
  let sheetRenderedInstanceIndex = -1;
  let sheetRenderedInstanceCount = 0;
  let sheetRenderedParameterSignature = '';
  let sheetRenderedTemplatesFingerprint = '';
  const sheetRenderedSheetIds = new Map();
  const sheetDuplicateIdRows = new Map();
  let sheetModeDirty = false;
  let luckysheetInitialized = false;
  const sheetTemplateValidation = new Map();
  const createDefaultCompareValueState = () => ({
    active: false,
    templateUid: null,
    type: 'normal',
    params: [],
    keys: [],
  });
  let compareValueState = createDefaultCompareValueState();

  // DOM 元素获取
  const $ = (id) => document.getElementById(id);
  const templateNameInput = $("templateName");
  const instanceNameInput = $("instanceName");
  const instanceIdInput = $("instanceId");
  const paramNameInput = $("paramName");
  const paramTypeSelect = $("paramType");
  const builtinParamTypeOptions = Array.from(paramTypeSelect.options).map((opt) => ({
    value: opt.value,
    label: opt.textContent,
  }));
  const builtinParamTypeSet = new Set(builtinParamTypeOptions.map((opt) => opt.value));
  const indexTemplateSelect = $("indexTemplate");
  const indexParamSelect = $("indexParam");
  const INDEXABLE_PARAM_TYPES = new Set(["int", "long", "float", "string"]);
  const RESERVED_INDEX_FIELDS = new Set(['template', 'id', 'name', 'index']);
  const templateListEl = $("templateList");
  const instanceListEl = $("instanceList");
  const paramListEl = $("paramList");
  const currentDirLabel = $("currentDir");
  const renameTemplateBtn = $("renameTemplate");
  const renameInstanceBtn = $("renameInstance");
  const openTrashBtn = $("openTrash");
  const trashOverlay = $("trashOverlay");
  const trashListEl = $("trashList");
  const closeTrashBtn = $("closeTrash");
  const emptyTrashBtn = $("emptyTrash");

  if (openTrashBtn && openTrashBtn.textContent) {
    const label = openTrashBtn.textContent.trim();
    if (label) {
      trashButtonBaseLabel = label;
    }
  }

  const NUMERIC_NAME_PATTERN = /^\d+$/;

  function isPureNumericName(name) {
    return NUMERIC_NAME_PATTERN.test(String(name || "").trim());
  }

  function setInvalidNameVisual(element, invalid) {
    if (!element) return;
    if (invalid) {
      element.classList.add('invalid-name');
    } else {
      element.classList.remove('invalid-name');
    }
  }

  function updateTemplateNameInputValidity() {
    if (!templateNameInput) return;
    setInvalidNameVisual(templateNameInput, isPureNumericName(templateNameInput.value));
  }

  function updateInstanceNameInputValidity() {
    if (!instanceNameInput) return;
    setInvalidNameVisual(instanceNameInput, isPureNumericName(instanceNameInput.value));
  }

  function updateInstanceIdInputState(duplicateIdInfo = null) {
    if (!instanceIdInput) return;
    const tpl = templates[currentTemplateIndex];
    if (!tpl || currentInstanceIndex < 0 || currentInstanceIndex >= tpl.instances.length) {
      instanceIdInput.value = '';
      instanceIdInput.disabled = true;
      instanceIdInput.classList.remove('invalid-name');
      instanceIdInput.removeAttribute('title');
      return;
    }
    const inst = tpl.instances[currentInstanceIndex];
    instanceIdInput.disabled = false;
    const value = inst && inst.id != null ? inst.id : '';
    instanceIdInput.value = value;
    if (duplicateIdInfo && duplicateIdInfo.byIndex && typeof duplicateIdInfo.byIndex.get === 'function') {
      const duplicateEntry = duplicateIdInfo.byIndex.get(currentInstanceIndex);
      if (duplicateEntry) {
        instanceIdInput.classList.add('invalid-name');
        const display = duplicateEntry.value !== '' ? duplicateEntry.value : '（空）';
        const entries = Array.isArray(duplicateEntry.entries) ? duplicateEntry.entries : [];
        const positions = entries
          .map((item) => (item && Number.isInteger(item.idx) ? item.idx + 1 : null))
          .filter((idx) => idx != null);
        const detailParts = [];
        if (entries.length > 0) {
          detailParts.push(`共 ${entries.length} 项`);
        }
        if (positions.length > 0) {
          detailParts.push(`位置 ${positions.join(', ')}`);
        }
        const detailSuffix = detailParts.length > 0 ? `（${detailParts.join('，')}）` : '';
        instanceIdInput.title = `ID 重复${detailSuffix}：${display}`;
      } else {
        instanceIdInput.classList.remove('invalid-name');
        instanceIdInput.removeAttribute('title');
      }
    } else {
      instanceIdInput.classList.remove('invalid-name');
      instanceIdInput.removeAttribute('title');
    }
  }

  function updateParamNameInputValidity() {
    if (!paramNameInput) return;
    const tpl = templates[currentTemplateIndex];
    if (tpl && isEnumTemplate(tpl)) {
      setInvalidNameVisual(paramNameInput, false);
      return;
    }
    setInvalidNameVisual(paramNameInput, isPureNumericName(paramNameInput.value));
  }

  function isSheetModeActive() {
    return currentEditMode === EDIT_MODES.SHEET;
  }

  function normalizeSheetSelection() {
    if (!templates.length) {
      sheetActiveTemplateIndex = -1;
      sheetActiveInstanceIndex = -1;
      return;
    }
    if (sheetActiveTemplateIndex < 0 || sheetActiveTemplateIndex >= templates.length) {
      sheetActiveTemplateIndex = currentTemplateIndex >= 0 ? currentTemplateIndex : 0;
      if (sheetActiveTemplateIndex >= templates.length) {
        sheetActiveTemplateIndex = templates.length - 1;
      }
    }
    const tpl = templates[sheetActiveTemplateIndex];
    const instList = Array.isArray(tpl?.instances) ? tpl.instances : [];
    if (instList.length === 0) {
      sheetActiveInstanceIndex = -1;
      return;
    }
    if (sheetActiveInstanceIndex < 0 || sheetActiveInstanceIndex >= instList.length) {
      if (currentInstanceIndex >= 0 && currentInstanceIndex < instList.length) {
        sheetActiveInstanceIndex = currentInstanceIndex;
      } else {
        sheetActiveInstanceIndex = 0;
      }
    }
  }

  function findTemplateByName(name) {
    if (!name) return null;
    return templates.find((tpl) => tpl && tpl.name === name) || null;
  }

  function doesTemplateHaveField(tpl, fieldName) {
    if (!tpl || !fieldName) return false;
    if (RESERVED_INDEX_FIELDS.has(fieldName)) return true;
    const params = Array.isArray(tpl.parameters) ? tpl.parameters : [];
    return params.some((p) => p && p.name === fieldName);
  }

  function getInstanceFieldValue(inst, fieldName, fallbackTemplateName = '') {
    if (!inst || !fieldName) return '';
    const payload = inst.payload || {};
    switch (fieldName) {
      case 'id':
        return inst.id != null ? inst.id : payload.id;
      case 'name':
        return inst.name != null ? inst.name : payload.name;
      case 'template':
        return payload.template != null ? payload.template : fallbackTemplateName;
      case 'index':
        return payload.index != null ? payload.index : '';
      default:
        return payload[fieldName];
    }
  }

  function doesTemplateContainValue(tpl, fieldName, value) {
    if (!tpl || !fieldName) return false;
    const normalized = value == null ? '' : String(value).trim();
    if (normalized === '') return false;
    const instList = Array.isArray(tpl.instances) ? tpl.instances : [];
    for (const instance of instList) {
      if (!instance) continue;
      const candidate = getInstanceFieldValue(instance, fieldName, tpl.name);
      if (candidate == null) continue;
      if (String(candidate).trim() === normalized) {
        return true;
      }
    }
    return false;
  }

  function evaluateInstanceIndexValidation(tpl, inst) {
    const invalidParams = new Map();
    if (!tpl || !inst) {
      return { invalidParams, hasInvalid: false };
    }
    const params = Array.isArray(tpl.parameters) ? tpl.parameters : [];
    params.forEach((param) => {
      if (!param || !param.parameterIndexes) return;
      const binding = inst.payload ? inst.payload[param.name] : undefined;
      const targetTplName = (param.parameterIndexes.template || '').trim();
      const targetParamName = (param.parameterIndexes.param || '').trim();
      const targetTpl = findTemplateByName(targetTplName);
      let reason = '';

      if (!targetTplName) {
        reason = '索引模板未设置';
      } else if (!targetTpl) {
        reason = `索引模板“${targetTplName}”不存在`;
      } else if (isEnumTemplate(targetTpl)) {
        reason = '索引目标不能是 enum 模板';
      } else if (!targetParamName) {
        reason = '索引字段未设置';
      } else if (!doesTemplateHaveField(targetTpl, targetParamName)) {
        reason = `模板“${targetTplName}”不存在字段“${targetParamName}”`;
      } else if (!RESERVED_INDEX_FIELDS.has(targetParamName)) {
        const targetParamDef = Array.isArray(targetTpl.parameters)
          ? targetTpl.parameters.find((p) => p && p.name === targetParamName)
          : null;
        if (targetParamDef && !INDEXABLE_PARAM_TYPES.has(targetParamDef.type)) {
          reason = `字段“${targetParamName}”类型不支持索引`;
        }
      }

      if (!reason) {
        let rawValue;
        if (binding == null) {
          reason = '索引值缺失';
        } else if (typeof binding === 'object') {
          rawValue = binding.value;
        } else if (typeof binding === 'string' || typeof binding === 'number' || typeof binding === 'boolean') {
          rawValue = binding;
        } else {
          reason = '索引值缺失';
        }

        if (!reason) {
          const normalizedValue = rawValue == null ? '' : String(rawValue).trim();
          if (normalizedValue === '') {
            reason = '索引值为空';
          } else if (!doesTemplateContainValue(targetTpl, targetParamName, normalizedValue)) {
            reason = `在模板“${targetTplName}”中找不到值“${normalizedValue}”`;
          }
        }
      }

      if (reason) {
        invalidParams.set(param.name, reason);
      }
    });

    return { invalidParams, hasInvalid: invalidParams.size > 0 };
  }

  function collectInstanceIndexInvalidReasons(tpl) {
    const invalidMap = new Map();
    if (!tpl || !Array.isArray(tpl.instances)) {
      return invalidMap;
    }
    tpl.instances.forEach((inst, idx) => {
      const validation = evaluateInstanceIndexValidation(tpl, inst);
      if (validation.hasInvalid) {
        invalidMap.set(idx, validation);
      }
    });
    return invalidMap;
  }

  function doesTemplateHaveInvalidIndexReferences(tpl) {
    if (!tpl || !Array.isArray(tpl.instances)) {
      return false;
    }
    return tpl.instances.some((inst) => {
      const validation = evaluateInstanceIndexValidation(tpl, inst);
      return validation.hasInvalid;
    });
  }

  function buildLuckysheetCell(text, options = {}) {
    const str = text == null ? '' : String(text);
    return Object.assign(
      {
        v: str,
        m: str,
        ct: { t: 'g', fa: 'General' },
      },
      options || {}
    );
  }

  function buildLuckysheetSheetFromRows(rows, sheetName, options = {}) {
    const {
      index: sheetIndex = 0,
      order = 0,
      status = 0,
      duplicateIdRows = null,
    } = options || {};
    const celldata = [];
    const header = rows[0] || [];
    const columnlen = {};
    header.forEach((_, idx) => {
      columnlen[idx] = idx === 0 ? 200 : 160;
    });
    rows.forEach((row, rIdx) => {
      (row || []).forEach((value, cIdx) => {
        const cellOptions = {};
        if (rIdx === 0) {
          cellOptions.bg = '#f3f6ff';
          cellOptions.fc = '#1f4fbf';
          cellOptions.bl = 1;
        } else if (rIdx === 1) {
          cellOptions.bg = '#fff8dc';
          cellOptions.fc = '#9c6f19';
        } else if (cIdx === 0) {
          cellOptions.fc = '#6a6a6a';
        }
        if (duplicateIdRows instanceof Set && duplicateIdRows.has(rIdx) && rIdx >= 2 && cIdx === 1) {
          cellOptions.bg = '#ffecec';
          cellOptions.fc = '#c53030';
          cellOptions.bl = 1;
        }
        celldata.push({ r: rIdx, c: cIdx, v: buildLuckysheetCell(value, cellOptions) });
      });
    });
    return {
      name: sheetName || '实例',
      order,
      index: sheetIndex,
      status,
      celldata,
      row: Math.max(rows.length, 20),
      column: Math.max(header.length, 1),
      config: { columnlen },
    };
  }

  function applyLuckysheetDuplicateIdStyles(sheetId, rowsSet) {
    if (!sheetId) return;
    const api = window.luckysheet;
    const nextSet = rowsSet instanceof Set ? rowsSet : new Set(rowsSet || []);
    const prevSet = sheetDuplicateIdRows.get(sheetId) || new Set();
    if (!api || typeof api.setRangeStyle !== 'function') {
      sheetDuplicateIdRows.set(sheetId, new Set(nextSet));
      return;
    }
    const prevRows = Array.from(prevSet);
    const nextRows = Array.from(nextSet);
    const toClear = prevRows.filter((row) => !nextSet.has(row));
    if (toClear.length > 0) {
      api.setRangeStyle({
        range: toClear.map((row) => ({ row: [row, row], column: [1, 1] })),
        style: { bg: '#ffffff', fc: '#000000', bl: 0 },
      });
    }
    const toApply = nextRows.filter((row) => row >= 2 && !prevSet.has(row));
    if (toApply.length > 0) {
      api.setRangeStyle({
        range: toApply.map((row) => ({ row: [row, row], column: [1, 1] })),
        style: { bg: '#ffecec', fc: '#c53030', bl: 1 },
      });
    }
    sheetDuplicateIdRows.set(sheetId, new Set(nextSet));
  }

  function refreshActiveLuckysheetDuplicateStyles() {
    if (!window.luckysheet || typeof window.luckysheet.getluckysheetfile !== 'function') return;
    if (sheetActiveTemplateIndex < 0) return;
    const sheetId = sheetRenderedSheetIds.get(sheetActiveTemplateIndex);
    if (!sheetId) return;
    const workbook = window.luckysheet.getluckysheetfile();
    if (!Array.isArray(workbook)) return;
    const sheet = workbook.find((item) => {
      if (!item) return false;
      return item.index === sheetId || item.id === sheetId || item.sheetId === sheetId;
    });
    if (!sheet) return;
    const rows = collectLuckysheetRows(sheet);
    const buckets = new Map();
    for (let r = 2; r < rows.length; r += 1) {
      const row = rows[r] || [];
      const idValue = row[1];
      const trimmed = String(idValue ?? '').trim();
      let key = trimmed;
      if (trimmed !== '') {
        const num = Number(trimmed);
        if (Number.isFinite(num)) {
          key = String(Math.trunc(num));
        }
      }
      if (!buckets.has(key)) {
        buckets.set(key, []);
      }
      buckets.get(key).push(r);
    }
    const duplicateRows = new Set();
    buckets.forEach((list) => {
      if (list.length > 1) {
        list.forEach((rowIndex) => duplicateRows.add(rowIndex));
      }
    });
    applyLuckysheetDuplicateIdStyles(sheetId, duplicateRows);
  }

  function activateLuckysheetSheet(sheetId) {
    if (!sheetId || !window.luckysheet) return false;
    const api = window.luckysheet;
    const workbook = typeof api.getluckysheetfile === 'function' ? api.getluckysheetfile() : null;
    let targetIndex = -1;
    if (Array.isArray(workbook)) {
      targetIndex = workbook.findIndex((sheet) => {
        if (!sheet) return false;
        return sheet.index === sheetId || sheet.id === sheetId || sheet.sheetId === sheetId;
      });
    }
    const tryCall = (methodName, value) => {
      const method = api[methodName];
      if (typeof method !== 'function') return false;
      try {
        method.call(api, value);
        return true;
      } catch (err) {
        console.warn(`Failed to call luckysheet.${methodName}:`, err);
        return false;
      }
    };
    if (targetIndex >= 0) {
      const orderMethods = ['setSheetActive', 'setSheetActivate', 'changeSheet', 'setSheetActiveByIndex', 'setSheetActivateByIndex', 'changeSheetByIndex'];
      for (let i = 0; i < orderMethods.length; i += 1) {
        if (tryCall(orderMethods[i], targetIndex)) {
          return true;
        }
      }
    }
    const idMethods = ['setSheetActiveById', 'setSheetActivateById', 'changeSheetById'];
    for (let i = 0; i < idMethods.length; i += 1) {
      if (tryCall(idMethods[i], sheetId)) {
        return true;
      }
    }
    if (targetIndex >= 0) {
      return tryCall('changeSheet', targetIndex);
    }
    return false;
  }

  function getLuckysheetCell(sheet, row, column) {
    if (!sheet) return null;
    if (Array.isArray(sheet.data) && sheet.data[row] && sheet.data[row][column]) {
      return sheet.data[row][column];
    }
    if (Array.isArray(sheet.celldata)) {
      for (let i = 0; i < sheet.celldata.length; i += 1) {
        const cell = sheet.celldata[i];
        if (cell && cell.r === row && cell.c === column) {
          return cell.v != null ? cell.v : cell;
        }
      }
    }
    return null;
  }

  function extractLuckysheetCellText(cell) {
    if (!cell) return '';
    if (cell.v != null && typeof cell.v === 'object') {
      return extractLuckysheetCellText(cell.v);
    }
    if (cell.m != null && cell.m !== '') {
      return String(cell.m);
    }
    if (cell.v != null && cell.v !== '') {
      if (typeof cell.v === 'object') {
        if (cell.v.m != null && cell.v.m !== '') {
          return String(cell.v.m);
        }
        if (cell.v.v != null && cell.v.v !== '') {
          return String(cell.v.v);
        }
      }
      return String(cell.v);
    }
    if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') {
      return String(cell);
    }
    return '';
  }

  function readLuckysheetCell(sheet, row, column) {
    const cell = getLuckysheetCell(sheet, row, column);
    return extractLuckysheetCellText(cell);
  }

  function compareTemplateParameters(a, b) {
    const left = Array.isArray(a) ? a : [];
    const right = Array.isArray(b) ? b : [];
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
      const pa = left[i] || {};
      const pb = right[i] || {};
      if ((pa.name || '') !== (pb.name || '')) return false;
      if ((pa.type || '').toLowerCase() !== (pb.type || '').toLowerCase()) return false;
      const idxA = pa.parameterIndexes || null;
      const idxB = pb.parameterIndexes || null;
      const keyA = idxA ? `${idxA.template || ''}/${idxA.param || ''}/${idxA.indexField || ''}` : '';
      const keyB = idxB ? `${idxB.template || ''}/${idxB.param || ''}/${idxB.indexField || ''}` : '';
      if (keyA !== keyB) return false;
    }
    return true;
  }

  function markSheetTemplateValidation(tpl, isValid, message) {
    if (!tpl) return;
    ensureTemplateUid(tpl);
    if (isValid) {
      sheetTemplateValidation.delete(tpl.__uid);
    } else {
      sheetTemplateValidation.set(tpl.__uid, { message: message || '' });
    }
  }

  function getLuckysheetUsedRange(sheet) {
    let maxRow = 1;
    let maxColumn = 3;
    const checkCell = (row, column, cell) => {
      const text = extractLuckysheetCellText(cell);
      if (text !== '') {
        if (row > maxRow) maxRow = row;
        if (column > maxColumn) maxColumn = column;
      }
    };
    if (Array.isArray(sheet?.data)) {
      sheet.data.forEach((row, rIdx) => {
        if (!Array.isArray(row)) return;
        row.forEach((cell, cIdx) => {
          if (cell == null) return;
          checkCell(rIdx, cIdx, cell);
        });
      });
    }
    if (Array.isArray(sheet?.celldata)) {
      sheet.celldata.forEach((item) => {
        if (!item) return;
        const cell = item.v != null ? item.v : item;
        checkCell(item.r, item.c, cell);
      });
    }
    return { maxRow: Math.max(maxRow, 1), maxColumn: Math.max(maxColumn, 3) };
  }

  function collectLuckysheetRows(sheet) {
    const { maxRow, maxColumn } = getLuckysheetUsedRange(sheet);
    const rows = [];
    const columnCount = Math.max(maxColumn + 1, 4);
    const rowCount = Math.max(maxRow + 1, 2);
    for (let r = 0; r < rowCount; r += 1) {
      const rowValues = [];
      for (let c = 0; c < columnCount; c += 1) {
        rowValues.push(readLuckysheetCell(sheet, r, c));
      }
      rows.push(rowValues);
    }
    return rows;
  }

  function normalizeSheetRowsForComparison(rows) {
    if (!Array.isArray(rows)) return [];
    const normalized = rows.map((row) => {
      const list = Array.isArray(row)
        ? row.map((cell) => String(cell ?? '').trim())
        : [];
      let lastIdx = list.length - 1;
      while (lastIdx >= 0 && list[lastIdx] === '') {
        lastIdx -= 1;
      }
      return list.slice(0, lastIdx + 1);
    });
    let lastRow = normalized.length - 1;
    while (lastRow >= 0 && normalized[lastRow].every((cell) => cell === '')) {
      lastRow -= 1;
    }
    return normalized.slice(0, lastRow + 1);
  }

  function areSheetRowsEqual(leftRows, rightRows) {
    const left = normalizeSheetRowsForComparison(leftRows);
    const right = normalizeSheetRowsForComparison(rightRows);
    if (left.length !== right.length) return false;
    for (let r = 0; r < left.length; r += 1) {
      const rowA = left[r];
      const rowB = right[r] || [];
      if (rowA.length !== rowB.length) return false;
      for (let c = 0; c < rowA.length; c += 1) {
        if (rowA[c] !== (rowB[c] || '')) return false;
      }
    }
    return true;
  }

  function getTemplateParameterSignature(tpl) {
    if (!tpl) return '';
    const params = (tpl.parameters || []).map((p) => {
      if (!p) return null;
      const indexes = p.parameterIndexes || {};
      return {
        name: p.name || '',
        type: p.type || '',
        template: indexes.template || '',
        param: indexes.param || '',
        indexField: indexes.indexField || '',
      };
    });
    return JSON.stringify({ params, indexField: tpl.indexField || 'id' });
  }

  function computeSheetTemplatesFingerprint() {
    const items = templates.map((tpl, idx) => {
      if (!tpl) return null;
      ensureTemplateUid(tpl);
      const instances = Array.isArray(tpl.instances) ? tpl.instances : [];
      return {
        uid: tpl.__uid,
        index: idx,
        count: instances.length,
        signature: getTemplateParameterSignature(tpl),
        name: tpl.name || '',
      };
    });
    return JSON.stringify(items);
  }

  function commitActiveSheetEdits() {
    if (!isSheetModeActive()) {
      sheetModeDirty = false;
      return { ok: true };
    }
    if (sheetRenderedTemplateIndex < 0) {
      sheetModeDirty = false;
      return { ok: true };
    }
    if (!window.luckysheet || typeof window.luckysheet.getluckysheetfile !== 'function') {
      sheetModeDirty = false;
      return { ok: true };
    }
    const tpl = templates[sheetRenderedTemplateIndex];
    if (!tpl) {
      sheetModeDirty = false;
      return { ok: true };
    }
    const sheetId = sheetRenderedSheetIds.get(sheetRenderedTemplateIndex) || tpl.__uid;
    if (!sheetId) {
      sheetModeDirty = false;
      return { ok: true };
    }
    const workbook = window.luckysheet.getluckysheetfile();
    if (!Array.isArray(workbook) || workbook.length === 0) {
      sheetModeDirty = false;
      return { ok: true };
    }
    const sheet = workbook.find((item) => {
      if (!item) return false;
      return item.index === sheetId || item.id === sheetId || item.sheetId === sheetId;
    }) || workbook.find((item) => Number(item?.status) === 1) || workbook[0];
    const mergedRows = collectLuckysheetRows(sheet);
    const currentRows = buildCsvRowsForTemplate(tpl, tpl.instances || []);
    if (!sheetModeDirty && areSheetRowsEqual(mergedRows, currentRows)) {
      markSheetTemplateValidation(tpl, true);
      return { ok: true };
    }
    try {
      const parsed = buildTemplateFromCsv(mergedRows, `${tpl.name || 'template'}.csv`);
      if ((parsed.name || tpl.name) !== tpl.name) {
        throw new Error('表格模式不可修改模板名称');
      }
      const expectedIndexField = tpl.indexField || 'id';
      if ((parsed.indexField || 'id') !== expectedIndexField) {
        throw new Error('表格模式不可修改索引列定义');
      }
      const nextParameters = Array.isArray(parsed.parameters) ? parsed.parameters : [];
      const nextInstances = Array.isArray(parsed.instances) ? parsed.instances : [];
      tpl.parameters = nextParameters;
      tpl.instances = nextInstances;
      tpl.indexField = parsed.indexField || tpl.indexField || 'id';
      sheetModeDirty = false;
      currentTemplateIndex = sheetRenderedTemplateIndex;
      if (tpl.instances.length > 0) {
        if (currentInstanceIndex < 0) {
          currentInstanceIndex = 0;
        }
        if (currentInstanceIndex >= tpl.instances.length) {
          currentInstanceIndex = tpl.instances.length - 1;
        }
      } else {
        currentInstanceIndex = -1;
      }
      selectedInstances.clear();
      if (currentInstanceIndex >= 0) {
        selectedInstances.add(currentInstanceIndex);
      }
      markSheetTemplateValidation(tpl, true);
      sheetRenderedInstanceCount = tpl.instances.length;
      sheetRenderedParameterSignature = getTemplateParameterSignature(tpl);
      refreshTemplates();
      refreshInstances();
      refreshParams();
      sheetRenderedTemplatesFingerprint = computeSheetTemplatesFingerprint();
      refreshActiveLuckysheetDuplicateStyles();
      return { ok: true };
    } catch (err) {
      console.error(err);
      showMessage(err && err.message ? `表格数据校验失败：${err.message}` : '表格数据校验失败', 'warn');
      markSheetTemplateValidation(tpl, false, err && err.message ? err.message : '表格数据校验失败');
      return { ok: false, error: err };
    }
  }

  function updateSheetTemplateNav() {
    if (!sheetTemplateListEl) return;
    normalizeSheetSelection();
    sheetTemplateListEl.innerHTML = '';
    templates.forEach((tpl, idx) => {
      ensureTemplateUid(tpl);
      const validation = sheetTemplateValidation.get(tpl.__uid);
      const li = document.createElement('li');
      const classes = [];
      if (idx === sheetActiveTemplateIndex) classes.push('active');
      if (validation) classes.push('invalid');
      const duplicateIdInfo = collectDuplicateIdInfo(tpl);
      const duplicateIdKeys = Array.from(duplicateIdInfo.duplicates.keys());
      if (duplicateIdKeys.length > 0) {
        classes.push('duplicate-id');
      }
      li.className = classes.join(' ');
      const tooltipParts = [];
      if (validation && validation.message) {
        tooltipParts.push(validation.message);
      }
      if (duplicateIdKeys.length > 0) {
        const preview = duplicateIdKeys
          .map((key) => (key === '' ? '（空）' : key))
          .slice(0, 3)
          .join(', ');
        const suffix = duplicateIdKeys.length > 3 ? '…' : '';
        tooltipParts.push(`存在重复 ID：${preview}${suffix}`);
      }
      if (tooltipParts.length > 0) {
        li.title = tooltipParts.join('\n');
      } else {
        li.removeAttribute('title');
      }
      const label = document.createElement('span');
      label.textContent = tpl.name || `模板${idx + 1}`;
      setInvalidNameVisual(label, isPureNumericName(tpl.name));
      li.appendChild(label);
      li.addEventListener('click', () => {
        if (idx === sheetActiveTemplateIndex) return;
        const result = commitActiveSheetEdits();
        if (result && result.ok === false) {
          updateSheetTemplateNav();
          return;
        }
        sheetActiveTemplateIndex = idx;
        currentTemplateIndex = idx;
        selectedTemplates.clear();
        selectedTemplates.add(idx);
        const instanceCount = Array.isArray(templates[idx]?.instances) ? templates[idx].instances.length : 0;
        currentInstanceIndex = instanceCount > 0 ? Math.min(Math.max(currentInstanceIndex, 0), instanceCount - 1) : -1;
        sheetActiveInstanceIndex = currentInstanceIndex;
        selectedInstances.clear();
        if (currentInstanceIndex >= 0) {
          selectedInstances.add(currentInstanceIndex);
        }
        refreshTemplates();
        refreshInstances();
        refreshParams();
        updateSheetTemplateNav();
        updateSheetInstanceTabs();
        renderLuckysheetForActiveInstance();
      });
      sheetTemplateListEl.appendChild(li);
    });
  }

  function updateSheetInstanceTabs() {
    if (!sheetInstanceTabsEl) return;
    normalizeSheetSelection();
    sheetInstanceTabsEl.innerHTML = '';
    const tpl = sheetActiveTemplateIndex >= 0 ? templates[sheetActiveTemplateIndex] : null;
    const instList = tpl && Array.isArray(tpl.instances) ? tpl.instances : [];
    const info = document.createElement('div');
    info.className = 'sheet-tabs-empty';
    if (!tpl) {
      info.textContent = '暂无模板，无法进入表格编辑。';
    } else if (instList.length === 0) {
      info.textContent = '该模板还没有实例，请在三列模式下创建后再切换。';
    } else {
      info.textContent = `当前模板共有 ${instList.length} 个实例，均已在表格中显示。`;
    }
    sheetInstanceTabsEl.appendChild(info);
  }

  function renderLuckysheetForActiveInstance() {
    if (!luckysheetContainer || !sheetModePanel) return;
    normalizeSheetSelection();
    if (!window.luckysheet) {
      showMessage('Luckysheet 库未加载，无法进入表格模式', 'warn');
      return;
    }
    if (sheetActiveTemplateIndex < 0 || sheetActiveTemplateIndex >= templates.length) {
      sheetRenderedTemplateIndex = -1;
      sheetRenderedInstanceIndex = -1;
      sheetRenderedInstanceCount = 0;
      sheetRenderedParameterSignature = '';
      if (sheetEmptyStateEl) {
        sheetEmptyStateEl.style.display = 'flex';
        const msg = sheetEmptyStateEl.querySelector('p');
        if (msg) {
          msg.textContent = '请选择一个包含实例的模板以进入表格编辑模式。';
        }
      }
      luckysheetContainer.style.display = 'none';
      return;
    }
    const tpl = templates[sheetActiveTemplateIndex];
    const instList = Array.isArray(tpl.instances) ? tpl.instances : [];
    const fingerprint = computeSheetTemplatesFingerprint();
    const needsRebuild = !luckysheetInitialized || sheetRenderedTemplatesFingerprint !== fingerprint;
    if (needsRebuild) {
      const workbookSheets = [];
      sheetRenderedSheetIds.clear();
      sheetDuplicateIdRows.clear();
      let activeSheetPrepared = false;
      templates.forEach((template, idx) => {
        if (!template) return;
        ensureTemplateUid(template);
        const instances = Array.isArray(template.instances) ? template.instances : [];
        if (instances.length === 0) return;
        const sheetId = template.__uid;
        const rows = buildCsvRowsForTemplate(template, instances);
        const sheetName = template?.name || `模板${idx + 1}`;
        const status = idx === sheetActiveTemplateIndex && instList.length > 0 ? 1 : 0;
        if (status === 1) {
          activeSheetPrepared = true;
        }
        const duplicateIdInfo = collectDuplicateIdInfo(template);
        const duplicateRowSet = new Set(
          Array.from(duplicateIdInfo.byIndex.keys()).map((instanceIdx) => instanceIdx + 2)
        );
        const sheetData = buildLuckysheetSheetFromRows(rows, sheetName, {
          index: sheetId,
          order: workbookSheets.length,
          status,
          duplicateIdRows: duplicateRowSet,
        });
        workbookSheets.push(sheetData);
        sheetRenderedSheetIds.set(idx, sheetId);
        sheetDuplicateIdRows.set(sheetId, duplicateRowSet);
      });
      if (workbookSheets.length === 0) {
        if (window.luckysheet?.destroy && luckysheetInitialized) {
          window.luckysheet.destroy();
        }
        luckysheetInitialized = false;
        sheetModeDirty = false;
        sheetRenderedTemplatesFingerprint = fingerprint;
      } else {
        if (!activeSheetPrepared) {
          workbookSheets[0].status = 1;
        }
        if (window.luckysheet?.destroy && luckysheetInitialized) {
          window.luckysheet.destroy();
        }
        const hook = {
          cellUpdateBefore(row, column) {
            if (column === 0) {
              showMessage('模板列由系统维护，无法修改', 'warn');
              return false;
            }
            if (column === 1 && row <= 1) {
              showMessage('ID 列标题不可修改', 'warn');
              return false;
            }
            if (column === 2) {
              showMessage('索引列由系统维护，无法修改', 'warn');
              return false;
            }
            if ((row === 0 || row === 1) && column === 3) {
              showMessage('保留字段不可编辑', 'warn');
              return false;
            }
            return true;
          },
          cellUpdate() {
            sheetModeDirty = true;
            setTimeout(refreshActiveLuckysheetDuplicateStyles, 0);
          },
        };
        window.luckysheet?.create({
          container: 'luckysheet',
          data: workbookSheets,
          showtoolbar: false,
          showsheetbar: false,
          showinfobar: false,
          lang: 'zh',
          hook,
        });
        luckysheetInitialized = true;
        sheetModeDirty = false;
        sheetRenderedTemplatesFingerprint = fingerprint;
      }
    }
    if (!luckysheetInitialized || sheetRenderedSheetIds.size === 0) {
      sheetRenderedTemplateIndex = -1;
      sheetRenderedInstanceIndex = -1;
      sheetRenderedInstanceCount = 0;
      sheetRenderedParameterSignature = '';
      if (sheetEmptyStateEl) {
        sheetEmptyStateEl.style.display = 'flex';
        const msg = sheetEmptyStateEl.querySelector('p');
        if (msg) {
          if (templates.length === 0) {
            msg.textContent = '暂无模板，无法进入表格编辑模式。';
          } else {
            msg.textContent = '请选择一个包含实例的模板以进入表格编辑模式。';
          }
        }
      }
      luckysheetContainer.style.display = 'none';
      return;
    }
    if (instList.length === 0 || !sheetRenderedSheetIds.has(sheetActiveTemplateIndex)) {
      sheetRenderedTemplateIndex = sheetActiveTemplateIndex;
      sheetRenderedInstanceIndex = -1;
      sheetRenderedInstanceCount = 0;
      sheetRenderedParameterSignature = '';
      if (sheetEmptyStateEl) {
        sheetEmptyStateEl.style.display = 'flex';
        const msg = sheetEmptyStateEl.querySelector('p');
        if (msg) {
          msg.textContent = '当前模板没有实例，请回到三列模式新增实例。';
        }
      }
      luckysheetContainer.style.display = 'none';
      return;
    }
    const activeSheetId = sheetRenderedSheetIds.get(sheetActiveTemplateIndex);
    if (!needsRebuild) {
      const activated = activateLuckysheetSheet(activeSheetId);
      if (!activated) {
        if (window.luckysheet?.destroy && luckysheetInitialized) {
          window.luckysheet.destroy();
        }
        luckysheetInitialized = false;
        sheetRenderedTemplatesFingerprint = '';
        renderLuckysheetForActiveInstance();
        return;
      }
    }
    sheetRenderedTemplateIndex = sheetActiveTemplateIndex;
    sheetRenderedInstanceIndex = -1;
    sheetRenderedInstanceCount = instList.length;
    sheetRenderedParameterSignature = getTemplateParameterSignature(tpl);
    luckysheetContainer.style.display = 'block';
    if (sheetEmptyStateEl) sheetEmptyStateEl.style.display = 'none';
    refreshActiveLuckysheetDuplicateStyles();
  }

  function enterSheetMode() {
    document.body.classList.add('sheet-mode');
    normalizeSheetSelection();
    updateSheetTemplateNav();
    updateSheetInstanceTabs();
    renderLuckysheetForActiveInstance();
  }

  function exitSheetMode() {
    document.body.classList.remove('sheet-mode');
    if (window.luckysheet?.destroy && luckysheetInitialized) {
      window.luckysheet.destroy();
    }
    luckysheetInitialized = false;
    sheetModeDirty = false;
    sheetRenderedTemplateIndex = -1;
    sheetRenderedInstanceIndex = -1;
    sheetRenderedInstanceCount = 0;
    sheetRenderedParameterSignature = '';
    sheetRenderedTemplatesFingerprint = '';
    sheetRenderedSheetIds.clear();
    sheetDuplicateIdRows.clear();
    if (luckysheetContainer) luckysheetContainer.style.display = 'none';
    if (sheetEmptyStateEl) sheetEmptyStateEl.style.display = 'none';
  }

  function setEditMode(nextMode) {
    if (nextMode === currentEditMode) return;
    if (nextMode === EDIT_MODES.SHEET && (!window.luckysheet || typeof window.luckysheet.create !== 'function')) {
      showMessage('Luckysheet 库未加载，无法切换到表格模式', 'warn');
      return;
    }
    if (currentEditMode === EDIT_MODES.SHEET) {
      const result = commitActiveSheetEdits();
      if (result && result.ok === false) {
        updateSheetTemplateNav();
        return;
      }
    }
    currentEditMode = nextMode;
    if (toggleEditModeBtn) {
      toggleEditModeBtn.dataset.mode = nextMode;
      toggleEditModeBtn.textContent = nextMode === EDIT_MODES.SHEET ? '返回三列模式' : '表格模式';
    }
    if (nextMode === EDIT_MODES.SHEET) {
      enterSheetMode();
    } else {
      exitSheetMode();
    }
  }

  // 面板元素，用于点击空白处取消选中
  const templatePanelEl = document.querySelector('.templates');
  const instancePanelEl = document.querySelector('.instances');
  const paramPanelEl = document.querySelector('.parameters');

  const toggleDarkBtn = $("toggleDark");
  const paramWidthSlider = $("paramWidth");
  const paramWidthLabel = $("paramWidthLabel");
  const messageBox = $("message");
  const helpBtn = $("helpBtn");
  const regenerateCsBtn = $("regenerateCs");
  const exportCsvBtn = $("exportCsv");
  const confirmExportCsvBtn = $("confirmExportCsv");
  const cancelExportCsvBtn = $("cancelExportCsv");
  const importCsvBtn = $("importCsv");
  const viewLogsBtn = $("viewLogs");
  const logOverlay = $("logOverlay");
  const logListEl = $("logList");
  const closeLogBtn = $("closeLog");
  const clearLogsBtn = $("clearLogs");
  const toggleEditModeBtn = $("toggleEditMode");
  const sheetModePanel = $("sheetMode");
  const sheetTemplateListEl = $("sheetTemplateList");
  const luckysheetContainer = $("luckysheet");
  const sheetInstanceTabsEl = $("sheetInstanceTabs");
  const sheetEmptyStateEl = $("sheetEmptyState");

  // 行高调整滑块
  const rowHeightSlider = $("rowHeight");
  const rowHeightLabel = $("rowHeightLabel");

  // 列表搜索输入
  const searchTemplatesInput = $("searchTemplates");
  const searchInstancesInput = $("searchInstances");
  const searchParamsInput = $("searchParams");
  const toggleCompareValuesBtn = $("toggleCompareValues");

  // 拖拽选择状态
  const dragSelect = {
    isDragging: false,
    type: null,
    indices: new Set(),
  };

  function addLogEntry(level, message, extra) {
    const entry = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      level: level || 'info',
      message: String(message ?? ''),
      time: new Date(),
      extra: extra || null,
    };
    operationLogs.push(entry);
    if (operationLogs.length > 500) {
      operationLogs.splice(0, operationLogs.length - 500);
    }
    if (logOverlay && logOverlay.style.display !== 'none') {
      renderLogs();
    }
  }

  function renderLogs() {
    if (!logListEl) return;
    logListEl.innerHTML = '';
    if (operationLogs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'log-empty';
      // 占位文案确保日志面板在没有记录时也能感知到已打开
      empty.textContent = '暂无日志';
      logListEl.appendChild(empty);
      return;
    }
    operationLogs.forEach((entry) => {
      const div = document.createElement('div');
      div.className = `log-entry ${entry.level}`;
      const timeSpan = document.createElement('span');
      timeSpan.className = 'time';
      timeSpan.textContent = formatLogTimestamp(entry.time);
      div.appendChild(timeSpan);
      const msgSpan = document.createElement('span');
      msgSpan.textContent = entry.message;
      div.appendChild(msgSpan);
      if (entry.extra && entry.extra.detail) {
        const detail = document.createElement('div');
        detail.textContent = entry.extra.detail;
        detail.style.marginTop = '4px';
        detail.style.whiteSpace = 'pre-wrap';
        div.appendChild(detail);
      }
      logListEl.appendChild(div);
    });
  }

  function formatLogTimestamp(date) {
    if (!(date instanceof Date)) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function openLogOverlay() {
    if (!logOverlay) return;
    renderLogs();
    logOverlay.style.display = 'flex';
  }

  function closeLogOverlay() {
    if (!logOverlay) return;
    logOverlay.style.display = 'none';
  }

  function clearLogEntries() {
    operationLogs.length = 0;
    renderLogs();
  }

  function updateTrashButtonLabel(count) {
    if (!openTrashBtn) return;
    const base = trashButtonBaseLabel || '垃圾箱';
    const total = Number.isFinite(count) && count > 0 ? count : 0;
    openTrashBtn.textContent = total > 0 ? `${base} (${total})` : base;
    if (total > 0) {
      openTrashBtn.classList.add('has-items');
    } else {
      openTrashBtn.classList.remove('has-items');
    }
  }

  async function ensureTrashDirectory() {
    if (!dataEntityHandle) {
      trashHandle = null;
      return null;
    }
    if (trashHandle) {
      return trashHandle;
    }
    try {
      trashHandle = await dataEntityHandle.getDirectoryHandle(TRASH_FOLDER_NAME, { create: true });
    } catch (err) {
      console.warn('无法访问垃圾箱目录', err);
      trashHandle = null;
    }
    return trashHandle;
  }

  function formatTrashTimestampText(ms) {
    if (!ms) return '未知时间';
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return '未知时间';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function formatFileSize(bytes) {
    if (typeof bytes !== 'number' || Number.isNaN(bytes) || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let size = bytes / 1024;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    const precision = size >= 10 ? 0 : 1;
    return `${size.toFixed(precision)} ${units[unit]}`;
  }

  async function listTrashEntries() {
    const handle = await ensureTrashDirectory();
    if (!handle) return [];
    const items = [];
    try {
      for await (const entry of handle.values()) {
        if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.json')) {
          try {
            const file = await entry.getFile();
            items.push({
              templateName: entry.name.replace(/\.json$/i, ''),
              fileName: entry.name,
              lastModified: file.lastModified,
              size: file.size,
            });
          } catch (err) {
            console.warn('读取垃圾箱文件失败', err);
          }
        }
      }
    } catch (err) {
      console.warn('遍历垃圾箱目录失败', err);
      return [];
    }
    items.sort((a, b) => {
      const timeDiff = (b.lastModified || 0) - (a.lastModified || 0);
      if (timeDiff !== 0) return timeDiff;
      return a.templateName.localeCompare(b.templateName);
    });
    return items;
  }

  function updateTrashSelectionUI() {
    if (!trashListEl) return;
    const items = trashListEl.querySelectorAll('.trash-item');
    items.forEach((item) => {
      const name = item.dataset.name || '';
      item.classList.toggle('selected', Boolean(trashSelectedTemplateName) && name === trashSelectedTemplateName);
    });
  }

  function setTrashSelection(name) {
    trashSelectedTemplateName = name || null;
    updateTrashSelectionUI();
  }

  function renderTrashEntries(entries) {
    if (!trashListEl) return;
    trashListEl.innerHTML = '';
    if (!Array.isArray(entries) || entries.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'trash-empty';
      emptyEl.textContent = '垃圾箱为空';
      trashListEl.appendChild(emptyEl);
      trashSelectedTemplateName = null;
      return;
    }
    if (!entries.some((entry) => entry.templateName === trashSelectedTemplateName)) {
      trashSelectedTemplateName = entries[0].templateName;
    }
    const list = document.createElement('ul');
    list.className = 'trash-list';
    entries.forEach((entry) => {
      const li = document.createElement('li');
      li.className = 'trash-item';
      li.dataset.name = entry.templateName;
      if (entry.templateName === trashSelectedTemplateName) {
        li.classList.add('selected');
      }
      li.addEventListener('click', () => {
        setTrashSelection(entry.templateName);
      });

      const info = document.createElement('div');
      info.className = 'trash-info';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'trash-name';
      nameSpan.textContent = entry.templateName;
      info.appendChild(nameSpan);
      const metaSpan = document.createElement('span');
      metaSpan.className = 'trash-meta';
      const timeText = formatTrashTimestampText(entry.lastModified);
      metaSpan.textContent = `${timeText} · ${formatFileSize(entry.size)}`;
      info.appendChild(metaSpan);

      const actions = document.createElement('div');
      actions.className = 'trash-item-actions';
      const restoreBtn = document.createElement('button');
      restoreBtn.textContent = '恢复';
      restoreBtn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        restoreTemplateFromTrash(entry.templateName);
      });
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '删除';
      deleteBtn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        deleteTrashEntry(entry.templateName);
      });
      actions.appendChild(restoreBtn);
      actions.appendChild(deleteBtn);

      li.appendChild(info);
      li.appendChild(actions);
      list.appendChild(li);
    });
    trashListEl.appendChild(list);
  }

  async function refreshTrashButtonState() {
    const entries = await listTrashEntries();
    updateTrashButtonLabel(entries.length);
    return entries;
  }

  async function refreshTrashOverlayContents() {
    if (!trashOverlay || trashOverlay.style.display === 'none') return;
    const entries = await refreshTrashButtonState();
    renderTrashEntries(entries);
    updateTrashSelectionUI();
  }

  async function openTrashOverlayPanel() {
    if (!trashOverlay) return;
    if (!directoryHandle || !dataEntityHandle) {
      showMessage('请先选择工作目录', 'warn');
      return;
    }
    const entries = await refreshTrashButtonState();
    renderTrashEntries(entries);
    trashOverlay.style.display = 'flex';
    trashOverlay.setAttribute('aria-hidden', 'false');
    try {
      trashOverlay.focus({ preventScroll: true });
    } catch {}
  }

  function closeTrashOverlayPanel() {
    if (!trashOverlay) return;
    trashOverlay.style.display = 'none';
    trashOverlay.setAttribute('aria-hidden', 'true');
    trashSelectedTemplateName = null;
  }

  async function deleteTrashEntry(templateName) {
    if (!templateName) return;
    const handle = await ensureTrashDirectory();
    if (!handle || typeof handle.removeEntry !== 'function') {
      showMessage('垃圾箱目录不可用', 'warn');
      return;
    }
    const fileName = `${templateName}.json`;
    try {
      await handle.removeEntry(fileName);
      if (trashSelectedTemplateName === templateName) {
        trashSelectedTemplateName = null;
      }
      showMessage(`已从垃圾箱删除：${templateName}`);
    } catch (err) {
      if (err && err.name === 'NotFoundError') {
        showMessage('垃圾箱中未找到该模板', 'warn');
      } else {
        console.warn('删除垃圾箱文件失败', err);
        showMessage('删除失败，请检查权限', 'warn');
      }
    }
    await refreshTrashOverlayContents();
  }

  function deleteSelectedTrashEntry() {
    if (!trashSelectedTemplateName) return;
    deleteTrashEntry(trashSelectedTemplateName);
  }

  async function emptyTrashFolder() {
    const handle = await ensureTrashDirectory();
    if (!handle || typeof handle.removeEntry !== 'function') {
      showMessage('垃圾箱目录不可用', 'warn');
      return;
    }
    const targets = [];
    try {
      for await (const entry of handle.values()) {
        if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.json')) {
          targets.push(entry.name);
        }
      }
    } catch (err) {
      console.warn('遍历垃圾箱目录失败', err);
      showMessage('清空垃圾箱失败', 'warn');
      return;
    }
    try {
      for (const name of targets) {
        await handle.removeEntry(name);
      }
      trashSelectedTemplateName = null;
      showMessage('垃圾箱已清空');
    } catch (err) {
      console.warn('清空垃圾箱失败', err);
      showMessage('清空垃圾箱失败，请检查权限', 'warn');
    }
    await refreshTrashOverlayContents();
  }

  async function restoreTemplateFromTrash(templateName) {
    if (!templateName) return;
    if (!directoryHandle) {
      showMessage('请先选择工作目录', 'warn');
      return;
    }
    if (!dataEntityHandle || !csharpHandle) {
      try {
        await ensureSubFolders();
      } catch (err) {
        console.warn('恢复模板时无法确保目录结构', err);
        showMessage('恢复失败，请检查权限', 'warn');
        return;
      }
    }
    const handle = await ensureTrashDirectory();
    if (!handle) {
      showMessage('垃圾箱目录不可用', 'warn');
      return;
    }
    const fileName = `${templateName}.json`;
    let fileText = '';
    let parsed = null;
    try {
      const fileHandle = await handle.getFileHandle(fileName, { create: false });
      const file = await fileHandle.getFile();
      fileText = await file.text();
      parsed = JSON.parse(fileText);
    } catch (err) {
      console.warn('读取垃圾箱模板失败', err);
      showMessage('读取垃圾箱文件失败', 'warn');
      return;
    }
    if (!parsed || typeof parsed !== 'object' || !parsed.name) {
      showMessage('模板 JSON 不合法，无法恢复', 'warn');
      return;
    }
    if (templates.some((tpl) => tpl && tpl.name === parsed.name)) {
      showMessage('已有同名模板，请先处理重名', 'warn');
      return;
    }
    try {
      await writeTextFile(dataEntityHandle, fileName, fileText);
      if (typeof handle.removeEntry === 'function') {
        await handle.removeEntry(fileName);
      }
    } catch (err) {
      console.warn('恢复模板写入失败', err);
      showMessage('恢复失败，请检查权限', 'warn');
      return;
    }

    const template = {
      name: parsed.name,
      parameters: Array.isArray(parsed.parameters) ? parsed.parameters : [],
      instances: Array.isArray(parsed.instances) ? parsed.instances : [],
      indexField: parsed.indexField || 'id',
    };
    normalizeTemplateParameterIndexes(template);
    if (isEnumTemplate(template)) {
      ensureEnumParamNaming(template);
    }
    ensureTemplateUid(template);
    template.__fromDisk = true;
    templates.push(template);
    populateMissingIndexFields(templates);
    templates.sort((a, b) => a.name.localeCompare(b.name));
    const idx = templates.findIndex((tpl) => tpl.__uid === template.__uid);
    selectedTemplates.clear();
    selectedInstances.clear();
    selectedParams.clear();
    if (idx >= 0) {
      currentTemplateIndex = idx;
      selectedTemplates.add(idx);
      currentInstanceIndex = template.instances.length > 0 ? 0 : -1;
    } else {
      currentTemplateIndex = templates.length > 0 ? 0 : -1;
      currentInstanceIndex = currentTemplateIndex >= 0 && templates[currentTemplateIndex].instances.length > 0 ? 0 : -1;
    }
    editingParamIndex = -1;
    refreshTemplates();
    refreshInstances();
    refreshParams();
    updateIndexTemplateOptions();
    updateTemplateNameInputValidity();
    updateInstanceNameInputValidity();
    updateParamNameInputValidity();
    lastSelectedCategory = 'template';
    pendingTemplateDeletions.delete(templateName);
    if (template.__uid) {
      lastSavedStructureSnapshot.set(template.__uid, snapshotTemplateStructure(template));
    }

    try {
      if (isEnumTemplate(template)) {
        await saveEnumTemplateCache(template);
        const enumJson = buildEnumTemplateJson(template);
        if (enumJson) {
          await writeTextFile(dataEntityHandle, `${template.name}.json`, JSON.stringify(enumJson, null, 2));
        }
      } else {
        const csContent = generateCSContent(template);
        await writeTextFile(csharpHandle, `${template.name}.cs`, csContent);
      }
      await writeManifestForTemplates();
      await generateEnumCSFiles(getEnumTemplate());
      await generateRuntimeLoaderArtifacts();
    } catch (err) {
      console.warn('恢复模板后生成文件失败', err);
      showMessage('模板已恢复，但生成关联文件失败，请手动保存', 'warn');
      await refreshTrashButtonState();
      await refreshTrashOverlayContents();
      return;
    }

    showMessage(`已恢复模板：${template.name}`);
    await refreshTrashButtonState();
    await refreshTrashOverlayContents();
  }
  const originalAlert = window.alert.bind(window);
  window.alert = (message) => {
    addLogEntry('warn', String(message ?? ''));
    originalAlert(message);
  };

  function updateExportButtons() {
    if (!exportCsvBtn || !confirmExportCsvBtn || !cancelExportCsvBtn) return;
    if (exportSelectionMode) {
      exportCsvBtn.style.display = 'none';
      confirmExportCsvBtn.style.display = '';
      cancelExportCsvBtn.style.display = '';
    } else {
      exportCsvBtn.style.display = '';
      confirmExportCsvBtn.style.display = 'none';
      cancelExportCsvBtn.style.display = 'none';
    }
  }

  function beginExportSelection() {
    const missingDirectory = !directoryHandle || !dataEntityHandle;
    exportSelectionMode = true;
    exportTemplateAnchorIndex = null;
    updateExportButtons();
    const message = missingDirectory
      ? '未选择工作目录，请先勾选需要导出的模板或实例，导出时会提示选择目录'
      : '已进入导出选择模式，勾选需要导出的模板或实例';
    showMessage(message, missingDirectory ? 'warn' : 'info');
    refreshTemplates();
    refreshInstances();
  }

  function exitExportSelectionMode(clearSelection) {
    exportSelectionMode = false;
    exportTemplateAnchorIndex = null;
    if (clearSelection) {
      exportSelections.clear();
    }
    updateExportButtons();
    refreshTemplates();
    refreshInstances();
  }

  function ensureTemplateUidForExport(tpl) {
    ensureTemplateUid(tpl);
    return tpl.__uid;
  }

  function getExportRecord(tpl, createIfMissing = false) {
    const key = ensureTemplateUidForExport(tpl);
    let record = exportSelections.get(key);
    if (!record && createIfMissing) {
      record = { allSelected: false, selectedInstances: new Set(), anchorIndex: null };
      exportSelections.set(key, record);
    }
    if (record) {
      // 清理无效实例 id
      const validIds = new Set((tpl.instances || []).map((inst) => inst.id));
      if (!record.allSelected && record.selectedInstances.size > 0) {
        for (const id of Array.from(record.selectedInstances)) {
          if (!validIds.has(id)) {
            record.selectedInstances.delete(id);
          }
        }
      }
    }
    return record || null;
  }

  function cleanupExportRecord(tpl) {
    const key = tpl.__uid;
    if (!key) return;
    const record = exportSelections.get(key);
    if (!record) return;
    if (!record.allSelected && record.selectedInstances.size === 0) {
      exportSelections.delete(key);
    }
  }

  function getTemplateExportCounts(tpl) {
    const total = (tpl.instances || []).length;
    const record = getExportRecord(tpl);
    if (!record) {
      return { selected: 0, total };
    }
    if (record.allSelected) {
      return { selected: total, total };
    }
    let selected = 0;
    const ids = new Set(record.selectedInstances);
    (tpl.instances || []).forEach((inst) => {
      if (ids.has(inst.id)) selected += 1;
    });
    return { selected, total };
  }

  function getTemplateExportState(tpl) {
    const { selected, total } = getTemplateExportCounts(tpl);
    if (selected <= 0) return 'none';
    if (selected >= total && total > 0) return 'all';
    if (total === 0) {
      const record = getExportRecord(tpl);
      return record && record.allSelected ? 'all' : 'none';
    }
    return 'partial';
  }

  function applyTemplateExportAction(tpl, action) {
    const record = getExportRecord(tpl, action === 'all');
    if (!record) return;
    if (action === 'clear') {
      exportSelections.delete(tpl.__uid);
      return;
    }
    record.allSelected = true;
    record.selectedInstances.clear();
    record.anchorIndex = null;
  }

  function handleTemplateExportCheckbox(templateIndex, prevState, event) {
    const tpl = templates[templateIndex];
    if (!tpl) return;
    let action = 'all';
    if (prevState === 'all') {
      action = 'clear';
    }
    if (prevState === 'partial') {
      action = 'all';
    }
    if (event && event.shiftKey && exportTemplateAnchorIndex !== null) {
      const start = Math.min(exportTemplateAnchorIndex, templateIndex);
      const end = Math.max(exportTemplateAnchorIndex, templateIndex);
      for (let i = start; i <= end; i += 1) {
        const targetTpl = templates[i];
        if (!targetTpl) continue;
        applyTemplateExportAction(targetTpl, action);
      }
    } else {
      applyTemplateExportAction(tpl, action);
    }
    exportTemplateAnchorIndex = templateIndex;
    refreshTemplates();
    refreshInstances();
  }

  function isInstanceSelectedForExport(tpl, inst) {
    const record = getExportRecord(tpl);
    if (!record) return false;
    if (record.allSelected) return true;
    return record.selectedInstances.has(inst.id);
  }

  function applyInstanceExportSelection(tpl, inst, shouldSelect, record) {
    if (!record) return;
    if (shouldSelect) {
      if (record.allSelected) return;
      record.selectedInstances.add(inst.id);
      const total = (tpl.instances || []).length;
      if (record.selectedInstances.size >= total && total > 0) {
        record.allSelected = true;
        record.selectedInstances.clear();
      }
    } else {
      if (record.allSelected) {
        record.allSelected = false;
        record.selectedInstances = new Set((tpl.instances || []).map((item) => item.id));
      }
      record.selectedInstances.delete(inst.id);
    }
    cleanupExportRecord(tpl);
  }

  function handleInstanceExportCheckbox(templateIndex, instanceIndex, wasSelected, event) {
    const tpl = templates[templateIndex];
    if (!tpl) return;
    const record = getExportRecord(tpl, true);
    if (!record) return;
    const shouldSelect = !wasSelected;
    if (event && event.shiftKey && record.anchorIndex !== null) {
      const start = Math.min(record.anchorIndex, instanceIndex);
      const end = Math.max(record.anchorIndex, instanceIndex);
      for (let i = start; i <= end; i += 1) {
        const inst = tpl.instances[i];
        if (!inst) continue;
        applyInstanceExportSelection(tpl, inst, shouldSelect, record);
      }
    } else {
      const inst = tpl.instances[instanceIndex];
      if (inst) {
        applyInstanceExportSelection(tpl, inst, shouldSelect, record);
      }
    }
    record.anchorIndex = instanceIndex;
    refreshTemplates();
    refreshInstances();
  }

  function collectTemplatesForExport() {
    const selected = [];
    templates.forEach((tpl) => {
      const record = getExportRecord(tpl);
      if (!record) return;
      const allInstances = (tpl.instances || []);
      const instances = record.allSelected
        ? allInstances.slice()
        : allInstances.filter((inst) => record.selectedInstances.has(inst.id));
      if (record.allSelected || instances.length > 0 || (allInstances.length === 0 && record.allSelected)) {
        selected.push({ tpl, instances });
      }
    });
    return selected;
  }

  function sanitizeCsvFileName(name) {
    return (name || 'template').replace(/[\\/:*?"<>|]/g, '_');
  }

  function encodeCsvValue(value) {
    const str = value == null ? '' : String(value);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function rowsToCsv(rows) {
    return rows.map((row) => row.map(encodeCsvValue).join(',')).join('\n');
  }

  function serializeValueForCsv(param, value) {
    if (param && param.parameterIndexes) {
      if (value && typeof value === 'object') {
        try {
          return JSON.stringify({
            template: value.template ?? param.parameterIndexes.template,
            by: value.by ?? param.parameterIndexes.param,
            value: value.value ?? '',
          });
        } catch (_) {
          return '';
        }
      }
      if (value == null || value === '') {
        return '';
      }
      return JSON.stringify({ template: param.parameterIndexes.template, by: param.parameterIndexes.param, value: String(value) });
    }
    if (Array.isArray(value)) {
      try {
        return JSON.stringify(value);
      } catch (_) {
        return '';
      }
    }
    if (value && typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch (_) {
        return '';
      }
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (value == null) return '';
    return String(value);
  }

  function resolveIndexFieldMeta(tpl) {
    let field = tpl && tpl.indexField ? tpl.indexField : 'id';
    if (field === 'id') {
      return { field: 'id', type: 'int' };
    }
    if (field === 'name') {
      return { field: 'name', type: 'string' };
    }
    const param = (tpl.parameters || []).find((p) => p && p.name === field);
    if (param && INDEXABLE_PARAM_TYPES.has(param.type)) {
      return { field, type: param.type };
    }
    return { field: 'id', type: 'int' };
  }

  function formatIndexCell(field, type, value) {
    const safeField = field || 'id';
    const safeType = type || (safeField === 'name' ? 'string' : 'int');
    const safeValue = value == null ? '' : String(value);
    return `${safeField}/${safeType}/${safeValue}`;
  }

  function parseIndexTypeCell(cell) {
    const raw = String(cell ?? '').trim();
    if (!raw) {
      return { field: 'id', type: 'int' };
    }
    const parts = raw.split('/');
    const field = (parts[0] || '').trim() || 'id';
    const type = (parts[1] || '').trim() || (field === 'name' ? 'string' : 'int');
    return { field, type };
  }

  function parseIndexDataCell(cell, fallbackField, fallbackType) {
    const raw = String(cell ?? '').trim();
    if (!raw) {
      return { field: fallbackField, type: fallbackType, value: '' };
    }
    const parts = raw.split('/');
    const field = (parts[0] || '').trim() || fallbackField;
    const type = (parts[1] || '').trim() || fallbackType;
    const value = parts.length >= 3 ? parts.slice(2).join('/') : '';
    return { field, type, value };
  }

  function buildCsvRowsForTemplate(tpl, instances) {
    const indexMeta = resolveIndexFieldMeta(tpl);
    const headers = ['template', 'id', 'index', 'name'];
    const types = [
      'string',
      'int',
      `${indexMeta.field}/${indexMeta.type}`,
      'string',
    ];
    const paramList = [];
    const seenNames = new Set();
    (tpl.parameters || []).forEach((p) => {
      if (!p || !p.name) return;
      paramList.push(p);
      seenNames.add(p.name);
    });
    if (isEnumTemplate(tpl)) {
      const numericKeys = new Set();
      (Array.isArray(instances) ? instances : []).forEach((inst) => {
        const payload = inst && inst.payload ? inst.payload : {};
        Object.keys(payload || {}).forEach((key) => {
          if (/^\d+$/.test(key)) numericKeys.add(key);
        });
      });
      Array.from(numericKeys)
        .sort((a, b) => {
          const na = Number(a);
          const nb = Number(b);
          if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) {
            return na - nb;
          }
          return a.localeCompare(b, 'zh-Hans-CN');
        })
        .forEach((key) => {
          if (seenNames.has(key)) return;
          paramList.push({ name: key, type: 'string' });
          seenNames.add(key);
        });
    }
    paramList.forEach((p) => {
      headers.push(p.name);
      if (p.parameterIndexes && p.parameterIndexes.template && p.parameterIndexes.param) {
        const idxField = p.parameterIndexes.indexField || '';
        const suffix = idxField ? `/${idxField}` : '';
        types.push(`${p.type}/${p.parameterIndexes.template}/${p.parameterIndexes.param}${suffix}`);
      } else {
        types.push(p.type);
      }
    });
    const rows = [headers, types];
    instances.forEach((inst) => {
      const payload = inst && inst.payload ? inst.payload : {};
      const row = [
        tpl.name,
        String(inst && inst.id != null ? inst.id : ''),
        formatIndexCell(
          indexMeta.field,
          indexMeta.type,
          computeExpectedIndexValue(tpl, inst, indexMeta.field)
        ),
        inst && inst.name != null ? inst.name : '',
      ];
      paramList.forEach((p) => {
        if (!p) return;
        row.push(serializeValueForCsv(p, payload[p.name]));
      });
      rows.push(row);
    });
    return rows;
  }

  async function performExportCsv() {
    if (!directoryHandle || !dataEntityHandle) {
      showMessage('请先选择工作目录', 'warn');
      return;
    }
    const selected = collectTemplatesForExport();
    if (selected.length === 0) {
      showMessage('请至少选择一个模板或实例进行导出', 'warn');
      return;
    }
    try {
      const csvDir = await dataEntityHandle.getDirectoryHandle('csvoutput', { create: true });
      for (const item of selected) {
        const rows = buildCsvRowsForTemplate(item.tpl, item.instances);
        const csvText = rowsToCsv(rows);
        const fileName = `${sanitizeCsvFileName(item.tpl.name)}.csv`;
        await writeTextFile(csvDir, fileName, csvText);
      }
      const names = selected.map((item) => item.tpl.name).join(', ');
      showMessage(`已导出 ${selected.length} 个模板的 CSV`, 'info');
      addLogEntry('info', `导出 CSV：${names}`);
      exitExportSelectionMode(true);
    } catch (err) {
      console.error(err);
      addLogEntry('error', `导出 CSV 失败：${err && err.message ? err.message : err}`, { detail: err && err.stack ? err.stack : '' });
      showMessage('导出 CSV 失败，请检查日志', 'warn');
    }
  }

  function parseCsvText(text) {
    const rows = [];
    let current = '';
    let row = [];
    let inQuotes = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            current += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(current);
        current = '';
      } else if (ch === '\r') {
        // ignore
      } else if (ch === '\n') {
        row.push(current);
        rows.push(row);
        row = [];
        current = '';
      } else {
        current += ch;
      }
    }
    if (inQuotes) {
      throw new Error('CSV 引号未闭合');
    }
    row.push(current);
    if (row.length > 1 || (row.length === 1 && row[0].length > 0)) {
      rows.push(row);
    }
    while (rows.length > 0 && rows[rows.length - 1].every((cell) => (cell || '').trim() === '')) {
      rows.pop();
    }
    return rows;
  }

  function normalizeCsvRowLength(row, targetLength) {
    const normalized = row.slice();
    while (normalized.length < targetLength) {
      normalized.push('');
    }
    if (normalized.length > targetLength) {
      throw new Error('CSV 列数不一致');
    }
    return normalized;
  }

  function parseBoolCell(raw) {
    const trimmed = String(raw ?? '').trim().toLowerCase();
    if (!trimmed) return false;
    if (['true', '1', 'yes', 'y', '是'].includes(trimmed)) return true;
    if (['false', '0', 'no', 'n', '否'].includes(trimmed)) return false;
    throw new Error(`无法解析布尔值：${raw}`);
  }

  function convertCsvValueByType(type, raw) {
    const base = (type || '').toLowerCase();
    if (base === 'int' || base === 'long') {
      const trimmed = String(raw ?? '').trim();
      if (!trimmed) return 0;
      const num = Number(trimmed);
      if (!Number.isFinite(num)) throw new Error(`无法解析数字：${raw}`);
      return Math.trunc(num);
    }
    if (base === 'float') {
      const trimmed = String(raw ?? '').trim();
      if (!trimmed) return 0;
      const num = Number(trimmed);
      if (!Number.isFinite(num)) throw new Error(`无法解析浮点数：${raw}`);
      return num;
    }
    if (base === 'bool') {
      return parseBoolCell(raw);
    }
    if (base === 'list') {
      const trimmed = String(raw ?? '').trim();
      if (!trimmed) return [];
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) throw new Error(`列表列必须是 JSON 数组：${raw}`);
      return parsed;
    }
    if (base === 'object') {
      const trimmed = String(raw ?? '').trim();
      if (!trimmed) return {};
      const parsed = JSON.parse(trimmed);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`对象列必须是 JSON 对象：${raw}`);
      }
      return parsed;
    }
    // 其它类型（包含字符串/枚举等）按字符串处理
    return raw == null ? '' : String(raw);
  }

  function parseDataRefCell(raw, param) {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) {
      return { template: param.parameterIndexes.template, by: param.parameterIndexes.param, value: '' };
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        return {
          template: parsed.template || param.parameterIndexes.template,
          by: parsed.by || param.parameterIndexes.param,
          value: parsed.value != null ? String(parsed.value) : '',
        };
      }
    } catch (_) {
      // fallback to plain string
    }
    return { template: param.parameterIndexes.template, by: param.parameterIndexes.param, value: trimmed };
  }

  function buildTemplateFromCsv(rows, fileName) {
    if (!rows || rows.length < 2) {
      throw new Error('CSV 至少需要包含两行数据');
    }
    const headers = rows[0].map((cell) => String(cell || '').trim());
    const typesRow = normalizeCsvRowLength(rows[1], headers.length).map((cell) => String(cell || '').trim());
    const reserved = new Set(['template', 'id', 'name', 'index']);
    const dataRows = rows.slice(2).map((row) => normalizeCsvRowLength(row, headers.length));
    const nonEmptyDataRows = dataRows.filter((row) => row.some((cell) => String(cell || '').trim().length > 0));

    const templateIdx = headers.indexOf('template');
    const idIdx = headers.indexOf('id');
    const nameIdx = headers.indexOf('name');
    const indexIdx = headers.indexOf('index');
    if (templateIdx < 0 || idIdx < 0 || nameIdx < 0 || indexIdx < 0) {
      throw new Error('CSV 必须包含 template、id、name、index 四列');
    }

    const columnIndexMap = new Map();
    headers.forEach((name, idx) => {
      if (!name) {
        throw new Error(`第 ${idx + 1} 列缺少列名`);
      }
      if (columnIndexMap.has(name)) {
        throw new Error(`重复的列名：${name}`);
      }
      columnIndexMap.set(name, idx);
    });

    let templateName = '';
    nonEmptyDataRows.forEach((row) => {
      const raw = row[templateIdx];
      const value = String(raw ?? '').trim();
      if (!value) return;
      if (!templateName) {
        templateName = value;
      } else if (templateName !== value) {
        throw new Error('template 列存在不一致的名称');
      }
    });
    if (!templateName) {
      if (nonEmptyDataRows.length === 0) {
        templateName = (fileName || '').replace(/\.csv$/i, '').trim() || '导入模板';
      } else {
        throw new Error('template 列不能为空');
      }
    }

    const csvIndexMeta = parseIndexTypeCell(typesRow[indexIdx]);
    const csvIndexField = csvIndexMeta.field || 'id';
    const csvIndexType = csvIndexMeta.type || 'int';

    const parameterDefs = [];
    headers.forEach((name, idx) => {
      if (reserved.has(name)) return;
      const info = (typesRow[idx] || '').split('/').map((part) => part.trim());
      const baseType = info[0];
      if (!baseType) {
        throw new Error(`${name} 缺少类型定义`);
      }
      const param = { name, type: baseType };
      if (info.length >= 3 && info[1] && info[2]) {
        param.parameterIndexes = {
          template: info[1],
          param: info[2],
          indexField: info[3] || '',
        };
      }
      parameterDefs.push(param);
    });

    let indexFieldMismatch = false;
    const instances = nonEmptyDataRows.map((row) => {
      const record = {};
      const payload = {};
      const idRaw = row[idIdx];
      const idTrimmed = String(idRaw ?? '').trim();
      const parsedId = idTrimmed ? Number(idTrimmed) : 0;
      if (idTrimmed && !Number.isFinite(parsedId)) {
        throw new Error(`无法解析 id：${idRaw}`);
      }
      const normalizedId = Math.trunc(parsedId);
      const nameValue = row[nameIdx] != null ? String(row[nameIdx]) : '';
      payload.template = templateName;
      payload.name = nameValue;
      const indexCell = parseIndexDataCell(row[indexIdx], csvIndexField, csvIndexType);
      payload.index = indexCell.value != null ? String(indexCell.value) : '';
      if (indexCell.field && indexCell.field !== csvIndexField) {
        indexFieldMismatch = true;
      }
      parameterDefs.forEach((param) => {
        const colIdx = columnIndexMap.get(param.name);
        const raw = row[colIdx];
        if (param.parameterIndexes) {
          payload[param.name] = parseDataRefCell(raw, param);
        } else {
          payload[param.name] = convertCsvValueByType(param.type, raw);
        }
      });
      record.id = normalizedId;
      record.name = nameValue;
      record.payload = payload;
      payload.id = normalizedId;
      return record;
    });

    instances.forEach((inst) => {
      inst.payload.template = templateName;
      inst.payload.name = inst.name;
    });

    return {
      name: templateName,
      parameters: parameterDefs,
      instances,
      indexField: indexFieldMismatch ? 'id' : (csvIndexField || 'id'),
    };
  }

  function computeExpectedIndexValue(tpl, inst, fieldName) {
    if (!inst || !inst.payload) return '';
    if (fieldName === 'id') {
      return String(inst.id ?? '');
    }
    if (fieldName === 'name') {
      return inst.name != null ? String(inst.name) : '';
    }
    const value = inst.payload[fieldName];
    return value == null ? '' : String(value);
  }

  function enforceEnumIndexField(tpl) {
    if (!tpl || !isEnumTemplate(tpl)) return false;
    let changed = false;
    if (tpl.indexField !== 'id') {
      tpl.indexField = 'id';
      changed = true;
    }
    const instList = Array.isArray(tpl.instances) ? tpl.instances : [];
    instList.forEach((inst) => {
      const expected = computeExpectedIndexValue(tpl, inst, 'id');
      if (!inst) return;
      if (!inst.payload) inst.payload = {};
      if (inst.payload.index !== expected) {
        inst.payload.index = expected;
        changed = true;
      }
    });
    return changed;
  }


  function collectDuplicateIdInfo(tpl) {
    if (!tpl) {
      return { duplicates: new Map(), byIndex: new Map() };
    }
    const instList = Array.isArray(tpl.instances) ? tpl.instances : [];
    const buckets = new Map();
    instList.forEach((inst, idx) => {
      const raw = inst && inst.id != null ? String(inst.id) : '';
      const trimmed = raw.trim();
      let key = trimmed;
      if (trimmed !== '') {
        const num = Number(trimmed);
        if (Number.isFinite(num)) {
          key = String(Math.trunc(num));
        }
      }
      if (!buckets.has(key)) {
        buckets.set(key, []);
      }
      buckets.get(key).push({ idx, inst, value: key });
    });
    const duplicates = new Map();
    const byIndex = new Map();
    buckets.forEach((entries, key) => {
      if (entries.length > 1) {
        duplicates.set(key, entries);
        entries.forEach((entry) => {
          byIndex.set(entry.idx, { value: key, entries });
        });
      }
    });
    return { duplicates, byIndex };
  }

  function getNumericInstanceId(inst) {
    if (!inst) return Number.NaN;
    const raw = inst.id;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string' && raw.trim() !== '') {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
    return Number.NaN;
  }

  function collectDuplicateIndexInfo(tpl) {
    if (!tpl) {
      return { field: 'id', duplicates: new Map(), byIndex: new Map() };
    }
    const field = tpl.indexField || 'id';
    const instList = Array.isArray(tpl.instances) ? tpl.instances : [];
    const buckets = new Map();
    instList.forEach((inst, idx) => {
      const rawValue = computeExpectedIndexValue(tpl, inst, field);
      const key = rawValue == null ? '' : String(rawValue);
      if (!buckets.has(key)) {
        buckets.set(key, []);
      }
      buckets.get(key).push({
        idx,
        inst,
        id: getNumericInstanceId(inst),
        value: key,
      });
    });
    const duplicates = new Map();
    const byIndex = new Map();
    buckets.forEach((entries, key) => {
      if (entries.length > 1) {
        duplicates.set(key, entries);
        entries.forEach((entry) => {
          byIndex.set(entry.idx, { value: key, entries });
        });
      }
    });
    return { field, duplicates, byIndex };
  }

  function chooseDuplicateNavigationTarget(group, currentInst) {
    if (!Array.isArray(group) || group.length <= 1) return null;
    const currentEntry = group.find((entry) => entry.inst === currentInst);
    const others = group.filter((entry) => entry.inst !== currentInst);
    if (others.length === 0) return null;
    if (!currentEntry) {
      return others.slice().sort((a, b) => a.idx - b.idx)[0];
    }
    const currentId = currentEntry.id;
    const greater = others
      .filter((entry) => Number.isFinite(entry.id) && Number.isFinite(currentId)
        && entry.id > currentId)
      .sort((a, b) => a.id - b.id);
    if (greater.length > 0) {
      return greater[0];
    }
    const smaller = others
      .filter((entry) => Number.isFinite(entry.id) && Number.isFinite(currentId)
        && entry.id < currentId)
      .sort((a, b) => a.id - b.id);
    if (smaller.length > 0) {
      return smaller[0];
    }
    return others.slice().sort((a, b) => a.idx - b.idx)[0];
  }

  function jumpToDuplicateIndexInstance(tpl, inst) {
    if (!tpl || !inst) return false;
    ensureTemplateUid(tpl);
    let info = null;
    if (lastDuplicateIndexInfo && lastDuplicateIndexInfo.uid === tpl.__uid) {
      info = lastDuplicateIndexInfo.info;
    }
    if (!info) {
      info = collectDuplicateIndexInfo(tpl);
      lastDuplicateIndexInfo = { uid: tpl.__uid, info };
    }
    const field = info.field;
    const key = computeExpectedIndexValue(tpl, inst, field);
    const normalized = key == null ? '' : String(key);
    const group = info.duplicates.get(normalized);
    if (!group || group.length <= 1) {
      showMessage('该索引值没有重复', 'info');
      return false;
    }
    const target = chooseDuplicateNavigationTarget(group, inst);
    if (!target) {
      showMessage('该索引值没有其他重复项', 'info');
      return false;
    }
    let targetIdx = target.idx;
    if (!(targetIdx >= 0 && targetIdx < tpl.instances.length)) {
      targetIdx = tpl.instances.indexOf(target.inst);
    }
    if (!(targetIdx >= 0 && targetIdx < tpl.instances.length)) {
      showMessage('未能定位到重复索引的实例', 'warn');
      return false;
    }
    currentInstanceIndex = targetIdx;
    selectedInstances.clear();
    selectedInstances.add(targetIdx);
    anchorInstance = targetIdx;
    instanceNameInput.value = tpl.instances[targetIdx]?.name || '';
    refreshInstances();
    refreshParams();
    lastSelectedCategory = 'instance';
    requestAnimationFrame(() => {
      const li = instanceListEl.children[targetIdx];
      if (li && typeof li.scrollIntoView === 'function') {
        try {
          li.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } catch (err) {
          li.scrollIntoView({ block: 'center' });
        }
      }
    });
    const instLabel = tpl.instances[targetIdx];
    let labelText = '';
    if (instLabel) {
      const parts = [];
      if (instLabel.name) parts.push(String(instLabel.name));
      if (instLabel.id != null && instLabel.id !== '') parts.push(`ID:${instLabel.id}`);
      labelText = parts.join(' ');
    }
    showMessage(labelText ? `已跳转到索引重复的实例：${labelText}` : '已跳转到索引重复的实例', 'warn');
    return true;
  }

  function enforceImportedIndexField(tpl, fileName) {
    if (isEnumTemplate(tpl)) {
      const changed = enforceEnumIndexField(tpl);
      if (changed) {
        showMessage(`${tpl.name}模版的index清空`, 'warn');
      }
      return;
    }
    let idxField = tpl.indexField || 'id';
    let needReset = false;
    const params = Array.isArray(tpl.parameters) ? tpl.parameters : [];
    if (idxField !== 'id' && idxField !== 'name') {
      const targetParam = params.find((p) => p && p.name === idxField);
      if (!targetParam || !INDEXABLE_PARAM_TYPES.has(targetParam.type)) {
        needReset = true;
      }
    }
    const instList = Array.isArray(tpl.instances) ? tpl.instances : [];
    if (!needReset) {
      for (const inst of instList) {
        const actual = inst.payload && inst.payload.index != null ? String(inst.payload.index) : '';
        const expected = computeExpectedIndexValue(tpl, inst, idxField);
        if (actual !== expected) {
          needReset = true;
          break;
        }
      }
    }
    if (needReset) {
      idxField = 'id';
      tpl.indexField = 'id';
      instList.forEach((inst) => {
        const newIndex = computeExpectedIndexValue(tpl, inst, 'id');
        if (!inst.payload) inst.payload = {};
        inst.payload.index = newIndex;
      });
      showMessage(`${tpl.name}模版的index清空`, 'warn');
    } else {
      instList.forEach((inst) => {
        const expected = computeExpectedIndexValue(tpl, inst, idxField);
        if (!inst.payload) inst.payload = {};
        inst.payload.index = expected;
      });
    }
  }

  function applyImportedTemplate(tpl, fileName) {
    enforceImportedIndexField(tpl, fileName);
    const existingIdx = templates.findIndex((item) => item.name === tpl.name);
    if (existingIdx >= 0) {
      const existing = templates[existingIdx];
      const existingIndexField = existing && existing.indexField ? existing.indexField : 'id';
      const newIndexField = tpl.indexField || 'id';
      if (newIndexField !== 'id' && existingIndexField !== newIndexField) {
        tpl.indexField = 'id';
        (tpl.instances || []).forEach((inst) => {
          const expected = computeExpectedIndexValue(tpl, inst, 'id');
          if (!inst.payload) inst.payload = {};
          inst.payload.index = expected;
        });
        showMessage(`${tpl.name}模版的index清空`, 'warn');
      }
      tpl.__uid = existing.__uid;
      tpl.__fromDisk = existing ? existing.__fromDisk : false;
      templates[existingIdx] = tpl;
      if (currentTemplateIndex === existingIdx) {
        currentInstanceIndex = tpl.instances.length > 0 ? 0 : -1;
      }
      return existingIdx;
    }
    ensureTemplateUid(tpl);
    tpl.__fromDisk = false;
    templates.push(tpl);
    return templates.length - 1;
  }

  async function importFromCsv() {
    let fileHandles;
    try {
      fileHandles = await window.showOpenFilePicker({
        multiple: true,
        types: [
          {
            description: 'CSV 文件',
            accept: { 'text/csv': ['.csv'] },
          },
        ],
      });
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      console.error(err);
      addLogEntry('error', `打开文件失败：${err && err.message ? err.message : err}`);
      showMessage('打开 CSV 文件失败', 'warn');
      return;
    }
    if (!fileHandles || fileHandles.length === 0) return;
    if (exportSelectionMode) {
      exitExportSelectionMode(true);
    }
    let successCount = 0;
    let lastImportedName = null;
    exportSelections.clear();
    for (const handle of fileHandles) {
      try {
        const file = await handle.getFile();
        const text = await file.text();
        const rows = parseCsvText(text);
        const tpl = buildTemplateFromCsv(rows, handle.name);
        applyImportedTemplate(tpl, handle.name);
        successCount += 1;
        lastImportedName = tpl.name;
        addLogEntry('info', `导入 CSV：${tpl.name}`);
      } catch (err) {
        console.error(err);
        addLogEntry('error', `导入 CSV 失败（${handle.name}）：${err && err.message ? err.message : err}`, {
          detail: err && err.stack ? err.stack : '',
        });
      }
    }
    if (successCount > 0) {
      templates.sort((a, b) => a.name.localeCompare(b.name));
      if (lastImportedName) {
        const idx = templates.findIndex((tpl) => tpl.name === lastImportedName);
        currentTemplateIndex = idx;
        currentInstanceIndex = idx >= 0 && templates[idx].instances.length > 0 ? 0 : -1;
      }
      selectedTemplates.clear();
      selectedInstances.clear();
      selectedParams.clear();
      if (currentTemplateIndex >= 0) {
        selectedTemplates.add(currentTemplateIndex);
        if (currentInstanceIndex >= 0) {
          selectedInstances.add(currentInstanceIndex);
        }
      }
      anchorTemplate = null;
      anchorInstance = null;
      anchorParam = null;
      refreshTemplates();
      refreshInstances();
      refreshParams();
      updateIndexTemplateOptions();
      showMessage(`成功导入 ${successCount} 个 CSV`, 'info');
    } else {
      showMessage('CSV 导入失败，请查看日志', 'warn');
    }
  }


  const operationLogs = [];

  // 事件绑定
  $("chooseDir").addEventListener("click", chooseDirectory);
  $("saveBtn").addEventListener("click", saveAll);
  $("newTemplate").addEventListener("click", newTemplate);
  $("newInstance").addEventListener("click", newInstance);
  $("copyInstance").addEventListener("click", copyInstance);
  $("pasteInstance").addEventListener("click", pasteInstance);
  $("deleteInstance").addEventListener("click", deleteInstance);
  $("newParam").addEventListener("click", newParam);
  if (toggleCompareValuesBtn) {
    toggleCompareValuesBtn.addEventListener('click', handleToggleCompareValues);
    updateCompareButtonState();
  }
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', beginExportSelection);
  }
  if (confirmExportCsvBtn) {
    confirmExportCsvBtn.addEventListener('click', performExportCsv);
  }
  if (cancelExportCsvBtn) {
    cancelExportCsvBtn.addEventListener('click', () => exitExportSelectionMode(true));
  }
  if (importCsvBtn) {
    importCsvBtn.addEventListener('click', importFromCsv);
  }
  if (toggleEditModeBtn) {
    toggleEditModeBtn.addEventListener('click', () => {
      const next = isSheetModeActive() ? EDIT_MODES.CLASSIC : EDIT_MODES.SHEET;
      setEditMode(next);
    });
  }
  if (viewLogsBtn) {
    viewLogsBtn.addEventListener('click', openLogOverlay);
  }
  if (closeLogBtn) {
    closeLogBtn.addEventListener('click', closeLogOverlay);
  }
  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', clearLogEntries);
  }
  if (openTrashBtn) {
    openTrashBtn.addEventListener('click', () => {
      openTrashOverlayPanel();
    });
  }
  if (closeTrashBtn) {
    closeTrashBtn.addEventListener('click', () => {
      closeTrashOverlayPanel();
    });
  }
  if (emptyTrashBtn) {
    emptyTrashBtn.addEventListener('click', () => {
      emptyTrashFolder();
    });
  }
  if (logOverlay) {
    logOverlay.addEventListener('click', (e) => {
      if (e.target === logOverlay) {
        closeLogOverlay();
      }
    });
  }
  if (trashOverlay) {
    trashOverlay.addEventListener('click', (e) => {
      if (e.target === trashOverlay) {
        closeTrashOverlayPanel();
      }
    });
  }
  if (regenerateCsBtn) {
    regenerateCsBtn.addEventListener("click", regenerateCSharpStructures);
  }
  if (templateNameInput) {
    templateNameInput.addEventListener('input', updateTemplateNameInputValidity);
  }
  if (instanceNameInput) {
    instanceNameInput.addEventListener('input', updateInstanceNameInputValidity);
  }
  if (instanceIdInput) {
    const commitId = () => commitInstanceIdChange();
    instanceIdInput.addEventListener('change', commitId);
    instanceIdInput.addEventListener('blur', commitId);
    instanceIdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        commitInstanceIdChange();
        instanceIdInput.blur();
      }
    });
  }
  if (paramNameInput) {
    paramNameInput.addEventListener('input', updateParamNameInputValidity);
  }
  if (paramTypeSelect) {
    paramTypeSelect.addEventListener('change', () => {
      updateIndexTemplateOptions();
    });
  }
  if (renameTemplateBtn) {
    renameTemplateBtn.addEventListener('click', () => {
      if (currentTemplateIndex < 0) { alert('请先选择一个模板'); return; }
      const oldName = templates[currentTemplateIndex].name;
      const v = prompt('重命名模板', oldName);
      if (v != null) renameTemplate(String(v).trim());
    });
  }
  if (renameInstanceBtn) {
    renameInstanceBtn.addEventListener('click', () => {
      if (currentTemplateIndex < 0 || currentInstanceIndex < 0) { alert('请先选择一个实例'); return; }
      const oldName = templates[currentTemplateIndex].instances[currentInstanceIndex].name;
      const v = prompt('重命名实例', oldName);
      if (v != null) renameInstance(String(v).trim());
    });
  }
  indexTemplateSelect.addEventListener("change", updateIndexParamOptions);
  // 模板索引字段的选择移动到右栏“index”保留项上进行，不在头部下拉处理
  // 操作指南
  if (helpBtn) {
    helpBtn.addEventListener("click", () => {
      const tips = [
        '选择与多选:',
        '  - 单击：单选；再次单击唯一选中项可取消',
        '  - Ctrl+点击：增/减选中（模板/实例/参数）',
        '  - Shift+点击：基于锚点的区间多选；无锚点时选当前',
        '  - Shift+拖拽：拖出范围多选',
        '',
        '索引与跳转:',
        '  - 右栏索引参数显示“索引值”输入框，可输入/选择目标值',
        '  - Alt+点击索引参数：跳转到目标模板/实例，并尝试选中被索引字段',
        '',
        '其它快捷键:',
        '  - Ctrl+C / Ctrl+V：复制 / 粘贴（按当前栏作用）',
        '  - Delete：删除当前选择',
        '  - F1：返回上一个选中的参数（不会写入历史）'
      ].join('\n');
      alert(tips);
    });
  }

  updateExportButtons();
  refreshParamTypeOptions();

  document.addEventListener('keydown', (evt) => {
    if ((evt.ctrlKey || evt.metaKey) && String(evt.key).toLowerCase() === 's') {
      evt.preventDefault();
      saveAll();
    }
  });

  function ensureTemplateUid(tpl) {
    if (!tpl) return;
    if (!tpl.__uid) {
      templateUidCounter += 1;
      tpl.__uid = `tpl_${templateUidCounter}`;
    }
  }

  function snapshotTemplateStructure(tpl) {
    return {
      name: tpl.name,
      indexField: tpl.indexField || 'id',
      parameters: (tpl.parameters || []).map((p) => {
        if (!p) return null;
        return {
          name: p.name,
          type: p.type,
          parameterIndexes: p.parameterIndexes
            ? {
                template: p.parameterIndexes.template || '',
                param: p.parameterIndexes.param || '',
                indexField: p.parameterIndexes.indexField || '',
              }
            : null,
        };
      }),
      isEnum: Boolean(isEnumTemplate(tpl)),
    };
  }

  function structuresEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function hasTemplateStructureChanged(tpl) {
    ensureTemplateUid(tpl);
    const prev = lastSavedStructureSnapshot.get(tpl.__uid);
    if (!prev) return true;
    const current = snapshotTemplateStructure(tpl);
    return !structuresEqual(prev, current);
  }

  function captureCurrentStructureSnapshot() {
    const map = new Map();
    templates.forEach((tpl) => {
      ensureTemplateUid(tpl);
      map.set(tpl.__uid, snapshotTemplateStructure(tpl));
    });
    return map;
  }

  function normalizeContent(content) {
    return (content || "").replace(/\r\n/g, "\n").trimEnd();
  }

  async function readTextFileIfExists(dirHandle, fileName) {
    if (!dirHandle) return null;
    try {
      const fileHandle = await dirHandle.getFileHandle(fileName, { create: false });
      const file = await fileHandle.getFile();
      return await file.text();
    } catch (err) {
      return null;
    }
  }

  async function writeTextFile(dirHandle, fileName, content) {
    if (!dirHandle) return;
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable({ keepExistingData: false });
    await writable.write(content);
    await writable.close();
  }

  // 参数选择历史（仅记录参数层级的选择）
  const paramHistory = [];
  function pushParamHistory() {
    if (currentTemplateIndex < 0 || currentInstanceIndex < 0 || editingParamIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    const param = tpl.parameters[editingParamIndex];
    if (!param) return;
    const snapshot = {
      templateName: tpl.name,
      paramName: param.name,
      instanceId: templates[currentTemplateIndex].instances[currentInstanceIndex]?.id ?? currentInstanceIndex,
    };
    // 若与栈顶相同则不重复压栈
    const top = paramHistory[paramHistory.length - 1];
    if (!top || top.templateName !== snapshot.templateName || top.paramName !== snapshot.paramName || top.instanceId !== snapshot.instanceId) {
      paramHistory.push(snapshot);
    }
  }
  function navigateToParamSnapshot(snap) {
    if (!snap) return false;
    const tIdx = templates.findIndex(t => t.name === snap.templateName);
    if (tIdx < 0) return false;
    currentTemplateIndex = tIdx;
    selectedTemplates.clear();
    selectedTemplates.add(tIdx);
    const instIdx = templates[tIdx].instances.findIndex(i => (i.id === snap.instanceId));
    currentInstanceIndex = instIdx >= 0 ? instIdx : (templates[tIdx].instances.length > 0 ? 0 : -1);
    selectedInstances.clear();
    if (currentInstanceIndex >= 0) selectedInstances.add(currentInstanceIndex);
    const pIdx = templates[tIdx].parameters.findIndex(p => p.name === snap.paramName);
    selectedParams.clear();
    if (pIdx >= 0) {
      selectedParams.add(pIdx);
      editingParamIndex = pIdx;
    } else {
      editingParamIndex = -1;
    }
    templateNameInput.value = templates[currentTemplateIndex].name;
    instanceNameInput.value = currentInstanceIndex >= 0 ? templates[currentTemplateIndex].instances[currentInstanceIndex].name : '';
    // 确保编辑区域与所选参数同步（或清空）
    showSelectedParamDetails();
    refreshTemplates();
    refreshInstances();
    refreshParams();
    updateIndexTemplateOptions();
    lastSelectedCategory = 'param';
    return true;
  }

  // 夜间模式切换
  toggleDarkBtn.addEventListener("click", () => {
    document.body.classList.toggle("dark");
  });

  // 参数栏宽度调节
  paramWidthSlider.addEventListener("input", () => {
    const val = parseFloat(paramWidthSlider.value);
    // 设置参数栏 flex 值
    // 使用 CSS 自定义变量控制 flex 比例
    document.documentElement.style.setProperty('--param-flex', val);
    paramWidthLabel.textContent = `参数栏比例 x${val.toFixed(1)}`;
  });

  // 行高比例调节
  rowHeightSlider.addEventListener("input", () => {
    const val = parseFloat(rowHeightSlider.value);
    document.documentElement.style.setProperty('--row-scale', val);
    rowHeightLabel.textContent = `行高比例 x${val.toFixed(1)}`;
  });

  // 搜索输入监听
  searchTemplatesInput.addEventListener("input", () => {
    filterList(templateListEl, searchTemplatesInput.value);
  });
  searchInstancesInput.addEventListener("input", () => {
    filterList(instanceListEl, searchInstancesInput.value);
  });
  searchParamsInput.addEventListener("input", () => {
    filterList(paramListEl, searchParamsInput.value, true);
  });

  // 实例列表拖拽选择
  // 通用拖拽多选逻辑，支持模板、实例、参数
  function setupDragSelection(listEl, type) {
    listEl.addEventListener('mousedown', (e) => {
      if (!e.shiftKey) return;
      const selector = type === 'param' ? '.param-item' : 'li';
      const itemEl = e.target.closest(selector);
      if (!itemEl) return;
      const items = Array.from(listEl.querySelectorAll(selector));
      const idx = items.indexOf(itemEl);
      if (idx < 0) return;
      dragSelect.isDragging = false; // 初始为非拖拽，仅当移动到其他项时才置为 true
      dragSelect.type = type;
      dragSelect.indices.clear();
      dragSelect.startIndex = idx;
    });
    listEl.addEventListener('mouseover', (e) => {
      if (dragSelect.type !== type) return;
      // 仅在按住鼠标左键进行移动时才认为是拖拽
      if ((e.buttons & 1) !== 1) return;
      const selector = type === 'param' ? '.param-item' : 'li';
      const items = Array.from(listEl.querySelectorAll(selector));
      const itemEl = e.target.closest(selector);
      if (!itemEl) return;
      const idx = items.indexOf(itemEl);
      if (idx < 0) return;
      if (dragSelect.startIndex === undefined) dragSelect.startIndex = idx;
      if (idx !== dragSelect.startIndex) {
        dragSelect.isDragging = true;
        dragSelect.indices.clear();
        // 清除旧的 selecting 临时样式
        listEl.querySelectorAll('.selecting').forEach((el) => el.classList.remove('selecting'));
        const start = Math.min(dragSelect.startIndex, idx);
        const end = Math.max(dragSelect.startIndex, idx);
        for (let i = start; i <= end; i++) {
          dragSelect.indices.add(i);
          const el = items[i];
          if (el) el.classList.add('selecting');
        }
      }
    });
  }
  setupDragSelection(templateListEl, 'template');
  setupDragSelection(instanceListEl, 'instance');
  setupDragSelection(paramListEl, 'param');
  // 结束拖拽时应用选择
  document.addEventListener('mouseup', () => {
    if (!dragSelect.isDragging) return;
    const type = dragSelect.type;
    const indices = Array.from(dragSelect.indices);
    if (type === 'template') {
      // 拖拽结束：将选择集设置为拖拽范围（不使用切换）
      selectedTemplates.clear();
      indices.forEach((idx) => selectedTemplates.add(idx));
      // 更新 currentTemplateIndex 为最后一个选中的
      if (indices.length > 0) {
        currentTemplateIndex = indices[indices.length - 1];
        templateNameInput.value = templates[currentTemplateIndex]?.name || '';
        // 重置实例选中索引
        currentInstanceIndex = templates[currentTemplateIndex].instances.length > 0 ? 0 : -1;
        selectedInstances.clear();
        selectedParams.clear();
      }
      refreshTemplates();
      refreshInstances();
      refreshParams();
      lastSelectedCategory = 'template';
    } else if (type === 'instance') {
      selectedInstances.clear();
      indices.forEach((idx) => selectedInstances.add(idx));
      if (indices.length > 0) {
        currentInstanceIndex = indices[indices.length - 1];
        instanceNameInput.value = templates[currentTemplateIndex].instances[currentInstanceIndex]?.name || '';
        selectedParams.clear();
      }
      refreshInstances();
      refreshParams();
      lastSelectedCategory = 'instance';
    } else if (type === 'param') {
      // 应用拖拽范围前记录历史
      pushParamHistory();
      selectedParams.clear();
      indices.forEach((idx) => selectedParams.add(idx));
      if (indices.length > 0) {
        // last selected param index
        const idx = indices[indices.length - 1];
        editingParamIndex = idx;
        showSelectedParamDetails();
      }
      refreshParams();
      lastSelectedCategory = 'param';
    }
    // 清除临时样式
    if (dragSelect.type === 'param') {
      paramListEl.querySelectorAll('.selecting').forEach((el) => el.classList.remove('selecting'));
    } else if (dragSelect.type === 'instance') {
      instanceListEl.querySelectorAll('.selecting').forEach((el) => el.classList.remove('selecting'));
    } else if (dragSelect.type === 'template') {
      templateListEl.querySelectorAll('.selecting').forEach((el) => el.classList.remove('selecting'));
    }
    dragSelect.isDragging = false;
    dragSelect.type = null;
    dragSelect.indices.clear();
    dragSelect.startIndex = undefined;
  });

  // 监听名称输入框，回车或者失焦时更新名称
  // 取消通过输入框失焦重命名模板/实例，改用专用按钮触发
  // templateNameInput.addEventListener("blur", () => {
  //   renameTemplate(templateNameInput.value.trim());
  // });
  // instanceNameInput.addEventListener("blur", () => {
  //   renameInstance(instanceNameInput.value.trim());
  // });

  // 初始化
  window.addEventListener("DOMContentLoaded", () => {
    refreshTemplates();
    updateIndexTemplateOptions();
  });

  // 点击空白区域取消选中
  function setupClearOnBlank(listEl, type) {
    listEl.addEventListener('click', (e) => {
      const itemSelector = type === 'param' ? '.param-item' : 'li';
      if (!e.target.closest(itemSelector)) {
        if (type === 'template') {
          selectedTemplates.clear();
          currentTemplateIndex = -1;
          currentInstanceIndex = -1;
          templateNameInput.value = '';
          instanceNameInput.value = '';
          selectedInstances.clear();
          selectedParams.clear();
          editingParamIndex = -1;
          // 清除锚点
          anchorTemplate = null;
          anchorInstance = null;
          anchorParam = null;
          refreshTemplates();
          refreshInstances();
          refreshParams();
        } else if (type === 'instance') {
          selectedInstances.clear();
          currentInstanceIndex = -1;
          instanceNameInput.value = '';
          selectedParams.clear();
          editingParamIndex = -1;
          // 清除实例和参数锚点
          anchorInstance = null;
          anchorParam = null;
          refreshInstances();
          refreshParams();
        } else if (type === 'param') {
          selectedParams.clear();
          editingParamIndex = -1;
          showSelectedParamDetails();
          refreshParams();
          // 清除参数锚点
          anchorParam = null;
        }
        lastSelectedCategory = type;
      }
    });
  }
  // 停用点击空白处取消选中（左/中栏）
  // setupClearOnBlank(templateListEl, 'template');
  // setupClearOnBlank(instanceListEl, 'instance');
  // 移除右栏（参数）空白处取消选中
  // setupClearOnBlank(paramListEl, 'param');

  // 监听整个面板的空白点击，支持取消选中
  // setupClearOnBlank(templatePanelEl, 'template');
  // setupClearOnBlank(instancePanelEl, 'instance');
  // 移除右栏（参数面板）空白处取消选中
  // setupClearOnBlank(paramPanelEl, 'param');

  // 全局快捷键：复制、粘贴、删除
  document.addEventListener('keydown', (e) => {
    if (trashOverlay && trashOverlay.style.display !== 'none') {
      if (e.key === 'Delete') {
        e.preventDefault();
        deleteSelectedTrashEntry();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeTrashOverlayPanel();
        return;
      }
      // 垃圾箱打开时屏蔽其他快捷键，避免与主界面冲突
      return;
    }
    // 避免在输入框中触发
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (isSheetModeActive()) return;
    if (e.ctrlKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      handleCopy();
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      handlePaste();
    }
    if (e.key === 'Delete') {
      e.preventDefault();
      handleDelete();
    }
    if (e.key === 'F1') {
      e.preventDefault();
      // 返回上一个参数（不入栈）
      const prev = paramHistory.pop();
      if (prev) {
        navigateToParamSnapshot(prev);
      } else {
        showMessage('没有更多历史');
      }
    }
  });

  /**
   * 显示消息提示
   */
  function showMessage(msg, level = 'info') {
    if (!messageBox) return;
    messageBox.textContent = msg;
    messageBox.style.display = 'block';
    addLogEntry(level, msg);
    setTimeout(() => {
      messageBox.style.display = 'none';
    }, 2000);
  }

  // 持久化：使用 IndexedDB 保存最近一次的工作目录句柄
  const DB_NAME = 'json-editor';
  const DB_STORE = 'handles';
  const ENUM_CACHE_PREFIX = 'enumCache:';
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function getEnumCacheKey() {
    if (!directoryHandle || !directoryHandle.name) return null;
    return `${ENUM_CACHE_PREFIX}${directoryHandle.name}`;
  }
  async function saveLastDirectoryHandle(handle) {
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put({ key: 'workdir', handle });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('保存目录句柄失败', e);
    }
  }
  async function getLastDirectoryHandle() {
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const req = tx.objectStore(DB_STORE).get('workdir');
        req.onsuccess = () => resolve(req.result ? req.result.handle : null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      return null;
    }
  }
  async function saveEnumTemplateCache(tpl) {
    const key = getEnumCacheKey();
    if (!key) return;
    try {
      const db = await openDB();
      const payload = JSON.parse(JSON.stringify({
        name: tpl.name,
        parameters: tpl.parameters,
        instances: tpl.instances,
        indexField: tpl.indexField || 'id',
      }));
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put({ key, template: payload });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('保存枚举模板缓存失败', e);
    }
  }
  async function loadEnumTemplateCache() {
    const key = getEnumCacheKey();
    if (!key) return null;
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const req = tx.objectStore(DB_STORE).get(key);
        req.onsuccess = () => {
          const value = req.result && req.result.template;
          resolve(value ? JSON.parse(JSON.stringify(value)) : null);
        };
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('读取枚举模板缓存失败', e);
      return null;
    }
  }
  async function clearEnumTemplateCache() {
    const key = getEnumCacheKey();
    if (!key) return;
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('清除枚举模板缓存失败', e);
    }
  }
  async function verifyPermission(handle, readWrite = false) {
    if (!handle) return false;
    const opts = { mode: readWrite ? 'readwrite' : 'read' };
    try {
      if (handle.queryPermission) {
        const p = await handle.queryPermission(opts);
        if (p === 'granted') return true;
        if (p === 'prompt' && handle.requestPermission) {
          const r = await handle.requestPermission(opts);
          return r === 'granted';
        }
        return false;
      }
    } catch {}
    return true;
  }
  async function autoRestoreLastDirectory() {
    try {
      const handle = await getLastDirectoryHandle();
      if (!handle) return;
      // 申请持久化存储，提升恢复成功率
      if (navigator.storage && navigator.storage.persist) {
        try { await navigator.storage.persist(); } catch {}
      }
      const ok = await verifyPermission(handle, true);
      if (!ok) return;
      directoryHandle = handle;
      currentDirLabel.textContent = directoryHandle.name;
      await ensureSubFolders();
      await ensureModelStruct();
      await generateRuntimeLoaderArtifacts();
      await loadAllTemplates();
      refreshTemplates();
      updateIndexTemplateOptions();
      showMessage('已自动恢复上次工作目录');
    } catch (err) {
      console.warn('自动恢复目录失败', err);
    }
  }

  /**
   * 选择工作目录
   */
  async function chooseDirectory() {
    try {
      directoryHandle = await window.showDirectoryPicker();
      currentDirLabel.textContent = directoryHandle.name;
      await ensureSubFolders();
      await ensureModelStruct();
      await generateRuntimeLoaderArtifacts();
      await loadAllTemplates();
      refreshTemplates();
      updateIndexTemplateOptions();
      showMessage("工作目录已选择并加载完成");
    } catch (err) {
      console.error(err);
      showMessage("选择工作目录失败");
    }
  }

  /**
   * 保证工作目录下有 csharpDate 和 dataEntity 文件夹，并检测现有文件是否合法
   */
  const IGNORED_FILE_SUFFIXES = [".meta"];
  const IGNORED_FILE_NAMES = [".ds_store", "thumbs.db"];

  function shouldIgnoreFileEntry(entryName) {
    if (!entryName) return false;
    const lower = entryName.toLowerCase();
    if (IGNORED_FILE_NAMES.includes(lower)) return true;
    return IGNORED_FILE_SUFFIXES.some((suffix) => lower.endsWith(suffix));
  }

  async function ensureSubFolders() {
    csharpHandle = await directoryHandle.getDirectoryHandle("csharpDate", { create: true });
    dataEntityHandle = await directoryHandle.getDirectoryHandle("dataEntity", { create: true });
    try {
      trashHandle = await dataEntityHandle.getDirectoryHandle(TRASH_FOLDER_NAME, { create: true });
    } catch (err) {
      console.warn('无法创建或访问垃圾箱目录', err);
      trashHandle = null;
    }
    try {
      editorHandle = await directoryHandle.getDirectoryHandle("Editor", { create: true });
    } catch (err) {
      console.warn('无法创建或访问 Editor 文件夹', err);
      editorHandle = null;
    }
    // 检查文件类型
    for await (const entry of csharpHandle.values()) {
      if (entry.kind === "file" && shouldIgnoreFileEntry(entry.name)) {
        continue;
      }
      if (entry.kind === "file" && !entry.name.toLowerCase().endsWith(".cs")) {
        showMessage(`csharpDate 文件夹内仅允许 .cs 文件：${entry.name}`);
        throw new Error("Invalid file in csharpDate");
      }
      if (entry.kind === "file") {
        const file = await entry.getFile();
        const text = await file.text();
        // 简单检测是否包含方法定义
        const hasMethod = /\bvoid\b|\bpublic\b|\bprivate\b/.test(text);
        if (hasMethod) {
          showMessage(`检测到已有 cs 文件包含方法，跳过读取：${entry.name}`);
        }
      }
    }
    for await (const entry of dataEntityHandle.values()) {
      if (entry.kind === "file" && shouldIgnoreFileEntry(entry.name)) {
        continue;
      }
      if (entry.kind === "file" && !entry.name.toLowerCase().endsWith(".json")) {
        showMessage(`dataEntity 文件夹内仅允许 .json 文件：${entry.name}`);
        throw new Error("Invalid file in dataEntity");
      }
    }
  }

  /**
   * 确保 csharpDate/modelstruct 与 modelCsharpe.cs 存在
   */
  async function ensureModelStruct() {
    if (!csharpHandle) return;
    try {
      modelStructHandle = await csharpHandle.getDirectoryHandle("modelstruct", { create: true });
      // 检测或创建 modelCsharpe.cs
      let exists = true;
      try {
        await modelStructHandle.getFileHandle("modelCsharpe.cs", { create: false });
      } catch (_) {
        exists = false;
      }
        // 始终写入固定模板内容
        const content = [
          'using System;',
          'using System.Collections.Generic;',
          'using Newtonsoft.Json;',
          'using Newtonsoft.Json.Linq;',
          '',
          '[Serializable]',
          'public class TableSchema',
          '{',
          '    public string name;',
          '    public string indexField;',
          '    public List<ParamDef> parameters;',
          '    public Dictionary<string, object> instances;',
          '}',
          '',
          '[Serializable]',
          'public class ParamDef',
          '{',
          '    public string name;',
          '    public string type;',
          '    public ParameterIndexBinding parameterIndexes;',
          '}',
          '',
          '[Serializable]',
          'public class ParameterIndexBinding',
          '{',
          '    public string template;',
          '    public string param;',
          '    public string indexField;',
          '}',
          '',
          '[Serializable]',
          'public class Row',
          '{',
          '    public int id;',
          '    public string name;',
          '    public Dictionary<string, object> payload; // 或Newtonsoft.Json.Linq.JObject payload;',
          '}',
          '',
          '[Serializable]',
          'public class DataRef',
          '{',
          '    public string template;  // 对应 JSON 里的 "template"',
          '    public string by;        // 对应 JSON 里的 "by"',
          '    public string value;     // 对应 JSON 里的 "value"',
          '',
          '    [JsonIgnore]',
          '    public object instance;  // 解析完后指向目标实例',
          '}',
          '',
          'public class DataRefConverter : JsonConverter<DataRef>',
          '{',
          '    public override DataRef ReadJson(JsonReader reader, Type objectType, DataRef existingValue, bool hasExistingValue, JsonSerializer serializer)',
          '    {',
          '        if (reader == null)',
          '        {',
          '            return null;',
          '        }',
          '        if (reader.TokenType == JsonToken.Null)',
          '        {',
          '            return null;',
          '        }',
          '        if (reader.TokenType == JsonToken.String)',
          '        {',
          "            return new DataRef { value = reader.Value?.ToString() };",
          '        }',
          '        var jToken = JToken.Load(reader);',
          '        if (jToken == null || jToken.Type == JTokenType.Null)',
          '        {',
          '            return null;',
          '        }',
          '        if (jToken.Type == JTokenType.String)',
          '        {',
          "            return new DataRef { value = jToken.ToString() };",
          '        }',
          '        return jToken.ToObject<DataRef>();',
          '    }',
          '',
          '    public override void WriteJson(JsonWriter writer, DataRef value, JsonSerializer serializer)',
          '    {',
          '        if (writer == null)',
          '        {',
          '            return;',
          '        }',
          '        if (value == null)',
          '        {',
          '            writer.WriteNull();',
          '            return;',
          '        }',
          '        var jObject = JObject.FromObject(value, serializer);',
          '        jObject.WriteTo(writer);',
          '    }',
          '}',
          ''
        ].join('\n');
        const file = await modelStructHandle.getFileHandle("modelCsharpe.cs", { create: true });
        const writable = await file.createWritable();
        await writable.write(content);
        await writable.close();
      
    } catch (e) {
      console.warn('ensureModelStruct failed', e);
    }
  }

  function normalizeParamIndexStructure(param) {
    if (!param || typeof param !== 'object') return;
    if (param.index && !param.parameterIndexes) {
      const legacy = param.index;
      if (legacy && typeof legacy === 'object') {
        param.parameterIndexes = {
          template: legacy.template || '',
          param: legacy.param || '',
          indexField: legacy.indexField || '',
        };
      } else {
        param.parameterIndexes = { template: '', param: '', indexField: '' };
      }
      delete param.index;
    } else if (param.index) {
      delete param.index;
    }
    if (param.parameterIndexes && typeof param.parameterIndexes === 'object') {
      if (!Object.prototype.hasOwnProperty.call(param.parameterIndexes, 'indexField')) {
        param.parameterIndexes.indexField = '';
      }
      if (!Object.prototype.hasOwnProperty.call(param.parameterIndexes, 'template')) {
        param.parameterIndexes.template = '';
      }
      if (!Object.prototype.hasOwnProperty.call(param.parameterIndexes, 'param')) {
        param.parameterIndexes.param = '';
      }
    }
  }

  function normalizeTemplateParameterIndexes(template) {
    if (!template || !Array.isArray(template.parameters)) return;
    template.parameters.forEach((param) => normalizeParamIndexStructure(param));
  }

  function populateMissingIndexFields(templatesList) {
    if (!Array.isArray(templatesList)) return;
    templatesList.forEach((tpl) => {
      if (!tpl || !Array.isArray(tpl.parameters)) return;
      tpl.parameters.forEach((param) => {
        if (!param || !param.parameterIndexes || typeof param.parameterIndexes !== 'object') return;
        if (!param.parameterIndexes.indexField) {
          const target = templatesList.find((item) => item && item.name === param.parameterIndexes.template);
          if (target) {
            param.parameterIndexes.indexField = target.indexField || 'id';
          }
        }
      });
    });
  }

  async function generateRuntimeLoaderArtifacts() {
    if (!csharpHandle) return;
    if (!modelStructHandle) {
      await ensureModelStruct();
    }
    if (!modelStructHandle) return;
    if (!editorHandle && directoryHandle) {
      try {
        editorHandle = await directoryHandle.getDirectoryHandle("Editor", { create: true });
      } catch (err) {
        console.warn('generateRuntimeLoaderArtifacts 无法访问 Editor 文件夹', err);
        editorHandle = null;
      }
    }
    const loaderContent = `
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

public static class DataEntityRuntimeLoader
{
    private const string DefaultManifestName = \"manifest.json\";
    private static readonly JsonSerializerSettings SerializerSettings = new JsonSerializerSettings
    {
        MissingMemberHandling = MissingMemberHandling.Ignore,
        NullValueHandling = NullValueHandling.Ignore,
        Converters = new List<JsonConverter>
        {
            // 在共享设置中显式注册 DataRefConverter，避免 DataRef 在 ToObject 时递归套用自身转换器
            new DataRefConverter(),
        },
    };

    private static readonly Dictionary<string, string> ManifestIndex = new Dictionary<string, string>(StringComparer.
OrdinalIgnoreCase);
    private static readonly Dictionary<string, TableSchema> SchemaCache = new Dictionary<string, TableSchema>(StringComparer.
OrdinalIgnoreCase);
    private static string _dataDirectory = string.Empty;
    private static bool _initialized;

    public static IReadOnlyDictionary<string, TableSchema> Schemas => SchemaCache;

    public static void Initialize(string dataDirectory = null)
    {
        _dataDirectory = string.IsNullOrWhiteSpace(dataDirectory)
            ? Path.GetFullPath(Path.Combine(Application.dataPath, \"dataEntity\"))
            : Path.GetFullPath(dataDirectory);
        LoadAll();
    }

    public static TableSchema GetSchema(string templateName)
    {
        EnsureInitialized();
        if (!SchemaCache.TryGetValue(templateName, out var schema))
        {
            throw new KeyNotFoundException($\"\u6a21\u677f {templateName} \u672a\u52a0\u8f7d\u3002\");
        }
        return schema;
    }

    public static T GetValue<T>(string templateName, string instanceName, string indexKey, string parameterName)
    {
        var value = GetValueInternal(templateName, instanceName, indexKey, parameterName, typeof(T), null, false);
        if (value == null)
        {
            return default;
        }
        return (T)value;
    }

    public static T GetValue<T>(string templateName, string instanceName, string indexKey, string parameterName, string getParameter)
    {
        var value = GetValueInternal(templateName, instanceName, indexKey, parameterName, typeof(T), getParameter, false);
        if (value == null)
        {
            return default;
        }
        return (T)value;
    }

    public static object GetValue(string templateName, string instanceName, string indexKey, string parameterName, Type parameterType)
    {
        return GetValueInternal(templateName, instanceName, indexKey, parameterName, parameterType, null, false);
    }

    public static object GetValue(string templateName, string instanceName, string indexKey, string parameterName, Type parameterType, string getParameter)
    {
        return GetValueInternal(templateName, instanceName, indexKey, parameterName, parameterType, getParameter, false);
    }

    public static DataRef GetIndexReference(string templateName, string instanceName, string indexKey, string parameterName)
    {
        var value = GetValueInternal(templateName, instanceName, indexKey, parameterName, typeof(DataRef), null, true);
        return value as DataRef;
    }

    public static string GetIndexValue(string templateName, string instanceName, string indexKey, string parameterName)
    {
        var reference = GetIndexReference(templateName, instanceName, indexKey, parameterName);
        return reference?.value;
    }

    private static object GetValueInternal(string templateName, string instanceName, string indexKey, string parameterName, Type parameterType, string getParameter, bool allowIndexReference)
    {
        EnsureInitialized();
        if (string.IsNullOrWhiteSpace(templateName))
        {
            throw new ArgumentException("\u6a21\u677f\u540d\u4e0d\u80fd\u4e3a\u7a7a", nameof(templateName));
        }
        if (string.IsNullOrWhiteSpace(parameterName))
        {
            throw new ArgumentException("\u53c2\u6570\u540d\u4e0d\u80fd\u4e3a\u7a7a", nameof(parameterName));
        }
        if (!SchemaCache.TryGetValue(templateName, out var schema))
        {
            throw new KeyNotFoundException($"\u6a21\u677f {templateName} \u672a\u627e\u5230\u3002");
        }

        var paramDef = FindParameter(schema, parameterName);
        var binding = paramDef?.parameterIndexes;
        var isIndexParameter = binding != null
            && !string.IsNullOrEmpty(binding.template)
            && !string.IsNullOrEmpty(binding.param);

        if (isIndexParameter)
        {
            if (string.IsNullOrWhiteSpace(getParameter) && !allowIndexReference)
            {
                var identifier = FormatInstanceIdentifier(templateName, instanceName, indexKey, parameterName);
                throw new InvalidOperationException($"{identifier} \u662f\u7d22\u5f15\u53c2\u6570\uff0c\u65e0\u6cd5\u6b63\u5e38\u8bfb\u53d6");
            }
        }
        else if (!string.IsNullOrWhiteSpace(getParameter))
        {
            var identifier = FormatInstanceIdentifier(templateName, instanceName, indexKey, parameterName);
            throw new InvalidOperationException($"{identifier} \u4e0d\u662f\u7d22\u5f15\u53c2\u6570\uff0c\u4e0d\u914dgetparameter\u3002");
        }

        var instance = LocateInstance(schema, instanceName, indexKey);
        var payload = ExtractPayload(instance);
        if (payload == null)
        {
            throw new InvalidOperationException($"\u5b9e\u4f8b {instanceName ?? indexKey} \u4e0d\u5305\u542b payload\u3002");
        }
        if (!payload.TryGetValue(parameterName, out var rawValue))
        {
            throw new KeyNotFoundException($"\u5b9e\u4f8b\u4e2d\u672a\u627e\u5230\u53c2\u6570 {parameterName}\u3002");
        }

        if (!isIndexParameter)
        {
            return ConvertValue(rawValue, parameterType ?? typeof(object), templateName, parameterName);
        }

        var payloadName = payload.TryGetValue("name", out var payloadNameObj) ? payloadNameObj?.ToString() : instanceName;
        var payloadIndex = indexKey;
        if (string.IsNullOrWhiteSpace(payloadIndex) && payload.TryGetValue("index", out var payloadIndexObj))
        {
            payloadIndex = payloadIndexObj?.ToString();
        }
        var identifierFull = FormatInstanceIdentifier(templateName, payloadName, payloadIndex, parameterName);
        var dataRef = NormalizeDataRef(rawValue);
        if (dataRef == null)
        {
            throw new InvalidOperationException($"{identifierFull} \u7d22\u5f15\u89e3\u6790\u5931\u8d25\u3002");
        }

        ApplyReferenceDefaults(dataRef, binding);
        EnsureDataRefInstance(schema, paramDef, payloadName, payloadIndex, dataRef);
        payload[parameterName] = dataRef;

        if (allowIndexReference && string.IsNullOrWhiteSpace(getParameter))
        {
            return dataRef;
        }

        if (string.IsNullOrWhiteSpace(getParameter))
        {
            return ConvertValue(dataRef, parameterType ?? typeof(object), templateName, parameterName);
        }

        if (dataRef.instance == null)
        {
            throw new KeyNotFoundException($"{identifierFull} \u672a\u627e\u5230\u7d22\u5f15\u5b9e\u4f8b\u3002");
        }

        var referencedPayload = ExtractPayload(dataRef.instance);
        if (referencedPayload == null || !referencedPayload.TryGetValue(getParameter, out var indexedValue))
        {
            throw new KeyNotFoundException($"{identifierFull} \u7d22\u5f15\u5b9e\u4f8b\u6ca1\u6709\u53c2\u6570 {getParameter}\u3002");
        }

        var targetTemplate = dataRef.template ?? binding?.template ?? templateName;
        return ConvertValue(indexedValue, parameterType ?? typeof(object), targetTemplate, getParameter);
    }

    public static void Reload()
    {
#if UNITY_EDITOR
        var wasPaused = EditorApplication.isPaused;
        if (!wasPaused)
        {
            EditorApplication.isPaused = true;
        }
#endif
        try
        {
            if (string.IsNullOrWhiteSpace(_dataDirectory))
            {
                throw new InvalidOperationException(\"\u8bf7\u5148\u8c03\u7528 Initialize \u6307\u5b9a\u6570\u636e\u76ee\u5f55\u3002\");
            }
            LoadAll();
        }
        finally
        {
#if UNITY_EDITOR
            if (!wasPaused)
            {
                EditorApplication.isPaused = false;
            }
#endif
        }
    }

    private static void EnsureInitialized()
    {
        if (!_initialized)
        {
            if (string.IsNullOrWhiteSpace(_dataDirectory))
            {
                Initialize();
            }
            else
            {
                LoadAll();
            }
        }
    }

    private static void LoadAll()
    {
        ManifestIndex.Clear();
        SchemaCache.Clear();

        var manifestPath = ResolvePath(DefaultManifestName);
        if (!File.Exists(manifestPath))
        {
            throw new FileNotFoundException($\"\u672a\u627e\u5230 manifest \u6587\u4ef6: {manifestPath}\");
        }

        var manifestContent = File.ReadAllText(manifestPath);
        var manifestEntries = JsonConvert.DeserializeObject<List<ManifestRecord>>(manifestContent, SerializerSettings) ?? new List<ManifestRecord>();
        foreach (var entry in manifestEntries)
        {
            if (string.IsNullOrWhiteSpace(entry.template) || string.IsNullOrWhiteSpace(entry.path))
            {
                continue;
            }
            var normalized = entry.template.Trim();
            ManifestIndex[normalized] = ResolvePath(entry.path);
        }

        foreach (var kv in ManifestIndex)
        {
            try
            {
                var schema = LoadSchema(kv.Key, kv.Value);
                SchemaCache[kv.Key] = schema;
            }
            catch (Exception ex)
            {
                Debug.LogError($\"\u52a0\u8f7d\u6a21\u677f {kv.Key} \u5931\u8d25: {ex.Message}\\n{ex.StackTrace}\");
            }
        }

        foreach (var schema in SchemaCache.Values)
        {
            if (schema?.parameters == null) continue;
            foreach (var param in schema.parameters)
            {
                if (param?.parameterIndexes == null) continue;
                if (string.IsNullOrEmpty(param.parameterIndexes.indexField) && !string.IsNullOrEmpty(param.parameterIndexes.template) && SchemaCache.TryGetValue(param.parameterIndexes.template, out var target))
                {
                    param.parameterIndexes.indexField = target.indexField ?? \"id\";
                }
            }
        }

        foreach (var kvp in SchemaCache)
        {
            HydrateIndexReferences(kvp.Value);
        }

        _initialized = true;
    }

    private static TableSchema LoadSchema(string templateName, string filePath)
    {
        if (!File.Exists(filePath))
        {
            throw new FileNotFoundException($\"\u627e\u4e0d\u5230\u6a21\u677f {templateName} \u7684\u6570\u636e\u6587\u4ef6\", filePath);
        }
        var json = File.ReadAllText(filePath);
        var raw = JsonConvert.DeserializeObject<RawTableSchema>(json, SerializerSettings) ?? new RawTableSchema();
        if (raw.parameters != null)
        {
            foreach (var param in raw.parameters)
            {
                if (param?.parameterIndexes != null && string.IsNullOrEmpty(param.parameterIndexes.indexField))
                {
                    param.parameterIndexes.indexField = string.Empty;
                }
            }
        }
        var schema = new TableSchema
        {
            name = string.IsNullOrWhiteSpace(raw.name) ? templateName : raw.name,
            indexField = string.IsNullOrWhiteSpace(raw.indexField) ? \"id\" : raw.indexField,
            parameters = raw.parameters ?? new List<ParamDef>(),
            instances = BuildInstanceDictionary(templateName, raw.instances)
        };
        return schema;
    }

    private static Dictionary<string, object> BuildInstanceDictionary(string templateName, List<RawInstance> instances)
    {
        var result = new Dictionary<string, object>(StringComparer.
OrdinalIgnoreCase);
        if (instances == null || instances.Count == 0)
        {
            return result;
        }

        var grouped = new Dictionary<string, List<RawInstance>>(StringComparer.
OrdinalIgnoreCase);
        foreach (var inst in instances)
        {
            var payloadIndex = inst?.payload?.Value<string>(\"index\");
            var key = string.IsNullOrWhiteSpace(payloadIndex) ? inst?.id.ToString() ?? Guid.NewGuid().ToString(\"N\") : payloadIndex;
            if (!grouped.TryGetValue(key, out var list))
            {
                list = new List<RawInstance>();
                grouped[key] = list;
            }
            list.Add(inst);
        }

        var duplicateMessages = new List<string>();
        foreach (var kv in grouped)
        {
            var ordered = kv.Value.OrderBy(r => r?.id ?? int.MaxValue).ToList();
            if (ordered.Count > 1)
            {
                var names = ordered
                    .Select(r => !string.IsNullOrEmpty(r?.name) ? r.name : r?.payload?.Value<string>(\"name\") ?? string.Empty)
                    .Where(n => !string.IsNullOrEmpty(n))
                    .ToList();
                if (names.Count > 0)
                {
                    duplicateMessages.Add($\"{templateName}[{string.Join(\",\", names)}]\");
                }
            }
            for (var i = 0; i < ordered.Count; i++)
            {
                var suffix = i == 0 ? string.Empty : $\"_{i}\";
                var baseKey = string.IsNullOrEmpty(kv.Key) ? ordered[i]?.id.ToString() ?? $\"__generated_{i}\" : kv.Key;
                var finalKey = baseKey + suffix;
                var attempt = 1;
                while (result.ContainsKey(finalKey))
                {
                    finalKey = $\"{baseKey}_{attempt++}\";
                }
                result[finalKey] = ordered[i]?.ToDictionary();
            }
        }

        if (duplicateMessages.Count > 0)
        {
            Debug.LogError($\"{string.Join(\",\", duplicateMessages)} \u91cd\u590d\u5b9e\u4f8b \u8fd9\u4e9b\u5b9e\u4f8b\u7684index\u91cd\u590d\u5bfc\u5165\u5931\u8d25\");
        }

        return result;
    }

    private static void HydrateIndexReferences(TableSchema schema)
    {
        if (schema?.parameters == null || schema.instances == null)
        {
            return;
        }
        foreach (var param in schema.parameters)
        {
            if (param?.parameterIndexes == null)
            {
                continue;
            }
            foreach (var kv in schema.instances)
            {
                var payload = ExtractPayload(kv.Value);
                if (payload == null || !payload.TryGetValue(param.name, out var rawValue))
                {
                    continue;
                }
                var payloadName = payload.TryGetValue("name", out var nameObj) ? nameObj?.ToString() : null;
                var payloadIndex = payload.TryGetValue("index", out var indexObj) ? indexObj?.ToString() : kv.Key;
                var dataRef = NormalizeDataRef(rawValue);
                if (dataRef == null)
                {
                    continue;
                }
                ApplyReferenceDefaults(dataRef, param.parameterIndexes);
                EnsureDataRefInstance(schema, param, payloadName, payloadIndex, dataRef);
                payload[param.name] = dataRef;
            }
        }
    }

    private static ParamDef FindParameter(TableSchema schema, string parameterName)
    {
        if (schema?.parameters == null)
        {
            return null;
        }
        return schema.parameters.FirstOrDefault(p => p != null && string.Equals(p.name, parameterName, StringComparison.
OrdinalIgnoreCase));
    }

    private static DataRef NormalizeDataRef(object rawValue)
    {
        switch (rawValue)
        {
            case null:
                return null;
            case DataRef existing:
                return existing;
            case JObject jObject:
                return jObject.ToObject<DataRef>();
            case Dictionary<string, object> dict:
                return JsonConvert.DeserializeObject<DataRef>(JsonConvert.SerializeObject(dict, SerializerSettings));
            default:
                try
                {
                    return JsonConvert.DeserializeObject<DataRef>(JsonConvert.SerializeObject(rawValue, SerializerSettings));
                }
                catch
                {
                    return null;
                }
        }
    }

    private static void ApplyReferenceDefaults(DataRef dataRef, ParameterIndexBinding binding)
    {
        if (dataRef == null || binding == null)
        {
            return;
        }
        if (string.IsNullOrEmpty(dataRef.template))
        {
            dataRef.template = binding.template;
        }
        if (string.IsNullOrEmpty(dataRef.by))
        {
            dataRef.by = !string.IsNullOrEmpty(binding.param) ? binding.param : binding.indexField;
        }
    }

    private static void EnsureDataRefInstance(TableSchema ownerSchema, ParamDef paramDef, string instanceName, string indexKey, DataRef dataRef)
    {
        if (dataRef == null || dataRef.instance != null)
        {
            return;
        }
        var binding = paramDef?.parameterIndexes;
        var targetTemplate = !string.IsNullOrEmpty(dataRef.template) ? dataRef.template : binding?.template;
        if (string.IsNullOrEmpty(targetTemplate))
        {
            return;
        }
        if (!SchemaCache.TryGetValue(targetTemplate, out var targetSchema) || targetSchema?.instances == null)
        {
            Debug.LogError($"{FormatInstanceIdentifier(ownerSchema?.name, instanceName, indexKey, paramDef?.name)} \u5f15\u7528\u7684\u6a21\u677f {targetTemplate} \u672a\u52a0\u8f7d\u3002");
            return;
        }
        var matchField = !string.IsNullOrEmpty(dataRef.by) ? dataRef.by : binding?.param;
        if (string.IsNullOrEmpty(matchField))
        {
            matchField = binding?.indexField;
        }
        if (string.IsNullOrEmpty(matchField))
        {
            matchField = targetSchema.indexField ?? "id";
        }
        if (string.IsNullOrWhiteSpace(dataRef.value))
        {
            dataRef.instance = null;
            return;
        }
        var resolved = FindInstanceByField(targetSchema, matchField, dataRef.value);
        if (resolved == null)
        {
            Debug.LogError($"{FormatInstanceIdentifier(ownerSchema?.name, instanceName, indexKey, paramDef?.name)} \u7d22\u5f15 {targetTemplate}.{matchField} = {dataRef.value} \u672a\u627e\u5230\u7d22\u5f15\u5b9e\u4f8b\u3002");
            return;
        }
        dataRef.instance = resolved;
    }

    private static object FindInstanceByField(TableSchema schema, string fieldName, string expectedValue)
    {
        if (schema?.instances == null)
        {
            return null;
        }
        if (!string.IsNullOrEmpty(expectedValue))
        {
            if (string.Equals(fieldName, "index", StringComparison.
OrdinalIgnoreCase)
                || (!string.IsNullOrEmpty(schema.indexField) && string.Equals(fieldName, schema.indexField, StringComparison.
OrdinalIgnoreCase)))
            {
                if (schema.instances.TryGetValue(expectedValue, out var byIndex))
                {
                    return byIndex;
                }
            }
        }
        foreach (var kv in schema.instances)
        {
            var payload = ExtractPayload(kv.Value);
            if (payload == null)
            {
                continue;
            }
            if (!payload.TryGetValue(fieldName, out var candidate) || candidate == null)
            {
                continue;
            }
            var candidateValue = candidate.ToString();
            if (string.Equals(candidateValue, expectedValue, StringComparison.
OrdinalIgnoreCase))
            {
                return kv.Value;
            }
        }
        return null;
    }

    private static string FormatInstanceIdentifier(string templateName, string instanceName, string indexKey, string parameterName)
    {
        var instancePart = !string.IsNullOrWhiteSpace(instanceName) ? instanceName : indexKey;
        if (string.IsNullOrWhiteSpace(instancePart))
        {
            instancePart = "(unknown)";
        }
        var tpl = string.IsNullOrWhiteSpace(templateName) ? "(unknown)" : templateName;
        var param = string.IsNullOrWhiteSpace(parameterName) ? "(unknown)" : parameterName;
        return $"{tpl}/{instancePart}/{param}";
    }

    private static object LocateInstance(TableSchema schema, string instanceName, string indexKey)
    {
        if (schema.instances == null)
        {
            throw new InvalidOperationException($\"\u6a21\u677f {schema.name} \u6ca1\u6709\u52a0\u8f7d\u4efb\u4f55\u5b9e\u4f8b\u3002\");
        }

        if (!string.IsNullOrWhiteSpace(indexKey) && schema.instances.TryGetValue(indexKey, out var indexed))
        {
            return indexed;
        }

        if (!string.IsNullOrWhiteSpace(instanceName))
        {
            foreach (var kv in schema.instances)
            {
                var payload = ExtractPayload(kv.Value);
                var name = payload != null && payload.TryGetValue(\"name\", out var v) ? v?.ToString() : null;
                if (!string.IsNullOrEmpty(name) && string.Equals(name, instanceName, StringComparison.
OrdinalIgnoreCase))
                {
                    return kv.Value;
                }
            }
        }

        throw new KeyNotFoundException($\"\u672a\u627e\u5230\u5b9e\u4f8b\uff1a\u6a21\u677f={schema.name}, \u540d\u79f0={instanceName}, \u7d22\u5f15={indexKey}\");
    }

    private static Dictionary<string, object> ExtractPayload(object instance)
    {
        if (instance is RawInstance raw)
        {
            return raw.payload?.ToObject<Dictionary<string, object>>();
        }
        if (instance is Dictionary<string, object> dict)
        {
            if (dict.TryGetValue(\"payload\", out var payloadObj))
            {
                return ConvertToDictionary(payloadObj);
            }
            return dict;
        }
        if (instance is JObject jObject)
        {
            var payload = jObject[\"payload\"] ?? jObject;
            return payload.ToObject<Dictionary<string, object>>();
        }
        return ConvertToDictionary(instance);
    }

    private static Dictionary<string, object> ConvertToDictionary(object value)
    {
        switch (value)
        {
            case null:
                return null;
            case Dictionary<string, object> dict:
                return dict;
            case JObject jObject:
                return jObject.ToObject<Dictionary<string, object>>();
            default:
                return JsonConvert.DeserializeObject<Dictionary<string, object>>(JsonConvert.SerializeObject(value, SerializerSettings));
        }
    }

    private static object ConvertValue(object rawValue, Type targetType, string templateName, string parameterName)
    {
        if (rawValue == null || targetType == typeof(object))
        {
            return rawValue;
        }
        if (targetType.IsInstanceOfType(rawValue))
        {
            return rawValue;
        }
        try
        {
            switch (rawValue)
            {
                case JToken token:
                    return token.ToObject(targetType);
                case Dictionary<string, object> dict:
                    return JsonConvert.DeserializeObject(JsonConvert.SerializeObject(dict, SerializerSettings), targetType);
                case IList<object> list when targetType.IsAssignableFrom(rawValue.GetType()):
                    return rawValue;
                case IConvertible convertible when typeof(IConvertible).IsAssignableFrom(targetType):
                    return Convert.ChangeType(convertible, targetType, CultureInfo.InvariantCulture);
                default:
                    return JsonConvert.DeserializeObject(JsonConvert.SerializeObject(rawValue, SerializerSettings), targetType);
            }
        }
        catch (Exception ex)
        {
            throw new InvalidCastException($\"\u6a21\u677f {templateName} \u7684\u53c2\u6570 {parameterName} \u65e0\u6cd5\u8f6c\u6362\u4e3a {targetType.Name}\", ex);
        }
    }

    private static string ResolvePath(string relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath))
        {
            return _dataDirectory;
        }
        if (Path.IsPathRooted(relativePath))
        {
            return relativePath;
        }
        var sanitized = relativePath.Replace(\"\\\\\", \"/\").TrimStart('.', '/');
        if (sanitized.StartsWith(\"dataEntity/\", StringComparison.
OrdinalIgnoreCase))
        {
            sanitized = sanitized.Substring(\"dataEntity/\".Length);
        }
        var combined = string.IsNullOrEmpty(_dataDirectory) ? sanitized : Path.Combine(_dataDirectory, sanitized);
        return Path.GetFullPath(combined);
    }

    private class ManifestRecord
    {
        public string template;
        public string path;
    }

    private class RawTableSchema
    {
        public string name;
        public string indexField;
        public List<ParamDef> parameters;
        public List<RawInstance> instances;
    }

    private class RawInstance
    {
        public int id;
        public string name;
        public JObject payload;

        public Dictionary<string, object> ToDictionary()
        {
            return new Dictionary<string, object>
            {
                { \"id\", id },
                { \"name\", name },
                { \"payload\", payload != null ? payload.ToObject<Dictionary<string, object>>() : new Dictionary<string, object>() }
            };
        }
    }
}
    `;
    await writeTextFile(modelStructHandle, 'DataEntityRuntimeLoader.cs', loaderContent);
    const guideContent = `
DataEntityRuntimeLoader \u4f7f\u7528\u8bf4\u660e
================================

1. \u521d\u59cb\u5316
   // dataEntity \u76ee\u5f55\u4f4d\u4e8e Assets \u76ee\u5f55\u4e0b\u65f6\u53ef\u76f4\u63a5\u8c03\u7528
   DataEntityRuntimeLoader.Initialize();
   // \u6216\u8005\u663e\u5f0f\u4f20\u5165\u8def\u5f84
   DataEntityRuntimeLoader.Initialize(Path.Combine(Application.dataPath, \"dataEntity\"));

2. \u8bfb\u53d6\u53c2\u6570
   // \u666e\u901a\u53c2\u6570\uff1a\u652f\u6301\u901a\u8fc7\u5b9e\u4f8b\u540d\u6216\u7d22\u5f15\u952e\u67e5\u8be2
   var damage = DataEntityRuntimeLoader.GetValue<int>(\"TemplateName\", null, \"indexKey\", \"damage\");
   // \u7d22\u5f15\u53c2\u6570\uff1a\u901a\u8fc7 getParameter \u6307\u5b9a\u5f15\u7528\u5b9e\u4f8b\u4e2d\u7684\u5b57\u6bb5
   var hp = DataEntityRuntimeLoader.GetValue<int>(\"TemplateName\", \"\u5b9e\u4f8b\u540d\u79f0\", null, \"refParam\", \"hp\");
   // \u82e5\u9700\u76f4\u63a5\u8bbf\u95ee DataRef \u53ca\u5176\u7d22\u5f15\u503c
   var dataRef = DataEntityRuntimeLoader.GetIndexReference(\"TemplateName\", \"\u5b9e\u4f8b\u540d\u79f0\", null, \"refParam\");
   var refKey = DataEntityRuntimeLoader.GetIndexValue(\"TemplateName\", \"\u5b9e\u4f8b\u540d\u79f0\", null, \"refParam\");

3. \u83b7\u53d6\u5b8c\u6574\u6a21\u677f
   var schema = DataEntityRuntimeLoader.GetSchema(\"TemplateName\");
   // schema.instances \u4e3a Dictionary<string, object>

4. \u70ed\u91cd\u8f7d
   DataEntityRuntimeLoader.Reload(); // \u81ea\u52a8\u6682\u505c\u5e76\u6062\u590d EditorApplication.isPaused

\u6ce8\u610f\u4e8b\u9879:
- manifest.json \u4f4d\u4e8e dataEntity \u76ee\u5f55\uff0cpath \u5b57\u6bb5\u662f JSON \u6587\u4ef6\u540d\u3002
- \u91cd\u590d\u7684\u5b9e\u4f8b\u7d22\u5f15\u4f1a\u5728\u63a7\u5236\u53f0\u8f93\u51fa\u9519\u8bef\uff0c\u5e76\u4e3a\u540e\u7eed\u5b9e\u4f8b\u8ffd\u52a0 _1/_2 \u540e\u7f00\u3002
- \u7d22\u5f15\u53c2\u6570\u5fc5\u987b\u901a\u8fc7\u5e26 getParameter \u7684 GetValue \u91cd\u8f7d\u6216 GetIndexReference/GetIndexValue \u8bbf\u95ee\uff0c\u76f4\u63a5\u8bfb\u53d6\u4f1a\u629b\u51fa\u5f02\u5e38\u3002
- \u5982\u679c\u7d22\u5f15\u5b9e\u4f8b\u7f3a\u5c11 getParameter \u6307\u5b9a\u7684\u5b57\u6bb5\uff0c\u4f1a\u629b\u51fa\u5f02\u5e38\u5e76\u5728\u63a7\u5236\u53f0\u6253\u5370\u9519\u8bef\u3002
- \u5982\u679c\u8bf7\u6c42\u7684\u53c2\u6570\u7c7b\u578b\u4e0d\u5339\u914d\u4f1a\u629b\u51fa InvalidCastException\u3002
    `;
    await writeTextFile(modelStructHandle, 'DataEntityRuntimeLoaderGuide.txt', guideContent);
    const testerRuntimeContent = `
using System;
using System.Collections.Generic;
using UnityEngine;

public class DataEntityRuntimeTester : MonoBehaviour
{
    public enum TestOperation
    {
        Initialize,
        Reload,
        GetValue,
    }

    [SerializeField]
    private TestOperation operation = TestOperation.Initialize;

    [SerializeField]
    private string dataDirectory = string.Empty;

    [SerializeField]
    private string templateName = string.Empty;

    [SerializeField]
    private string instanceName = string.Empty;

    [SerializeField]
    private string indexKey = string.Empty;

    [SerializeField]
    private string parameterName = string.Empty;

    [SerializeField]
    private string parameterType = "string";

    [SerializeField]
    private string getParameter = string.Empty;

    public void ExecuteSelectedOperation()
    {
        try
        {
            switch (operation)
            {
                case TestOperation.Initialize:
                    ExecuteInitialize();
                    break;
                case TestOperation.Reload:
                    ExecuteReload();
                    break;
                case TestOperation.GetValue:
                    ExecuteGetValue();
                    break;
                default:
                    Debug.LogError("Unsupported operation");
                    break;
            }
        }
        catch (Exception ex)
        {
            Debug.LogError($"[DataEntityRuntimeTester] {ex.Message}/n{ex}");
        }
    }

    private void ExecuteInitialize()
    {
        var path = string.IsNullOrWhiteSpace(dataDirectory) ? null : dataDirectory;
        DataEntityRuntimeLoader.Initialize(path);
        Debug.Log("[DataEntityRuntimeTester] Initialize completed");
    }

    private void ExecuteReload()
    {
        DataEntityRuntimeLoader.Reload();
        Debug.Log("[DataEntityRuntimeTester] Reload completed");
    }

    private void ExecuteGetValue()
    {
        if (string.IsNullOrWhiteSpace(templateName) || string.IsNullOrWhiteSpace(parameterName))
        {
            Debug.LogError("输入不合法");
            return;
        }

        var type = ResolveParameterType(parameterType);
        if (type == null)
        {
            Debug.LogError("输入不合法");
            return;
        }

        var instance = string.IsNullOrWhiteSpace(instanceName) ? null : instanceName;
        var index = string.IsNullOrWhiteSpace(indexKey) ? null : indexKey;

        object value;
        if (string.IsNullOrWhiteSpace(getParameter))
        {
            value = DataEntityRuntimeLoader.GetValue(templateName, instance, index, parameterName, type);
        }
        else
        {
            value = DataEntityRuntimeLoader.GetValue(templateName, instance, index, parameterName, type, getParameter);
        }

        var identifier = !string.IsNullOrWhiteSpace(instance) ? instance : index;
        var valueText = value == null ? "<null>" : value.ToString();
        Debug.Log($"{templateName}/{identifier ?? "(null)"}/{parameterName}/{valueText}");
    }

    private static Type ResolveParameterType(string typeName)
    {
        if (string.IsNullOrWhiteSpace(typeName))
        {
            return typeof(object);
        }

        var normalized = typeName.Trim();
        if (TypeMappings.TryGetValue(normalized, out var mapped))
        {
            return mapped;
        }
        if (TypeMappings.TryGetValue(normalized.ToLowerInvariant(), out mapped))
        {
            return mapped;
        }
        try
        {
            return Type.GetType(normalized, false);
        }
        catch
        {
            return null;
        }
    }

    private static readonly Dictionary<string, Type> TypeMappings = new Dictionary<string, Type>(StringComparer.OrdinalIgnoreCase)
    {
        { "bool", typeof(bool) },
        { "byte", typeof(byte) },
        { "sbyte", typeof(sbyte) },
        { "char", typeof(char) },
        { "decimal", typeof(decimal) },
        { "double", typeof(double) },
        { "float", typeof(float) },
        { "int", typeof(int) },
        { "uint", typeof(uint) },
        { "long", typeof(long) },
        { "ulong", typeof(ulong) },
        { "short", typeof(short) },
        { "ushort", typeof(ushort) },
        { "string", typeof(string) },
        { "datetime", typeof(DateTime) },
        { "guid", typeof(Guid) },
    };
}

    `;
    await writeTextFile(csharpHandle, 'DataEntityRuntimeTester.cs', testerRuntimeContent);
    if (editorHandle) {
      const testerEditorContent = `
#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;

[CustomEditor(typeof(DataEntityRuntimeTester))]
public class DataEntityRuntimeTesterEditor : Editor
{
    private SerializedProperty operation;
    private SerializedProperty dataDirectory;
    private SerializedProperty templateName;
    private SerializedProperty instanceName;
    private SerializedProperty indexKey;
    private SerializedProperty parameterName;
    private SerializedProperty parameterType;
    private SerializedProperty getParameter;

    private void OnEnable()
    {
        operation = serializedObject.FindProperty("operation");
        dataDirectory = serializedObject.FindProperty("dataDirectory");
        templateName = serializedObject.FindProperty("templateName");
        instanceName = serializedObject.FindProperty("instanceName");
        indexKey = serializedObject.FindProperty("indexKey");
        parameterName = serializedObject.FindProperty("parameterName");
        parameterType = serializedObject.FindProperty("parameterType");
        getParameter = serializedObject.FindProperty("getParameter");
    }

    public override void OnInspectorGUI()
    {
        serializedObject.Update();
        EditorGUILayout.PropertyField(operation);
        var op = (DataEntityRuntimeTester.TestOperation)operation.enumValueIndex;
        switch (op)
        {
            case DataEntityRuntimeTester.TestOperation.Initialize:
                EditorGUILayout.HelpBox("调用 DataEntityRuntimeLoader.Initialize", MessageType.Info);
                EditorGUILayout.PropertyField(dataDirectory, new GUIContent("数据目录(可空)"));
                break;
            case DataEntityRuntimeTester.TestOperation.Reload:
                EditorGUILayout.HelpBox("调用 DataEntityRuntimeLoader.Reload", MessageType.Info);
                break;
            case DataEntityRuntimeTester.TestOperation.GetValue:
                EditorGUILayout.HelpBox("读取数据并在控制台输出", MessageType.Info);
                EditorGUILayout.PropertyField(templateName, new GUIContent("模板名"));
                EditorGUILayout.PropertyField(instanceName, new GUIContent("实例名"));
                EditorGUILayout.PropertyField(indexKey, new GUIContent("索引字符"));
                EditorGUILayout.PropertyField(parameterName, new GUIContent("参数名"));
                EditorGUILayout.PropertyField(parameterType, new GUIContent("参数类型"));
                EditorGUILayout.PropertyField(getParameter, new GUIContent("索引获取参数(getParameter)"));
                break;
        }
        serializedObject.ApplyModifiedProperties();
        if (GUILayout.Button("执行"))
        {
            foreach (UnityEngine.Object target in targets)
            {
                if (target is DataEntityRuntimeTester tester)
                {
                    tester.ExecuteSelectedOperation();
                }
            }
        }
    }
}
#endif

      `;
      await writeTextFile(editorHandle, 'DataEntityRuntimeTesterEditor.cs', testerEditorContent);
      const testerGuideContent = `
DataEntityRuntimeTester 使用说明
================================

挂载脚本
1. 在 csharpDate 目录中找到 DataEntityRuntimeTester.cs 并挂载到需要测试的 GameObject。
2. 确保 Editor 文件夹中的 DataEntityRuntimeTesterEditor.cs 保持在 Editor 目录下，以启用自定义 Inspector 面板。
3. 在 Inspector 中使用生成的自定义面板选择要执行的操作。

操作说明
- Initialize：可选填写数据目录，为空时使用 dataEntity 目录。
- Reload：调用 DataEntityRuntimeLoader.Reload 并在 Editor 内自动暂停/恢复。
- GetValue：填写模板名、实例名或索引字符、参数名、参数类型。
  * 若目标参数为索引参数，在 getParameter 中填写要读取的字段。
  * 控制台会输出 template/entity/参数名/参数内容 或错误信息。

执行步骤
- 参数填写完成后点击“执行”按钮触发对应操作。
- 若输入不合法，Console 面板会打印提示便于排查。

注意事项
- 在未调用 Initialize 前执行读取会抛出异常。
- getParameter 仅在索引参数读取时需要，普通参数保持为空。
      `;
      await writeTextFile(editorHandle, 'DataEntityRuntimeTesterGuide.txt', testerGuideContent);
    }
  }

  /**
   * 从 dataEntity 读取所有模板文件
   */
  async function loadAllTemplates() {
    templates.length = 0;
    currentTemplateIndex = -1;
    currentInstanceIndex = -1;
    templateUidCounter = 0;
    lastSavedStructureSnapshot = new Map();
    pendingTemplateDeletions.clear();
    let enumLoadedFromJson = false;
    for await (const entry of dataEntityHandle.values()) {
      if (entry.kind === "file" && entry.name.toLowerCase().endsWith(".json")) {
        if (entry.name.toLowerCase() === 'manifest.json') continue;
        try {
          const file = await entry.getFile();
          const text = await file.text();
          const obj = JSON.parse(text);
          if (obj && obj.name && Array.isArray(obj.parameters) && Array.isArray(obj.instances)) {
            const template = {
              name: obj.name,
              parameters: obj.parameters,
              instances: obj.instances,
              indexField: obj.indexField || 'id',
            };
            normalizeTemplateParameterIndexes(template);
            if (isEnumTemplate(template) && Array.isArray(template.parameters)) {
              template.parameters = template.parameters.map((param) => {
                if (!param) return param;
                return { ...param, type: 'string' };
              });
              // 确保参数名使用顺位，并同步实例
              ensureEnumParamNaming(template);
              enumLoadedFromJson = true;
            }
            ensureTemplateUid(template);
            template.__fromDisk = true;
            templates.push(template);
          }
        } catch (err) {
          showMessage(`无法解析 ${entry.name}，已跳过`);
        }
      }
    }
    if (!enumLoadedFromJson) {
      const cachedEnum = await loadEnumTemplateCache();
      if (cachedEnum && isEnumTemplate(cachedEnum)) {
        ensureEnumParamNaming(cachedEnum);
        if (!Array.isArray(cachedEnum.parameters)) cachedEnum.parameters = [];
        if (!Array.isArray(cachedEnum.instances)) cachedEnum.instances = [];
        ensureTemplateUid(cachedEnum);
        cachedEnum.__fromDisk = false;
        templates.push(cachedEnum);
      }
    }
    // 按名称排序
    templates.sort((a, b) => a.name.localeCompare(b.name));
    populateMissingIndexFields(templates);
    if (templates.length > 0) {
      currentTemplateIndex = 0;
      currentInstanceIndex = templates[0].instances.length > 0 ? 0 : -1;
    }
    lastSavedStructureSnapshot = captureCurrentStructureSnapshot();
    await refreshTrashButtonState();
  }

  /**
   * 新建模板
   */
  function newTemplate() {
    const rawName = templateNameInput.value.trim();
    if (rawName && isPureNumericName(rawName)) {
      showMessage('模板名称不能为纯数字');
      return;
    }
    const name = rawName || `模板${templates.length + 1}`;
    if (isPureNumericName(name)) {
      showMessage('模板名称不能为纯数字');
      return;
    }
    if (templates.some((t) => t.name === name)) {
      alert("模板名称已存在");
      return;
    }
    const instance = {
      id: 0,
      name: "默认",
      payload: { template: name, id: 0, name: "默认", index: '0' },
    };
    const template = {
      name,
      parameters: [],
      instances: [instance],
      indexField: 'id',
    };
    ensureTemplateUid(template);
    template.__fromDisk = false;
    templates.push(template);
    currentTemplateIndex = templates.length - 1;
    currentInstanceIndex = 0;
    refreshTemplates();
    updateIndexTemplateOptions();
    updateTemplateNameInputValidity();
    updateInstanceNameInputValidity();
    showMessage(`已创建新模板：${name}`);
  }

  /**
   * 重命名模板
   */
  function renameTemplate(newName) {
    if (currentTemplateIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    if (!tpl) return;
    const targetName = (newName || "").trim();
    if (!targetName) {
      templateNameInput.value = tpl.name;
      return;
    }
    if (isPureNumericName(targetName)) {
      alert('模板名称不能为纯数字');
      templateNameInput.value = tpl.name;
      updateTemplateNameInputValidity();
      return;
    }
    if (!isEnumTemplate(tpl) && targetName === 'enum') {
      alert('禁止将其它模板重命名为 enum');
      templateNameInput.value = tpl.name;
      return;
    }
    if (isEnumTemplate(tpl) && targetName !== 'enum') {
      alert('enum 模板创建后不可重命名');
      templateNameInput.value = tpl.name;
      return;
    }
    if (templates.some((t, idx) => idx !== currentTemplateIndex && t.name === targetName)) {
      alert('模板名称已存在');
      templateNameInput.value = tpl.name;
      return;
    }
    if (tpl.name === targetName) {
      templateNameInput.value = tpl.name;
      return;
    }
    tpl.name = targetName;
    tpl.instances.forEach((inst) => {
      if (inst && inst.payload) {
        inst.payload.template = targetName;
      }
    });
    templateNameInput.value = targetName;
    refreshTemplates();
    updateIndexTemplateOptions();
    updateTemplateNameInputValidity();
    showMessage(`已重命名模板：${targetName}`);
  }

  /**
   * 新建实例
   */
  function newInstance() {
    if (currentTemplateIndex < 0) {
      alert("请先选择一个模板");
      return;
    }
    const tpl = templates[currentTemplateIndex];
    const rawName = instanceNameInput.value.trim();
    if (rawName && isPureNumericName(rawName)) {
      showMessage('实例名称不能为纯数字');
      return;
    }
    const name = rawName || `实例${tpl.instances.length}`;
    if (isPureNumericName(name)) {
      showMessage('实例名称不能为纯数字');
      return;
    }
    const usedIds = new Set();
    tpl.instances.forEach((inst) => {
      if (!inst) return;
      const value = Number(inst.id);
      if (Number.isFinite(value) && value >= 0) {
        usedIds.add(Math.trunc(value));
      }
    });
    let nextId = 0;
    while (usedIds.has(nextId)) {
      nextId += 1;
    }
    const inst = {
      id: nextId,
      name,
      payload: {},
    };
    // 默认值
    tpl.parameters.forEach((p) => {
      inst.payload[p.name] = getDefaultValueForType(p.type);
    });
    inst.payload.template = tpl.name;
    inst.payload.id = nextId;
    inst.payload.name = name;
    inst.payload.index = String(getValueByFieldForInstance(tpl, inst, tpl.indexField || 'id'));
    inst.payload.name = name;
    tpl.instances.push(inst);
    currentInstanceIndex = tpl.instances.length - 1;
    refreshInstances();
    refreshParams();
    updateInstanceNameInputValidity();
    showMessage(`已创建新实例：${name}`);
  }

  /**
   * 重命名实例
   */
  function renameInstance(newName) {
    if (currentTemplateIndex < 0 || currentInstanceIndex < 0) return;
    if (!newName) return;
    const tpl = templates[currentTemplateIndex];
    const inst = tpl.instances[currentInstanceIndex];
    const trimmed = String(newName || '').trim();
    if (!trimmed) {
      instanceNameInput.value = inst.name;
      return;
    }
    if (isPureNumericName(trimmed)) {
      showMessage('实例名称不能为纯数字');
      instanceNameInput.value = inst.name;
      updateInstanceNameInputValidity();
      return;
    }
    inst.name = trimmed;
    inst.payload.name = trimmed;
    refreshInstances();
    refreshParams();
    instanceNameInput.value = inst.name;
    updateInstanceNameInputValidity();
  }

  function commitInstanceIdChange(rawValue = null) {
    if (!instanceIdInput) return;
    if (currentTemplateIndex < 0 || currentInstanceIndex < 0) {
      updateInstanceIdInputState();
      return;
    }
    const tpl = templates[currentTemplateIndex];
    if (!tpl) return;
    const inst = tpl.instances[currentInstanceIndex];
    if (!inst) return;
    const value = rawValue != null ? rawValue : instanceIdInput.value;
    const trimmed = String(value ?? '').trim();
    if (!trimmed) {
      showMessage('ID 不能为空', 'warn');
      instanceIdInput.value = inst.id != null ? inst.id : '';
      updateInstanceIdInputState(collectDuplicateIdInfo(tpl));
      return;
    }
    if (!/^[-+]?\d+$/.test(trimmed)) {
      showMessage('ID 必须为整数', 'warn');
      instanceIdInput.value = inst.id != null ? inst.id : '';
      updateInstanceIdInputState(collectDuplicateIdInfo(tpl));
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      showMessage('ID 必须为整数', 'warn');
      instanceIdInput.value = inst.id != null ? inst.id : '';
      updateInstanceIdInputState(collectDuplicateIdInfo(tpl));
      return;
    }
    const normalized = Math.trunc(parsed);
    if (inst.id === normalized) {
      instanceIdInput.value = inst.id != null ? inst.id : '';
      updateInstanceIdInputState(collectDuplicateIdInfo(tpl));
      return;
    }
    inst.id = normalized;
    if (!inst.payload) inst.payload = {};
    inst.payload.id = normalized;
    inst.payload.template = tpl.name;
    if (inst.name != null) {
      inst.payload.name = inst.name;
    }
    inst.payload.index = String(getValueByFieldForInstance(tpl, inst, tpl.indexField || 'id'));
    refreshInstances();
    refreshParams();
    refreshTemplates();
    updateSheetTemplateNav();
    if (isSheetModeActive()) {
      sheetRenderedTemplatesFingerprint = '';
      renderLuckysheetForActiveInstance();
    }
  }

  /**
   * 复制实例
   */
  function copyInstance() {
    // 使用新的选中集合，实现复制实例
    if (currentTemplateIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    let indices = Array.from(selectedInstances);
    if (indices.length === 0 && currentInstanceIndex >= 0) indices = [currentInstanceIndex];
    if (indices.length === 0) {
      alert("请选择要复制的实例");
      return;
    }
    copyBuffer = { type: 'instance', items: indices.map((idx) => JSON.parse(JSON.stringify(tpl.instances[idx]))) };
    showMessage(`已复制 ${copyBuffer.items.length} 个实例`);
  }

  /**
   * 粘贴实例
   */
  function pasteInstance() {
    if (currentTemplateIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    if (!copyBuffer || copyBuffer.type !== 'instance' || !copyBuffer.items || copyBuffer.items.length === 0) {
      alert("没有已复制的实例");
      return;
    }
    const offsetInput = prompt('粘贴的实例 ID 偏移量', '1');
    if (offsetInput === null) {
      return;
    }
    const trimmed = String(offsetInput).trim();
    if (!/^[-+]?\d+$/.test(trimmed)) {
      showMessage('偏移量必须为整数', 'warn');
      return;
    }
    const offsetValue = Number(trimmed);
    if (!Number.isFinite(offsetValue)) {
      showMessage('偏移量必须为整数', 'warn');
      return;
    }
    const offset = Math.trunc(offsetValue);
    copyBuffer.items.forEach((srcInst) => {
      const baseIdValue = Number(srcInst?.id);
      const baseId = Number.isFinite(baseIdValue) ? Math.trunc(baseIdValue) : 0;
      const newId = baseId + offset;
      const newInst = JSON.parse(JSON.stringify(srcInst));
      newInst.id = newId;
      newInst.name = `${srcInst.name}_复制`;
      newInst.payload = { ...srcInst.payload };
      newInst.payload.id = newId;
      newInst.payload.name = newInst.name;
      newInst.payload.template = tpl.name;
      newInst.payload.index = String(getValueByFieldForInstance(tpl, newInst, tpl.indexField || 'id'));
      tpl.instances.push(newInst);
    });
    refreshInstances();
    refreshParams();
    refreshTemplates();
    updateSheetTemplateNav();
    if (isSheetModeActive()) {
      sheetRenderedTemplatesFingerprint = '';
      renderLuckysheetForActiveInstance();
    }
    showMessage(`已粘贴 ${copyBuffer.items.length} 个实例`);
  }

  /**
   * 删除实例
   */
  function deleteInstance() {
    if (currentTemplateIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    let indices = Array.from(selectedInstances);
    if (indices.length === 0 && currentInstanceIndex >= 0) indices = [currentInstanceIndex];
    if (indices.length === 0) {
      alert("请选择要删除的实例");
      return;
    }
    indices.sort((a, b) => b - a);
    let nextSelection = -1;
    indices.forEach((idx) => {
      tpl.instances.splice(idx, 1);
      nextSelection = idx;
    });
    const remaining = tpl.instances.length;
    if (remaining > 0) {
      if (nextSelection < 0) {
        nextSelection = 0;
      }
      if (nextSelection >= remaining) {
        nextSelection = remaining - 1;
      }
      currentInstanceIndex = nextSelection;
    } else {
      currentInstanceIndex = -1;
    }
    selectedInstances.clear();
    refreshInstances();
    refreshParams();
    refreshTemplates();
    updateSheetTemplateNav();
    if (isSheetModeActive()) {
      sheetRenderedTemplatesFingerprint = '';
      renderLuckysheetForActiveInstance();
    }
    showMessage(`已删除 ${indices.length} 个实例`);
  }

  /**
   * 新建参数
   */
  function newParam() {
    if (currentTemplateIndex < 0) {
      alert("请先选择一个模板");
      return;
    }
    const name = paramNameInput.value.trim();
    if (!name && !isEnumTemplate(templates[currentTemplateIndex])) {
      showMessage("请输入参数名称");
      return;
    }
    const tpl = templates[currentTemplateIndex];
    if (!isEnumTemplate(tpl) && name && isPureNumericName(name)) {
      showMessage('参数名称不能为纯数字');
      return;
    }
    let type = paramTypeSelect.value;
    if (isEnumTemplate(tpl)) {
      type = 'string';
    }
    let indexObj = null;
    const isEnumParamType = isEnumType(type);
    if (isEnumParamType) {
      indexTemplateSelect.value = '';
      indexParamSelect.value = '';
    }
    if (!indexTemplateSelect.disabled && !isEnumParamType) {
      const idxTpl = indexTemplateSelect.value;
      const idxParam = indexParamSelect.value;
      if (idxTpl && idxParam) {
        const targetTpl = templates.find(t=>t.name===idxTpl);
        if (targetTpl && isEnumTemplate(targetTpl)) {
          alert('索引目标不能是 enum 模板');
          indexTemplateSelect.value = '';
          updateIndexParamOptions();
        } else if (targetTpl) {
          const isReservedField = RESERVED_INDEX_FIELDS.has(idxParam);
          const targetParam = (targetTpl.parameters || []).find(p => p && p.name === idxParam);
          const validParam = isReservedField || (targetParam && INDEXABLE_PARAM_TYPES.has(targetParam.type));
          if (!validParam) {
            alert('索引字段类型必须是 int/long/float/string');
            indexParamSelect.value = '';
          } else {
            indexObj = {
              template: idxTpl,
              param: idxParam,
              indexField: targetTpl ? (targetTpl.indexField || 'id') : '',
            };
          }
        }
      }
    } else {
      indexTemplateSelect.value = '';
      indexParamSelect.value = '';
    }
    // 如果正在编辑参数
    if (editingParamIndex >= 0) {
      const currentTpl = templates[currentTemplateIndex];
      const effectiveName = isEnumTemplate(currentTpl) ? String(editingParamIndex) : name;
      if (!isEnumTemplate(currentTpl) && isPureNumericName(effectiveName)) {
        showMessage('参数名称不能为纯数字');
        return;
      }
      updateParamAtIndex(editingParamIndex, effectiveName, type, indexObj);
      editingParamIndex = -1;
      selectedParams.clear();
      refreshParams();
      showMessage(`已更新参数`);
      return;
    }
    // enum 模板：根据当前实例已有的参数键计算插入序号，并强制按顺位命名
    if (isEnumTemplate(tpl)) {
      if (currentInstanceIndex < 0) { alert('请先选择一个实例'); return; }
      const curInst = tpl.instances[currentInstanceIndex];
      if (!curInst.payload) curInst.payload = {};
      const keys = getEnumParamKeysForInstance(tpl, curInst).map(k=>parseInt(k,10));
      let n = 0; while (keys.includes(n)) n++;
      curInst.payload[String(n)] = '';
      refreshParams();
      showMessage(`已创建新参数`);
      return;
    }
    // 新建参数
    if (tpl.parameters.some((p) => p.name === name)) {
      showMessage("该参数已存在");
      return;
    }
    const indexBinding = !isEnumParamType && indexObj
      ? {
          template: indexObj.template || '',
          param: indexObj.param || '',
          indexField: indexObj.indexField || '',
        }
      : null;
    const param = { name, type };
    if (indexBinding) {
      param.parameterIndexes = indexBinding;
    }
    tpl.parameters.push(param);
    tpl.instances.forEach((inst) => {
      if (indexBinding) {
        inst.payload[name] = { template: indexBinding.template, by: indexBinding.param, value: '' };
      } else {
        inst.payload[name] = getDefaultValueForType(type);
      }
    });
    refreshParams();
    showMessage(`已创建新参数：${name}`);
  }

  /**
   * 更新参数
   */
  function updateParamAtIndex(index, newName, newType, newIndexObj) {
    if (currentTemplateIndex < 0 || index < 0) return;
    const tpl = templates[currentTemplateIndex];
    const param = tpl.parameters[index];
    if (!param) return;
    if (!isEnumTemplate(tpl) && isPureNumericName(newName)) {
      showMessage('参数名称不能为纯数字');
      return;
    }
    // 检查重名
    if (!isEnumTemplate(tpl) && tpl.parameters.some((p, i) => p.name === newName && i !== index)) {
      alert("参数名称已存在");
      return;
    }
    const enumTypeSelected = isEnumType(newType);
    if (isEnumTemplate(tpl)) {
      newType = 'string';
      newName = String(index);
      newIndexObj = null;
    } else if (enumTypeSelected) {
      newIndexObj = null;
    }
    // 索引目标不允许 enum
    if (newIndexObj && newIndexObj.template) {
      const targetTpl = templates.find(t=>t.name===newIndexObj.template);
      if (targetTpl && isEnumTemplate(targetTpl)) {
        alert('索引目标不能是 enum 模板');
        newIndexObj = null;
      } else if (targetTpl) {
        const isReservedField = RESERVED_INDEX_FIELDS.has(newIndexObj.param);
        const targetParam = (targetTpl.parameters || []).find(p => p && p.name === newIndexObj.param);
        const validParam = isReservedField || (targetParam && INDEXABLE_PARAM_TYPES.has(targetParam.type));
        if (!validParam) {
          alert('索引字段类型必须是 int/long/float/string');
          newIndexObj = null;
        } else {
          newIndexObj.indexField = targetTpl.indexField || 'id';
        }
      }
    }
    const oldName = param.name;
    const oldType = param.type;
    // 更新定义
    param.name = newName;
    param.type = newType;
    const oldIndex = param.parameterIndexes;
    param.parameterIndexes = newIndexObj;
    // 对所有实例调整 payload
    tpl.instances.forEach((inst) => {
      // 如果重命名
      if (oldName !== newName) {
        inst.payload[newName] = inst.payload[oldName];
        delete inst.payload[oldName];
      }
      // 如果类型变化，尝试转换
      if (oldType !== newType) {
        const val = inst.payload[newName];
        inst.payload[newName] = convertValueForType(val, newType);
      }
      // 如果索引配置变化，规范化/还原值
      if (!oldIndex && newIndexObj) {
        // 变为索引：把原值包进引用对象
        const prev = inst.payload[newName];
        inst.payload[newName] = { template: newIndexObj.template, by: newIndexObj.param, value: prev == null ? '' : String(prev) };
      } else if (oldIndex && !newIndexObj) {
        // 取消索引：取引用对象中的 value 作为当前类型的值
        const ref = inst.payload[newName];
        const raw = ref && typeof ref === 'object' ? ref.value : ref;
        inst.payload[newName] = convertValueForType(raw, newType);
      } else if (oldIndex && newIndexObj) {
        // 索引存在但定义变化：同步 template/by 保留 value
        const ref = inst.payload[newName];
        if (!ref || typeof ref !== 'object') {
          inst.payload[newName] = { template: newIndexObj.template, by: newIndexObj.param, value: ref == null ? '' : String(ref) };
        } else {
          ref.template = newIndexObj.template;
          ref.by = newIndexObj.param;
        }
      }
    });
  }

  /**
   * 根据新类型转换现有值，简单处理
   */
  function convertValueForType(val, type) {
    if (isEnumType(type)) {
      const enums = getEnumValues(type);
      const str = val == null ? '' : String(val);
      if (enums && enums.includes(str)) return str;
      return (enums && enums.length > 0) ? enums[0] : '';
    }
    if (val === undefined || val === null) return getDefaultValueForType(type);
    switch (type) {
      case 'string':
        return String(val);
      case 'int':
        return parseInt(val) || 0;
      case 'long':
        return parseInt(val) || 0;
      case 'float':
        return parseFloat(val) || 0;
      case 'bool':
        return Boolean(val);
      case 'list':
        if (Array.isArray(val)) return val.map(v => (v == null ? '' : String(v)));
        return val ? String(val).split(/\s*,\s*/) : [];
      case 'object':
        try {
          return typeof val === 'object' ? val : JSON.parse(val);
        } catch {
          return {};
        }
      default:
        return val;
    }
  }

  /**
   * 删除参数
   */
  function deleteParam(index) {
    // 包装为多选删除，以保持一致
    if (currentTemplateIndex < 0) return;
    selectedParams.clear();
    selectedParams.add(index);
    deleteParams();
  }

  /**
   * 根据类型获取默认值
   */
  function getDefaultValueForType(type) {
    if (isEnumType(type)) {
      const enums = getEnumValues(type);
      return (enums && enums.length > 0) ? enums[0] : '';
    }
    switch (type) {
      case "string":
        return "";
      case "int":
      case "long":
      case "float":
        return 0;
      case "bool":
        return false;
      case "list":
        return [""];
      case "object":
        return {};
      default:
        return null;
    }
  }

  function isEnumTemplate(tpl) {
    return tpl && tpl.name === 'enum';
  }

  // enum 新规则：参数与实例对应，因此该函数改为空实现（兼容旧调用）
  function ensureEnumParamNaming(tpl) { return; }

  function getEnumParamKeysForInstance(tpl, inst) {
    if (!tpl || !inst || !inst.payload) return [];
    const reserved = new Set(['template','id','name','index']);
    return Object.keys(inst.payload)
      .filter(k => !reserved.has(k) && /^\d+$/.test(k))
      .map(k => parseInt(k, 10))
      .sort((a,b)=>a-b)
      .map(n => String(n));
  }

  function getEnumTemplate() {
    return templates.find((tpl) => isEnumTemplate(tpl));
  }

  function getEnumDefinitions() {
    const enumTpl = getEnumTemplate();
    if (!enumTpl || !Array.isArray(enumTpl.instances)) return [];
    const paramNames = Array.isArray(enumTpl.parameters)
      ? enumTpl.parameters.map((p) => p && p.name).filter((name) => typeof name === 'string' && name.length > 0)
      : [];
    const definitions = [];
    const usedTypeNames = new Set();
    enumTpl.instances.forEach((inst, idx) => {
      if (!inst) return;
      const displayName = (inst.name && inst.name.trim()) ? inst.name.trim() : `Enum${inst.id ?? idx}`;
      const fallbackName = `Enum${inst.id ?? idx}`;
      const baseName = sanitizeCSharpTypeName(displayName || fallbackName, fallbackName);
      let csharpName = baseName;
      let suffix = 1;
      while (usedTypeNames.has(csharpName)) {
        csharpName = `${baseName}_${suffix++}`;
      }
      usedTypeNames.add(csharpName);
      const payload = inst.payload || {};
      const seen = new Set();
      const values = [];
      // 新规则：从该实例自身的数字键顺序提取枚举值
      Object.keys(payload)
        .filter(k => /^\d+$/.test(k))
        .map(k => parseInt(k,10))
        .sort((a,b)=>a-b)
        .map(n=>String(n))
        .forEach((k) => {
          const raw = payload[k];
          if (raw === undefined || raw === null) return;
          const str = String(raw).trim();
          if (!str || seen.has(str)) return;
          seen.add(str);
          values.push(str);
        });
      definitions.push({
        name: displayName,
        csharpName,
        values,
      });
    });
    return definitions;
  }

  function getEnumDefinition(type) {
    if (!type) return null;
    const defs = getEnumDefinitions();
    return defs.find((def) => def.name === type) || null;
  }

  function isEnumType(type) {
    return Boolean(getEnumDefinition(type));
  }

  function getEnumValues(type) {
    const def = getEnumDefinition(type);
    return def ? def.values.slice() : null;
  }

  function getEnumCSharpTypeName(type) {
    const def = getEnumDefinition(type);
    return def ? def.csharpName : type;
  }

  function sanitizeCSharpTypeName(name, fallback) {
    const base = (name || '').split(/[^A-Za-z0-9]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
    let result = base || fallback || 'EnumType';
    result = result.replace(/[^A-Za-z0-9_]/g, '_');
    if (/^[0-9]/.test(result)) {
      result = `_${result}`;
    }
    return result || 'EnumType';
  }

  function sanitizeCSharpMemberName(name, fallback) {
    let result = (name == null ? '' : String(name)).trim();
    if (!result) {
      result = fallback || 'Member';
    }
    result = result.replace(/[\s]+/g, '_');
    result = result.replace(/[^\p{L}\p{Nd}_]/gu, '_');
    if (!result) {
      result = fallback || 'Member';
    }
    if (/^[\p{Nd}]/u.test(result)) {
      result = `_${result}`;
    }
    return result || 'Member';
  }

  function refreshParamTypeOptions() {
    if (!paramTypeSelect) return;
    const previousValue = paramTypeSelect.value;
    const enumDefs = getEnumDefinitions();
    const missingTypes = new Set();
    templates.forEach((tpl) => {
      if (!tpl || !Array.isArray(tpl.parameters)) return;
      tpl.parameters.forEach((p) => {
        if (!p || !p.type) return;
        if (builtinParamTypeSet.has(p.type)) return;
        if (enumDefs.some((def) => def.name === p.type)) return;
        missingTypes.add(p.type);
      });
    });
    paramTypeSelect.innerHTML = '';
    builtinParamTypeOptions.forEach((opt) => {
      const optionEl = document.createElement('option');
      optionEl.value = opt.value;
      optionEl.textContent = opt.label;
      paramTypeSelect.appendChild(optionEl);
    });
    if (enumDefs.length > 0) {
      const group = document.createElement('optgroup');
      group.label = '枚举类型';
      enumDefs
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
        .forEach((def) => {
          const opt = document.createElement('option');
          opt.value = def.name;
          opt.textContent = def.name;
          group.appendChild(opt);
        });
      paramTypeSelect.appendChild(group);
    }
    if (missingTypes.size > 0) {
      const missingGroup = document.createElement('optgroup');
      missingGroup.label = '缺失类型';
      Array.from(missingTypes).sort().forEach((typeName) => {
        const opt = document.createElement('option');
        opt.value = typeName;
        opt.textContent = `${typeName} (缺失)`;
        missingGroup.appendChild(opt);
      });
      paramTypeSelect.appendChild(missingGroup);
    }
    if (previousValue && Array.from(paramTypeSelect.options).some((opt) => opt.value === previousValue)) {
      paramTypeSelect.value = previousValue;
    } else {
      paramTypeSelect.value = 'string';
    }
  }

  function updateParamTypeSelectEnabledState() {
    const tpl = templates[currentTemplateIndex];
    const shouldDisable = Boolean(tpl && isEnumTemplate(tpl));
    paramTypeSelect.disabled = shouldDisable;
    if (shouldDisable) {
      paramTypeSelect.value = 'string';
    }
  }

  function applyIndexDisabledState(message) {
    indexTemplateSelect.innerHTML = '';
    const optTpl = document.createElement('option');
    optTpl.value = '';
    optTpl.textContent = message;
    indexTemplateSelect.appendChild(optTpl);
    indexTemplateSelect.value = '';
    indexTemplateSelect.disabled = true;
    indexTemplateSelect.dataset.disabledReason = message;

    indexParamSelect.innerHTML = '';
    const optParam = document.createElement('option');
    optParam.value = '';
    optParam.textContent = message;
    indexParamSelect.appendChild(optParam);
    indexParamSelect.value = '';
    indexParamSelect.disabled = true;
    indexParamSelect.dataset.disabledReason = message;
  }

  // enum 模板下禁用参数名输入框（参数名由顺位自动生成）
  function updateParamNameInputEnabledState() {
    if (!paramNameInput) return;
    const tpl = templates[currentTemplateIndex];
    const shouldDisable = Boolean(tpl && isEnumTemplate(tpl));
    paramNameInput.disabled = shouldDisable;
    if (shouldDisable) {
      paramNameInput.placeholder = 'enum 自动命名（0,1,2,...)';
    } else {
      paramNameInput.placeholder = '';
    }
  }

  // 读取实例指定字段的值（支持保留字段和自定义字段）
  function getValueByFieldForInstance(tpl, inst, fieldName) {
    if (!inst || !inst.payload) return '';
    if (fieldName === 'template' || fieldName === 'id' || fieldName === 'name') return inst.payload[fieldName];
    return inst.payload[fieldName];
  }

  /**
   * 刷新模板列表
   */
  function refreshTemplates() {
    templateListEl.innerHTML = "";
    templates.forEach((tpl, idx) => {
      const li = document.createElement("li");
      li.setAttribute('draggable','true');
      li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(idx)); });
      li.addEventListener('dragover', (e) => { e.preventDefault(); });
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = parseInt(e.dataTransfer.getData('text/plain'));
        const to = idx;
        if (isNaN(from) || from === to) return;
        const it = templates.splice(from,1)[0];
        templates.splice(to,0,it);
        if (currentTemplateIndex === from) currentTemplateIndex = to;
        else if (from < currentTemplateIndex && to >= currentTemplateIndex) currentTemplateIndex--;
        else if (from > currentTemplateIndex && to <= currentTemplateIndex) currentTemplateIndex++;
        refreshTemplates();
      });
      // 设置选中状态与重复 ID 提示
      const tooltipParts = [];
      const duplicateIdInfo = collectDuplicateIdInfo(tpl);
      const duplicateIdKeys = Array.from(duplicateIdInfo.duplicates.keys());
      if (duplicateIdKeys.length > 0) {
        li.classList.add('duplicate-id');
        const preview = duplicateIdKeys
          .map((key) => (key === '' ? '（空）' : key))
          .slice(0, 3)
          .join(', ');
        const suffix = duplicateIdKeys.length > 3 ? '…' : '';
        tooltipParts.push(`存在重复 ID：${preview}${suffix}`);
      } else {
        li.classList.remove('duplicate-id');
      }
      const hasInvalidReferences = doesTemplateHaveInvalidIndexReferences(tpl);
      li.classList.toggle('invalid-reference', hasInvalidReferences);
      if (hasInvalidReferences) {
        tooltipParts.push('存在无效的索引引用');
      }
      if (tooltipParts.length > 0) {
        li.title = tooltipParts.join('\n');
      } else {
        li.removeAttribute('title');
      }
      // 设置选中状态
      if (selectedTemplates.has(idx)) li.classList.add('active');
      let exportState = 'none';
      if (exportSelectionMode) {
        exportState = getTemplateExportState(tpl);
        if (exportState === 'all') li.classList.add('export-all');
        if (exportState === 'partial') li.classList.add('export-partial');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = exportState === 'all';
        checkbox.indeterminate = exportState === 'partial';
        checkbox.addEventListener('click', (e) => {
          e.stopPropagation();
          handleTemplateExportCheckbox(idx, exportState, e);
        });
        li.appendChild(checkbox);
      }
      const nameSpan = document.createElement('span');
      nameSpan.textContent = tpl.name;
      setInvalidNameVisual(nameSpan, isPureNumericName(tpl.name));
      li.appendChild(nameSpan);
      if (exportSelectionMode) {
        const counts = getTemplateExportCounts(tpl);
        const countSpan = document.createElement('span');
        countSpan.className = 'export-count';
        countSpan.textContent = `${counts.selected}/${counts.total}`;
        li.appendChild(countSpan);
      }
      li.addEventListener('click', (e) => {
        // Ctrl+点击：切换该项选中状态（不丢失已有选择）
        if (e.ctrlKey) {
          if (selectedTemplates.has(idx)) {
            selectedTemplates.delete(idx);
          } else {
            selectedTemplates.add(idx);
          }
          const arr = Array.from(selectedTemplates).sort((a,b)=>a-b);
          if (arr.length > 0) {
            currentTemplateIndex = arr[arr.length - 1];
            templateNameInput.value = templates[currentTemplateIndex].name;
            anchorTemplate = currentTemplateIndex;
          } else {
            currentTemplateIndex = -1;
            templateNameInput.value = '';
            instanceNameInput.value = '';
            anchorTemplate = null;
          }
        // Shift+点击范围选择
        } else if (e.shiftKey) {
          // 如果未设置锚点，则以当前选中模板或自身为锚点
          if (anchorTemplate === null) {
            anchorTemplate = currentTemplateIndex >= 0 ? currentTemplateIndex : idx;
          }
          const start = Math.min(anchorTemplate, idx);
          const end = Math.max(anchorTemplate, idx);
          selectedTemplates.clear();
          for (let i = start; i <= end; i++) {
            selectedTemplates.add(i);
          }
          currentTemplateIndex = idx;
          templateNameInput.value = tpl.name;
          // 更新锚点为当前
          anchorTemplate = idx;
        } else {
          // 单击已选中的唯一模板 => 取消选中
          if (selectedTemplates.has(idx) && selectedTemplates.size === 1) {
            selectedTemplates.clear();
            currentTemplateIndex = -1;
            currentInstanceIndex = -1;
            templateNameInput.value = '';
            instanceNameInput.value = '';
            selectedInstances.clear();
            selectedParams.clear();
            editingParamIndex = -1;
            // 清除锚点
            anchorTemplate = null;
            anchorInstance = null;
            anchorParam = null;
            refreshTemplates();
            refreshInstances();
            refreshParams();
            updateIndexTemplateOptions();
            lastSelectedCategory = 'template';
            e.stopPropagation();
            return;
          }
          // 单选
          selectedTemplates.clear();
          selectedTemplates.add(idx);
          currentTemplateIndex = idx;
          templateNameInput.value = tpl.name;
          // 更新锚点
          anchorTemplate = idx;
        }
        // 切换模板时，重置实例和参数选择
        currentInstanceIndex = currentTemplateIndex >= 0 && templates[currentTemplateIndex].instances.length > 0 ? 0 : -1;
        selectedInstances.clear();
        selectedParams.clear();
        editingParamIndex = -1;
        // 清除实例和参数锚点
        anchorInstance = null;
        anchorParam = null;
        refreshTemplates();
        refreshInstances();
        refreshParams();
        updateIndexTemplateOptions();
        lastSelectedCategory = 'template';
        e.stopPropagation();
      });
      templateListEl.appendChild(li);
    });
    if (currentTemplateIndex >= 0) {
      templateNameInput.value = templates[currentTemplateIndex].name;
    } else {
      templateNameInput.value = "";
    }
    updateTemplateNameInputValidity();
    updateInstanceNameInputValidity();
    refreshInstances();
    refreshParams();
    // 应用模板搜索过滤
    filterList(templateListEl, searchTemplatesInput.value);
    if (isSheetModeActive()) {
      updateSheetTemplateNav();
      updateSheetInstanceTabs();
    }
  }

  /**
   * 获取选中的实例索引
   */
  function getSelectedInstanceIndices() {
    return Array.from(selectedInstances).sort((a, b) => a - b);
  }

  function updateCompareButtonState() {
    if (!toggleCompareValuesBtn) return;
    const isActive = !!compareValueState.active;
    toggleCompareValuesBtn.classList.toggle('active', isActive);
    toggleCompareValuesBtn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  }

  function deactivateCompareValues(options = {}) {
    const force = Boolean(options.force);
    if (!compareValueState.active && !force) return;
    compareValueState = createDefaultCompareValueState();
    updateCompareButtonState();
  }

  function buildCompareValueSnapshot() {
    if (currentTemplateIndex < 0) {
      showMessage('请先选择模板', 'warn');
      return null;
    }
    const tpl = templates[currentTemplateIndex];
    if (!tpl) return null;
    ensureTemplateUid(tpl);
    if (isEnumTemplate(tpl)) {
      if (currentInstanceIndex < 0) {
        showMessage('请先选择一个实例', 'warn');
        return null;
      }
      const indices = Array.from(selectedParams).sort((a, b) => a - b);
      if (indices.length === 0) {
        showMessage('请选择要对比的参数', 'warn');
        return null;
      }
      const inst = tpl.instances[currentInstanceIndex];
      if (!inst) return null;
      const keys = getEnumParamKeysForInstance(tpl, inst);
      const selectedKeys = indices
        .map((idx) => keys[idx])
        .filter((key) => key != null);
      if (selectedKeys.length === 0) {
        showMessage('未找到可对比的参数', 'warn');
        return null;
      }
      return {
        active: true,
        templateUid: tpl.__uid,
        type: 'enum',
        params: [],
        keys: selectedKeys,
      };
    }
    const indices = Array.from(selectedParams).sort((a, b) => a - b);
    if (indices.length === 0) {
      showMessage('请选择要对比的参数', 'warn');
      return null;
    }
    const params = indices
      .map((idx) => tpl.parameters[idx])
      .filter((param) => param && param.name)
      .map((param) => ({
        name: param.name,
        type: param.type,
        parameterIndexes: param.parameterIndexes
          ? {
              template: param.parameterIndexes.template || '',
              param: param.parameterIndexes.param || '',
            }
          : null,
      }));
    if (params.length === 0) {
      showMessage('未找到可对比的参数', 'warn');
      return null;
    }
    return {
      active: true,
      templateUid: tpl.__uid,
      type: 'normal',
      params,
      keys: [],
    };
  }

  function formatCompareDisplayValue(value, meta) {
    let result = value;
    if (meta && meta.parameterIndexes && result && typeof result === 'object' && !Array.isArray(result) && 'value' in result) {
      result = result.value;
    }
    if (Array.isArray(result)) {
      if (result.length === 0) return '（空）';
      const joined = result
        .map((item) => (item == null ? '' : String(item)))
        .join(', ');
      return joined.trim() ? joined : '（空）';
    }
    if (result === null || result === undefined) return '（空）';
    if (typeof result === 'string') {
      return result.length === 0 ? '（空）' : result;
    }
    if (typeof result === 'boolean') {
      return result ? 'true' : 'false';
    }
    if (typeof result === 'number') {
      return Number.isFinite(result) ? String(result) : '（空）';
    }
    if (typeof result === 'object') {
      try {
        const str = JSON.stringify(result);
        return str && str !== '{}' ? str : '（空）';
      } catch (err) {
        return String(result);
      }
    }
    return String(result);
  }

  function buildInstanceCompareText(tpl, inst) {
    if (!compareValueState.active || !tpl || compareValueState.templateUid !== tpl.__uid) return '';
    if (!inst || !inst.payload) return '';
    if (compareValueState.type === 'enum') {
      const keys = Array.isArray(compareValueState.keys) ? compareValueState.keys : [];
      if (keys.length === 0) return '';
      const parts = keys
        .map((key) => {
          const raw = inst.payload ? inst.payload[key] : undefined;
          const formatted = formatCompareDisplayValue(raw);
          return `${key}: ${formatted}`;
        })
        .filter((text) => text && text.length > 0);
      return parts.join(' | ');
    }
    const params = Array.isArray(compareValueState.params) ? compareValueState.params : [];
    if (params.length === 0) return '';
    const parts = params
      .map((meta) => {
        if (!meta || !meta.name) return '';
        const raw = inst.payload ? inst.payload[meta.name] : undefined;
        const formatted = formatCompareDisplayValue(raw, meta);
        return `${meta.name}: ${formatted}`;
      })
      .filter((text) => text && text.length > 0);
    return parts.join(' | ');
  }

  function handleToggleCompareValues() {
    if (!compareValueState.active) {
      const snapshot = buildCompareValueSnapshot();
      if (!snapshot) return;
      compareValueState = snapshot;
      updateCompareButtonState();
      refreshInstances();
      return;
    }
    compareValueState = createDefaultCompareValueState();
    updateCompareButtonState();
    refreshInstances();
  }

  /**
   * 刷新实例列表
   */
  function refreshInstances() {
    instanceListEl.innerHTML = "";
    if (currentTemplateIndex < 0) {
      if (compareValueState.active) {
        deactivateCompareValues({ force: true });
      }
      lastDuplicateIndexInfo = null;
      if (instanceIdInput) {
        instanceIdInput.value = '';
        instanceIdInput.disabled = true;
        instanceIdInput.classList.remove('invalid-name');
        instanceIdInput.removeAttribute('title');
      }
      return;
    }
    const tpl = templates[currentTemplateIndex];
    if (!tpl) {
      if (instanceIdInput) {
        instanceIdInput.value = '';
        instanceIdInput.disabled = true;
        instanceIdInput.classList.remove('invalid-name');
        instanceIdInput.removeAttribute('title');
      }
      return;
    }
    ensureTemplateUid(tpl);
    if (compareValueState.active && compareValueState.templateUid && compareValueState.templateUid !== tpl.__uid) {
      deactivateCompareValues({ force: true });
    }
    const duplicateInfo = collectDuplicateIndexInfo(tpl);
    const duplicateIdInfo = collectDuplicateIdInfo(tpl);
    const invalidInstanceMap = collectInstanceIndexInvalidReasons(tpl);
    lastDuplicateIndexInfo = { uid: tpl.__uid, info: duplicateInfo };
    const duplicatesByIndex = duplicateInfo.byIndex;
    const duplicatesById = duplicateIdInfo.byIndex;
    const templateIdxForExport = currentTemplateIndex;
    tpl.instances.forEach((inst, idx) => {
      const li = document.createElement("li");
      li.setAttribute('draggable','true');
      li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(idx)); });
      li.addEventListener('dragover', (e) => { e.preventDefault(); });
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = parseInt(e.dataTransfer.getData('text/plain'));
        const to = idx;
        if (isNaN(from) || from === to) return;
        const it = tpl.instances.splice(from,1)[0];
        tpl.instances.splice(to,0,it);
        if (currentInstanceIndex === from) currentInstanceIndex = to;
        else if (from < currentInstanceIndex && to >= currentInstanceIndex) currentInstanceIndex--;
        else if (from > currentInstanceIndex && to <= currentInstanceIndex) currentInstanceIndex++;
        refreshInstances();
      });
      li.setAttribute('draggable','true');
      li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(idx)); });
      li.addEventListener('dragover', (e) => { e.preventDefault(); });
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = parseInt(e.dataTransfer.getData('text/plain'));
        const to = idx;
        if (isNaN(from) || from === to) return;
        const it = tpl.instances.splice(from,1)[0];
        tpl.instances.splice(to,0,it);
        if (currentInstanceIndex === from) currentInstanceIndex = to;
        else if (from < currentInstanceIndex && to >= currentInstanceIndex) currentInstanceIndex--;
        else if (from > currentInstanceIndex && to <= currentInstanceIndex) currentInstanceIndex++;
        refreshInstances();
      });
      // 设置索引重复状态与选中状态
      const tooltipParts = [];
      const duplicateEntry = duplicatesByIndex.get(idx);
      if (duplicateEntry) {
        li.classList.add('duplicate-index');
        const displayValue = duplicateEntry.value !== '' ? duplicateEntry.value : '（空）';
        tooltipParts.push(`索引值重复：${displayValue}`);
      }
      const duplicateIdEntry = duplicatesById.get(idx);
      if (duplicateIdEntry) {
        li.classList.add('duplicate-id');
        const displayId = duplicateIdEntry.value !== '' ? duplicateIdEntry.value : '（空）';
        const idEntries = Array.isArray(duplicateIdEntry.entries) ? duplicateIdEntry.entries : [];
        const idPositions = idEntries
          .map((item) => (item && Number.isInteger(item.idx) ? item.idx + 1 : null))
          .filter((pos) => pos != null);
        const idDetailParts = [];
        if (idEntries.length > 0) {
          idDetailParts.push(`共 ${idEntries.length} 项`);
        }
        if (idPositions.length > 0) {
          idDetailParts.push(`位置 ${idPositions.join(', ')}`);
        }
        const idDetailSuffix = idDetailParts.length > 0 ? `（${idDetailParts.join('，')}）` : '';
        tooltipParts.push(`ID 重复${idDetailSuffix}：${displayId}`);
      }
      const invalidReference = invalidInstanceMap.get(idx);
      if (invalidReference && invalidReference.hasInvalid) {
        li.classList.add('invalid-reference');
        const invalidDetails = Array.from(invalidReference.invalidParams.entries())
          .map(([name, reason]) => `${name}: ${reason}`)
          .join('；');
        if (invalidDetails) {
          tooltipParts.push(`索引引用错误：${invalidDetails}`);
        }
      }
      if (tooltipParts.length > 0) {
        li.title = tooltipParts.join('\n');
      } else {
        li.removeAttribute('title');
      }
      if (selectedInstances.has(idx)) li.classList.add('active');
      let instanceExportSelected = false;
      if (exportSelectionMode) {
        instanceExportSelected = isInstanceSelectedForExport(tpl, inst);
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = instanceExportSelected;
        checkbox.addEventListener('click', (e) => {
          e.stopPropagation();
          handleInstanceExportCheckbox(templateIdxForExport, idx, instanceExportSelected, e);
        });
        li.appendChild(checkbox);
      }
      const nameSpan = document.createElement('span');
      nameSpan.textContent = `${inst.id}: ${inst.name}`;
      setInvalidNameVisual(nameSpan, isPureNumericName(inst.name));
      li.appendChild(nameSpan);
      const compareText = buildInstanceCompareText(tpl, inst);
      if (compareText) {
        const compareSpan = document.createElement('span');
        compareSpan.className = 'instance-compare-values';
        compareSpan.textContent = ` ${compareText}`;
        li.appendChild(compareSpan);
      }
      li.addEventListener('click', (e) => {
        if (e.ctrlKey) {
          // Ctrl+点击：切换该实例选中状态
          if (selectedInstances.has(idx)) {
            selectedInstances.delete(idx);
          } else {
            selectedInstances.add(idx);
          }
          const arr = Array.from(selectedInstances).sort((a,b)=>a-b);
          if (arr.length > 0) {
            currentInstanceIndex = arr[arr.length - 1];
          } else {
            currentInstanceIndex = -1;
          }
          // 更新实例锚点
          anchorInstance = currentInstanceIndex >= 0 ? currentInstanceIndex : null;
        } else if (e.shiftKey) {
          // 如果未设置实例锚点，则以当前实例索引为锚点
          if (anchorInstance === null) {
            anchorInstance = currentInstanceIndex >= 0 ? currentInstanceIndex : idx;
          }
          const start = Math.min(anchorInstance, idx);
          const end = Math.max(anchorInstance, idx);
          selectedInstances.clear();
          for (let i = start; i <= end; i++) {
            selectedInstances.add(i);
          }
          currentInstanceIndex = idx;
          // 更新实例锚点
          anchorInstance = idx;
        } else {
          // 单击已选中的唯一实例 => 取消选中
          if (selectedInstances.has(idx) && selectedInstances.size === 1) {
            selectedInstances.clear();
            currentInstanceIndex = -1;
            instanceNameInput.value = '';
            // 清除参数选择与锚点
            selectedParams.clear();
            editingParamIndex = -1;
            anchorParam = null;
            refreshInstances();
            refreshParams();
            lastSelectedCategory = 'instance';
            e.stopPropagation();
            return;
          }
          selectedInstances.clear();
          selectedInstances.add(idx);
          currentInstanceIndex = idx;
          // 更新实例锚点
          anchorInstance = idx;
        }
        instanceNameInput.value = (currentTemplateIndex >= 0 && currentInstanceIndex >= 0)
          ? templates[currentTemplateIndex].instances[currentInstanceIndex].name
          : '';
        updateInstanceNameInputValidity();
        // 切换实例时清除参数选择
        selectedParams.clear();
        editingParamIndex = -1;
        // 清除参数锚点
        anchorParam = null;
        refreshInstances();
        refreshParams();
        lastSelectedCategory = 'instance';
        e.stopPropagation();
      });
      instanceListEl.appendChild(li);
    });
    // 应用实例搜索过滤
    filterList(instanceListEl, searchInstancesInput.value);
    updateInstanceNameInputValidity();
    updateInstanceIdInputState(duplicateIdInfo);
    if (isSheetModeActive()) {
      if (sheetActiveTemplateIndex === currentTemplateIndex && currentInstanceIndex >= 0) {
        sheetActiveInstanceIndex = currentInstanceIndex;
      }
      updateSheetInstanceTabs();
      if (!sheetModeDirty && sheetActiveTemplateIndex === currentTemplateIndex) {
        const tpl = templates[currentTemplateIndex];
        const expectedCount = tpl?.instances?.length || 0;
        const expectedSignature = getTemplateParameterSignature(tpl);
        if (
          sheetRenderedTemplateIndex !== sheetActiveTemplateIndex ||
          sheetRenderedInstanceCount !== expectedCount ||
          sheetRenderedParameterSignature !== expectedSignature
        ) {
          renderLuckysheetForActiveInstance();
        }
      }
    }
  }

  /**
   * 刷新参数列表
   */
  function refreshParams() {
    paramListEl.innerHTML = "";
    paramListEl.classList.remove('has-invalid-reference');
    paramListEl.removeAttribute('title');
    updateParamTypeSelectEnabledState();
    updateParamNameInputEnabledState();
    refreshParamTypeOptions();
    updateIndexTemplateOptions();
    if (currentTemplateIndex < 0 || currentInstanceIndex < 0) {
      updateParamNameInputValidity();
      return;
    }
    const tpl = templates[currentTemplateIndex];
    const inst = tpl.instances[currentInstanceIndex];
    const indexValidation = evaluateInstanceIndexValidation(tpl, inst);
    if (indexValidation.hasInvalid) {
      const tooltip = Array.from(indexValidation.invalidParams.entries())
        .map(([name, reason]) => `${name}: ${reason}`)
        .join('\n');
      if (tooltip) {
        paramListEl.title = tooltip;
      } else {
        paramListEl.removeAttribute('title');
      }
    } else {
      paramListEl.removeAttribute('title');
    }
    const isEnumTpl = isEnumTemplate(tpl);
    if (isEnumTpl) {
      enforceEnumIndexField(tpl);
    }
    // 保留字段
    const reserved = [
      { name: "template", type: "string" },
      { name: "id", type: "int" },
      { name: "name", type: "string" },
      { name: "index", type: "string" },
    ];
    reserved.forEach((f) => {
      const item = document.createElement("div");
      item.classList.add("param-item", "reserved");
      const label = document.createElement("label");
      label.textContent = f.name;
      item.appendChild(label);
      if (f.name === 'index') {
        const select = document.createElement('select');
        const candidates = isEnumTpl
          ? ['id']
          : ['id', 'name', ...tpl.parameters.map((p) => p.name).filter((n) => n !== 'index')];
        candidates.forEach((n) => {
          const opt = document.createElement('option');
          opt.value = n;
          opt.textContent = n;
          select.appendChild(opt);
        });
        select.value = tpl.indexField || 'id';
        if (isEnumTpl) {
          select.disabled = true;
          select.title = 'enum 模板的索引固定为 id';
        } else {
          select.addEventListener('change', () => {
            tpl.indexField = select.value || 'id';
            tpl.instances.forEach((one) => {
              const vv = getValueByFieldForInstance(tpl, one, tpl.indexField);
              if (!one.payload) one.payload = {};
              one.payload.index = vv == null ? '' : String(vv);
            });
            refreshInstances();
            refreshParams();
          });
        }
        const valueSpan = document.createElement('span');
        valueSpan.style.flex = '1';
        const vNow = getValueByFieldForInstance(tpl, inst, tpl.indexField || 'id');
        valueSpan.textContent = vNow == null ? '' : String(vNow);
        if (!inst.payload) inst.payload = {};
        inst.payload.index = valueSpan.textContent;
        item.appendChild(select);
        item.appendChild(valueSpan);
        item.addEventListener('mousedown', (evt) => {
          if (evt.button !== 0 || !evt.altKey) return;
          evt.preventDefault();
          evt.stopPropagation();
          jumpToDuplicateIndexInstance(tpl, inst);
        });
      } else {
        const span = document.createElement("span");
        span.textContent = inst.payload[f.name];
        span.style.flex = '1';
        item.appendChild(span);
      }
      paramListEl.appendChild(item);
    });
    // enum：参数与实例对应，使用实例自身的数字键渲染并返回
    if (isEnumTpl) {
      const keys = getEnumParamKeysForInstance(tpl, inst);
      keys.forEach((key, idx) => {
        const item = document.createElement('div');
        item.classList.add('param-item');
        const label = document.createElement('label');
        label.textContent = key;
        item.appendChild(label);
        if (selectedParams.has(idx)) item.classList.add('active');
        const inputEl = document.createElement('input');
        inputEl.type = 'text';
        inputEl.style.flex = '1';
        inputEl.value = inst.payload && inst.payload[key] != null ? String(inst.payload[key]) : '';
        const updateEnumValueValidity = () => {
          setInvalidNameVisual(inputEl, isPureNumericName(inputEl.value));
        };
        updateEnumValueValidity();
        // 防止点击输入框触发父级选择逻辑，打断编辑
        inputEl.addEventListener('mousedown', (e) => e.stopPropagation());
        inputEl.addEventListener('click', (e) => e.stopPropagation());
        inputEl.addEventListener('keydown', (e) => e.stopPropagation());
        inputEl.addEventListener('input', () => {
          updateEnumValueValidity();
        });
        inputEl.addEventListener('change', () => {
          if (!inst.payload) inst.payload = {};
          inst.payload[key] = inputEl.value;
          updateEnumValueValidity();
        });
        item.appendChild(inputEl);
        const del = document.createElement('button');
        del.className = 'delete-param';
        del.textContent = '删除';
        del.addEventListener('click', (e) => { e.stopPropagation(); deleteParam(idx); });
        item.appendChild(del);
        item.addEventListener('click', (e) => {
          if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON')) return;
          if (e.ctrlKey) {
            if (selectedParams.has(idx)) selectedParams.delete(idx); else selectedParams.add(idx);
            const arr = Array.from(selectedParams).sort((a, b) => a - b);
            editingParamIndex = arr.length > 0 ? arr[arr.length - 1] : -1;
          } else if (e.shiftKey) {
            if (anchorParam === null) anchorParam = editingParamIndex >= 0 ? editingParamIndex : idx;
            const start = Math.min(anchorParam, idx);
            const end = Math.max(anchorParam, idx);
            selectedParams.clear();
            for (let i = start; i <= end; i++) selectedParams.add(i);
            editingParamIndex = idx;
            anchorParam = idx;
          } else {
            if (selectedParams.has(idx) && selectedParams.size === 1) {
              selectedParams.clear();
              editingParamIndex = -1;
              anchorParam = null;
            } else {
              selectedParams.clear();
              selectedParams.add(idx);
              editingParamIndex = idx;
              anchorParam = idx;
            }
          }
          refreshParams();
          lastSelectedCategory = 'param';
        });
        paramListEl.appendChild(item);
      });
      // 过滤（仅文本值可被过滤）
      filterList(paramListEl, searchParamsInput.value, true);
      updateParamNameInputValidity();
      return;
    }
    // 自定义参数
    tpl.parameters.forEach((p, idx) => {
      const item = document.createElement("div");
      item.classList.add("param-item");
      const label = document.createElement('label');
      label.textContent = p.name;
      setInvalidNameVisual(label, isPureNumericName(p.name));
      item.appendChild(label);
      if (selectedParams.has(idx)) item.classList.add('active');
      const invalidReason = indexValidation.invalidParams.get(p.name);
      if (invalidReason) {
        item.classList.add('invalid-reference');
        item.title = invalidReason;
      }
      if (p.parameterIndexes) {
        const info = document.createElement('span');
        info.textContent = `索引：${p.parameterIndexes.template} → ${p.parameterIndexes.param}`;
        info.style.marginRight = '8px';
        item.appendChild(info);

        // 为索引参数提供可编辑的 value 输入框（并规范化存储结构）
        let refObj = inst.payload[p.name];
        if (refObj == null) {
          refObj = { template: p.parameterIndexes.template, by: p.parameterIndexes.param, value: '' };
          inst.payload[p.name] = refObj;
        } else if (typeof refObj !== 'object') {
          refObj = { template: p.parameterIndexes.template, by: p.parameterIndexes.param, value: String(refObj) };
          inst.payload[p.name] = refObj;
        } else {
          refObj.template = p.parameterIndexes.template;
          refObj.by = p.parameterIndexes.param;
          if (refObj.value == null) refObj.value = '';
        }

        // datalist 建议（来自目标模板对应字段的值）
        const suggestId = `idx-suggest-${p.name}`;
        const dataList = document.createElement('datalist');
        dataList.id = suggestId;
        const targetTpl = templates.find(t => t.name === p.parameterIndexes.template);
        if (targetTpl && !isEnumTemplate(targetTpl)) {
          targetTpl.instances.forEach((it, instIdx) => {
            const v = it.payload ? it.payload[p.parameterIndexes.param] : undefined;
            const sv = v == null ? '' : String(v);
            if (!sv) return;
            const rawName = getInstanceFieldValue(it, 'name', targetTpl.name);
            const instName = rawName != null && String(rawName).trim() !== ''
              ? String(rawName).trim()
              : (() => {
                  const idValue = getInstanceFieldValue(it, 'id', targetTpl.name);
                  if (idValue != null && String(idValue).trim() !== '') {
                    return `ID:${String(idValue).trim()}`;
                  }
                  return `实例${instIdx + 1}`;
                })();
            const opt = document.createElement('option');
            opt.value = sv;
            const label = `${sv}（${instName}）`;
            opt.label = label;
            opt.textContent = label;
            dataList.appendChild(opt);
          });
        }
        item.appendChild(dataList);

        const inputElIdx = document.createElement('input');
        inputElIdx.type = 'text';
        inputElIdx.style.flex = '1';
        inputElIdx.placeholder = '索引值';
        inputElIdx.setAttribute('list', suggestId);
        inputElIdx.value = refObj.value ?? '';
        inputElIdx.addEventListener('change', () => {
          let obj = inst.payload[p.name];
          if (!obj || typeof obj !== 'object') {
            obj = { template: p.parameterIndexes.template, by: p.parameterIndexes.param, value: '' };
            inst.payload[p.name] = obj;
          }
          // 若索引目标是 enum，阻止写入
          const tt = templates.find(t => t.name === p.parameterIndexes.template);
          if (tt && isEnumTemplate(tt)) {
            showMessage('索引目标不能是 enum 模板');
            indexTemplateSelect.value = '';
            updateIndexParamOptions();
            obj.template = '';
            obj.by = '';
          } else {
            obj.template = p.parameterIndexes.template;
            obj.by = p.parameterIndexes.param;
          }
          obj.value = inputElIdx.value;
        });
        item.appendChild(inputElIdx);
      } else {
        let inputEl;
        let value = inst.payload[p.name];
        if (isEnumType(p.type)) {
          const def = getEnumDefinition(p.type);
          const select = document.createElement('select');
          select.style.flex = '1';
          // 防止选择下拉时触发父级点击，导致取消选择或刷新
          select.addEventListener('mousedown', (e) => e.stopPropagation());
          select.addEventListener('click', (e) => e.stopPropagation());
          const enumValues = def ? def.values : [];
          value = convertValueForType(value, p.type);
          if (inst.payload[p.name] !== value) {
            inst.payload[p.name] = value;
          }
          if (enumValues && enumValues.length > 0) {
            enumValues.forEach((val) => {
              const opt = document.createElement('option');
              opt.value = val;
              opt.textContent = val;
              select.appendChild(opt);
            });
          }
          if (value && (!enumValues || !enumValues.includes(value))) {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = value;
            select.appendChild(opt);
          }
          select.value = value ?? '';
          if (!enumValues || enumValues.length === 0) {
            select.disabled = true;
          }
          inputEl = select;
        } else {
          switch (p.type) {
            case 'string':
              inputEl = document.createElement('input');
              inputEl.type = 'text';
              inputEl.value = value ?? '';
              break;
            case 'int':
            case 'long':
            case 'float':
              inputEl = document.createElement('input');
              inputEl.type = 'number';
              inputEl.value = value ?? 0;
              break;
            case 'bool':
              inputEl = document.createElement('input');
              inputEl.type = 'checkbox';
              inputEl.checked = !!value;
              break;
            case 'list':
            // 列表类型：渲染为多个子输入 + 操作按钮
            let arr = Array.isArray(value) ? value.slice() : [];
            if (arr.length === 0) arr = [""];
            inst.payload[p.name] = arr;
            const listWrap = document.createElement('div');
            listWrap.style.display = 'flex';
            listWrap.style.flexDirection = 'column';
            listWrap.style.flex = '1';
            const renderList = () => {
              listWrap.innerHTML = '';
              arr.forEach((val, i) => {
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.gap = 'calc(4px * var(--row-scale))';
                row.style.marginBottom = 'calc(4px * var(--row-scale))';
                const inp = document.createElement('input');
                inp.type = 'text';
                inp.value = val ?? '';
                inp.style.flex = '1';
                inp.addEventListener('change', () => {
                  inst.payload[p.name][i] = inp.value;
                });
                row.appendChild(inp);
                listWrap.appendChild(row);
              });
            };
            renderList();
            item.appendChild(listWrap);
            const addBtn = document.createElement('button');
            addBtn.textContent = '增加元素';
            addBtn.classList.add('list-control-btn');
            addBtn.addEventListener('click', (e2) => {
              e2.stopPropagation();
              inst.payload[p.name].push('');
              arr = inst.payload[p.name];
              renderList();
            });
            const removeBtn = document.createElement('button');
            removeBtn.textContent = '删除元素';
            removeBtn.classList.add('list-control-btn');
            removeBtn.addEventListener('click', (e2) => {
              e2.stopPropagation();
              if (inst.payload[p.name].length > 1) {
                inst.payload[p.name].pop();
                arr = inst.payload[p.name];
                renderList();
              }
            });
            item.appendChild(addBtn);
            item.appendChild(removeBtn);
            // 跳过通用 inputEl 追加
            inputEl = null;
            break;
          case 'object':
            inputEl = document.createElement('input');
            inputEl.type = 'text';
            inputEl.value = value && typeof value === 'object' ? JSON.stringify(value) : '';
              break;
            default:
              inputEl = document.createElement('input');
              inputEl.type = 'text';
              inputEl.value = value ?? '';
          }
        }
        if (inputEl) {
          if (inputEl.tagName !== 'SELECT') {
            inputEl.style.flex = '1';
          }
          inputEl.addEventListener('change', () => updateParamValue(idx, inputEl));
          item.appendChild(inputEl);
        }
      }
      const del = document.createElement('button');
      del.className = 'delete-param';
      del.textContent = '删除';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteParam(idx);
      });
      item.appendChild(del);
      // 单击参数项选择/取消选择，或执行 Alt 跳转
        item.addEventListener('click', (e) => {
          // 点击输入/选择/删除不触发选择逻辑
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return;
        // Alt+点击：若为索引参数则跳转
        if (e.altKey && p.parameterIndexes) {
          // 将当前参数选择压栈
          pushParamHistory();
          const ref = inst.payload[p.name];
          const targetTplName = ref && typeof ref === 'object' ? (ref.template || p.parameterIndexes.template) : p.parameterIndexes.template;
          const byField = ref && typeof ref === 'object' ? (ref.by || p.parameterIndexes.param) : p.parameterIndexes.param;
          const byValue = ref && typeof ref === 'object' ? (ref.value ?? '') : '';
          // 禁止跳转到 enum 模板
          if (isEnumTemplate({ name: targetTplName })) {
            showMessage('索引目标不能是 enum 模板');
            return;
          }
          const tIdx = templates.findIndex(t => t.name === targetTplName);
          if (tIdx < 0) {
            showMessage('未找到目标模板');
            return;
          }
          currentTemplateIndex = tIdx;
          selectedTemplates.clear();
          selectedTemplates.add(tIdx);
          const t = templates[tIdx];
          let iIdx = -1;
          for (let i = 0; i < t.instances.length; i++) {
            const v = t.instances[i].payload ? t.instances[i].payload[byField] : undefined;
            if ((v !== undefined && v !== null) && String(v) === String(byValue)) { iIdx = i; break; }
          }
        if (iIdx < 0) {
          showMessage('未找到符合索引值的实例');
          // 仍然跳到模板，清空实例与参数
          currentInstanceIndex = -1;
          selectedInstances.clear();
          selectedParams.clear();
          editingParamIndex = -1;
        } else {
          currentInstanceIndex = iIdx;
          selectedInstances.clear();
          selectedInstances.add(iIdx);
          // 选中目标字段对应的参数（若存在）
          const pIdx = t.parameters.findIndex(pp => pp.name === byField);
          selectedParams.clear();
          if (pIdx >= 0) {
            selectedParams.add(pIdx);
            editingParamIndex = pIdx;
          } else {
            editingParamIndex = -1;
            showMessage('目标字段为系统字段或不存在，未选中参数');
          }
        }
        templateNameInput.value = templates[currentTemplateIndex]?.name || '';
        instanceNameInput.value = (currentTemplateIndex >= 0 && currentInstanceIndex >= 0) ? templates[currentTemplateIndex].instances[currentInstanceIndex].name : '';
        // 同步编辑区域，避免残留上一次的参数信息
        showSelectedParamDetails();
        refreshTemplates();
        refreshInstances();
        refreshParams();
        updateIndexTemplateOptions();
        lastSelectedCategory = 'param';
        e.stopPropagation();
        return;
      }
        if (e.ctrlKey) {
          // Ctrl+点击：切换该参数选中状态
          pushParamHistory();
          if (selectedParams.has(idx)) {
            selectedParams.delete(idx);
          } else {
            selectedParams.add(idx);
          }
          const arr = Array.from(selectedParams).sort((a,b)=>a-b);
          editingParamIndex = arr.length > 0 ? arr[arr.length - 1] : -1;
          anchorParam = editingParamIndex >= 0 ? editingParamIndex : null;
        } else if (e.shiftKey) {
          // 如果未设置锚点，则以当前正在编辑的参数或本次索引为锚点
          pushParamHistory();
          if (anchorParam === null) {
            if (editingParamIndex >= 0) {
              anchorParam = editingParamIndex;
            } else {
              anchorParam = idx;
            }
          }
          const start = Math.min(anchorParam, idx);
          const end = Math.max(anchorParam, idx);
          selectedParams.clear();
          for (let i = start; i <= end; i++) {
            selectedParams.add(i);
          }
          editingParamIndex = idx;
          anchorParam = idx;
        } else {
          // 普通点击前，记录当前参数到历史
          if (editingParamIndex !== idx) pushParamHistory();
          // 单击已选中的唯一参数 => 取消选中
          if (selectedParams.has(idx) && selectedParams.size === 1) {
            selectedParams.clear();
            editingParamIndex = -1;
            anchorParam = null;
          } else {
            selectedParams.clear();
            selectedParams.add(idx);
            editingParamIndex = idx;
            anchorParam = idx;
          }
        }
        showSelectedParamDetails();
        refreshParams();
        lastSelectedCategory = 'param';
        e.stopPropagation();
      });
      paramListEl.appendChild(item);
    });
    // 应用参数搜索过滤
    filterList(paramListEl, searchParamsInput.value, true);
    updateParamNameInputValidity();
  }

  /**
   * 更新参数值
   */
  function updateParamValue(paramIndex, inputEl) {
    if (currentTemplateIndex < 0 || currentInstanceIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    const inst = tpl.instances[currentInstanceIndex];
    const param = tpl.parameters[paramIndex];
    if (!inst.payload) inst.payload = {};
    let shouldRefreshInstances = compareValueState.active && compareValueState.templateUid === tpl.__uid;
    switch (param.type) {
      case "string":
        inst.payload[param.name] = inputEl.value;
        break;
      case "int":
        inst.payload[param.name] = parseInt(inputEl.value) || 0;
        break;
      case "long":
        inst.payload[param.name] = parseInt(inputEl.value) || 0;
        break;
      case "float":
        inst.payload[param.name] = parseFloat(inputEl.value) || 0;
        break;
      case "bool":
        inst.payload[param.name] = inputEl.checked;
        break;
      case "list":
        // 不使用通用处理（列表已在专用 UI 内处理），这里保底支持逗号分隔
        inst.payload[param.name] = inputEl.value ? inputEl.value.split(/\s*,\s*/) : [""];
        break;
      case "object":
        try {
          inst.payload[param.name] = inputEl.value ? JSON.parse(inputEl.value) : {};
        } catch (err) {
          alert("对象格式需为合法 JSON");
        }
        break;
      default:
        inst.payload[param.name] = inputEl.value;
    }
    if (tpl.indexField === param.name) {
      const newIndexValue = computeExpectedIndexValue(tpl, inst, tpl.indexField);
      inst.payload.index = newIndexValue == null ? '' : String(newIndexValue);
      shouldRefreshInstances = true;
    }
    if (shouldRefreshInstances) {
      refreshInstances();
    }
  }

  /**
   * 根据当前选择的参数显示其信息到表单
   */
  function showSelectedParamDetails() {
    if (currentTemplateIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    updateParamTypeSelectEnabledState();
    updateIndexTemplateOptions();
    if (selectedParams.size === 0) {
      // 没有选中，重置输入
      paramNameInput.value = '';
      paramTypeSelect.value = 'string';
      updateParamNameInputValidity();
      if (!indexTemplateSelect.disabled) {
        indexTemplateSelect.value = '';
        updateIndexParamOptions();
      } else {
        indexParamSelect.value = '';
      }
      editingParamIndex = -1;
      $('newParam').textContent = '新建参数';
      updateIndexTemplateOptions();
      return;
    }
    const idxs = Array.from(selectedParams);
    const idx = idxs[idxs.length - 1];
    const p = tpl.parameters[idx];
    if (!p) return;
    editingParamIndex = idx;
    paramNameInput.value = p.name;
    updateParamNameInputValidity();
    paramTypeSelect.value = p.type;
    if (isEnumTemplate(tpl)) {
      paramTypeSelect.value = 'string';
    }
    updateIndexTemplateOptions();
    // 设置索引下拉
    if (!indexTemplateSelect.disabled) {
      if (p.parameterIndexes) {
        indexTemplateSelect.value = p.parameterIndexes.template;
        updateIndexParamOptions();
        indexParamSelect.value = p.parameterIndexes.param;
      } else {
        indexTemplateSelect.value = '';
        updateIndexParamOptions();
      }
    }
    $('newParam').textContent = '更新参数';
  }

  /**
   * 快捷键处理
   */
  function handleCopy() {
    if (lastSelectedCategory === 'param') {
      copyParams();
    } else if (lastSelectedCategory === 'instance') {
      copyInstance();
    } else if (lastSelectedCategory === 'template') {
      copyTemplates();
    }
  }
  function handlePaste() {
    if (!copyBuffer) return;
    if (copyBuffer.type === 'param') {
      const tpl = templates[currentTemplateIndex];
      if (tpl && isEnumTemplate(tpl)) {
        // enum 使用实例局部粘贴
        if (currentTemplateIndex < 0 || currentInstanceIndex < 0) return;
        const inst = templates[currentTemplateIndex].instances[currentInstanceIndex];
        if (!inst.payload) inst.payload = {};
        (copyBuffer.items || []).forEach((obj) => {
          const exist = Object.keys(inst.payload).filter(k=>/^\d+$/.test(k)).map(k=>parseInt(k,10));
          let n = 0; while (exist.includes(n)) n++;
          inst.payload[String(n)] = obj && Object.prototype.hasOwnProperty.call(obj,'value') ? obj.value : '';
        });
        refreshParams();
        showMessage(`已粘贴 ${copyBuffer.items.length} 个参数`);
      } else {
        pasteParams();
      }
    } else if (copyBuffer.type === 'instance') {
      pasteInstance();
    } else if (copyBuffer.type === 'template') {
      pasteTemplates();
    }
  }
  function handleDelete() {
    if (lastSelectedCategory === 'param') {
      deleteParams();
    } else if (lastSelectedCategory === 'instance') {
      deleteInstance();
    } else if (lastSelectedCategory === 'template') {
      deleteTemplates();
    }
  }

  /**
   * 复制模板
   */
  function copyTemplates() {
    if (templates.length === 0) return;
    let indices = Array.from(selectedTemplates);
    if (indices.length === 0 && currentTemplateIndex >= 0) indices = [currentTemplateIndex];
    if (indices.length === 0) {
      alert('请选择要复制的模板');
      return;
    }
    const items = indices.map((idx) => JSON.parse(JSON.stringify(templates[idx])));
    items.forEach((tpl) => {
      if (tpl && tpl.__uid) delete tpl.__uid;
    });
    copyBuffer = { type: 'template', items };
    showMessage(`已复制 ${items.length} 个模板`);
  }

  /**
   * 粘贴模板
   */
  function pasteTemplates() {
    if (!copyBuffer || copyBuffer.type !== 'template' || !copyBuffer.items) return;
    copyBuffer.items.forEach((srcTpl) => {
      let newName = srcTpl.name;
      // 处理重名
      while (templates.some((t) => t.name === newName)) {
        newName = `${newName}_复制`;
      }
      const newTpl = JSON.parse(JSON.stringify(srcTpl));
      newTpl.name = newName;
      delete newTpl.__uid;
      // 更新实例中的 template 字段和 id
      newTpl.instances.forEach((inst, idx) => {
        inst.id = idx;
        inst.name = `${inst.name}`;
        inst.payload.template = newName;
        inst.payload.id = idx;
        inst.payload.name = inst.name;
      });
      ensureTemplateUid(newTpl);
      newTpl.__fromDisk = false;
      templates.push(newTpl);
    });
    refreshTemplates();
    showMessage(`已粘贴 ${copyBuffer.items.length} 个模板`);
  }

  /**
   * 删除模板
   */
  function deleteTemplates() {
    if (templates.length === 0) return;
    let indices = Array.from(selectedTemplates);
    if (indices.length === 0 && currentTemplateIndex >= 0) indices = [currentTemplateIndex];
    if (indices.length === 0) {
      alert('请选择要删除的模板');
      return;
    }
    indices.sort((a, b) => b - a);
    indices.forEach((idx) => {
      const tpl = templates[idx];
      if (tpl && tpl.__uid) {
        lastSavedStructureSnapshot.delete(tpl.__uid);
      }
      if (tpl && tpl.__fromDisk) {
        if (!templates.some((t, currentIdx) => currentIdx !== idx && t && t.name === tpl.name)) {
          pendingTemplateDeletions.set(tpl.name, { name: tpl.name, deletedAt: Date.now() });
        }
      }
      templates.splice(idx, 1);
    });
    // 更新当前模板索引
    if (templates.length === 0) {
      currentTemplateIndex = -1;
      currentInstanceIndex = -1;
    } else {
      currentTemplateIndex = 0;
      currentInstanceIndex = templates[0].instances.length > 0 ? 0 : -1;
    }
    selectedTemplates.clear();
    selectedInstances.clear();
    selectedParams.clear();
    editingParamIndex = -1;
    refreshTemplates();
    refreshInstances();
    refreshParams();
    showMessage(`已删除 ${indices.length} 个模板`);
  }

  /**
   * 复制参数
   */
  function copyParams() {
    if (currentTemplateIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    let indices = Array.from(selectedParams);
    if (indices.length === 0) {
      alert('请选择要复制的参数');
      return;
    }
    if (isEnumTemplate(tpl)) {
      if (currentInstanceIndex < 0) { alert('请先选择一个实例'); return; }
      const inst = tpl.instances[currentInstanceIndex];
      const keys = getEnumParamKeysForInstance(tpl, inst);
      const items = indices.map((idx) => ({ value: inst.payload[keys[idx]] }));
      copyBuffer = { type: 'param', items, enumMode: true };
    } else {
      // 深拷贝参数定义，并保存每个参数在所有实例中的值
      const items = indices.map((idx) => {
        const param = JSON.parse(JSON.stringify(tpl.parameters[idx]));
        const values = tpl.instances.map((inst) => inst.payload[param.name]);
        return { param, values };
      });
      copyBuffer = { type: 'param', items };
    }
    showMessage(`已复制 ${items.length} 个参数`);
  }

  /**
   * 粘贴参数
   */
  function pasteParams() {
    if (currentTemplateIndex < 0) return;
    if (!copyBuffer || copyBuffer.type !== 'param' || !copyBuffer.items) return;
    const tpl = templates[currentTemplateIndex];
    copyBuffer.items.forEach((obj) => {
      let newName = isEnumTemplate(tpl) ? String(tpl.parameters.length) : obj.param.name;
      while (tpl.parameters.some((p) => p.name === newName)) {
        newName = `${newName}_复制`;
      }
      const newParam = JSON.parse(JSON.stringify(obj.param));
      newParam.name = newName;
      if (isEnumTemplate(tpl)) {
        newParam.type = 'string';
        delete newParam.parameterIndexes;
      }
      tpl.parameters.push(newParam);
      // 为每个实例复制值
      tpl.instances.forEach((inst, idx) => {
        inst.payload[newName] = obj.values[idx];
      });
    });
    if (isEnumTemplate(tpl)) {
      ensureEnumParamNaming(tpl);
    }
    refreshParams();
    showMessage(`已粘贴 ${copyBuffer.items.length} 个参数`);
  }

  /**
   * 删除参数
   */
  function deleteParams() {
    if (currentTemplateIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    let indices = Array.from(selectedParams);
    if (indices.length === 0) {
      alert('请选择要删除的参数');
      return;
    }
    indices.sort((a, b) => b - a);
    if (isEnumTemplate(tpl)) {
      if (currentInstanceIndex < 0) return;
      const inst = tpl.instances[currentInstanceIndex];
      const keys = Object.keys(inst.payload || {}).filter(k=>/^\d+$/.test(k)).map(k=>parseInt(k,10)).sort((a,b)=>a-b).map(n=>String(n));
      indices.forEach((idx) => {
        const key = keys[idx];
        if (key !== undefined && inst.payload) delete inst.payload[key];
      });
    } else {
      indices.forEach((idx) => {
        const param = tpl.parameters[idx];
        tpl.parameters.splice(idx, 1);
        tpl.instances.forEach((inst) => {
          delete inst.payload[param.name];
        });
      });
    }
    selectedParams.clear();
    editingParamIndex = -1;
    refreshParams();
    showMessage(`已删除 ${indices.length} 个参数`);
  }

  /**
   * 更新索引模板列表
   */
  function updateIndexTemplateOptions() {
    const currentTpl = currentTemplateIndex >= 0 ? templates[currentTemplateIndex] : null;
    const previousValue = indexTemplateSelect.value;
    indexTemplateSelect.innerHTML = "";
    const disableReason = (() => {
      if (currentTpl && isEnumTemplate(currentTpl)) return '枚举不支持索引';
      if (paramTypeSelect && isEnumType(paramTypeSelect.value)) return '枚举类型参数不支持索引';
      return null;
    })();
    if (disableReason) {
      applyIndexDisabledState(disableReason);
      return;
    }

    indexTemplateSelect.disabled = false;
    indexParamSelect.disabled = false;
    delete indexTemplateSelect.dataset.disabledReason;
    delete indexParamSelect.dataset.disabledReason;

    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '无索引';
    indexTemplateSelect.appendChild(opt0);
    // 不允许选择 enum 模板作为索引目标
    templates.forEach((tpl) => {
      if (currentTpl && (tpl === currentTpl || tpl.name === currentTpl.name)) return;
      if (isEnumTemplate(tpl)) return;
      const opt = document.createElement('option');
      opt.value = tpl.name;
      opt.textContent = tpl.name;
      indexTemplateSelect.appendChild(opt);
    });

    if (previousValue) {
      indexTemplateSelect.value = previousValue;
      if (indexTemplateSelect.value !== previousValue) {
        indexTemplateSelect.value = '';
      }
    } else {
      indexTemplateSelect.value = '';
    }

    updateIndexParamOptions();
  }

  /**
   * 根据选中的索引模板更新参数列表
   */
  function updateIndexParamOptions() {
    if (indexTemplateSelect.disabled) {
      indexParamSelect.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = indexTemplateSelect.dataset.disabledReason || '枚举不支持索引';
      indexParamSelect.appendChild(opt);
      indexParamSelect.value = '';
      indexParamSelect.disabled = true;
      indexParamSelect.dataset.disabledReason = indexTemplateSelect.dataset.disabledReason || '';
      return;
    }

    indexParamSelect.disabled = false;
    delete indexParamSelect.dataset.disabledReason;
    const tplName = indexTemplateSelect.value;
    indexParamSelect.innerHTML = "";
    if (!tplName) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "无索引";
      indexParamSelect.appendChild(opt);
      indexParamSelect.value = "";
      return;
    }
    const tpl = templates.find((t) => t.name === tplName);
    if (!tpl) return;
    if (isEnumTemplate(tpl)) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "不允许指向 enum";
      indexParamSelect.appendChild(opt);
      indexParamSelect.value = "";
      return;
    }
    const previousValue = indexParamSelect.value;
    const indexableParams = [];
    const seenNames = new Set();
    function appendParamOption(name, label) {
      if (!name || seenNames.has(name)) return;
      seenNames.add(name);
      indexableParams.push({ name, label: label || name });
    }

    appendParamOption('id', 'id');
    (tpl.parameters || [])
      .filter((p) => p && INDEXABLE_PARAM_TYPES.has(p.type))
      .forEach((p) => appendParamOption(p.name, p.name));

    if (indexableParams.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '无可用参数';
      indexParamSelect.appendChild(opt);
      indexParamSelect.value = '';
      indexParamSelect.disabled = true;
      return;
    }

    const optDef = document.createElement("option");
    optDef.value = "";
    optDef.textContent = "选择参数";
    indexParamSelect.appendChild(optDef);
    indexableParams.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.name;
      opt.textContent = p.label;
      indexParamSelect.appendChild(opt);
    });

    if (previousValue) {
      indexParamSelect.value = previousValue;
      if (indexParamSelect.value !== previousValue) {
        indexParamSelect.value = '';
      }
    } else {
      indexParamSelect.value = '';
    }
  }

  async function deleteDataEntityFileIfExists(fileName) {
    if (!dataEntityHandle || typeof dataEntityHandle.removeEntry !== 'function') return;
    try {
      await dataEntityHandle.removeEntry(fileName);
    } catch (err) {
      if (err && err.name === 'NotFoundError') {
        return;
      }
      console.warn(`删除 ${fileName} 失败`, err);
    }
  }

  async function deleteCSharpFileIfExists(templateName) {
    if (!templateName || !csharpHandle || typeof csharpHandle.removeEntry !== 'function') return;
    const fileName = `${templateName}.cs`;
    try {
      await csharpHandle.removeEntry(fileName);
    } catch (err) {
      if (err && err.name === 'NotFoundError') {
        return;
      }
      console.warn(`删除 ${fileName} 失败`, err);
    }
  }

  async function moveTemplateJsonToTrash(templateName) {
    if (!templateName || !dataEntityHandle) return { moved: false, reason: 'no-data-entity' };
    const handle = await ensureTrashDirectory();
    if (!handle) return { moved: false, reason: 'no-trash' };
    const fileName = `${templateName}.json`;
    try {
      const fileHandle = await dataEntityHandle.getFileHandle(fileName, { create: false });
      const file = await fileHandle.getFile();
      const content = await file.text();
      const destFile = await handle.getFileHandle(fileName, { create: true });
      const writable = await destFile.createWritable({ keepExistingData: false });
      await writable.write(content);
      await writable.close();
      if (typeof dataEntityHandle.removeEntry === 'function') {
        await dataEntityHandle.removeEntry(fileName);
      }
      return { moved: true };
    } catch (err) {
      if (err && err.name === 'NotFoundError') {
        return { moved: true, skipped: true };
      }
      console.warn(`移动 ${fileName} 至垃圾箱失败`, err);
      return { moved: false, error: err };
    }
  }

  function buildEnumTemplateJson(tpl) {
    if (!tpl || !isEnumTemplate(tpl)) return null;
    const indexField = 'id';
    const parameters = Array.isArray(tpl.parameters)
      ? tpl.parameters.map((param, idx) => {
          if (!param || typeof param !== 'object') return param;
          const clone = JSON.parse(JSON.stringify(param));
          clone.name = clone.name != null && clone.name !== '' ? clone.name : String(idx);
          clone.type = 'string';
          if (clone.parameterIndexes) {
            delete clone.parameterIndexes;
          }
          return clone;
        })
      : [];
    const instances = Array.isArray(tpl.instances)
      ? tpl.instances.map((inst, instIdx) => {
          if (!inst || typeof inst !== 'object') return inst;
          const clone = JSON.parse(JSON.stringify(inst));
          if (clone.id == null) {
            clone.id = instIdx;
          }
          if (!clone.payload || typeof clone.payload !== 'object') {
            clone.payload = {};
          }
          if (clone.payload.id == null) {
            clone.payload.id = clone.id;
          }
          if (clone.payload.template == null) {
            clone.payload.template = tpl.name;
          }
          if (clone.payload.name == null) {
            clone.payload.name = clone.name != null ? clone.name : '';
          }
          const indexSource = clone.payload[indexField];
          if (indexSource == null) {
            const fallback = clone.payload.id;
            clone.payload.index = fallback == null ? '' : String(fallback);
          } else {
            clone.payload.index = String(indexSource);
          }
          return clone;
        })
      : [];
    return {
      name: tpl.name,
      indexField,
      parameters,
      instances,
    };
  }

  async function writeManifestForTemplates() {
    if (!dataEntityHandle) return;
    const manifest = templates
      .filter((tpl) => !isEnumTemplate(tpl))
      .map((tpl) => ({ template: tpl.name, path: `${tpl.name}.json` }));
    await writeTextFile(
      dataEntityHandle,
      'manifest.json',
      JSON.stringify(manifest, null, 2)
    );
  }

  /**
   * 保存所有模板到文件
   */
  function askCSharpReplacementBulk(templateNames) {
    const readableList = templateNames.join('、');
    const lines = [
      '以下模板的结构发生变化，检测到 C# 脚本内容可能发生变化：',
      readableList,
      '请选择操作：',
      '1. 替换 C#，同时保存 JSON 数据',
      '2. 只保存 JSON 数据，不替换脚本',
      '3. 取消保存',
    ];
    while (true) {
      const input = prompt(lines.join('\n'), '1');
      if (input === null) return 'cancel';
      const trimmed = String(input).trim();
      if (trimmed === '1') return 'replace';
      if (trimmed === '2') return 'jsonOnly';
      if (trimmed === '3') return 'cancel';
    }
  }

  async function saveAll() {
    const commitResult = commitActiveSheetEdits();
    if (commitResult && commitResult.ok === false) {
      if (isSheetModeActive()) {
        updateSheetTemplateNav();
      }
      return;
    }
    if (!directoryHandle) {
      alert("请先选择工作目录");
      return;
    }
    try {
      if (!csharpHandle || !dataEntityHandle) {
        await ensureSubFolders();
      }
      await ensureTrashDirectory();
      const templateDecisions = new Map();
      const csCache = new Map();
      let enumTemplateSaved = false;
      const pendingStructureDecision = [];
      const trashFailures = [];
      const duplicateIdWarnings = [];

      for (const tpl of templates) {
        ensureTemplateUid(tpl);
        if (isEnumTemplate(tpl)) {
          continue;
        }
        const structureChanged = hasTemplateStructureChanged(tpl);
        if (!structureChanged) {
          templateDecisions.set(tpl.__uid, { decision: 'jsonOnly', structureChanged: false });
          continue;
        }
        const csContent = generateCSContent(tpl);
        const existingCs = await readTextFileIfExists(csharpHandle, `${tpl.name}.cs`);
        csCache.set(tpl.__uid, csContent);
        if (existingCs != null && normalizeContent(existingCs) === normalizeContent(csContent)) {
          templateDecisions.set(tpl.__uid, { decision: 'jsonOnly', structureChanged: true });
          continue;
        }
        pendingStructureDecision.push(tpl);
      }

      if (pendingStructureDecision.length > 0) {
        const answer = askCSharpReplacementBulk(pendingStructureDecision.map((tpl) => tpl.name));
        if (answer === 'cancel') {
          showMessage('已取消保存');
          return;
        }
        for (const tpl of pendingStructureDecision) {
          templateDecisions.set(tpl.__uid, {
            decision: answer === 'replace' ? 'replace' : 'jsonOnly',
            structureChanged: true,
          });
        }
      }

      for (const tpl of templates) {
        ensureTemplateUid(tpl);
        normalizeTemplateParameterIndexes(tpl);
        if (isEnumTemplate(tpl)) {
          await saveEnumTemplateCache(tpl);
          enumTemplateSaved = true;
          const enumJsonObj = buildEnumTemplateJson(tpl);
          if (enumJsonObj) {
            await writeTextFile(
              dataEntityHandle,
              `${tpl.name}.json`,
              JSON.stringify(enumJsonObj, null, 2)
            );
          }
          tpl.__fromDisk = true;
          continue;
        }
        const duplicateIdInfo = collectDuplicateIdInfo(tpl);
        const duplicateIndices = new Set(duplicateIdInfo.byIndex.keys());
        const cleanedInstances = Array.isArray(tpl.instances)
          ? tpl.instances.filter((_, idx) => !duplicateIndices.has(idx))
          : [];
        if (duplicateIndices.size > 0) {
          const values = Array.from(duplicateIdInfo.duplicates.keys()).map((key) => (key === '' ? '（空）' : key));
          duplicateIdWarnings.push({
            name: tpl.name,
            count: duplicateIndices.size,
            values,
          });
        }
        const json = JSON.stringify({
          name: tpl.name,
          indexField: tpl.indexField || 'id',
          parameters: tpl.parameters,
          instances: cleanedInstances,
        }, null, 2);
        await writeTextFile(dataEntityHandle, `${tpl.name}.json`, json);
        tpl.__fromDisk = true;
        const meta = templateDecisions.get(tpl.__uid);
        if (meta && meta.decision === 'replace') {
          const content = csCache.get(tpl.__uid) || generateCSContent(tpl);
          await writeTextFile(csharpHandle, `${tpl.name}.cs`, content);
        }
      }

      const deletionsToProcess = [];
      for (const [name] of Array.from(pendingTemplateDeletions.entries())) {
        if (templates.some((tpl) => tpl && tpl.name === name)) {
          pendingTemplateDeletions.delete(name);
          continue;
        }
        deletionsToProcess.push(name);
      }
      if (deletionsToProcess.length > 0) {
        await ensureTrashDirectory();
        for (const name of deletionsToProcess) {
          const result = await moveTemplateJsonToTrash(name);
          if (result && result.moved) {
            pendingTemplateDeletions.delete(name);
            await deleteCSharpFileIfExists(name);
          } else {
            trashFailures.push(name);
          }
        }
      }

      await generateEnumCSFiles(getEnumTemplate());

      if (!enumTemplateSaved) {
        await clearEnumTemplateCache();
        await deleteDataEntityFileIfExists('enum.json');
      }

      await writeManifestForTemplates();
      await generateRuntimeLoaderArtifacts();

      lastSavedStructureSnapshot = captureCurrentStructureSnapshot();
      await refreshTrashButtonState();
      await refreshTrashOverlayContents();
      if (duplicateIdWarnings.length > 0) {
        const detail = duplicateIdWarnings
          .map((item) => {
            const preview = item.values.slice(0, 5).join(', ');
            const suffix = item.values.length > 5 ? '…' : '';
            return `${item.name}: 跳过 ${item.count} 项（${preview}${suffix}）`;
          })
          .join('\n');
        addLogEntry('warn', '部分实例因 ID 重复未写入 JSON', { detail });
      }
      if (trashFailures.length > 0) {
        const detail = trashFailures.join(', ');
        addLogEntry('warn', '以下模板移入垃圾箱失败', { detail });
        showMessage('部分模板移入垃圾箱失败，请检查日志', 'warn');
      } else if (duplicateIdWarnings.length > 0) {
        const names = duplicateIdWarnings.map((item) => item.name).join(', ');
        showMessage(`保存完成，但以下模板存在重复 ID：${names}`, 'warn');
      } else {
        showMessage("已保存所有更改");
      }
    } catch (err) {
      console.error(err);
      showMessage("保存失败，请检查权限");
    }
  }

  async function regenerateCSharpStructures() {
    if (!directoryHandle) {
      alert('请先选择工作目录');
      return;
    }
    try {
      if (!csharpHandle || !dataEntityHandle) {
        await ensureSubFolders();
      }
      let updatedAny = false;
      for (const tpl of templates) {
        ensureTemplateUid(tpl);
        if (isEnumTemplate(tpl)) continue;
        const content = generateCSContent(tpl);
        await writeTextFile(csharpHandle, `${tpl.name}.cs`, content);
        updatedAny = true;
      }
      const enumTpl = getEnumTemplate();
      await generateEnumCSFiles(enumTpl);
      if (enumTpl) {
        updatedAny = true;
      }
      if (updatedAny) {
        showMessage('已重新生成 C# 数据结构脚本');
      } else {
        showMessage('没有可生成的 C# 数据结构脚本');
      }
      await generateRuntimeLoaderArtifacts();
    } catch (err) {
      console.error(err);
      showMessage('重新生成 C# 脚本失败，请检查权限');
    }
  }

  /**
   * 生成 C# 枚举内容
   */
  async function generateEnumCSFiles(enumTpl) {
    if (!csharpHandle) return;
    let enumDir = csharpHandle;
    let useSubDir = true;
    try {
      enumDir = await csharpHandle.getDirectoryHandle('enums', { create: true });
    } catch (err) {
      console.warn('无法访问 enums 目录，枚举将生成到 csharpDate 根目录', err);
      enumDir = csharpHandle;
      useSubDir = false;
    }
    const definitions = enumTpl ? getEnumDefinitions() : [];
    const generatedFiles = new Set();
    for (const def of definitions) {
      if (!def || !def.csharpName) continue;
      const members = [];
      const seenMembers = new Set();
      def.values.forEach((raw, idx) => {
        if (!raw) return;
        const fallback = `Member${idx + 1}`;
        const baseName = sanitizeCSharpMemberName(raw, fallback);
        let memberName = baseName;
        let suffix = 1;
        while (seenMembers.has(memberName)) {
          memberName = `${baseName}_${suffix++}`;
        }
        seenMembers.add(memberName);
        members.push({ name: memberName, original: raw });
      });
      if (members.length === 0) continue;
      const lines = [];
      lines.push('using System;');
      lines.push('');
      lines.push('[Serializable]');
      lines.push(`public enum ${def.csharpName}`);
      lines.push('{');
      members.forEach((member, index) => {
        if (member.original && member.original !== member.name) {
          lines.push(`    // ${member.original}`);
        }
        const suffix = index === members.length - 1 ? '' : ',';
        lines.push(`    ${member.name}${suffix}`);
      });
      lines.push('}');
      const fileName = `${def.csharpName}.cs`;
      const fileHandle = await enumDir.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(lines.join('\n') + '\n');
      await writable.close();
      generatedFiles.add(fileName);
    }
    if (useSubDir) {
      for await (const entry of enumDir.values()) {
        if (entry.kind === 'file' && !generatedFiles.has(entry.name)) {
          await enumDir.removeEntry(entry.name);
        }
      }
    }
  }

  /**
   * 生成 C# 内容
   */
  function generateCSContent(tpl) {
    const lines = [];
    lines.push("using System;");
    lines.push("using System.Collections.Generic;");
    lines.push("");
    lines.push("[Serializable]");
    lines.push(`public class ${tpl.name}`);
    lines.push("{");
    lines.push("    public string template;");
    lines.push("    public int id;");
    lines.push("    public string name;");
    // 根据模板的索引字段生成 index 成员
    const idxField = tpl.indexField || 'id';
    let idxType = 'string';
    if (idxField === 'id') idxType = 'long';
    else if (idxField === 'name') idxType = 'string';
    else {
      const pp = tpl.parameters.find(p => p.name === idxField);
      if (pp) idxType = mapToCSharpType(pp.type);
    }
    lines.push(`    public ${idxType} index;`);
    // 索引参数使用可复用的全局类型 DataRef（由 modelCsharpe.cs 提供）
    tpl.parameters.forEach((p) => {
      if (!p) return;
      if (p.parameterIndexes) {
        lines.push(`    public DataRef ${p.name};`);
      } else {
        const csType = mapToCSharpType(p.type);
        lines.push(`    public ${csType} ${p.name};`);
      }
    });
    lines.push("}");
    return lines.join("\n");
  }

  /**
   * 类型映射
   */
  function mapToCSharpType(type) {
    if (isEnumType(type)) {
      return getEnumCSharpTypeName(type);
    }
    switch (type) {
      case "string":
        return "string";
      case "int":
        return "int";
      case "long":
        return "long";
      case "float":
        return "float";
      case "bool":
        return "bool";
      case "list":
        return "List<object>";
      case "object":
        return "object";
      default:
        return "object";
    }
  }

  /**
   * 根据搜索内容过滤列表显示
   * @param {HTMLElement} listEl 列表容器
   * @param {string} term 搜索关键词
   * @param {boolean} isParamList 是否为参数列表
   */
  function filterList(listEl, term, isParamList = false) {
    const lower = term.trim().toLowerCase();
    const items = listEl.children;
    let visibleCount = 0;
    let lastVisibleIndex = -1;
    for (let i = 0; i < items.length; i++) {
      const el = items[i];
      let text;
      if (isParamList) {
        // 参数列表，标签在第一个 label 或 span
        const label = el.querySelector('label');
        text = label ? label.textContent : '';
      } else {
        text = el.textContent;
      }
      if (!lower || (text && text.toLowerCase().includes(lower))) {
        el.style.display = '';
        visibleCount++;
        lastVisibleIndex = i;
      } else {
        el.style.display = 'none';
      }
    }
    // 仅在存在搜索关键字时，且只有一个匹配项时自动选择
    if (visibleCount === 1 && !isParamList && lower.length > 0) {
      if (listEl === templateListEl) {
        const li = listEl.children[lastVisibleIndex];
        li.click();
      } else if (listEl === instanceListEl) {
        const li = listEl.children[lastVisibleIndex];
        li.click();
      }
    }
  }
  
  // 默认使用暗色主题并自动恢复上次工作目录
  window.addEventListener('DOMContentLoaded', async () => {
    // 默认暗色
    document.body.classList.add('dark');
    // 重新绑定选择目录按钮，选择完成后保存句柄
    const btn = document.getElementById('chooseDir');
    if (btn) {
      try { btn.removeEventListener('click', chooseDirectory); } catch {}
      btn.addEventListener('click', async () => {
        await chooseDirectory();
        try {
          if (navigator.storage && navigator.storage.persist) { try { await navigator.storage.persist(); } catch {} }
          if (directoryHandle) { await saveLastDirectoryHandle(directoryHandle); }
        } catch {}
      });
    }
    // 自动恢复
    await autoRestoreLastDirectory();
  });
})();
