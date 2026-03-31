const DB_NAME = 'json-editor';
const DB_STORE = 'handles';
const ENUM_CACHE_PREFIX = 'enumCache:';
const IGNORED_FILE_SUFFIXES = ['.meta'];
const IGNORED_FILE_NAMES = ['.ds_store', 'thumbs.db'];

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
    showMessage = () => {},
    loadAllTemplates = async () => {},
    refreshTemplates = () => {},
    updateIndexTemplateOptions = () => {},
    generateRuntimeLoaderArtifacts = async () => {},
    ensureModelStruct = async () => {},
  } = context;

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

  async function initializeWorkspaceFromHandle(handle, successMessage = '') {
    if (!handle) return;
    appState.directoryHandle = handle;
    appState.configDirHandle = null;
    setCurrentDirectoryLabel(handle.name || '');
    await loadEditorConfigState();
    await ensureSubFolders();
    if (isUnityMode()) {
      await ensureModelStruct();
      await generateRuntimeLoaderArtifacts();
    }
    await loadAllTemplates();
    refreshTemplates();
    updateIndexTemplateOptions();
    if (successMessage) {
      showMessage(successMessage);
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
      console.error(err);
      showMessage('选择工作目录失败');
    }
  }

  function shouldIgnoreFileEntry(entryName) {
    if (!entryName) return false;
    const lower = entryName.toLowerCase();
    if (IGNORED_FILE_NAMES.includes(lower)) return true;
    return IGNORED_FILE_SUFFIXES.some((suffix) => lower.endsWith(suffix));
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
    if (isUnityMode()) {
      await removeDirectoryIfExists(appState.directoryHandle, 'cppmodel');
      appState.cppModelHandle = null;
      appState.cppEnumHandle = null;
      return;
    }
    await removeDirectoryIfExists(appState.directoryHandle, 'csharpDate');
    await removeDirectoryIfExists(appState.directoryHandle, 'Editor');
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

    if (isUnityMode()) {
      appState.cppModelHandle = null;
      appState.cppEnumHandle = null;
      appState.csharpHandle = await appState.directoryHandle.getDirectoryHandle('csharpDate', {
        create: true,
      });
      try {
        appState.editorHandle = await appState.directoryHandle.getDirectoryHandle('Editor', {
          create: true,
        });
      } catch (err) {
        console.warn('无法创建或访问 Editor 文件夹', err);
        appState.editorHandle = null;
      }
      for await (const entry of appState.csharpHandle.values()) {
        if (entry.kind === 'file' && shouldIgnoreFileEntry(entry.name)) {
          continue;
        }
        if (entry.kind === 'file' && !entry.name.toLowerCase().endsWith('.cs')) {
          showMessage(`csharpDate 文件夹内仅允许 .cs 文件：${entry.name}`);
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
    shouldIgnoreFileEntry,
    removeDirectoryIfExists,
    cleanConflictingEngineArtifacts,
    ensureSubFolders,
    ensureCppEnumDirectory,
    ensureModelStruct,
    readTextFileIfExists,
    writeTextFile,
    deleteDataEntityFileIfExists,
    deleteCSharpFileIfExists,
    moveTemplateJsonToTrash,
  };
}

export function getWorkspaceStorageModule(context) {
  return createWorkspaceStorageModule(context);
}

export default createWorkspaceStorageModule;
