function ensureContext(context) {
  if (!context || typeof context !== 'object') {
    throw new Error('createTemplatePersistenceModule requires a context object');
  }
  if (!context.appState || typeof context.appState !== 'object') {
    throw new Error('createTemplatePersistenceModule requires appState');
  }
}

export function createTemplatePersistenceModule(context) {
  ensureContext(context);

  const {
    appState,
    isUnityMode = () => true,
    isGodotMode = () => false,
    isSheetModeActive = () => false,
    updateSheetTemplateNav = () => {},
    commitActiveSheetEdits = () => ({ ok: true }),
    commitActiveFormEdits = () => {},
    setSaveBusy = () => {},
    ensureEngineGenerationConsent = async () => true,
    cleanConflictingEngineArtifacts = async () => {},
    ensureSubFolders = async () => {},
    resolveScriptOutputRootHandle = async () => null,
    ensureModelStruct = async () => {},
    ensureTrashDirectory = async () => appState.trashHandle,
    saveEnumTemplateCache = async () => {},
    loadEnumTemplateCache = async () => null,
    clearEnumTemplateCache = async () => {},
    readTextFileIfExists = async () => null,
    writeTextFile: writeTextFileRaw = async () => {},
    deleteDataEntityFileIfExists: deleteDataEntityFileRaw = async () => {},
    deleteCSharpFileIfExists = async () => {},
    moveTemplateJsonToTrash = async () => ({ moved: false }),
    persistEditorConfig = async () => {},
    refreshTrashButtonState = async () => {},
    refreshTrashOverlayContents = async () => {},
    refreshTemplates = () => {},
    refreshInstances = () => {},
    refreshParams = () => {},
    updateIndexTemplateOptions = () => {},
    updateTemplateNameInputValidity = () => {},
    updateInstanceNameInputValidity = () => {},
    updateParamNameInputValidity = () => {},
    addLogEntry = () => {},
    showMessage = () => {},
    generateCSContent = () => '',
    generateEnumCSFiles = async () => {},
    generateRuntimeLoaderArtifacts = async () => {},
    generateUECppStructuresForCurrentTemplates = async () => ({ invalidMessage: '' }),
    collectDuplicateIdInfo = () => ({ duplicates: new Map(), byIndex: new Map() }),
    collectListTypeViolations = () => ({ invalidInstances: new Map() }),
    ensureTemplateUid = () => null,
    normalizeTemplateParameterIndexes = () => {},
    populateMissingIndexFields = () => {},
    captureCurrentStructureSnapshot = () => new Map(),
    hasTemplateStructureChanged = () => true,
    normalizeContent = (value) => value || '',
    snapshotTemplateStructure = () => ({}),
    isEnumTemplate = () => false,
    ensureEnumParamNaming = () => {},
    getEnumTemplate = () => null,
  } = context;

  const isCSharpMode = () => isUnityMode() || isGodotMode();
  let saving = false;
  let diskSnapshot = null;
  let loadErrors = [];
  // Semantic baselines catch every editing route (forms, sheets, CSV, undo,
  // reference edits) without relying on each legacy handler remembering a flag.
  let savedTableSnapshots = new Map();
  const dirtyTableUids = new Set();

  function collectTableSnapshots() {
    return new Map(appState.templates.map((tpl) => {
      ensureTemplateUid(tpl);
      return [tpl.__uid, JSON.stringify(buildPersistedTemplateSnapshot(tpl))];
    }));
  }

  function getDirtyTemplateNames() {
    dirtyTableUids.clear();
    for (const [uid, snapshot] of collectTableSnapshots()) {
      if (snapshot !== savedTableSnapshots.get(uid)) dirtyTableUids.add(uid);
    }
    return appState.templates.filter(tpl => dirtyTableUids.has(tpl.__uid)).map(tpl => tpl.name);
  }

  async function assertFileUnchanged(name) {
    if (!diskSnapshot) return;
    const current = await readTextFileIfExists(appState.dataEntityHandle, name);
    if (current !== (diskSnapshot.get(name) ?? null)) throw new Error(`磁盘文件已被外部修改：${name}，请刷新核对后重试`);
  }

  async function writeTextFile(handle, name, content) {
    if (handle === appState.dataEntityHandle) await assertFileUnchanged(name);
    // Retain conflict checks, but avoid expensive browser write/close operations
    // (and filesystem notifications) for tables whose contents did not change.
    if (handle === appState.dataEntityHandle && diskSnapshot?.get(name) === content) return;
    await writeTextFileRaw(handle, name, content);
    if (handle === appState.dataEntityHandle && diskSnapshot) diskSnapshot.set(name, content);
  }

  async function deleteDataEntityFileIfExists(name) {
    await assertFileUnchanged(name);
    await deleteDataEntityFileRaw(name);
    // Confirm deletion: storage helpers may report a failure without throwing.
    const remaining = await readTextFileIfExists(appState.dataEntityHandle, name);
    if (remaining !== null) throw new Error(`未能删除 ${name}`);
    if (diskSnapshot) diskSnapshot.delete(name);
  }

  async function assertDiskUnchanged() {
    if (!diskSnapshot) throw new Error('请先加载工作目录，再保存');
    const current = new Map();
    for await (const entry of appState.dataEntityHandle.values()) {
      if (entry.kind !== 'file' || !entry.name.toLowerCase().endsWith('.json')) continue;
      current.set(entry.name, await (await entry.getFile()).text());
    }
    const names = new Set([...diskSnapshot.keys(), ...current.keys()]);
    const changed = [...names].filter((name) => diskSnapshot.get(name) !== current.get(name));
    if (changed.length) {
      throw new Error(`磁盘数据已被外部修改：${changed.join('、')}。请先备份当前编辑内容，再点击刷新核对，避免覆盖外部修改`);
    }
  }

  function validateBeforeSave() {
    if (loadErrors.length) throw new Error(`加载时存在异常文件：${loadErrors.join('、')}，请修复并刷新后保存`);
    const names = new Set();
    for (const tpl of appState.templates) {
      const name = String(tpl?.name || '');
      const key = name.toLowerCase();
      if (!name.trim() || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) || key === 'manifest' || names.has(key)) {
        throw new Error(`模板名称无效或重名：${name}`);
      }
      names.add(key);
      if (collectDuplicateIdInfo(tpl).byIndex.size) throw new Error(`模板 ${name} 存在重复 ID，请修正后保存（未写入任何数据）`);
      if (!isEnumTemplate(tpl) && collectListTypeViolations(tpl).invalidInstances.size) {
        throw new Error(`模板 ${name} 存在无效列表数据，请修正后保存（未写入任何数据）`);
      }
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
          clone.payload.index = indexSource == null ? String(clone.payload.id ?? '') : String(indexSource);
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

  async function writeManifestForTemplates(templates = appState.templates) {
    if (!appState.dataEntityHandle) return;
    const manifest = templates
      .filter((tpl) => !isEnumTemplate(tpl))
      .map((tpl) => ({ template: tpl.name, path: `${tpl.name}.json` }));
    await writeTextFile(appState.dataEntityHandle, 'manifest.json', JSON.stringify(manifest, null, 2));
  }

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

  function resetTemplateLoadState() {
    diskSnapshot = new Map();
    savedTableSnapshots = new Map();
    dirtyTableUids.clear();
    loadErrors = [];
    appState.templates.length = 0;
    appState.currentTemplateIndex = -1;
    appState.currentInstanceIndex = -1;
    appState.templateUidState.counter = 0;
    appState.lastSavedStructureSnapshot = new Map();
    appState.lastLoadedTemplateSnapshot = '[]';
    appState.pendingTemplateDeletions.clear();
  }

  function buildPersistedTemplateSnapshot(tpl) {
    if (!tpl) return null;
    const source = isEnumTemplate(tpl)
      ? buildEnumTemplateJson(tpl)
      : {
          name: tpl.name,
          indexField: tpl.indexField || 'id',
          parameters: Array.isArray(tpl.parameters) ? tpl.parameters : [],
          instances: Array.isArray(tpl.instances) ? tpl.instances : [],
        };
    if (!source || !source.name) return null;
    return JSON.parse(JSON.stringify(source));
  }

  function getCurrentTemplatePersistenceSnapshot() {
    const snapshot = appState.templates
      .map((tpl) => buildPersistedTemplateSnapshot(tpl))
      .filter(Boolean)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN'));
    return JSON.stringify(snapshot);
  }

  function hasUnsavedTemplateChanges() {
    return getCurrentTemplatePersistenceSnapshot() !== (appState.lastLoadedTemplateSnapshot || '[]');
  }

  function hydrateTemplateFromJson(obj) {
    if (!obj || !obj.name || !Array.isArray(obj.parameters) || !Array.isArray(obj.instances)) {
      return null;
    }
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
      ensureEnumParamNaming(template);
    }
    ensureTemplateUid(template);
    template.__fromDisk = true;
    return template;
  }

  async function loadAllTemplates() {
    resetTemplateLoadState();
    let enumLoadedFromJson = false;

    for await (const entry of appState.dataEntityHandle.values()) {
      if (entry.kind !== 'file' || !entry.name.toLowerCase().endsWith('.json')) {
        continue;
      }
      try {
        const file = await entry.getFile();
        const text = await file.text();
        diskSnapshot.set(entry.name, text);
        if (entry.name.toLowerCase() === 'manifest.json') continue;
        const obj = JSON.parse(text);
        const template = hydrateTemplateFromJson(obj);
        // The data directory can also contain standalone settings JSON.
        if (!template && !obj?.name) continue;
        if (!template || entry.name !== `${template.name}.json`) {
          loadErrors.push(entry.name);
          showMessage(`模板格式或文件名不匹配：${entry.name}，保存已阻止`, 'warn');
          continue;
        }
        if (isEnumTemplate(template)) {
          enumLoadedFromJson = true;
        }
        appState.templates.push(template);
      } catch (_err) {
        loadErrors.push(entry.name);
        showMessage(`无法解析 ${entry.name}，已跳过`);
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
        appState.templates.push(cachedEnum);
      }
    }

    appState.templates.sort((a, b) => a.name.localeCompare(b.name));
    populateMissingIndexFields(appState.templates);
    if (appState.templates.length > 0) {
      appState.currentTemplateIndex = 0;
      appState.currentInstanceIndex =
        appState.templates[0].instances.length > 0 ? 0 : -1;
    }
    appState.lastSavedStructureSnapshot = captureCurrentStructureSnapshot();
    appState.lastLoadedTemplateSnapshot = getCurrentTemplatePersistenceSnapshot();
    savedTableSnapshots = collectTableSnapshots();
    for (const tpl of appState.templates) {
      if (!tpl.__fromDisk) savedTableSnapshots.delete(tpl.__uid);
    }
    await refreshTrashButtonState();
  }

  async function restoreTemplateFromTrash(templateName) {
    if (!templateName) return;
    if (!appState.directoryHandle) {
      showMessage('请先选择工作目录', 'warn');
      return;
    }
    try {
      await cleanConflictingEngineArtifacts();
      await ensureSubFolders();
    } catch (err) {
      console.warn('恢复模板时无法确保目录结构', err);
      showMessage('恢复失败，请检查权限', 'warn');
      return;
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
    if (appState.templates.some((tpl) => tpl && tpl.name === parsed.name)) {
      showMessage('已有同名模板，请先处理重名', 'warn');
      return;
    }

    try {
      await writeTextFile(appState.dataEntityHandle, fileName, fileText);
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
    appState.templates.push(template);
    populateMissingIndexFields(appState.templates);
    appState.templates.sort((a, b) => a.name.localeCompare(b.name));
    const idx = appState.templates.findIndex((tpl) => tpl.__uid === template.__uid);
    appState.selectedTemplates.clear();
    appState.selectedInstances.clear();
    appState.selectedParams.clear();
    if (idx >= 0) {
      appState.currentTemplateIndex = idx;
      appState.selectedTemplates.add(idx);
      appState.currentInstanceIndex = template.instances.length > 0 ? 0 : -1;
    } else {
      appState.currentTemplateIndex = appState.templates.length > 0 ? 0 : -1;
      appState.currentInstanceIndex =
        appState.currentTemplateIndex >= 0 &&
        appState.templates[appState.currentTemplateIndex].instances.length > 0
          ? 0
          : -1;
    }
    appState.editingParamIndex = -1;
    refreshTemplates();
    refreshInstances();
    refreshParams();
    updateIndexTemplateOptions();
    updateTemplateNameInputValidity();
    updateInstanceNameInputValidity();
    updateParamNameInputValidity();
    appState.lastSelectedCategory = 'template';
    appState.pendingTemplateDeletions.delete(templateName);
    if (template.__uid) {
      appState.lastSavedStructureSnapshot.set(template.__uid, snapshotTemplateStructure(template));
    }

    let restoreInvalidMessage = '';
    try {
      if (isEnumTemplate(template)) {
        await saveEnumTemplateCache(template);
        const enumJson = buildEnumTemplateJson(template);
        if (enumJson) {
          await writeTextFile(
            appState.dataEntityHandle,
            `${template.name}.json`,
            JSON.stringify(enumJson, null, 2),
          );
        }
      }
      await writeManifestForTemplates();
      if (isCSharpMode()) {
        if (!isEnumTemplate(template)) {
          const csContent = generateCSContent(template);
          await writeTextFile(appState.csharpHandle, `${template.name}.cs`, csContent);
        }
        await generateEnumCSFiles(getEnumTemplate());
        await generateRuntimeLoaderArtifacts();
      } else {
        const result = await generateUECppStructuresForCurrentTemplates();
        if (result.invalidMessage) {
          restoreInvalidMessage = result.invalidMessage;
          addLogEntry('warn', result.invalidMessage);
        }
      }
    } catch (err) {
      console.warn('恢复模板后生成文件失败', err);
      showMessage('模板已恢复，但生成关联文件失败，请手动保存', 'warn');
      await refreshTrashButtonState();
      await refreshTrashOverlayContents();
      return;
    }

    if (restoreInvalidMessage) {
      showMessage(`${restoreInvalidMessage}（模板：${template.name}）`, 'warn');
    } else {
      showMessage(`已恢复模板：${template.name}`);
    }
    appState.lastLoadedTemplateSnapshot = getCurrentTemplatePersistenceSnapshot();
    savedTableSnapshots.set(template.__uid, JSON.stringify(buildPersistedTemplateSnapshot(template)));
    await refreshTrashButtonState();
    await refreshTrashOverlayContents();
  }

  async function collectCSharpSavePlan() {
    let targetHandle = null;
    const scriptRoot = await resolveScriptOutputRootHandle({ create: false });
    if (scriptRoot) {
      try {
        targetHandle = await scriptRoot.getDirectoryHandle(isGodotMode() ? 'godotCsharpDate' : 'csharpDate', { create: false });
      } catch (err) {
        if (err?.name !== 'NotFoundError') throw err;
      }
    }
    const templateDecisions = new Map();
    const csCache = new Map();
    const pendingStructureDecision = [];

    for (const tpl of appState.templates) {
      ensureTemplateUid(tpl);
      if (isEnumTemplate(tpl)) continue;
      const structureChanged = hasTemplateStructureChanged(tpl);
      const csContent = generateCSContent(tpl);
      const existingCs = await readTextFileIfExists(targetHandle, `${tpl.name}.cs`);
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
        return { canceled: true };
      }
      if (answer === 'jsonOnly') return { canceled: false, dataOnly: true, templateDecisions: new Map(), csCache: new Map() };
      for (const tpl of pendingStructureDecision) {
        templateDecisions.set(tpl.__uid, {
          decision: answer === 'replace' ? 'replace' : 'jsonOnly',
          structureChanged: true,
        });
      }
    }

    return { canceled: false, templateDecisions, csCache };
  }

  function buildInvalidListEntry(tpl, listValidation) {
    const invalidListIndices = new Set(listValidation.invalidInstances.keys());
    const skippedListEntries = [];
    listValidation.invalidInstances.forEach((paramErrors, instIdx) => {
      if (!invalidListIndices.has(instIdx)) return;
      const inst = tpl.instances[instIdx];
      skippedListEntries.push({
        index: instIdx,
        id: inst && Object.prototype.hasOwnProperty.call(inst, 'id') ? inst.id : '',
        name: inst && inst.name,
        params: paramErrors,
      });
    });
    return {
      invalidListIndices,
      warning: {
        name: tpl.name,
        count: invalidListIndices.size,
        instances: skippedListEntries,
      },
    };
  }

  async function writeTemplateJsonFiles(templateDecisions, csCache, templates) {
    let enumTemplateSaved = templates.some(isEnumTemplate);
    const duplicateIdWarnings = [];
    const listValidationWarnings = [];

    for (const tpl of templates) {
      ensureTemplateUid(tpl);
      const meta = templateDecisions.get(tpl.__uid);
      if (!dirtyTableUids.has(tpl.__uid) && meta?.decision !== 'replace') continue;
      normalizeTemplateParameterIndexes(tpl);
      if (isEnumTemplate(tpl)) {
        if (!dirtyTableUids.has(tpl.__uid)) continue;
        await saveEnumTemplateCache(tpl);
        enumTemplateSaved = true;
        const enumJsonObj = buildEnumTemplateJson(tpl);
        if (enumJsonObj) {
          await writeTextFile(
            appState.dataEntityHandle,
            `${tpl.name}.json`,
            JSON.stringify(enumJsonObj, null, 2),
          );
        }
        tpl.__fromDisk = true;
        continue;
      }

      const duplicateIdInfo = collectDuplicateIdInfo(tpl);
      const duplicateIndices = new Set(duplicateIdInfo.byIndex.keys());
      const listValidation = collectListTypeViolations(tpl);
      const { invalidListIndices, warning } = buildInvalidListEntry(tpl, listValidation);
      if (duplicateIndices.size || invalidListIndices.size) {
        throw new Error(`模板 ${tpl.name} 校验失败，保存已中止，未剔除任何实例`);
      }
      const cleanedInstances = Array.isArray(tpl.instances) ? tpl.instances : [];

      if (duplicateIndices.size > 0) {
        duplicateIdWarnings.push({
          name: tpl.name,
          count: duplicateIndices.size,
          values: Array.from(duplicateIdInfo.duplicates.keys()).map((key) =>
            key === '' ? '（空）' : key,
          ),
        });
      }
      if (invalidListIndices.size > 0) {
        listValidationWarnings.push(warning);
      }

      const json = JSON.stringify(
        {
          name: tpl.name,
          indexField: tpl.indexField || 'id',
          parameters: tpl.parameters,
          instances: cleanedInstances,
        },
        null,
        2,
      );
      if (dirtyTableUids.has(tpl.__uid)) {
        showMessage(`正在保存：${tpl.name}`);
        await writeTextFile(appState.dataEntityHandle, `${tpl.name}.json`, json);
      }
      tpl.__fromDisk = true;

      if (meta && meta.decision === 'replace') {
        const content = csCache.get(tpl.__uid) || generateCSContent(tpl);
        await writeTextFile(appState.csharpHandle, `${tpl.name}.cs`, content);
      }
    }

    return { enumTemplateSaved, duplicateIdWarnings, listValidationWarnings };
  }

  async function processPendingDeletions(refreshScripts, templates, pendingDeletions) {
    const trashFailures = [];
    const deletionsToProcess = [];
    const clearPending = name => {
      if (appState.pendingTemplateDeletions.get(name) === pendingDeletions.get(name)) appState.pendingTemplateDeletions.delete(name);
    };
    for (const [name] of pendingDeletions) {
      if (templates.some((tpl) => tpl && tpl.name === name)) {
        clearPending(name);
        continue;
      }
      deletionsToProcess.push(name);
    }

    if (deletionsToProcess.length > 0) {
      await ensureTrashDirectory();
      for (const name of deletionsToProcess) {
        await assertFileUnchanged(`${name}.json`);
        const result = await moveTemplateJsonToTrash(name);
        if (result && result.moved) {
          if (diskSnapshot) diskSnapshot.delete(`${name}.json`);
          clearPending(name);
          if (refreshScripts) await deleteCSharpFileIfExists(name);
        } else {
          trashFailures.push(name);
        }
      }
    }

    return { trashFailures };
  }

  async function runPostSaveGenerators() {
    let ueGenerationInfo = null;
    let ueInvalidNameMessage = '';
    if (isCSharpMode()) {
      await generateEnumCSFiles(getEnumTemplate());
    } else {
      ueGenerationInfo = await generateUECppStructuresForCurrentTemplates();
      if (ueGenerationInfo && ueGenerationInfo.invalidMessage) {
        ueInvalidNameMessage = ueGenerationInfo.invalidMessage;
        addLogEntry('warn', ueInvalidNameMessage);
      }
    }
    return { ueGenerationInfo, ueInvalidNameMessage };
  }

  function reportSaveWarnings({
    trashFailures,
    duplicateIdWarnings,
    listValidationWarnings,
    ueInvalidNameMessage,
    refreshScripts,
  }) {
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

    const warningMessages = [];
    if (trashFailures.length > 0) {
      const detail = trashFailures.join(', ');
      addLogEntry('warn', '以下模板移入垃圾箱失败', { detail });
      warningMessages.push('部分模板移入垃圾箱失败，请检查日志');
    }
    if (duplicateIdWarnings.length > 0) {
      warningMessages.push(
        `以下模板存在重复 ID：${duplicateIdWarnings.map((item) => item.name).join(', ')}`,
      );
    }
    if (listValidationWarnings.length > 0) {
      const names = listValidationWarnings.map((item) => item.name).join(', ');
      const detail = listValidationWarnings
        .map((item) => {
          const instanceLines = (item.instances || [])
            .map((info) => {
              const headerParts = [`序号 ${info.index + 1}`];
              if (info.id !== undefined && info.id !== null && info.id !== '') {
                headerParts.push(`ID ${info.id}`);
              }
              if (info.name) {
                headerParts.push(`名称 ${info.name}`);
              }
              const paramLines = (info.params || [])
                .map((paramError) => {
                  const errorDetails = (paramError.errors || [])
                    .map((err) => {
                      if (err && Number.isInteger(err.index) && err.index >= 0) {
                        return `${err.reason || '类型不匹配'} @${err.index + 1}`;
                      }
                      return err && err.reason ? err.reason : '类型不匹配';
                    })
                    .join(' / ');
                  return `${paramError.paramName}: ${errorDetails || '类型不匹配'}`;
                })
                .join('；');
              return `${headerParts.join('，')} -> ${paramLines || '类型不匹配'}`;
            })
            .join('\n    ');
          return `${item.name}:\n    ${instanceLines || '无实例信息'}`;
        })
        .join('\n');
      addLogEntry('warn', '以下模板包含无效的列表数据，相关实例已跳过保存', { detail });
      warningMessages.push(`以下模板包含无效的列表数据：${names}`);
    }
    if (ueInvalidNameMessage) {
      warningMessages.push(ueInvalidNameMessage);
    }

    if (warningMessages.length > 0) {
      showMessage(warningMessages.join('；'), 'warn');
    } else {
      showMessage(refreshScripts ? '已保存数据并刷新脚本' : '已保存数据（未刷新脚本）');
    }
  }

  async function saveAll({ refreshScripts = false } = {}) {
    if (saving) {
      showMessage('正在保存，请稍候', 'warn');
      return;
    }
    saving = true;
    try {
      setSaveBusy(true);
      showMessage('正在保存，请稍候');
      commitActiveFormEdits();
      const commitResult = commitActiveSheetEdits();
      if (commitResult && commitResult.ok === false) {
        if (isSheetModeActive()) {
          updateSheetTemplateNav();
        }
        return;
      }
      if (!appState.directoryHandle) {
        alert('请先选择工作目录');
        return;
      }

      validateBeforeSave();
      await assertDiskUnchanged();
      if (refreshScripts) {
        const consent = await ensureEngineGenerationConsent('保存并生成文件');
        if (!consent) return;
      }

      let templateDecisions = new Map();
      let csCache = new Map();
      if (refreshScripts && isCSharpMode()) {
        // Inspect existing scripts without cleanup, so cancel/data-only are side-effect free.
        const plan = await collectCSharpSavePlan();
        if (plan.canceled) {
          showMessage('已取消保存');
          return;
        }
        templateDecisions = plan.templateDecisions;
        csCache = plan.csCache;
        if (plan.dataOnly) refreshScripts = false;
      }

      if (refreshScripts) await cleanConflictingEngineArtifacts();
      await ensureSubFolders({ dataOnly: !refreshScripts });
      if (refreshScripts && isCSharpMode()) await ensureModelStruct();
      await ensureTrashDirectory();
      await assertDiskUnchanged();
      validateBeforeSave();
      // Edits made while asynchronous I/O runs must remain marked as unsaved.
      const savedTemplateSnapshot = getCurrentTemplatePersistenceSnapshot();
      const savedStructureSnapshot = captureCurrentStructureSnapshot();
      getDirtyTemplateNames();
      const savedTables = collectTableSnapshots();
      // Write a fixed batch; edits made during I/O belong to the next save.
      const saveTemplates = appState.templates.map(tpl => ({
        ...JSON.parse(savedTables.get(tpl.__uid)), __uid: tpl.__uid,
      }));
      const pendingDeletions = new Map(appState.pendingTemplateDeletions);

      await writeTextFileRaw(appState.dataEntityHandle, '.data-save-in-progress', String(Date.now()));
      const {
        enumTemplateSaved,
        duplicateIdWarnings,
        listValidationWarnings,
      } = await writeTemplateJsonFiles(templateDecisions, csCache, saveTemplates);
      const { trashFailures } = await processPendingDeletions(refreshScripts, saveTemplates, pendingDeletions);
      if (trashFailures.length) throw new Error(`部分模板移入垃圾箱失败：${trashFailures.join('、')}；其他文件可能已保存，请检查后重试`);
      const { ueInvalidNameMessage } = refreshScripts ? await runPostSaveGenerators() : { ueInvalidNameMessage: '' };

      if (!enumTemplateSaved) {
        await clearEnumTemplateCache();
        if (diskSnapshot.has('enum.json')) await deleteDataEntityFileIfExists('enum.json');
      }

      await writeManifestForTemplates(saveTemplates);
      if (refreshScripts && isCSharpMode()) {
        await generateRuntimeLoaderArtifacts();
      }
      await persistEditorConfig();
      await refreshTrashButtonState();
      await refreshTrashOverlayContents();

      // Success means the runtime can reload now, not merely that JSON writes
      // have completed. A failed unlock must remain retryable and dirty.
      await appState.dataEntityHandle.removeEntry('.data-save-in-progress');
      if (refreshScripts) appState.lastSavedStructureSnapshot = savedStructureSnapshot;
      appState.lastLoadedTemplateSnapshot = savedTemplateSnapshot;
      savedTableSnapshots = savedTables;
      for (const tpl of appState.templates) {
        const saved = savedTables.get(tpl.__uid);
        if (saved && JSON.parse(saved).name === tpl.name) tpl.__fromDisk = true;
      }
      getDirtyTemplateNames();
      reportSaveWarnings({
        trashFailures,
        duplicateIdWarnings,
        listValidationWarnings,
        ueInvalidNameMessage,
        refreshScripts,
      });
      if (hasUnsavedTemplateChanges()) showMessage('本次数据已保存；保存期间有新修改，请再次保存', 'warn');
    } catch (err) {
      console.error(err);
      showMessage(`保存失败：${err?.message || '请检查权限'}。若已开始写入，部分文件可能已保存`, 'warn');
    } finally {
      // Failed-save markers deliberately remain: runtime must reject a partial batch.
      saving = false;
      setSaveBusy(false);
    }
  }

  return {
    loadAllTemplates,
    getCurrentTemplatePersistenceSnapshot,
    hasUnsavedTemplateChanges,
    getDirtyTemplateNames,
    buildEnumTemplateJson,
    writeManifestForTemplates,
    askCSharpReplacementBulk,
    restoreTemplateFromTrash,
    saveAll,
  };
}

export function getTemplatePersistenceModule(context) {
  return createTemplatePersistenceModule(context);
}

export default createTemplatePersistenceModule;
