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
    if (!directoryHandle) {
      alert('请先选择工作目录');
      return;
    }
    exportSelectionMode = true;
    exportTemplateAnchorIndex = null;
    updateExportButtons();
    showMessage('已进入导出选择模式，勾选需要导出的模板或实例');
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
    if (param && param.index) {
      if (value && typeof value === 'object') {
        try {
          return JSON.stringify({
            template: value.template ?? param.index.template,
            by: value.by ?? param.index.param,
            value: value.value ?? '',
          });
        } catch (_) {
          return '';
        }
      }
      if (value == null || value === '') {
        return '';
      }
      return JSON.stringify({ template: param.index.template, by: param.index.param, value: String(value) });
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
    (tpl.parameters || []).forEach((p) => {
      if (!p) return;
      headers.push(p.name);
      if (p.index && p.index.template && p.index.param) {
        types.push(`${p.type}/${p.index.template}/${p.index.param}`);
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
      alert('请先选择工作目录');
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
      return { template: param.index.template, by: param.index.param, value: '' };
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        return {
          template: parsed.template || param.index.template,
          by: parsed.by || param.index.param,
          value: parsed.value != null ? String(parsed.value) : '',
        };
      }
    } catch (_) {
      // fallback to plain string
    }
    return { template: param.index.template, by: param.index.param, value: trimmed };
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
        param.index = { template: info[1], param: info[2] };
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
        if (param.index) {
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

  function enforceImportedIndexField(tpl, fileName) {
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
      templates[existingIdx] = tpl;
      if (currentTemplateIndex === existingIdx) {
        currentInstanceIndex = tpl.instances.length > 0 ? 0 : -1;
      }
      return existingIdx;
    }
    ensureTemplateUid(tpl);
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
          index: p.index
            ? {
                template: p.index.template || '',
                param: p.index.param || '',
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
    // 避免在输入框中触发
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
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
  async function ensureSubFolders() {
    csharpHandle = await directoryHandle.getDirectoryHandle("csharpDate", { create: true });
    dataEntityHandle = await directoryHandle.getDirectoryHandle("dataEntity", { create: true });
    // 检查文件类型
    for await (const entry of csharpHandle.values()) {
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
          '',
          '[Serializable]',
          'public class TableSchema',
          '{',
          '    public string name;',
          '    public string indexField;',
          '    public List<ParamDef> parameters;',
          '    public List<Row> instances;',
          '}',
          '',
          '[Serializable]',
          'public class ParamDef',
          '{',
          '    public string name;',
          '    public string type;',
          '    public object index;',
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
          '[JsonConverter(typeof(DataRefConverter))] // 全局指定这个类型走自定义解析',
          'public class DataRef',
          '{',
          '    public string template;  // 对应 JSON 里的 "template"',
          '    public string by;        // 对应 JSON 里的 "by"',
          '    public string value;     // 对应 JSON 里的 "value"',
          '',
          '    [JsonIgnore]',
          '    public object instance;  // 解析完后指向目标实例',
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

  /**
   * 从 dataEntity 读取所有模板文件
   */
  async function loadAllTemplates() {
    templates.length = 0;
    currentTemplateIndex = -1;
    currentInstanceIndex = -1;
    templateUidCounter = 0;
    lastSavedStructureSnapshot = new Map();
    let enumLoadedFromJson = false;
    for await (const entry of dataEntityHandle.values()) {
      if (entry.kind === "file" && entry.name.toLowerCase().endsWith(".json")) {
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
        templates.push(cachedEnum);
      }
    }
    // 按名称排序
    templates.sort((a, b) => a.name.localeCompare(b.name));
    if (templates.length > 0) {
      currentTemplateIndex = 0;
      currentInstanceIndex = templates[0].instances.length > 0 ? 0 : -1;
    }
    lastSavedStructureSnapshot = captureCurrentStructureSnapshot();
  }

  /**
   * 新建模板
   */
  function newTemplate() {
    const name = templateNameInput.value.trim() || `模板${templates.length + 1}`;
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
    templates.push(template);
    currentTemplateIndex = templates.length - 1;
    currentInstanceIndex = 0;
    refreshTemplates();
    updateIndexTemplateOptions();
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
    const name = instanceNameInput.value.trim() || `实例${tpl.instances.length}`;
    const nextId = tpl.instances.length > 0 ? Math.max(...tpl.instances.map((i) => i.id)) + 1 : 0;
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
    inst.name = newName;
    inst.payload.name = newName;
    refreshInstances();
    refreshParams();
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
    copyBuffer.items.forEach((srcInst) => {
      const nextId = tpl.instances.length > 0 ? Math.max(...tpl.instances.map((i) => i.id)) + 1 : 0;
      const newInst = JSON.parse(JSON.stringify(srcInst));
      newInst.id = nextId;
      newInst.name = `${srcInst.name}_复制`;
      newInst.payload = { ...srcInst.payload };
      newInst.payload.id = nextId;
      newInst.payload.name = newInst.name;
      newInst.payload.template = tpl.name;
      tpl.instances.push(newInst);
    });
    refreshInstances();
    refreshParams();
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
    indices.forEach((idx) => {
      tpl.instances.splice(idx, 1);
    });
    // 重新赋予 id
    tpl.instances.forEach((inst, index) => {
      inst.id = index;
      inst.payload.id = index;
    });
    // 更新当前实例索引
    currentInstanceIndex = tpl.instances.length > 0 ? 0 : -1;
    selectedInstances.clear();
    refreshInstances();
    refreshParams();
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
    let type = paramTypeSelect.value;
    if (isEnumTemplate(tpl)) {
      type = 'string';
    }
    let indexObj = null;
    if (!indexTemplateSelect.disabled) {
      const idxTpl = indexTemplateSelect.value;
      const idxParam = indexParamSelect.value;
      if (idxTpl && idxParam) {
        const targetTpl = templates.find(t=>t.name===idxTpl);
        if (targetTpl && isEnumTemplate(targetTpl)) {
          alert('索引目标不能是 enum 模板');
          indexTemplateSelect.value = '';
          updateIndexParamOptions();
        } else if (targetTpl) {
          const targetParam = (targetTpl.parameters || []).find(p => p && p.name === idxParam);
          if (!targetParam || !INDEXABLE_PARAM_TYPES.has(targetParam.type)) {
            alert('索引字段类型必须是 int/long/float/string');
            indexParamSelect.value = '';
          } else {
            indexObj = { template: idxTpl, param: idxParam };
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
    const param = { name, type, index: indexObj };
    tpl.parameters.push(param);
    tpl.instances.forEach((inst) => {
      if (indexObj) {
        inst.payload[name] = { template: indexObj.template, by: indexObj.param, value: '' };
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
    // 检查重名
    if (!isEnumTemplate(tpl) && tpl.parameters.some((p, i) => p.name === newName && i !== index)) {
      alert("参数名称已存在");
      return;
    }
    if (isEnumTemplate(tpl)) {
      newType = 'string';
      newName = String(index);
      newIndexObj = null;
    }
    // 索引目标不允许 enum
    if (newIndexObj && newIndexObj.template) {
      const targetTpl = templates.find(t=>t.name===newIndexObj.template);
      if (targetTpl && isEnumTemplate(targetTpl)) {
        alert('索引目标不能是 enum 模板');
        newIndexObj = null;
      } else if (targetTpl) {
        const targetParam = (targetTpl.parameters || []).find(p => p && p.name === newIndexObj.param);
        if (!targetParam || !INDEXABLE_PARAM_TYPES.has(targetParam.type)) {
          alert('索引字段类型必须是 int/long/float/string');
          newIndexObj = null;
        }
      }
    }
    const oldName = param.name;
    const oldType = param.type;
    // 更新定义
    param.name = newName;
    param.type = newType;
    const oldIndex = param.index;
    param.index = newIndexObj;
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
    const base = (name || '').split(/[^A-Za-z0-9]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
    let result = base || fallback || 'Member';
    result = result.replace(/[^A-Za-z0-9_]/g, '_');
    if (/^[0-9]/.test(result)) {
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
    refreshInstances();
    refreshParams();
    // 应用模板搜索过滤
    filterList(templateListEl, searchTemplatesInput.value);
  }

  /**
   * 获取选中的实例索引
   */
  function getSelectedInstanceIndices() {
    return Array.from(selectedInstances).sort((a, b) => a - b);
  }

  /**
   * 刷新实例列表
   */
  function refreshInstances() {
    instanceListEl.innerHTML = "";
    if (currentTemplateIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
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
      // 设置选中状态
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
      li.appendChild(nameSpan);
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
  }

  /**
   * 刷新参数列表
   */
  function refreshParams() {
    paramListEl.innerHTML = "";
    updateParamTypeSelectEnabledState();
    updateParamNameInputEnabledState();
    refreshParamTypeOptions();
    updateIndexTemplateOptions();
    if (currentTemplateIndex < 0 || currentInstanceIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    const inst = tpl.instances[currentInstanceIndex];
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
        // 在 index 行放置“索引字段选择”下拉，选项来自该模板的所有可选字段
        const select = document.createElement('select');
        const candidates = ['id','name', ...tpl.parameters.map(p => p.name).filter(n => n !== 'index')];
        candidates.forEach(n => {
          const opt = document.createElement('option');
          opt.value = n;
          opt.textContent = n;
          select.appendChild(opt);
        });
        select.value = tpl.indexField || 'id';
        select.addEventListener('change', () => {
          tpl.indexField = select.value || 'id';
          // 同步整个模板的实例 index 值
          tpl.instances.forEach(one => {
            const vv = getValueByFieldForInstance(tpl, one, tpl.indexField);
            if (!one.payload) one.payload = {};
            one.payload.index = vv == null ? '' : String(vv);
          });
          refreshParams();
        });
        // 显示当前实例的 index 值（只读）
        const valueSpan = document.createElement('span');
        valueSpan.style.flex = '1';
        const vNow = getValueByFieldForInstance(tpl, inst, tpl.indexField || 'id');
        valueSpan.textContent = vNow == null ? '' : String(vNow);
        if (!inst.payload) inst.payload = {};
        inst.payload.index = valueSpan.textContent;
        item.appendChild(select);
        item.appendChild(valueSpan);
      } else {
        const span = document.createElement("span");
        span.textContent = inst.payload[f.name];
        span.style.flex = '1';
        item.appendChild(span);
      }
      paramListEl.appendChild(item);
    });
    // enum：参数与实例对应，使用实例自身的数字键渲染并返回
    if (isEnumTemplate(tpl)) {
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
        // 防止点击输入框触发父级选择逻辑，打断编辑
        inputEl.addEventListener('mousedown', (e) => e.stopPropagation());
        inputEl.addEventListener('click', (e) => e.stopPropagation());
        inputEl.addEventListener('keydown', (e) => e.stopPropagation());
        inputEl.addEventListener('change', () => {
          if (!inst.payload) inst.payload = {};
          inst.payload[key] = inputEl.value;
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
            const arr = Array.from(selectedParams).sort((a,b)=>a-b);
            editingParamIndex = arr.length > 0 ? arr[arr.length-1] : -1;
          } else if (e.shiftKey) {
            if (anchorParam === null) anchorParam = editingParamIndex >= 0 ? editingParamIndex : idx;
            const start = Math.min(anchorParam, idx);
            const end = Math.max(anchorParam, idx);
            selectedParams.clear();
            for (let i = start; i <= end; i++) selectedParams.add(i);
            editingParamIndex = idx; anchorParam = idx;
          } else {
            if (selectedParams.has(idx) && selectedParams.size === 1) {
              selectedParams.clear(); editingParamIndex = -1; anchorParam = null;
            } else {
              selectedParams.clear(); selectedParams.add(idx); editingParamIndex = idx; anchorParam = idx;
            }
          }
          refreshParams();
          lastSelectedCategory = 'param';
        });
        paramListEl.appendChild(item);
      });
      // 过滤（仅文本值可被过滤）
      filterList(paramListEl, searchParamsInput.value, true);
      return;
    }
    // 自定义参数
    tpl.parameters.forEach((p, idx) => {
      const item = document.createElement("div");
      item.classList.add("param-item");
      const label = document.createElement('label');
      label.textContent = p.name;
      item.appendChild(label);
      if (selectedParams.has(idx)) item.classList.add('active');
      if (p.index) {
        const info = document.createElement('span');
        info.textContent = `索引：${p.index.template} → ${p.index.param}`;
        info.style.marginRight = '8px';
        item.appendChild(info);

        // 为索引参数提供可编辑的 value 输入框（并规范化存储结构）
        let refObj = inst.payload[p.name];
        if (refObj == null) {
          refObj = { template: p.index.template, by: p.index.param, value: '' };
          inst.payload[p.name] = refObj;
        } else if (typeof refObj !== 'object') {
          refObj = { template: p.index.template, by: p.index.param, value: String(refObj) };
          inst.payload[p.name] = refObj;
        } else {
          refObj.template = p.index.template;
          refObj.by = p.index.param;
          if (refObj.value == null) refObj.value = '';
        }

        // datalist 建议（来自目标模板对应字段的值）
        const suggestId = `idx-suggest-${p.name}`;
        const dataList = document.createElement('datalist');
        dataList.id = suggestId;
        const targetTpl = templates.find(t => t.name === p.index.template);
        if (targetTpl && !isEnumTemplate(targetTpl)) {
          const seen = new Set();
          targetTpl.instances.forEach(it => {
            const v = it.payload ? it.payload[p.index.param] : undefined;
            const sv = v == null ? '' : String(v);
            if (sv && !seen.has(sv)) {
              seen.add(sv);
              const opt = document.createElement('option');
              opt.value = sv;
              dataList.appendChild(opt);
            }
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
            obj = { template: p.index.template, by: p.index.param, value: '' };
            inst.payload[p.name] = obj;
          }
          // 若索引目标是 enum，阻止写入
          const tt = templates.find(t => t.name === p.index.template);
          if (tt && isEnumTemplate(tt)) {
            showMessage('索引目标不能是 enum 模板');
            indexTemplateSelect.value = '';
            updateIndexParamOptions();
            obj.template = '';
            obj.by = '';
          } else {
            obj.template = p.index.template;
            obj.by = p.index.param;
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
        if (e.altKey && p.index) {
          // 将当前参数选择压栈
          pushParamHistory();
          const ref = inst.payload[p.name];
          const targetTplName = ref && typeof ref === 'object' ? (ref.template || p.index.template) : p.index.template;
          const byField = ref && typeof ref === 'object' ? (ref.by || p.index.param) : p.index.param;
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
  }

  /**
   * 更新参数值
   */
  function updateParamValue(paramIndex, inputEl) {
    if (currentTemplateIndex < 0 || currentInstanceIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    const inst = tpl.instances[currentInstanceIndex];
    const param = tpl.parameters[paramIndex];
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
      if (!indexTemplateSelect.disabled) {
        indexTemplateSelect.value = '';
        updateIndexParamOptions();
      } else {
        indexParamSelect.value = '';
      }
      editingParamIndex = -1;
      $('newParam').textContent = '新建参数';
      return;
    }
    const idxs = Array.from(selectedParams);
    const idx = idxs[idxs.length - 1];
    const p = tpl.parameters[idx];
    if (!p) return;
    editingParamIndex = idx;
    paramNameInput.value = p.name;
    paramTypeSelect.value = p.type;
    if (isEnumTemplate(tpl)) {
      paramTypeSelect.value = 'string';
    }
    // 设置索引下拉
    if (!indexTemplateSelect.disabled) {
      if (p.index) {
        indexTemplateSelect.value = p.index.template;
        updateIndexParamOptions();
        indexParamSelect.value = p.index.param;
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
        delete newParam.index;
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
    if (currentTpl && isEnumTemplate(currentTpl)) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '枚举不支持索引';
      indexTemplateSelect.appendChild(opt);
      indexTemplateSelect.value = '';
      indexTemplateSelect.disabled = true;
      indexParamSelect.innerHTML = '';
      const optParam = document.createElement('option');
      optParam.value = '';
      optParam.textContent = '枚举不支持索引';
      indexParamSelect.appendChild(optParam);
      indexParamSelect.value = '';
      indexParamSelect.disabled = true;
      return;
    }

    indexTemplateSelect.disabled = false;
    indexParamSelect.disabled = false;

    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '无索引';
    indexTemplateSelect.appendChild(opt0);
    // 不允许选择 enum 模板作为索引目标
    templates.forEach((tpl) => {
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
      opt.textContent = '枚举不支持索引';
      indexParamSelect.appendChild(opt);
      indexParamSelect.value = '';
      indexParamSelect.disabled = true;
      return;
    }

    indexParamSelect.disabled = false;
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
    const indexableParams = (tpl.parameters || []).filter((p) => p && INDEXABLE_PARAM_TYPES.has(p.type));
    if (indexableParams.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "无可用参数";
      indexParamSelect.appendChild(opt);
      indexParamSelect.value = "";
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
      opt.textContent = p.name;
      indexParamSelect.appendChild(opt);
    });
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

  /**
   * 保存所有模板到文件
   */
  function askCSharpReplacement(templateName) {
    const lines = [
      `${templateName} 模板的结构发生变化，检测到 C# 脚本内容可能发生变化。`,
      '请选择操作：',
      '1. 替换原有 C# 脚本',
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
    if (!directoryHandle) {
      alert("请先选择工作目录");
      return;
    }
    try {
      if (!csharpHandle || !dataEntityHandle) {
        await ensureSubFolders();
      }
      const templateDecisions = new Map();
      const csCache = new Map();
      let enumTemplateSaved = false;
      let shouldUpdateDataRef = false;

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
        const answer = askCSharpReplacement(tpl.name);
        if (answer === 'cancel') {
          showMessage('已取消保存');
          return;
        }
        if (answer === 'replace') {
          shouldUpdateDataRef = true;
          templateDecisions.set(tpl.__uid, { decision: 'replace', structureChanged: true });
        } else {
          templateDecisions.set(tpl.__uid, { decision: 'jsonOnly', structureChanged: true });
        }
      }

      for (const tpl of templates) {
        ensureTemplateUid(tpl);
        if (isEnumTemplate(tpl)) {
          await saveEnumTemplateCache(tpl);
          enumTemplateSaved = true;
          await deleteDataEntityFileIfExists(`${tpl.name}.json`);
          continue;
        }
        const json = JSON.stringify({ name: tpl.name, indexField: tpl.indexField || 'id', parameters: tpl.parameters, instances: tpl.instances }, null, 2);
        await writeTextFile(dataEntityHandle, `${tpl.name}.json`, json);
        const meta = templateDecisions.get(tpl.__uid);
        if (meta && meta.decision === 'replace') {
          const content = csCache.get(tpl.__uid) || generateCSContent(tpl);
          await writeTextFile(csharpHandle, `${tpl.name}.cs`, content);
        }
      }

      if (shouldUpdateDataRef) {
        if (templates.some(t => Array.isArray(t.parameters) && t.parameters.some(p => p && p.index))) {
          const dataRefContent = [
            'using System;',
            'using System.Collections.Generic;',
            '',
            '[Serializable]',
            'public class DataRef',
            '{',
            '    public string template;',
            '    public string by;',
            '    public string value;',
            '    // 运行时可放置解析后的实例引用（可选）',
            '    // public object instance;',
            '}',
            ''
          ].join('\n');
          await writeTextFile(csharpHandle, 'DataRef.cs', dataRefContent);
        }
      }

      await generateEnumCSFiles(getEnumTemplate());

      if (!enumTemplateSaved) {
        await clearEnumTemplateCache();
        await deleteDataEntityFileIfExists('enum.json');
      }

      const manifest = templates
        .filter((tpl) => !isEnumTemplate(tpl))
        .map((tpl) => ({ template: tpl.name, path: `dataEntity/${tpl.name}.json` }));
      await writeTextFile(directoryHandle, 'manifest.json', JSON.stringify(manifest, null, 2));

      lastSavedStructureSnapshot = captureCurrentStructureSnapshot();
      showMessage("已保存所有更改");
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
      if (templates.some(t => Array.isArray(t.parameters) && t.parameters.some(p => p && p.index))) {
        const dataRefContent = [
          'using System;',
          'using System.Collections.Generic;',
          '',
          '[Serializable]',
          'public class DataRef',
          '{',
          '    public string template;',
          '    public string by;',
          '    public string value;',
          '    // 运行时可放置解析后的实例引用（可选）',
          '    // public object instance;',
          '}',
          ''
        ].join('\n');
        await writeTextFile(csharpHandle, 'DataRef.cs', dataRefContent);
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
    // 索引参数使用可复用的全局类型 DataRef（在保存时生成 DataRef.cs）
    tpl.parameters.forEach((p) => {
      if (!p) return;
      if (p.index) {
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
