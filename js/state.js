// Application state initialisation, DOM lookups, and shared utility helpers.
(() => {
  // 数据结构：模板列表
  const templates = [];
  let templateUidCounter = 0;
  let lastSavedStructureSnapshot = new Map();
  let currentTemplateIndex = -1;
  let currentInstanceIndex = -1;
  const MODE_COLUMN = 'column';
  const MODE_TABLE = 'table';
  let currentEditMode = MODE_COLUMN;
  let tableModeTemplateIndex = -1;
  const tableModeInvalidTemplates = new Set();
  const tableModeValidationErrors = new Map();
  const pendingJsonRemovals = new Set();
  const pendingCsRemovals = new Set();
  let directoryHandle = null;
  let csharpHandle = null;
  let dataEntityHandle = null;
  let modelStructHandle = null;
  let editorHandle = null;
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

  // DOM 元素获取
  const $ = (id) => document.getElementById(id);
  const templateNameInput = $("templateName");
  const instanceNameInput = $("instanceName");
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
  const templateListEl = $("templateList");
  const instanceListEl = $("instanceList");
  const paramListEl = $("paramList");
  const currentDirLabel = $("currentDir");
  const renameTemplateBtn = $("renameTemplate");
  const renameInstanceBtn = $("renameInstance");

  const NUMERIC_NAME_PATTERN = /^\d+$/;

  function isPureNumericName(name) {
    return NUMERIC_NAME_PATTERN.test(String(name || "").trim());
  }

  function setElementClassState(element, className, active) {
    if (!element) return;
    if (active) {
      element.classList.add(className);
    } else {
      element.classList.remove(className);
    }
  }

  function setInvalidNameVisual(element, invalid) {
    setElementClassState(element, 'invalid-name', invalid);
  }

  function updateTemplateNameInputValidity() {
    if (!templateNameInput) return;
    setInvalidNameVisual(templateNameInput, isPureNumericName(templateNameInput.value));
  }

  function updateInstanceNameInputValidity() {
    if (!instanceNameInput) return;
    setInvalidNameVisual(instanceNameInput, isPureNumericName(instanceNameInput.value));
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

  function hasEnumNumericIssues(tpl) {
    if (!tpl || !isEnumTemplate(tpl)) return false;
    const instances = Array.isArray(tpl.instances) ? tpl.instances : [];
    for (const inst of instances) {
      if (!inst) continue;
      const nameText = inst.name != null ? String(inst.name).trim() : '';
      if (isPureNumericName(nameText)) {
        return true;
      }
      const payload = inst.payload || {};
      const keys = getEnumParamKeysForInstance(tpl, inst);
      for (const key of keys) {
        const raw = payload[key];
        const cellText = raw == null ? '' : String(raw).trim();
        if (isPureNumericName(cellText)) {
          return true;
        }
      }
    }
    return false;
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
  const toggleModeBtn = $("toggleMode");
  const columnModeContainer = $("columnModeContainer");
  const tableModeContainer = $("tableModeContainer");
  const tableModeTabsEl = $("tableModeTabs");
  const tableModeEmptyEl = $("tableModeEmpty");
  const tableModeIndexFieldEl = $("tableModeIndexField");
  const luckysheetWrapper = $("luckysheetWrapper");
  const luckysheetEl = $("luckysheet");
  const TABLE_LOCKED_ROWS = 3;
  const TABLE_READONLY_COLUMNS = new Set([0, 1, 2]);
  let luckysheetLoadedTemplateUid = null;

  // 行高调整滑块
  const rowHeightSlider = $("rowHeight");
  const rowHeightLabel = $("rowHeightLabel");

  // 列表搜索输入
  const searchTemplatesInput = $("searchTemplates");
  const searchInstancesInput = $("searchInstances");
  const searchParamsInput = $("searchParams");

  // 拖拽选择状态
  const dragSelect = {
    isDragging: false,
    type: null,
    indices: new Set(),
  };

  let tableModeActive = false;
  let tableColumnIdCounter = 0;
  let tableModeState = {
    templateIndex: -1,
    columns: [],
    rows: [],
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

  function generateTableColumnKey() {
    tableColumnIdCounter += 1;
    return `col_${tableColumnIdCounter}`;
  }

  function cloneTableModeState() {
    return {
      templateIndex: tableModeState.templateIndex,
      columns: tableModeState.columns.map((col) => ({ ...col })),
      rows: tableModeState.rows.map((row) => row.slice()),
    };
  }

  function serializeParameterTypeForTable(param) {
    if (!param) return 'string';
    if (param.parameterIndexes && param.parameterIndexes.template && param.parameterIndexes.param) {
      const idxField = param.parameterIndexes.indexField ? `/${param.parameterIndexes.indexField}` : '';
      return `${param.type}/${param.parameterIndexes.template}/${param.parameterIndexes.param}${idxField}`;
    }
    return param.type || 'string';
  }

  function buildTableStateForTemplate(tpl, templateIndex) {
    if (!tpl) {
      return { templateIndex: templateIndex ?? -1, columns: [], rows: [] };
    }
    const indexMeta = resolveIndexFieldMeta(tpl);
    const columns = [
      { key: 'template', name: 'template', type: 'string', allowNameEdit: false, allowTypeEdit: false, allowDataEdit: false, reserved: true },
      { key: 'id', name: 'id', type: 'int', allowNameEdit: false, allowTypeEdit: false, allowDataEdit: false, reserved: true },
      { key: 'index', name: 'index', type: `${indexMeta.field}/${indexMeta.type}`, allowNameEdit: false, allowTypeEdit: false, allowDataEdit: false, reserved: true },
      { key: 'name', name: 'name', type: 'string', allowNameEdit: false, allowTypeEdit: false, allowDataEdit: true, reserved: true },
    ];
    (tpl.parameters || []).forEach((param, idx) => {
      if (!param) return;
      columns.push({
        key: param.__tableKey || `param_${idx}_${param.name || generateTableColumnKey()}`,
        name: param.name || `param_${idx}`,
        type: serializeParameterTypeForTable(param),
        allowNameEdit: true,
        allowTypeEdit: true,
        allowDataEdit: true,
        reserved: false,
      });
    });
    const rows = [];
    const instList = Array.isArray(tpl.instances) ? tpl.instances.slice() : [];
    instList.sort((a, b) => {
      const idA = getNumericInstanceId(a);
      const idB = getNumericInstanceId(b);
      const bothNumeric = Number.isFinite(idA) && Number.isFinite(idB);
      if (bothNumeric) return idA - idB;
      if (Number.isFinite(idA)) return -1;
      if (Number.isFinite(idB)) return 1;
      const strA = String(a && a.id != null ? a.id : '');
      const strB = String(b && b.id != null ? b.id : '');
      return strA.localeCompare(strB, 'zh-Hans-CN');
    });
    instList.forEach((inst) => {
      const row = [];
      row.push(tpl.name || '');
      row.push(inst && inst.id != null ? String(inst.id) : '');
      row.push(
        formatIndexCell(
          indexMeta.field,
          indexMeta.type,
          computeExpectedIndexValue(tpl, inst, indexMeta.field)
        )
      );
      row.push(inst && inst.name != null ? String(inst.name) : '');
      (tpl.parameters || []).forEach((param) => {
        if (!param) return;
        const payload = inst && inst.payload ? inst.payload : {};
        row.push(serializeValueForCsv(param, payload[param.name]));
      });
      rows.push(row);
    });
    return { templateIndex: templateIndex ?? -1, columns, rows };
  }

  function renderTableModeTemplateList() {
    if (!tableModeTemplateList || !tableModeActive) return;
    tableModeTemplateList.innerHTML = '';
    if (!templates.length) {
      const li = document.createElement('li');
      li.textContent = '暂无模板';
      li.className = 'table-mode-empty';
      tableModeTemplateList.appendChild(li);
      return;
    }
    templates.forEach((tpl, idx) => {
      const li = document.createElement('li');
      li.textContent = tpl.name;
      setInvalidNameVisual(li, isPureNumericName(tpl.name));
      if (idx === tableModeState.templateIndex) {
        li.classList.add('active');
      }
      li.addEventListener('click', () => {
        switchTableModeTemplate(idx);
      });
      tableModeTemplateList.appendChild(li);
    });
  }

  function clearTableValidationMarkers() {
    if (!tableModeContainer) return;
    tableModeContainer.querySelectorAll('.table-error').forEach((el) => el.classList.remove('table-error'));
  }

  function markTableColumnError(columnIndex) {
    if (columnIndex == null || columnIndex < 0) return;
    const headerCell = tableModeHeaderRow && tableModeHeaderRow.children[columnIndex];
    const typeCell = tableModeTypeRow && tableModeTypeRow.children[columnIndex];
    if (headerCell) headerCell.classList.add('table-error');
    if (typeCell) typeCell.classList.add('table-error');
    if (tableModeBody) {
      Array.from(tableModeBody.rows).forEach((row) => {
        const cell = row.children[columnIndex];
        if (cell) cell.classList.add('table-error');
      });
    }
    if (headerCell) {
      headerCell.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }

  function renderTableFromState(state) {
    if (!tableModeContainer) return;
    tableModeState = {
      templateIndex: state.templateIndex,
      columns: state.columns.map((col) => ({ ...col })),
      rows: state.rows.map((row) => row.slice()),
    };
    clearTableValidationMarkers();
    if (tableModeHeaderRow) tableModeHeaderRow.innerHTML = '';
    if (tableModeTypeRow) tableModeTypeRow.innerHTML = '';
    if (tableModeBody) tableModeBody.innerHTML = '';
    if (!tableModeActive) return;
    if (!tableModeHeaderRow || !tableModeTypeRow || !tableModeBody) return;
    if (!tableModeState.columns.length) {
      if (tableModeGrid) {
        tableModeGrid.innerHTML = '';
        const empty = document.createElement('div');
        empty.className = 'table-mode-empty';
        empty.textContent = '没有可显示的列';
        tableModeGrid.appendChild(empty);
      }
      return;
    }
    if (tableModeGrid) {
      tableModeGrid.innerHTML = '';
      const table = document.createElement('table');
      table.id = 'tableModeTable';
      const thead = document.createElement('thead');
      thead.appendChild(tableModeHeaderRow);
      thead.appendChild(tableModeTypeRow);
      table.appendChild(thead);
      table.appendChild(tableModeBody);
      tableModeGrid.appendChild(table);
    }
    tableModeState.columns.forEach((col, colIndex) => {
      const header = document.createElement('th');
      header.dataset.columnKey = col.key;
      header.dataset.columnIndex = String(colIndex);
      header.dataset.reserved = col.reserved ? '1' : '0';
      if (col.allowNameEdit) {
        const input = document.createElement('input');
        input.value = col.name;
        input.placeholder = '参数名';
        input.addEventListener('input', () => {
          tableModeState.columns[colIndex].name = input.value;
          if (isPureNumericName(input.value)) {
            input.classList.add('invalid-name');
          } else {
            input.classList.remove('invalid-name');
          }
        });
        input.addEventListener('keydown', (evt) => evt.stopPropagation());
        if (isPureNumericName(col.name)) {
          input.classList.add('invalid-name');
        }
        header.appendChild(input);
      } else {
        header.textContent = col.name;
      }
      tableModeHeaderRow.appendChild(header);

      const typeCell = document.createElement('th');
      if (col.allowTypeEdit) {
        const input = document.createElement('input');
        input.value = col.type || '';
        input.placeholder = '类型';
        input.addEventListener('input', () => {
          tableModeState.columns[colIndex].type = input.value;
        });
        input.addEventListener('keydown', (evt) => evt.stopPropagation());
        typeCell.appendChild(input);
      } else {
        typeCell.textContent = col.type || '';
      }
      tableModeTypeRow.appendChild(typeCell);
    });
    if (!tableModeState.rows.length) {
      const emptyRow = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = tableModeState.columns.length;
      cell.className = 'table-mode-empty';
      cell.textContent = '该模板暂无实例数据';
      emptyRow.appendChild(cell);
      tableModeBody.appendChild(emptyRow);
      return;
    }
    tableModeState.rows.forEach((rowValues, rowIndex) => {
      const rowEl = document.createElement('tr');
      tableModeState.columns.forEach((col, colIndex) => {
        const cell = document.createElement('td');
        const input = document.createElement('input');
        input.value = rowValues[colIndex] ?? '';
        if (!col.allowDataEdit) {
          input.readOnly = true;
        } else {
          input.addEventListener('input', () => {
            tableModeState.rows[rowIndex][colIndex] = input.value;
          });
        }
        input.addEventListener('keydown', (evt) => evt.stopPropagation());
        cell.appendChild(input);
        rowEl.appendChild(cell);
      });
      tableModeBody.appendChild(rowEl);
    });
  }

  function handleTableCommitError(err) {
    const message = err && err.message ? String(err.message) : '';
    let columnIndex = null;
    const matchIndex = message.match(/第\s*(\d+)\s*列/);
    if (matchIndex) {
      const parsed = Number(matchIndex[1]);
      if (Number.isFinite(parsed)) {
        columnIndex = parsed - 1;
      }
    }
    if (columnIndex == null) {
      const candidates = [];
      tableModeState.columns.forEach((col, idx) => {
        if (!col || !col.name) return;
        if (message.includes(col.name)) {
          candidates.push({ idx, weight: col.name.length });
        }
      });
      if (candidates.length > 0) {
        candidates.sort((a, b) => b.weight - a.weight);
        columnIndex = candidates[0].idx;
      }
    }
    if (columnIndex != null) {
      markTableColumnError(columnIndex);
    }
  }

  function collectTableHeadersAndTypes() {
    const headers = [];
    const types = [];
    tableModeState.columns.forEach((col) => {
      if (!col) return;
      const name = col.name != null ? String(col.name).trim() : '';
      headers.push(name);
      if (col.reserved) {
        types.push(col.type || (col.name === 'template' || col.name === 'name' ? 'string' : 'int'));
      } else {
        types.push(col.type != null ? String(col.type).trim() : '');
      }
    });
    return { headers, types };
  }

  function commitCurrentTableEdits(rebuildAfterCommit = true) {
    if (!tableModeActive) return true;
    if (tableModeState.templateIndex == null || tableModeState.templateIndex < 0) return true;
    if (!tableModeState.columns.length) return true;
    clearTableValidationMarkers();
    try {
      const { headers, types } = collectTableHeadersAndTypes();
      const numericIndex = tableModeState.columns.findIndex((col, idx) => {
        if (!col || col.reserved) return false;
        return isPureNumericName(headers[idx]);
      });
      if (numericIndex >= 0) {
        throw new Error(`第${numericIndex + 1}列列名不能为纯数字：${headers[numericIndex] || '(空)'}`);
      }
      const csvRows = [headers, types];
      tableModeState.rows.forEach((row) => {
        csvRows.push(row.map((cell) => (cell == null ? '' : String(cell))));
      });
      const csvText = rowsToCsv(csvRows);
      const parsedRows = parseCsvText(csvText);
      const tpl = buildTemplateFromCsv(parsedRows);
      const templateIndex = tableModeState.templateIndex;
      const existing = templates[templateIndex];
      if (existing) {
        tpl.__uid = existing.__uid;
        enforceImportedIndexField(tpl);
        templates[templateIndex] = tpl;
        if (currentTemplateIndex === templateIndex) {
          if (tpl.instances.length > 0) {
            const bounded = Math.min(Math.max(currentInstanceIndex, 0), tpl.instances.length - 1);
            currentInstanceIndex = Number.isFinite(bounded) ? bounded : 0;
          } else {
            currentInstanceIndex = -1;
          }
          refreshInstances();
          refreshParams();
        }
        refreshTemplates();
        if (rebuildAfterCommit) {
          const refreshed = buildTableStateForTemplate(tpl, templateIndex);
          renderTableFromState(refreshed);
        }
      }
      return true;
    } catch (err) {
      handleTableCommitError(err);
      showMessage(`表格数据格式错误：${err && err.message ? err.message : err}`, 'warn');
      return false;
    }
  }

  function switchTableModeTemplate(nextIndex) {
    if (!tableModeActive) return;
    if (nextIndex == null || nextIndex < 0 || nextIndex >= templates.length) return;
    if (tableModeState.templateIndex === nextIndex) return;
    if (!commitCurrentTableEdits()) {
      return;
    }
    const tpl = templates[nextIndex];
    currentTemplateIndex = nextIndex;
    selectedTemplates.clear();
    selectedTemplates.add(nextIndex);
    selectedInstances.clear();
    selectedParams.clear();
    editingParamIndex = -1;
    currentInstanceIndex = tpl && tpl.instances && tpl.instances.length > 0 ? 0 : -1;
    const state = buildTableStateForTemplate(tpl, nextIndex);
    renderTableFromState(state);
    renderTableModeTemplateList();
  }

  function enterTableMode() {
    if (tableModeActive) return;
    if (!templates.length) {
      showMessage('暂无模板可供表格编辑', 'warn');
      return;
    }
    tableModeActive = true;
    document.body.classList.add('table-mode-active');
    if (toggleTableModeBtn) {
      toggleTableModeBtn.textContent = '返回三栏模式';
    }
    const targetIndex = currentTemplateIndex >= 0 ? currentTemplateIndex : 0;
    currentTemplateIndex = targetIndex;
    selectedTemplates.clear();
    selectedTemplates.add(targetIndex);
    selectedInstances.clear();
    selectedParams.clear();
    editingParamIndex = -1;
    const tpl = templates[targetIndex];
    currentInstanceIndex = tpl && tpl.instances && tpl.instances.length > 0 ? 0 : -1;
    const state = buildTableStateForTemplate(tpl, targetIndex);
    renderTableFromState(state);
    renderTableModeTemplateList();
  }

  function exitTableMode() {
    if (!tableModeActive) return;
    if (!commitCurrentTableEdits(false)) {
      return;
    }
    tableModeActive = false;
    document.body.classList.remove('table-mode-active');
    if (toggleTableModeBtn) {
      toggleTableModeBtn.textContent = '表格模式';
    }
    tableModeState = { templateIndex: -1, columns: [], rows: [] };
    clearTableValidationMarkers();
    if (tableModeTemplateList) {
      tableModeTemplateList.innerHTML = '';
    }
    if (tableModeGrid) {
      tableModeGrid.innerHTML = '';
    }
    if (tableModeHeaderRow) tableModeHeaderRow.innerHTML = '';
    if (tableModeTypeRow) tableModeTypeRow.innerHTML = '';
    if (tableModeBody) tableModeBody.innerHTML = '';
    refreshTemplates();
    refreshInstances();
    refreshParams();
  }

  function addTableModeColumn() {
    if (!tableModeActive) {
      showMessage('请先进入表格模式', 'warn');
      return;
    }
    if (tableModeState.templateIndex == null || tableModeState.templateIndex < 0) {
      showMessage('请选择要编辑的模板', 'warn');
      return;
    }
    const nameInput = prompt('请输入新参数列名称');
    if (nameInput == null) return;
    const trimmedName = String(nameInput).trim();
    if (!trimmedName) {
      showMessage('列名不能为空', 'warn');
      return;
    }
    if (['template', 'id', 'index', 'name'].includes(trimmedName)) {
      showMessage('该列名称为保留字段，无法使用', 'warn');
      return;
    }
    if (isPureNumericName(trimmedName)) {
      showMessage('参数名不能为纯数字', 'warn');
      return;
    }
    if (tableModeState.columns.some((col) => col && String(col.name || '').trim() === trimmedName)) {
      showMessage('列名重复', 'warn');
      return;
    }
    const typeInput = prompt('请输入参数类型（例如：string、int、float、bool、list、object 等）', 'string');
    if (typeInput == null) return;
    const trimmedType = String(typeInput).trim();
    if (!trimmedType) {
      showMessage('类型不能为空', 'warn');
      return;
    }
    const workingState = cloneTableModeState();
    workingState.columns.push({
      key: generateTableColumnKey(),
      name: trimmedName,
      type: trimmedType,
      allowNameEdit: true,
      allowTypeEdit: true,
      allowDataEdit: true,
      reserved: false,
    });
    if (!workingState.rows.length) {
      workingState.rows = [];
    } else {
      workingState.rows = workingState.rows.map((row) => {
        const next = row.slice();
        next.push('');
        return next;
      });
    }
    renderTableFromState(workingState);
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
    if (tpl && isEnumTemplate(tpl)) {
      const enumKeySet = new Set();
      (instances || []).forEach((inst) => {
        const keys = getEnumParamKeysForInstance(tpl, inst);
        keys.forEach((key) => enumKeySet.add(key));
      });
      const sortedKeys = Array.from(enumKeySet)
        .map((key) => parseInt(key, 10))
        .filter((num) => Number.isFinite(num))
        .sort((a, b) => a - b)
        .map((num) => String(num));
      sortedKeys.forEach((key) => {
        headers.push(key);
        types.push('string');
      });
      const rows = [headers, types];
      (instances || []).forEach((inst) => {
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
        sortedKeys.forEach((key) => {
          const value = payload[key];
          row.push(value == null ? '' : String(value));
        });
        rows.push(row);
      });
      return rows;
    }
    (tpl.parameters || []).forEach((p) => {
      if (!p) return;
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
    (instances || []).forEach((inst) => {
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
      (tpl.parameters || []).forEach((p) => {
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
    const isEnumCsv = templateName === 'enum';
    headers.forEach((name, idx) => {
      if (reserved.has(name)) return;
      if (!isEnumCsv && isPureNumericName(name)) {
        throw new Error(`参数名称不能为纯数字：${name}`);
      }
      const info = (typesRow[idx] || '').split('/').map((part) => part.trim());
      let baseType = info[0];
      if (!baseType) {
        if (isEnumCsv) {
          baseType = 'string';
        } else {
          throw new Error(`${name} 缺少类型定义`);
        }
      }
      if (isEnumCsv) {
        if (baseType && baseType.toLowerCase() !== 'string') {
          throw new Error(`enum 模板的列 ${name} 类型必须为 string`);
        }
        baseType = 'string';
      }
      const param = { name, type: baseType };
      if (!isEnumCsv && info.length >= 3 && info[1] && info[2]) {
        param.parameterIndexes = {
          template: info[1],
          param: info[2],
          indexField: info[3] || '',
        };
      }
      parameterDefs.push(param);
    });

    const idsFromCsv = [];
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
      idsFromCsv.push(parsedId);
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
      record.id = parsedId;
      record.name = nameValue;
      record.payload = payload;
      return record;
    });

    let idsIncremental = true;
    if (idsFromCsv.length > 0) {
      if (Number.isNaN(idsFromCsv[0])) idsIncremental = false;
      for (let i = 1; i < idsFromCsv.length; i += 1) {
        if (!Number.isFinite(idsFromCsv[i]) || idsFromCsv[i] !== idsFromCsv[i - 1] + 1) {
          idsIncremental = false;
          break;
        }
      }
    }

    const idStart = idsIncremental && idsFromCsv.length > 0 ? idsFromCsv[0] : 0;
    instances.forEach((inst, idx) => {
      const newId = idsIncremental ? (idStart + idx) : idx;
      inst.id = newId;
      inst.payload.id = newId;
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
      tpl.__persistedName = existing.__persistedName ?? existing.name;
      tpl.__pendingDeleteFileName = existing.__pendingDeleteFileName ?? null;
      templates[existingIdx] = tpl;
      if (currentTemplateIndex === existingIdx) {
        currentInstanceIndex = tpl.instances.length > 0 ? 0 : -1;
      }
      return existingIdx;
    }
    ensureTemplateUid(tpl);
    tpl.__persistedName = null;
    tpl.__pendingDeleteFileName = null;
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
  if (toggleTableModeBtn) {
    toggleTableModeBtn.addEventListener('click', () => {
      if (tableModeActive) {
        exitTableMode();
      } else {
        enterTableMode();
      }
    });
  }
  if (tableModeAddColumnBtn) {
    tableModeAddColumnBtn.addEventListener('click', addTableModeColumn);
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
  if (logOverlay) {
    logOverlay.addEventListener('click', (e) => {
      if (e.target === logOverlay) {
        closeLogOverlay();
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
  if (paramNameInput) {
    paramNameInput.addEventListener('input', updateParamNameInputValidity);
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

  function clearTemplateStructureError(tpl) {
    if (!tpl) return;
    ensureTemplateUid(tpl);
    tableModeInvalidTemplates.delete(tpl.__uid);
    tableModeValidationErrors.delete(tpl.__uid);
  }

  function markTemplateStructureError(tpl, message) {
    if (!tpl) return;
    ensureTemplateUid(tpl);
    tableModeInvalidTemplates.add(tpl.__uid);
    if (message) {
      tableModeValidationErrors.set(tpl.__uid, message);
    } else {
      tableModeValidationErrors.delete(tpl.__uid);
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

  if (toggleModeBtn) {
    toggleModeBtn.addEventListener('click', () => {
      if (currentEditMode === MODE_TABLE) {
        switchToColumnMode();
      } else {
        switchToTableMode();
      }
    });
  }

  window.addEventListener('resize', () => {
    if (currentEditMode === MODE_TABLE) {
      scheduleLuckysheetResize();
    }
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
    if (tableModeActive) return;
    // 避免在输入框中触发
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (currentEditMode === MODE_TABLE) return;
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

