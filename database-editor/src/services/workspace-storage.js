import {
  GODOT_GAME_ROOT_SCENE_NAME,
  GODOT_OBJECT_BASE_SCENE_NAME,
  GODOT_PREFAB_FOLDER_NAME,
  SYSTEM_INIT_ORDER_TEMPLATE_NAME,
  buildGodotGameRootSceneContent,
  buildGodotObjectBaseSceneContent,
  buildGodotRuntimeFiles,
  buildSystemInitOrderTemplate,
} from '../generators/godot-project-bootstrap-generator.js';

const DB_NAME = 'json-editor';
const DB_STORE = 'handles';
const ENUM_CACHE_PREFIX = 'enumCache:';
const IGNORED_FILE_SUFFIXES = ['.meta', '.uid'];
const IGNORED_FILE_NAMES = ['.ds_store', 'thumbs.db'];
const ALLOWED_CSHARP_ROOT_FILE_SUFFIXES = ['.cs', '.md', '.txt'];
const PREFAB_SEARCH_IGNORED_DIRECTORIES = new Set([
  '.git',
  '.godot',
  '.import',
  '.vs',
  'bin',
  'library',
  'node_modules',
  'obj',
  'temp',
]);

function ensureContext(context) {
  if (!context || typeof context !== 'object') {
    throw new Error('createWorkspaceStorageModule requires a context object');
  }
  if (!context.appState || typeof context.appState !== 'object') {
    throw new Error('createWorkspaceStorageModule requires appState');
  }
}

export function createWorkspaceStorageModule(context) {
  ensureContext(context);

  const {
    appState,
    setCurrentDirectoryLabel = () => {},
    updateEngineModeUIState = () => {},
    setEngineMode = () => {},
    getCurrentEngineLabel = () => '',
    isUnityMode = () => true,
    isGodotMode = () => false,
    showMessage = () => {},
    commitActiveSheetEdits = () => ({ ok: true }),
    loadAllTemplates = async () => {},
    hasUnsavedTemplateChanges = () => false,
    refreshTemplates = () => {},
    refreshInstances = () => {},
    refreshParams = () => {},
    showSelectedParamDetails = () => {},
    updateIndexTemplateOptions = () => {},
    isSheetModeActive = () => false,
    updateSheetTemplateNav = () => {},
    updateSheetInstanceTabs = () => {},
    renderLuckysheetForActiveInstance = () => {},
    generateRuntimeLoaderArtifacts = async () => {},
    ensureModelStruct = async () => {},
    generateCSContent = () => '',
    snapshotTemplateStructure = () => ({}),
    ensureTemplateUid = () => null,
    normalizeTemplateParameterIndexes = () => {},
    addLogEntry = () => {},
  } = context;

  const isCSharpMode = () => isUnityMode() || isGodotMode();
  const SCRIPT_OUTPUT_ROOT_CANDIDATES = ['scripts', 'Script'];
  const DEFAULT_SCRIPT_OUTPUT_ROOT = 'scripts';

  async function getDirectoryHandleIfExists(parentHandle, name) {
    if (!parentHandle || !name) return null;
    try {
      return await parentHandle.getDirectoryHandle(name, { create: false });
    } catch (err) {
      if (err && (err.name === 'NotFoundError' || err.name === 'TypeMismatchError')) {
        return null;
      }
      throw err;
    }
  }

  async function resolveScriptOutputRootHandle(options = {}) {
    if (!appState.directoryHandle) return null;
    const create = Boolean(options.create);

    for (const candidate of SCRIPT_OUTPUT_ROOT_CANDIDATES) {
      const handle = await getDirectoryHandleIfExists(appState.directoryHandle, candidate);
      if (handle) {
        return handle;
      }
    }
    if (!create) {
      return null;
    }

    try {
      return await appState.directoryHandle.getDirectoryHandle(DEFAULT_SCRIPT_OUTPUT_ROOT, {
        create: true,
      });
    } catch (err) {
      if (!err || err.name !== 'TypeMismatchError') {
        throw err;
      }
    }

    try {
      return await appState.directoryHandle.getDirectoryHandle('Script', {
        create: true,
      });
    } catch (err) {
      if (!err || err.name !== 'TypeMismatchError') {
        throw err;
      }
    }
    return null;
  }

  async function getConfigDirectoryHandle(options = {}) {
    if (!appState.directoryHandle) return null;
    const create = Boolean(options.create);
    if (appState.configDirHandle) return appState.configDirHandle;
    try {
      appState.configDirHandle = await appState.directoryHandle.getDirectoryHandle(
        appState.CONFIG_DIR_NAME,
        { create },
      );
    } catch (err) {
      if (!create && err && err.name === 'NotFoundError') {
        appState.configDirHandle = null;
        return null;
      }
      if (create) {
        console.warn('无法创建配置目录', err);
      }
      appState.configDirHandle = null;
      return null;
    }
    return appState.configDirHandle;
  }

  async function readEditorConfig() {
    try {
      const dir = await getConfigDirectoryHandle({ create: false });
      if (!dir) return null;
      const fileHandle = await dir.getFileHandle(appState.CONFIG_FILE_NAME, { create: false });
      const file = await fileHandle.getFile();
      return JSON.parse(await file.text());
    } catch (_err) {
      return null;
    }
  }

  async function persistEditorConfig() {
    if (!appState.directoryHandle) return;
    try {
      const dir = await getConfigDirectoryHandle({ create: true });
      if (!dir) return;
      const payload = {
        engineMode: appState.currentEngineMode,
      };
      await writeTextFile(dir, appState.CONFIG_FILE_NAME, JSON.stringify(payload, null, 2));
    } catch (err) {
      console.warn('保存编辑器配置失败', err);
    }
  }

  async function loadEditorConfigState() {
    if (!appState.directoryHandle) {
      updateEngineModeUIState();
      return;
    }
    try {
      const config = await readEditorConfig();
      const mode = config && config.engineMode;
      if (mode && Object.values(appState.ENGINE_MODES).includes(mode)) {
        if (appState.currentEngineMode !== mode) {
          setEngineMode(mode);
        } else {
          updateEngineModeUIState();
        }
        return;
      }
    } catch (err) {
      console.warn('读取编辑器配置失败', err);
    }
    if (appState.currentEngineMode !== appState.ENGINE_MODES.UNITY) {
      setEngineMode(appState.ENGINE_MODES.UNITY);
    } else {
      updateEngineModeUIState();
    }
  }

  async function ensureEngineGenerationConsent(actionLabel = '生成操作') {
    if (!appState.engineModeNeedsConfirmation[appState.currentEngineMode]) {
      return true;
    }
    const engineName = getCurrentEngineLabel();
    const confirmed = window.confirm(`首次在${engineName}模式执行${actionLabel}，是否继续？`);
    if (!confirmed) {
      return false;
    }
    appState.engineModeNeedsConfirmation[appState.currentEngineMode] = false;
    return true;
  }

  async function readTextFileIfExists(dirHandle, fileName) {
    if (!dirHandle) return null;
    try {
      const fileHandle = await dirHandle.getFileHandle(fileName, { create: false });
      const file = await fileHandle.getFile();
      return await file.text();
    } catch (_err) {
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

  async function fileExists(dirHandle, fileName) {
    if (!dirHandle || !fileName) return false;
    try {
      await dirHandle.getFileHandle(fileName, { create: false });
      return true;
    } catch (err) {
      if (err && err.name === 'NotFoundError') {
        return false;
      }
      throw err;
    }
  }

  async function ensureNestedDirectory(parentHandle, segments) {
    let current = parentHandle;
    for (const segment of segments || []) {
      if (!segment) continue;
      current = await current.getDirectoryHandle(segment, { create: true });
    }
    return current;
  }

  async function upsertManagedTextFile(dirHandle, fileName, content) {
    const existing = await readTextFileIfExists(dirHandle, fileName);
    if (existing != null) {
      if (existing === content) {
        return { status: 'unchanged', fileName };
      }
      return { status: 'skipped', fileName };
    }
    await writeTextFile(dirHandle, fileName, content);
    return { status: 'created', fileName };
  }

  async function overwriteManagedTextFile(dirHandle, fileName, content) {
    const existing = await readTextFileIfExists(dirHandle, fileName);
    if (existing != null && existing === content) {
      return { status: 'unchanged', fileName };
    }

    await writeTextFile(dirHandle, fileName, content);
    return { status: existing == null ? 'created' : 'updated', fileName };
  }

  async function writeManagedRelativeFile(rootHandle, relativePath, content, options = {}) {
    const normalizedPath = String(relativePath || '')
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean);
    const fileName = normalizedPath.pop();
    const dirHandle = await ensureNestedDirectory(rootHandle, normalizedPath);
    const result = options.overwrite
      ? await overwriteManagedTextFile(dirHandle, fileName, content)
      : await upsertManagedTextFile(dirHandle, fileName, content);
    return {
      ...result,
      relativePath: [...normalizedPath, fileName].join('/'),
    };
  }

  function summarizeWriteResults(results) {
    return (Array.isArray(results) ? results : []).reduce(
      (summary, item) => {
        const status = item && item.status ? item.status : 'unknown';
        if (!Object.prototype.hasOwnProperty.call(summary, status)) {
          summary[status] = 0;
        }
        summary[status] += 1;
        return summary;
      },
      { created: 0, updated: 0, unchanged: 0, skipped: 0, unknown: 0 },
    );
  }

  function captureCurrentTemplateSelectionState() {
    const currentTemplate =
      appState.currentTemplateIndex >= 0 ? appState.templates[appState.currentTemplateIndex] : null;
    if (currentTemplate) {
      ensureTemplateUid(currentTemplate);
    }
    const instanceList = Array.isArray(currentTemplate?.instances) ? currentTemplate.instances : [];
    const currentInstance =
      appState.currentInstanceIndex >= 0 ? instanceList[appState.currentInstanceIndex] : null;
    const currentParam =
      currentTemplate && appState.editingParamIndex >= 0
        ? currentTemplate.parameters?.[appState.editingParamIndex] || null
        : null;
    return {
      templateUid: currentTemplate && currentTemplate.__uid ? currentTemplate.__uid : null,
      templateName: currentTemplate && currentTemplate.name ? currentTemplate.name : '',
      instanceIndex: appState.currentInstanceIndex,
      instanceId:
        currentInstance && Object.prototype.hasOwnProperty.call(currentInstance, 'id')
          ? currentInstance.id
          : null,
      instanceName: currentInstance && currentInstance.name ? currentInstance.name : '',
      paramName: currentParam && currentParam.name ? currentParam.name : '',
      editMode: appState.currentEditMode || '',
    };
  }

  function restoreTemplateSelectionState(state, fallbackTemplateUid = null) {
    const templates = Array.isArray(appState.templates) ? appState.templates : [];
    if (templates.length === 0) {
      appState.currentTemplateIndex = -1;
      appState.currentInstanceIndex = -1;
      appState.selectedTemplates.clear();
      appState.selectedInstances.clear();
      return;
    }

    const preferredUid = state && state.templateUid ? state.templateUid : fallbackTemplateUid;
    let nextTemplateIndex =
      preferredUid != null
        ? templates.findIndex((tpl) => tpl && tpl.__uid === preferredUid)
        : -1;
    if (nextTemplateIndex < 0 && state && state.templateName) {
      nextTemplateIndex = templates.findIndex((tpl) => tpl && tpl.name === state.templateName);
    }
    if (nextTemplateIndex < 0 && fallbackTemplateUid) {
      nextTemplateIndex = templates.findIndex((tpl) => tpl && tpl.__uid === fallbackTemplateUid);
    }
    if (nextTemplateIndex < 0) {
      nextTemplateIndex = 0;
    }

    appState.currentTemplateIndex = nextTemplateIndex;
    appState.selectedTemplates.clear();
    appState.selectedTemplates.add(nextTemplateIndex);

    const instanceList = Array.isArray(templates[nextTemplateIndex]?.instances)
      ? templates[nextTemplateIndex].instances
      : [];
    appState.selectedInstances.clear();
    if (instanceList.length > 0) {
      let nextInstanceIndex =
        state && state.instanceId != null
          ? instanceList.findIndex((inst) => inst && inst.id === state.instanceId)
          : -1;
      if (nextInstanceIndex < 0 && state && state.instanceName) {
        nextInstanceIndex = instanceList.findIndex((inst) => inst && inst.name === state.instanceName);
      }
      if (nextInstanceIndex < 0) {
        const desiredInstanceIndex =
          state && Number.isInteger(state.instanceIndex) ? state.instanceIndex : 0;
        nextInstanceIndex = Math.max(0, Math.min(desiredInstanceIndex, instanceList.length - 1));
      }
      appState.currentInstanceIndex = nextInstanceIndex;
      appState.selectedInstances.add(nextInstanceIndex);
    } else {
      appState.currentInstanceIndex = -1;
    }

    const parameterList = Array.isArray(templates[nextTemplateIndex]?.parameters)
      ? templates[nextTemplateIndex].parameters
      : [];
    appState.selectedParams.clear();
    appState.editingParamIndex = -1;
    if (state && state.paramName) {
      const nextParamIndex = parameterList.findIndex((param) => param && param.name === state.paramName);
      if (nextParamIndex >= 0) {
        appState.editingParamIndex = nextParamIndex;
        appState.selectedParams.add(nextParamIndex);
      }
    }
  }

  function refreshTemplateViews() {
    refreshTemplates();
    refreshInstances();
    refreshParams();
    updateIndexTemplateOptions();
    if (isSheetModeActive()) {
      updateSheetTemplateNav();
      updateSheetInstanceTabs();
      renderLuckysheetForActiveInstance();
    }
  }

  async function rebuildManifestFromDisk() {
    if (!appState.dataEntityHandle) return [];
    const manifest = [];
    for await (const entry of appState.dataEntityHandle.values()) {
      if (entry.kind !== 'file') continue;
      const lowerName = entry.name.toLowerCase();
      if (!lowerName.endsWith('.json')) continue;
      if (lowerName === 'manifest.json' || lowerName === 'enum.json') continue;
      manifest.push({
        template: entry.name.slice(0, -5),
        path: entry.name,
      });
    }
    manifest.sort((a, b) => a.template.localeCompare(b.template, 'zh-Hans-CN'));
    await writeTextFile(appState.dataEntityHandle, 'manifest.json', JSON.stringify(manifest, null, 2));
    return manifest;
  }

  async function findDirectoryByNameRecursive(rootHandle, targetName) {
    if (!rootHandle || !targetName) return null;
    const queue = [rootHandle];
    const expected = String(targetName).trim().toLowerCase();
    while (queue.length > 0) {
      const current = queue.shift();
      for await (const entry of current.values()) {
        if (entry.kind !== 'directory') continue;
        const lowerName = String(entry.name || '').trim().toLowerCase();
        if (lowerName === expected) {
          return entry;
        }
        if (PREFAB_SEARCH_IGNORED_DIRECTORIES.has(lowerName)) {
          continue;
        }
        queue.push(entry);
      }
    }
    return null;
  }

  async function ensurePrefabDirectory() {
    const existing = await findDirectoryByNameRecursive(appState.directoryHandle, GODOT_PREFAB_FOLDER_NAME);
    if (existing) {
      return { handle: existing, created: false };
    }
    const created = await appState.directoryHandle.getDirectoryHandle(GODOT_PREFAB_FOLDER_NAME, {
      create: true,
    });
    return { handle: created, created: true };
  }

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
    if (!appState.directoryHandle || !appState.directoryHandle.name) return null;
    return `${ENUM_CACHE_PREFIX}${appState.directoryHandle.name}`;
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
    } catch (err) {
      console.warn('保存目录句柄失败', err);
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
    } catch (_err) {
      return null;
    }
  }

  async function saveEnumTemplateCache(tpl) {
    const key = getEnumCacheKey();
    if (!key) return;
    try {
      const db = await openDB();
      const payload = JSON.parse(
        JSON.stringify({
          name: tpl.name,
          parameters: tpl.parameters,
          instances: tpl.instances,
          indexField: tpl.indexField || 'id',
        }),
      );
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put({ key, template: payload });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('保存枚举模板缓存失败', err);
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
    } catch (err) {
      console.warn('读取枚举模板缓存失败', err);
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
    } catch (err) {
      console.warn('清除枚举模板缓存失败', err);
    }
  }

  async function verifyPermission(handle, readWrite = false) {
    if (!handle) return false;
    const opts = { mode: readWrite ? 'readwrite' : 'read' };
    try {
      if (handle.queryPermission) {
        const permission = await handle.queryPermission(opts);
        if (permission === 'granted') return true;
        if (permission === 'prompt' && handle.requestPermission) {
          const result = await handle.requestPermission(opts);
          return result === 'granted';
        }
        return false;
      }
    } catch (_err) {}
    return true;
  }

  function describeError(err) {
    if (!err) return 'Unknown error';
    if (typeof err === 'string') return err;
    const parts = [];
    if (err.name) parts.push(err.name);
    if (err.message && err.message !== err.name) parts.push(err.message);
    return parts.length > 0 ? parts.join(': ') : String(err);
  }

  async function initializeWorkspaceFromHandle(handle, successMessage = '') {
    if (!handle) return;
    try {
      appState.directoryHandle = handle;
      appState.configDirHandle = null;
      setCurrentDirectoryLabel(handle.name || '');
      await loadEditorConfigState();
      await ensureSubFolders();
      if (isCSharpMode()) {
        await ensureModelStruct();
        await generateRuntimeLoaderArtifacts();
      }
      await loadAllTemplates();
      refreshTemplates();
      updateIndexTemplateOptions();
      if (successMessage) {
        showMessage(successMessage);
      }
    } catch (err) {
      const detail = describeError(err);
      addLogEntry('error', `初始化工作目录失败: ${detail}`, {
        detail: err && err.stack ? err.stack : '',
      });
      throw new Error(detail);
    }
  }

  async function autoRestoreLastDirectory() {
    try {
      const handle = await getLastDirectoryHandle();
      if (!handle) return;
      if (navigator.storage && navigator.storage.persist) {
        try {
          await navigator.storage.persist();
        } catch (_err) {}
      }
      const ok = await verifyPermission(handle, true);
      if (!ok) return;
      await initializeWorkspaceFromHandle(handle, '已自动恢复上次工作目录');
    } catch (err) {
      console.warn('自动恢复目录失败', err);
    }
  }

  async function chooseDirectory() {
    try {
      const handle = await window.showDirectoryPicker();
      if (navigator.storage && navigator.storage.persist) {
        try {
          await navigator.storage.persist();
        } catch (_err) {}
      }
      await initializeWorkspaceFromHandle(handle, '工作目录已选择并加载完成');
      await saveLastDirectoryHandle(handle);
    } catch (err) {
      if (err && err.name === 'AbortError') {
        showMessage('已取消选择工作目录', 'warn');
        return;
      }
      const detail = describeError(err);
      console.error(err);
      addLogEntry('error', `选择工作目录失败: ${detail}`, {
        detail: err && err.stack ? err.stack : '',
      });
      showMessage(`选择工作目录失败：${detail}`, 'warn');
    }
  }

  async function refreshCurrentWorkspace() {
    if (!appState.directoryHandle) {
      showMessage('请先选择工作目录', 'warn');
      return { ok: false, reason: 'missing-directory' };
    }

    const commitResult = commitActiveSheetEdits();
    if (commitResult && commitResult.ok === false) {
      if (isSheetModeActive()) {
        updateSheetTemplateNav();
      }
      return { ok: false, reason: 'invalid-sheet' };
    }

    try {
      const hasPermission = await verifyPermission(appState.directoryHandle, false);
      if (!hasPermission) {
        showMessage('当前工作目录读取权限不可用，请重新选择目录', 'warn');
        return { ok: false, reason: 'permission-denied' };
      }

      const hasUnsavedChanges = hasUnsavedTemplateChanges();
      if (hasUnsavedChanges) {
        const confirmed = window.confirm(
          '检测到当前编辑器里还有未保存改动。继续刷新会用磁盘里的 JSON 覆盖这些修改，是否继续？',
        );
        if (!confirmed) {
          showMessage('已取消刷新', 'warn');
          return { ok: false, reason: 'canceled' };
        }
      }

      const selectionState = captureCurrentTemplateSelectionState();
      await loadEditorConfigState();
      await ensureSubFolders();
      await loadAllTemplates();
      restoreTemplateSelectionState(selectionState);
      appState.anchorTemplate = appState.currentTemplateIndex >= 0 ? appState.currentTemplateIndex : null;
      appState.anchorInstance = appState.currentInstanceIndex >= 0 ? appState.currentInstanceIndex : null;
      appState.anchorParam = appState.editingParamIndex >= 0 ? appState.editingParamIndex : null;
      appState.lastSelectedCategory = appState.editingParamIndex >= 0 ? 'param' : 'template';
      appState.sheetActiveTemplateIndex = appState.currentTemplateIndex;
      appState.sheetActiveInstanceIndex = appState.currentInstanceIndex;
      showSelectedParamDetails();
      refreshTemplateViews();
      showMessage(
        hasUnsavedChanges ? '已从磁盘刷新，未保存修改已被覆盖' : '已从磁盘刷新最新 JSON',
      );
      return { ok: true };
    } catch (err) {
      const detail = describeError(err);
      console.error(err);
      addLogEntry('error', `刷新工作目录失败: ${detail}`, {
        detail: err && err.stack ? err.stack : '',
      });
      showMessage(`刷新失败：${detail}`, 'warn');
      return { ok: false, reason: 'error', error: err };
    }
  }

  function shouldIgnoreFileEntry(entryName) {
    if (!entryName) return false;
    const lower = entryName.toLowerCase();
    if (IGNORED_FILE_NAMES.includes(lower)) return true;
    return IGNORED_FILE_SUFFIXES.some((suffix) => lower.endsWith(suffix));
  }

  function isAllowedCSharpRootFile(entryName) {
    if (!entryName) return false;
    const lower = entryName.toLowerCase();
    return ALLOWED_CSHARP_ROOT_FILE_SUFFIXES.some((suffix) => lower.endsWith(suffix));
  }

  async function removeDirectoryIfExists(parentHandle, name) {
    if (!parentHandle || typeof parentHandle.removeEntry !== 'function' || !name) return false;
    try {
      await parentHandle.removeEntry(name, { recursive: true });
      return true;
    } catch (err) {
      if (err && err.name === 'NotFoundError') {
        return false;
      }
      console.warn(`删除目录${name}失败`, err);
      return false;
    }
  }

  async function cleanConflictingEngineArtifacts() {
    if (!appState.directoryHandle) return;
    const scriptOutputRootHandle = await resolveScriptOutputRootHandle({ create: false });
    const removeScriptOutputDirectoryIfExists = async (name) => {
      if (!scriptOutputRootHandle) return false;
      return removeDirectoryIfExists(scriptOutputRootHandle, name);
    };
    if (isUnityMode()) {
      await removeScriptOutputDirectoryIfExists('godotCsharpDate');
      await removeDirectoryIfExists(appState.directoryHandle, 'godotCsharpDate');
      await removeDirectoryIfExists(appState.directoryHandle, 'cppmodel');
      appState.cppModelHandle = null;
      appState.cppEnumHandle = null;
      return;
    }
    if (isGodotMode()) {
      await removeScriptOutputDirectoryIfExists('csharpDate');
      await removeDirectoryIfExists(appState.directoryHandle, 'csharpDate');
      await removeDirectoryIfExists(appState.directoryHandle, 'cppmodel');
      appState.csharpHandle = null;
      appState.cppModelHandle = null;
      appState.cppEnumHandle = null;
      appState.editorHandle = null;
      appState.modelStructHandle = null;
      return;
    }
    await removeScriptOutputDirectoryIfExists('csharpDate');
    await removeScriptOutputDirectoryIfExists('godotCsharpDate');
    await removeDirectoryIfExists(appState.directoryHandle, 'csharpDate');
    await removeDirectoryIfExists(appState.directoryHandle, 'godotCsharpDate');
    appState.csharpHandle = null;
    appState.editorHandle = null;
    appState.modelStructHandle = null;
  }

  async function ensureSubFolders() {
    if (!appState.directoryHandle) return;
    appState.dataEntityHandle = await appState.directoryHandle.getDirectoryHandle('dataEntity', {
      create: true,
    });
    try {
      appState.trashHandle = await appState.dataEntityHandle.getDirectoryHandle(
        appState.TRASH_FOLDER_NAME,
        { create: true },
      );
    } catch (err) {
      console.warn('无法创建或访问垃圾箱目录', err);
      appState.trashHandle = null;
    }

    if (isCSharpMode()) {
      const csharpFolderName = isGodotMode() ? 'godotCsharpDate' : 'csharpDate';
      const scriptOutputRootHandle = await resolveScriptOutputRootHandle({ create: true });
      if (!scriptOutputRootHandle) {
        throw new Error('Unable to access scripts output directory');
      }
      appState.cppModelHandle = null;
      appState.cppEnumHandle = null;
      appState.csharpHandle = await scriptOutputRootHandle.getDirectoryHandle(csharpFolderName, {
        create: true,
      });
      appState.modelStructHandle = null;
      if (isUnityMode()) {
        try {
          appState.editorHandle = await appState.csharpHandle.getDirectoryHandle('Editor', {
            create: true,
          });
        } catch (err) {
          console.warn('无法创建或访问 Editor 文件夹', err);
          appState.editorHandle = null;
        }
      } else {
        appState.editorHandle = null;
      }
      for await (const entry of appState.csharpHandle.values()) {
        if (entry.kind === 'file' && shouldIgnoreFileEntry(entry.name)) {
          continue;
        }
        if (entry.kind === 'file' && !isAllowedCSharpRootFile(entry.name)) {
          showMessage(`${csharpFolderName} 文件夹内仅允许 .cs/.md/.txt 文件：${entry.name}`);
          throw new Error('Invalid file in csharpDate');
        }
        if (entry.kind === 'file') {
          const file = await entry.getFile();
          const text = await file.text();
          const hasMethod = /\bvoid\b|\bpublic\b|\bprivate\b/.test(text);
          if (hasMethod) {
            showMessage(`检测到已有 cs 文件包含方法，跳过读取：${entry.name}`);
          }
        }
      }
    } else {
      appState.csharpHandle = null;
      appState.editorHandle = null;
      appState.modelStructHandle = null;
      appState.cppModelHandle = await appState.directoryHandle.getDirectoryHandle('cppmodel', {
        create: true,
      });
      try {
        appState.cppEnumHandle = await appState.cppModelHandle.getDirectoryHandle('enum', {
          create: true,
        });
      } catch (err) {
        console.warn('无法创建或访问 enum 目录', err);
        appState.cppEnumHandle = null;
      }
      for await (const entry of appState.cppModelHandle.values()) {
        if (entry.kind === 'directory') continue;
        if (entry.kind === 'file' && shouldIgnoreFileEntry(entry.name)) {
          continue;
        }
        if (entry.kind === 'file' && !entry.name.toLowerCase().endsWith('.h')) {
          showMessage(`cppmodel 文件夹内仅允许 .h 文件：${entry.name}`);
          throw new Error('Invalid file in cppmodel');
        }
      }
    }

    for await (const entry of appState.dataEntityHandle.values()) {
      if (entry.kind === 'file' && shouldIgnoreFileEntry(entry.name)) {
        continue;
      }
      if (entry.kind === 'file' && !entry.name.toLowerCase().endsWith('.json')) {
        showMessage(`dataEntity 文件夹内仅允许 .json 文件：${entry.name}`);
        throw new Error('Invalid file in dataEntity');
      }
    }
  }

  async function ensureCppEnumDirectory() {
    if (appState.cppEnumHandle) return appState.cppEnumHandle;
    if (!appState.cppModelHandle) return null;
    try {
      appState.cppEnumHandle = await appState.cppModelHandle.getDirectoryHandle('enum', {
        create: true,
      });
    } catch (err) {
      console.warn('无法创建或访问 enum 目录', err);
      appState.cppEnumHandle = null;
    }
    return appState.cppEnumHandle;
  }

  async function deleteDataEntityFileIfExists(fileName) {
    if (!appState.dataEntityHandle || typeof appState.dataEntityHandle.removeEntry !== 'function') {
      return;
    }
    try {
      await appState.dataEntityHandle.removeEntry(fileName);
    } catch (err) {
      if (err && err.name === 'NotFoundError') {
        return;
      }
      console.warn(`删除 ${fileName} 失败`, err);
    }
  }

  async function deleteCSharpFileIfExists(templateName) {
    if (
      !templateName ||
      !appState.csharpHandle ||
      typeof appState.csharpHandle.removeEntry !== 'function'
    ) {
      return;
    }
    const fileName = `${templateName}.cs`;
    try {
      await appState.csharpHandle.removeEntry(fileName);
    } catch (err) {
      if (err && err.name === 'NotFoundError') {
        return;
      }
      console.warn(`删除 ${fileName} 失败`, err);
    }
  }

  async function moveTemplateJsonToTrash(templateName) {
    if (!templateName || !appState.dataEntityHandle) {
      return { moved: false, reason: 'no-data-entity' };
    }
    const handle = appState.trashHandle;
    if (!handle) {
      return { moved: false, reason: 'no-trash' };
    }
    const fileName = `${templateName}.json`;
    try {
      const fileHandle = await appState.dataEntityHandle.getFileHandle(fileName, { create: false });
      const file = await fileHandle.getFile();
      const content = await file.text();
      const destFile = await handle.getFileHandle(fileName, { create: true });
      const writable = await destFile.createWritable({ keepExistingData: false });
      await writable.write(content);
      await writable.close();
      if (typeof appState.dataEntityHandle.removeEntry === 'function') {
        await appState.dataEntityHandle.removeEntry(fileName);
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

  async function injectGodotRuntimeFiles(scriptOutputRootHandle, options = {}) {
    const results = [];
    for (const file of buildGodotRuntimeFiles()) {
      results.push(
        await writeManagedRelativeFile(scriptOutputRootHandle, file.relativePath, file.content, options),
      );
    }
    return results;
  }

  async function ensureSystemInitOrderTemplate() {
    if (!appState.dataEntityHandle) {
      return null;
    }

    const selectionState = captureCurrentTemplateSelectionState();
    let template = appState.templates.find(
      (item) => item && item.name === SYSTEM_INIT_ORDER_TEMPLATE_NAME,
    );
    let createdInMemory = false;

    if (!template) {
      template = buildSystemInitOrderTemplate();
      normalizeTemplateParameterIndexes(template);
      ensureTemplateUid(template);
      template.__fromDisk = false;
      appState.templates.push(template);
      appState.templates.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
      createdInMemory = true;
      restoreTemplateSelectionState(selectionState, template.__uid);
    } else {
      normalizeTemplateParameterIndexes(template);
      ensureTemplateUid(template);
    }

    const templateFileName = `${template.name}.json`;
    const serializedTemplate = JSON.stringify(
      {
        name: template.name,
        indexField: template.indexField || 'id',
        parameters: Array.isArray(template.parameters) ? template.parameters : [],
        instances: Array.isArray(template.instances) ? template.instances : [],
      },
      null,
      2,
    );
    const existingTemplateJson = await readTextFileIfExists(
      appState.dataEntityHandle,
      templateFileName,
    );
    let templateFileStatus = 'unchanged';
    if (existingTemplateJson == null) {
      await writeTextFile(appState.dataEntityHandle, templateFileName, serializedTemplate);
      templateFileStatus = 'created';
    } else if (existingTemplateJson !== serializedTemplate) {
      templateFileStatus = 'skipped';
    }

    let csharpFileStatus = 'not_applicable';
    if (appState.csharpHandle) {
      const csharpResult = await upsertManagedTextFile(
        appState.csharpHandle,
        `${template.name}.cs`,
        generateCSContent(template),
      );
      csharpFileStatus = csharpResult.status;
    }

    if (templateFileStatus !== 'skipped') {
      await rebuildManifestFromDisk();
      template.__fromDisk = true;
      if (appState.lastSavedStructureSnapshot instanceof Map && template.__uid) {
        appState.lastSavedStructureSnapshot.set(template.__uid, snapshotTemplateStructure(template));
      }
    }

    if (createdInMemory) {
      refreshTemplateViews();
    }

    return {
      templateName: template.name,
      createdInMemory,
      templateFileStatus,
      csharpFileStatus,
    };
  }

  async function injectGameRootScene(prefabHandle, scriptOutputRootName) {
    if (!prefabHandle) {
      return null;
    }
    const sceneContent = buildGodotGameRootSceneContent({ scriptOutputRootName });
    const result = await upsertManagedTextFile(prefabHandle, GODOT_GAME_ROOT_SCENE_NAME, sceneContent);
    return {
      ...result,
      relativePath: `${prefabHandle.name}/${GODOT_GAME_ROOT_SCENE_NAME}`,
    };
  }

  async function injectObjectBaseScene(prefabHandle, scriptOutputRootName) {
    if (!prefabHandle) {
      return null;
    }
    const sceneContent = buildGodotObjectBaseSceneContent({ scriptOutputRootName });
    const result = await upsertManagedTextFile(prefabHandle, GODOT_OBJECT_BASE_SCENE_NAME, sceneContent);
    return {
      ...result,
      relativePath: `${prefabHandle.name}/${GODOT_OBJECT_BASE_SCENE_NAME}`,
    };
  }

  function buildGodotInitializationSummary({
    runtimeResults,
    templateResult,
    prefabResult,
    sceneResult,
    objectBaseResult,
  }) {
    const runtimeStats = summarizeWriteResults(runtimeResults);
    const parts = [];

    if (runtimeStats.created > 0) {
      parts.push(`created ${runtimeStats.created} runtime files`);
    }
    if (runtimeStats.updated > 0) {
      parts.push(`updated ${runtimeStats.updated} runtime files`);
    }
    if (runtimeStats.unchanged > 0) {
      parts.push(`reused ${runtimeStats.unchanged} runtime files`);
    }
    if (runtimeStats.skipped > 0) {
      parts.push(`kept ${runtimeStats.skipped} custom runtime files`);
    }

    if (templateResult) {
      if (templateResult.createdInMemory || templateResult.templateFileStatus === 'created') {
        parts.push(`prepared ${templateResult.templateName} template`);
      } else if (templateResult.templateFileStatus === 'unchanged') {
        parts.push(`${templateResult.templateName} template ready`);
      } else if (templateResult.templateFileStatus === 'skipped') {
        parts.push(`kept existing ${templateResult.templateName} template`);
      }

      if (templateResult.csharpFileStatus === 'created') {
        parts.push(`generated ${templateResult.templateName}.cs`);
      } else if (templateResult.csharpFileStatus === 'skipped') {
        parts.push(`kept existing ${templateResult.templateName}.cs`);
      }
    }

    if (prefabResult && prefabResult.created) {
      parts.push(`created ${GODOT_PREFAB_FOLDER_NAME} directory`);
    }

    if (sceneResult) {
      if (sceneResult.status === 'created') {
        parts.push(`generated ${GODOT_GAME_ROOT_SCENE_NAME}`);
      } else if (sceneResult.status === 'unchanged') {
        parts.push(`${GODOT_GAME_ROOT_SCENE_NAME} ready`);
      } else if (sceneResult.status === 'skipped') {
        parts.push(`kept existing ${GODOT_GAME_ROOT_SCENE_NAME}`);
      }
    }

    if (objectBaseResult) {
      if (objectBaseResult.status === 'created') {
        parts.push(`generated ${GODOT_OBJECT_BASE_SCENE_NAME}`);
      } else if (objectBaseResult.status === 'unchanged') {
        parts.push(`${GODOT_OBJECT_BASE_SCENE_NAME} ready`);
      } else if (objectBaseResult.status === 'skipped') {
        parts.push(`kept existing ${GODOT_OBJECT_BASE_SCENE_NAME}`);
      }
    }

    if (parts.length === 0) {
      return 'Godot init complete; existing files were kept';
    }
    return `Godot init complete: ${parts.join(', ')}`;
  }

  async function initializeGodotProjectConfiguration() {
    if (!appState.directoryHandle) {
      showMessage('Please choose a workspace first', 'warn');
      return;
    }
    if (!isGodotMode()) {
      showMessage('Quick init is only available in Godot C# mode', 'warn');
      return;
    }

    try {
      await ensureSubFolders();
      await ensureModelStruct();
      await generateRuntimeLoaderArtifacts();

      const scriptOutputRootHandle = await resolveScriptOutputRootHandle({ create: true });
      if (!scriptOutputRootHandle) {
        throw new Error('Unable to access script output directory');
      }

      const runtimeResults = await injectGodotRuntimeFiles(scriptOutputRootHandle, { overwrite: true });
      const templateResult = await ensureSystemInitOrderTemplate();
      const prefabResult = await ensurePrefabDirectory();
      const sceneResult = await injectGameRootScene(prefabResult.handle, scriptOutputRootHandle.name);
      const objectBaseResult = await injectObjectBaseScene(prefabResult.handle, scriptOutputRootHandle.name);

      const summary = buildGodotInitializationSummary({
        runtimeResults,
        templateResult,
        prefabResult,
        sceneResult,
        objectBaseResult,
      });
      addLogEntry('info', summary);
      showMessage(summary);
    } catch (err) {
      console.error(err);
      const detail = err && err.message ? err.message : String(err);
      addLogEntry('error', `Godot quick init failed: ${detail}`, {
        detail: err && err.stack ? err.stack : '',
      });
      showMessage('Godot quick init failed, check logs for details', 'warn');
    }
  }

  return {
    getConfigDirectoryHandle,
    readEditorConfig,
    persistEditorConfig,
    loadEditorConfigState,
    ensureEngineGenerationConsent,
    openDB,
    getEnumCacheKey,
    saveLastDirectoryHandle,
    getLastDirectoryHandle,
    saveEnumTemplateCache,
    loadEnumTemplateCache,
    clearEnumTemplateCache,
    verifyPermission,
    autoRestoreLastDirectory,
    chooseDirectory,
    refreshCurrentWorkspace,
    shouldIgnoreFileEntry,
    removeDirectoryIfExists,
    cleanConflictingEngineArtifacts,
    ensureSubFolders,
    ensureCppEnumDirectory,
    ensureModelStruct,
    resolveScriptOutputRootHandle,
    readTextFileIfExists,
    writeTextFile,
    deleteDataEntityFileIfExists,
    deleteCSharpFileIfExists,
    moveTemplateJsonToTrash,
    initializeGodotProjectConfiguration,
  };
}

export function getWorkspaceStorageModule(context) {
  return createWorkspaceStorageModule(context);
}

export default createWorkspaceStorageModule;
