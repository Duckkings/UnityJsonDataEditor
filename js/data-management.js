// Template, instance, and parameter management plus clipboard helpers.
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

  function showLuckysheetPlaceholder(message) {
    if (!tableModeEmptyEl) return;
    const text = message && message.trim() ? message : '暂无数据';
    tableModeEmptyEl.textContent = text;
    tableModeEmptyEl.style.display = 'flex';
    if (luckysheetEl) {
      luckysheetEl.style.display = 'none';
    }
  }

  function hideLuckysheetPlaceholder() {
    if (tableModeEmptyEl) {
      tableModeEmptyEl.style.display = 'none';
    }
    if (luckysheetEl) {
      luckysheetEl.style.display = 'block';
    }
  }

  function destroyLuckysheet() {
    if (typeof window.luckysheet !== 'undefined' && typeof window.luckysheet.destroy === 'function') {
      try {
        window.luckysheet.destroy();
      } catch (err) {
        console.warn('销毁 Luckysheet 失败', err);
      }
    }
    if (luckysheetEl) {
      luckysheetEl.innerHTML = '';
    }
    luckysheetLoadedTemplateUid = null;
  }

  function ensureLuckysheetReady() {
    return typeof window.luckysheet !== 'undefined' && typeof window.luckysheet.create === 'function';
  }

  function buildLuckysheetSheetData(rows) {
    const targetCols = Math.max(rows.reduce((max, row) => Math.max(max, row.length), 0), 4);
    const targetRows = Math.max(rows.length, 20);
    const data = Array.from({ length: targetRows }, () => Array.from({ length: targetCols }, () => null));
    rows.forEach((row, rIdx) => {
      if (rIdx >= targetRows) return;
      for (let cIdx = 0; cIdx < targetCols; cIdx += 1) {
        const value = row && cIdx < row.length ? row[cIdx] : '';
        const text = value == null ? '' : String(value);
        const cellData = {};
        if (text) {
          cellData.v = text;
          cellData.m = text;
        }
        if (rIdx === 0 || rIdx === 1) {
          cellData.bg = rIdx === 0 ? '#f2f2f2' : '#fafafa';
          cellData.fc = '#333333';
          if (rIdx === 0) cellData.bl = 1;
        }
        if (text || rIdx === 0 || rIdx === 1) {
          data[rIdx][cIdx] = cellData;
        }
      }
    });
    return { data, rowCount: targetRows, columnCount: targetCols };
  }

  function readLuckysheetCell(cell) {
    if (cell == null) return '';
    if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') {
      return String(cell);
    }
    if (typeof cell === 'object') {
      if (cell.v != null && typeof cell.v === 'object' && cell.v.v != null) {
        return String(cell.v.v);
      }
      if (cell.v != null) {
        return String(cell.v);
      }
      if (cell.m != null) {
        return String(cell.m);
      }
    }
    return '';
  }

  function trimLuckysheetMatrix(rows) {
    if (!Array.isArray(rows)) return [];
    let effectiveRows = rows.length;
    while (effectiveRows > TABLE_LOCKED_ROWS) {
      const row = rows[effectiveRows - 1] || [];
      const hasValue = row.some((cell) => String(cell || '').trim() !== '');
      if (hasValue) break;
      effectiveRows -= 1;
    }
    effectiveRows = Math.max(effectiveRows, TABLE_LOCKED_ROWS);
    const sliced = rows.slice(0, effectiveRows);
    let effectiveCols = sliced.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
    while (effectiveCols > 4) {
      const colIdx = effectiveCols - 1;
      const hasValue = sliced.some((row) => String((row && row[colIdx]) || '').trim() !== '');
      if (hasValue) break;
      effectiveCols -= 1;
    }
    effectiveCols = Math.max(effectiveCols, 4);
    return sliced.map((row) => {
      const normalized = Array.from({ length: effectiveCols }, (_, idx) => String((row && row[idx]) || ''));
      return normalized;
    });
  }

  function collectLuckysheetRows() {
    if (!ensureLuckysheetReady() || typeof window.luckysheet.getSheetData !== 'function') {
      return null;
    }
    const sheetData = window.luckysheet.getSheetData();
    if (!Array.isArray(sheetData)) return null;
    const columnCount = sheetData.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
    const rows = sheetData.map((row) => {
      const normalized = [];
      for (let c = 0; c < columnCount; c += 1) {
        const cell = row && row[c];
        normalized.push(readLuckysheetCell(cell));
      }
      return normalized;
    });
    const trimmed = trimLuckysheetMatrix(rows);
    if (trimmed.length >= 3) {
      const lockedRow = trimmed[2];
      const isLockedRow = Array.isArray(lockedRow)
        ? lockedRow.every((cell) => String(cell || '').trim() === '')
        : true;
      if (isLockedRow) {
        trimmed.splice(2, 1);
      }
    }
    return trimmed;
  }

  function canEditLuckysheetRange(range) {
    if (!range) return true;
    const row = range.row || [0, 0];
    const column = range.column || [0, 0];
    for (let r = row[0]; r <= row[1]; r += 1) {
      if (r < TABLE_LOCKED_ROWS) return false;
    }
    for (let c = column[0]; c <= column[1]; c += 1) {
      if (TABLE_READONLY_COLUMNS.has(c)) return false;
    }
    return true;
  }

  function getLuckysheetViewportSize() {
    if (!luckysheetWrapper) {
      return {
        width: Math.max(window.innerWidth || 0, 480),
        height: Math.max(window.innerHeight || 0, 320),
      };
    }
    const rect = luckysheetWrapper.getBoundingClientRect();
    const width = Math.max(Math.floor(rect.width || luckysheetWrapper.clientWidth || 0), 480);
    const height = Math.max(Math.floor(rect.height || luckysheetWrapper.clientHeight || 0), 320);
    return { width, height };
  }

  function scheduleLuckysheetResize() {
    if (!ensureLuckysheetReady()) return;
    requestAnimationFrame(() => {
      if (currentEditMode !== MODE_TABLE) return;
      const viewport = getLuckysheetViewportSize();
      if (luckysheetEl) {
        luckysheetEl.style.width = `${viewport.width}px`;
        luckysheetEl.style.height = `${viewport.height}px`;
      }
      const sheetRoot = luckysheetEl ? luckysheetEl.querySelector('.luckysheet') : null;
      if (sheetRoot) {
        sheetRoot.style.width = `${viewport.width}px`;
        sheetRoot.style.height = `${viewport.height}px`;
      }
      try {
        window.luckysheet.resize();
      } catch (err) {
        console.warn('Luckysheet resize failed', err);
      }
    });
  }

  function renderLuckysheetForTemplate(tpl) {
    if (!luckysheetWrapper || !luckysheetEl) return;
    if (!tpl) {
      destroyLuckysheet();
      luckysheetLoadedTemplateUid = null;
      const hasTemplates = templates.length > 0;
      showLuckysheetPlaceholder(hasTemplates ? '请选择模板' : '暂无模板');
      return;
    }
    if (!ensureLuckysheetReady()) {
      showLuckysheetPlaceholder('Luckysheet 未加载');
      return;
    }
    ensureTemplateUid(tpl);
    const baseRows = buildCsvRowsForTemplate(tpl, tpl.instances || []);
    const displayRows = baseRows.map((row) => row.slice());
    const blankWidth = Math.max(
      displayRows.reduce((max, row) => Math.max(max, row.length), 0),
      4
    );
    const lockedRow = Array.from({ length: blankWidth }, () => '');
    displayRows.splice(2, 0, lockedRow);
    const dataset = buildLuckysheetSheetData(displayRows);
    destroyLuckysheet();
    hideLuckysheetPlaceholder();
    const viewport = getLuckysheetViewportSize();
    if (luckysheetEl) {
      luckysheetEl.style.width = `${viewport.width}px`;
      luckysheetEl.style.height = `${viewport.height}px`;
    }
    try {
      window.luckysheet.create({
        container: 'luckysheet',
        lang: 'zh',
        showinfobar: false,
        fullscreen: false,
        allowEdit: true,
        allowCopy: true,
        width: viewport.width,
        height: viewport.height,
        data: [
          {
            name: tpl.name || 'Sheet1',
            status: 1,
            order: 0,
            row: dataset.rowCount,
            column: dataset.columnCount,
            data: dataset.data,
          },
        ],
        hook: {
          cellEditBefore: (range) => canEditLuckysheetRange(range),
        },
      });
      luckysheetLoadedTemplateUid = tpl.__uid || null;
      scheduleLuckysheetResize();
    } catch (err) {
      console.error('初始化 Luckysheet 失败', err);
      showLuckysheetPlaceholder('表格加载失败');
    }
  }

  function renderTableModeTabs() {
    if (!tableModeTabsEl) return;
    tableModeTabsEl.innerHTML = '';
    if (templates.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'table-mode-tabs-empty';
      empty.textContent = '暂无模板';
      tableModeTabsEl.appendChild(empty);
      return;
    }
    let activeTabEl = null;
    templates.forEach((tpl, idx) => {
      ensureTemplateUid(tpl);
      const tabBtn = document.createElement('button');
      tabBtn.type = 'button';
      tabBtn.className = 'table-mode-tab';
      tabBtn.textContent = tpl.name || `模板${idx + 1}`;
      const invalidTemplateName = isPureNumericName(tpl.name);
      const enumNumericIssue = hasEnumNumericIssues(tpl);
      if (idx === currentTemplateIndex) {
        tabBtn.classList.add('active');
        activeTabEl = tabBtn;
      }
      if (invalidTemplateName || enumNumericIssue) {
        tabBtn.classList.add('invalid-name');
      }
      if (tableModeInvalidTemplates.has(tpl.__uid)) {
        tabBtn.classList.add('invalid-structure');
      }
      const tooltipParts = [];
      if (invalidTemplateName) {
        tooltipParts.push('模板名称不能为纯数字');
      }
      if (enumNumericIssue) {
        tooltipParts.push('枚举名称或成员不能为纯数字');
      }
      if (tableModeInvalidTemplates.has(tpl.__uid)) {
        const msg = tableModeValidationErrors.get(tpl.__uid) || '表格格式校验失败';
        tooltipParts.push(msg);
      }
      if (tooltipParts.length > 0) {
        tabBtn.title = tooltipParts.join('；');
      }
      tabBtn.addEventListener('click', () => {
        if (idx === currentTemplateIndex) {
          lastSelectedCategory = 'template';
          return;
        }
        if (!syncLuckysheetBackToTemplate()) {
          return;
        }
        selectedTemplates.clear();
        selectedTemplates.add(idx);
        currentTemplateIndex = idx;
        tableModeTemplateIndex = idx;
        templateNameInput.value = tpl.name || '';
        updateTemplateNameInputValidity();
        const instances = Array.isArray(tpl.instances) ? tpl.instances : [];
        currentInstanceIndex = instances.length > 0 ? 0 : -1;
        selectedInstances.clear();
        selectedParams.clear();
        editingParamIndex = -1;
        anchorTemplate = idx;
        anchorInstance = null;
        anchorParam = null;
        renderTableModeView();
        refreshInstances();
        refreshParams();
        updateIndexTemplateOptions();
        lastSelectedCategory = 'template';
      });
      tableModeTabsEl.appendChild(tabBtn);
    });
    if (activeTabEl) {
      requestAnimationFrame(() => {
        if (!tableModeTabsEl) return;
        const visibleWidth = tableModeTabsEl.clientWidth;
        if (visibleWidth <= 0) return;
        const scrollTarget = activeTabEl.offsetLeft - Math.max(0, (visibleWidth - activeTabEl.offsetWidth) / 2);
        tableModeTabsEl.scrollLeft = Math.max(scrollTarget, 0);
      });
    }
  }

  function renderTableModeView() {
    if (currentEditMode !== MODE_TABLE) return;
    const tpl = currentTemplateIndex >= 0 ? templates[currentTemplateIndex] : null;
    tableModeTemplateIndex = currentTemplateIndex;
    if (tableModeIndexFieldEl) {
      tableModeIndexFieldEl.textContent = tpl ? (tpl.indexField || 'id') : '';
    }
    renderLuckysheetForTemplate(tpl || null);
    renderTableModeTabs();
  }

  function switchToTableMode() {
    if (currentEditMode === MODE_TABLE) return;
    if (!tableModeContainer || !luckysheetWrapper || !luckysheetEl) {
      showMessage('表格模式初始化失败', 'warn');
      return;
    }
    document.body.classList.add('table-mode');
    tableModeContainer.setAttribute('aria-hidden', 'false');
    currentEditMode = MODE_TABLE;
    if (toggleModeBtn) {
      toggleModeBtn.textContent = '切换为三栏模式';
      toggleModeBtn.dataset.mode = MODE_TABLE;
    }
    if (templates.length > 0 && currentTemplateIndex < 0) {
      currentTemplateIndex = 0;
    }
    if (currentTemplateIndex >= 0) {
      selectedTemplates.clear();
      selectedTemplates.add(currentTemplateIndex);
    }
    renderTableModeView();
    refreshTemplates();
    refreshInstances();
    refreshParams();
  }

  function switchToColumnMode() {
    if (currentEditMode !== MODE_TABLE) return;
    syncLuckysheetBackToTemplate();
    document.body.classList.remove('table-mode');
    if (tableModeContainer) {
      tableModeContainer.setAttribute('aria-hidden', 'true');
    }
    if (toggleModeBtn) {
      toggleModeBtn.textContent = '切换为表格模式';
      toggleModeBtn.dataset.mode = MODE_COLUMN;
    }
    destroyLuckysheet();
    showLuckysheetPlaceholder('暂无数据');
    currentEditMode = MODE_COLUMN;
    tableModeTemplateIndex = -1;
    renderTableModeTabs();
    refreshTemplates();
    refreshInstances();
    refreshParams();
  }

  function syncLuckysheetBackToTemplate() {
    if (currentEditMode !== MODE_TABLE) return true;
    if (tableModeTemplateIndex < 0) return true;
    const tpl = templates[tableModeTemplateIndex];
    if (!tpl) return true;
    ensureTemplateUid(tpl);
    if (luckysheetLoadedTemplateUid && tpl.__uid && luckysheetLoadedTemplateUid !== tpl.__uid) {
      return true;
    }
    try {
      const rows = collectLuckysheetRows();
      if (!rows || rows.length === 0) {
        clearTemplateStructureError(tpl);
        return true;
      }
      const validated = buildTemplateFromCsv(rows, `${tpl.name}.csv`);
      if (validated.name !== tpl.name) {
        throw new Error('禁止通过表格修改模板名称');
      }
      tpl.parameters = validated.parameters;
      tpl.instances = validated.instances;
      tpl.indexField = validated.indexField || tpl.indexField || 'id';
      clearTemplateStructureError(tpl);
      const instCount = Array.isArray(tpl.instances) ? tpl.instances.length : 0;
      const indexField = tpl.indexField || 'id';
      if (Array.isArray(tpl.instances)) {
        tpl.instances.forEach((inst) => {
          if (!inst) return;
          if (!inst.payload) inst.payload = {};
          inst.payload.index = computeExpectedIndexValue(tpl, inst, indexField);
        });
      }
      if (currentTemplateIndex === tableModeTemplateIndex) {
        if (instCount === 0) {
          currentInstanceIndex = -1;
        } else if (currentInstanceIndex < 0 || currentInstanceIndex >= instCount) {
          currentInstanceIndex = Math.max(0, instCount - 1);
        }
      }
      if (currentEditMode === MODE_TABLE && luckysheetLoadedTemplateUid === tpl.__uid) {
        renderTableModeView();
      }
      return true;
    } catch (err) {
      const msg = err && err.message ? err.message : '表格格式错误';
      markTemplateStructureError(tpl, msg);
      showMessage(`表格校验失败：${msg}`, 'warn');
      refreshTemplates();
      return false;
    }
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
      const granted = await verifyPermission(directoryHandle, true);
      if (!granted) {
        showMessage('未获取到目录读写权限');
        return;
      }
      currentDirLabel.textContent = directoryHandle.name;
      await ensureSubFolders();
      await ensureModelStruct();
      await generateRuntimeLoaderArtifacts();
      await loadAllTemplates();
      refreshTemplates();
      updateIndexTemplateOptions();
      showMessage("工作目录已选择并加载完成");
    } catch (err) {
      if (err && err.name === 'AbortError') {
        showMessage('已取消选择工作目录');
        return;
      }
      console.error(err);
      const message = err && err.message ? `选择工作目录失败：${err.message}` : '选择工作目录失败';
      showMessage(message);
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
            ? Path.GetFullPath(Path.Combine(Application.dataPath, \"..\", \"dataEntity\"))
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
   // dataEntity \u76ee\u5f55\u4f4d\u4e8e\u9879\u76ee\u6839\u76ee\u5f55\u65f6\u53ef\u76f4\u63a5\u8c03\u7528
   DataEntityRuntimeLoader.Initialize();
   // \u6216\u8005\u663e\u5f0f\u4f20\u5165\u8def\u5f84
   DataEntityRuntimeLoader.Initialize(Path.Combine(Application.dataPath, \"..\", \"dataEntity\"));

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
    if (editorHandle) {
      const testerContent = `
using System;
using System.Collections.Generic;
using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

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
    private string parameterType = \"string\";

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
                    Debug.LogError(\"Unsupported operation\");
                    break;
            }
        }
        catch (Exception ex)
        {
            Debug.LogError($\"[DataEntityRuntimeTester] {ex.Message}\\n{ex}\");
        }
    }

    private void ExecuteInitialize()
    {
        var path = string.IsNullOrWhiteSpace(dataDirectory) ? null : dataDirectory;
        DataEntityRuntimeLoader.Initialize(path);
        Debug.Log(\"[DataEntityRuntimeTester] Initialize completed\");
    }

    private void ExecuteReload()
    {
        DataEntityRuntimeLoader.Reload();
        Debug.Log(\"[DataEntityRuntimeTester] Reload completed\");
    }

    private void ExecuteGetValue()
    {
        if (string.IsNullOrWhiteSpace(templateName) || string.IsNullOrWhiteSpace(parameterName))
        {
            Debug.LogError(\"输入不合法\");
            return;
        }

        var type = ResolveParameterType(parameterType);
        if (type == null)
        {
            Debug.LogError(\"输入不合法\");
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
        var valueText = value == null ? \"<null>\" : value.ToString();
        Debug.Log($\"{templateName}/{identifier ?? \"(null)\"}/{parameterName}/{valueText}\");
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

    private static readonly Dictionary<string, Type> TypeMappings = new Dictionary<string, Type>(StringComparer.
OrdinalIgnoreCase)
    {
        { \"bool\", typeof(bool) },
        { \"byte\", typeof(byte) },
        { \"sbyte\", typeof(sbyte) },
        { \"char\", typeof(char) },
        { \"decimal\", typeof(decimal) },
        { \"double\", typeof(double) },
        { \"float\", typeof(float) },
        { \"int\", typeof(int) },
        { \"uint\", typeof(uint) },
        { \"long\", typeof(long) },
        { \"ulong\", typeof(ulong) },
        { \"short\", typeof(short) },
        { \"ushort\", typeof(ushort) },
        { \"string\", typeof(string) },
        { \"datetime\", typeof(DateTime) },
        { \"guid\", typeof(Guid) },
    };
}

#if UNITY_EDITOR
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
        operation = serializedObject.FindProperty(\"operation\");
        dataDirectory = serializedObject.FindProperty(\"dataDirectory\");
        templateName = serializedObject.FindProperty(\"templateName\");
        instanceName = serializedObject.FindProperty(\"instanceName\");
        indexKey = serializedObject.FindProperty(\"indexKey\");
        parameterName = serializedObject.FindProperty(\"parameterName\");
        parameterType = serializedObject.FindProperty(\"parameterType\");
        getParameter = serializedObject.FindProperty(\"getParameter\");
    }

    public override void OnInspectorGUI()
    {
        serializedObject.Update();
        EditorGUILayout.PropertyField(operation);
        var op = (DataEntityRuntimeTester.TestOperation)operation.enumValueIndex;
        switch (op)
        {
            case DataEntityRuntimeTester.TestOperation.Initialize:
                EditorGUILayout.HelpBox(\"调用 DataEntityRuntimeLoader.Initialize\", MessageType.Info);
                EditorGUILayout.PropertyField(dataDirectory, new GUIContent(\"数据目录(可空)\"));
                break;
            case DataEntityRuntimeTester.TestOperation.Reload:
                EditorGUILayout.HelpBox(\"调用 DataEntityRuntimeLoader.Reload\", MessageType.Info);
                break;
            case DataEntityRuntimeTester.TestOperation.GetValue:
                EditorGUILayout.HelpBox(\"读取数据并在控制台输出\", MessageType.Info);
                EditorGUILayout.PropertyField(templateName, new GUIContent(\"模板名\"));
                EditorGUILayout.PropertyField(instanceName, new GUIContent(\"实例名\"));
                EditorGUILayout.PropertyField(indexKey, new GUIContent(\"索引字符\"));
                EditorGUILayout.PropertyField(parameterName, new GUIContent(\"参数名\"));
                EditorGUILayout.PropertyField(parameterType, new GUIContent(\"参数类型\"));
                EditorGUILayout.PropertyField(getParameter, new GUIContent(\"索引获取参数(getParameter)\"));
                break;
        }
        serializedObject.ApplyModifiedProperties();
        if (GUILayout.Button(\"执行\"))
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
      await writeTextFile(editorHandle, 'DataEntityRuntimeTester.cs', testerContent);
      const testerGuideContent = `
DataEntityRuntimeTester 使用说明
================================

挂载脚本
1. 将 DataEntityRuntimeTester.cs 挂载到需要测试的 GameObject。
2. 在 Inspector 中使用自定义面板选择要执行的操作。

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

