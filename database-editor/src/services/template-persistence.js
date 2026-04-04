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
    ensureEngineGenerationConsent = async () => true,
    cleanConflictingEngineArtifacts = async () => {},
    ensureSubFolders = async () => {},
    ensureModelStruct = async () => {},
    ensureTrashDirectory = async () => appState.trashHandle,
    saveEnumTemplateCache = async () => {},
    loadEnumTemplateCache = async () => null,
    clearEnumTemplateCache = async () => {},
    readTextFileIfExists = async () => null,
    writeTextFile = async () => {},
    deleteDataEntityFileIfExists = async () => {},
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

  async function writeManifestForTemplates() {
    if (!appState.dataEntityHandle) return;
    const manifest = appState.templates
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
    appState.templates.length = 0;
    appState.currentTemplateIndex = -1;
    appState.currentInstanceIndex = -1;
    appState.templateUidState.counter = 0;
    appState.lastSavedStructureSnapshot = new Map();
    appState.pendingTemplateDeletions.clear();
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
      if (entry.name.toLowerCase() === 'manifest.json') continue;
      try {
        const file = await entry.getFile();
        const obj = JSON.parse(await file.text());
        const template = hydrateTemplateFromJson(obj);
        if (!template) continue;
        if (isEnumTemplate(template)) {
          enumLoadedFromJson = true;
        }
        appState.templates.push(template);
      } catch (_err) {
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
    await refreshTrashButtonState();
    await refreshTrashOverlayContents();
  }

  async function collectCSharpSavePlan() {
    const templateDecisions = new Map();
    const csCache = new Map();
    const pendingStructureDecision = [];

    for (const tpl of appState.templates) {
      ensureTemplateUid(tpl);
      if (isEnumTemplate(tpl)) continue;
      const structureChanged = hasTemplateStructureChanged(tpl);
      if (!structureChanged) {
        templateDecisions.set(tpl.__uid, { decision: 'jsonOnly', structureChanged: false });
        continue;
      }
      const csContent = generateCSContent(tpl);
      const existingCs = await readTextFileIfExists(appState.csharpHandle, `${tpl.name}.cs`);
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

  async function writeTemplateJsonFiles(templateDecisions, csCache) {
    let enumTemplateSaved = false;
    const duplicateIdWarnings = [];
    const listValidationWarnings = [];

    for (const tpl of appState.templates) {
      ensureTemplateUid(tpl);
      normalizeTemplateParameterIndexes(tpl);
      if (isEnumTemplate(tpl)) {
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
      const cleanedInstances = Array.isArray(tpl.instances)
        ? tpl.instances.filter((_, idx) => !duplicateIndices.has(idx) && !invalidListIndices.has(idx))
        : [];

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
      await writeTextFile(appState.dataEntityHandle, `${tpl.name}.json`, json);
      tpl.__fromDisk = true;

      const meta = templateDecisions.get(tpl.__uid);
      if (meta && meta.decision === 'replace') {
        const content = csCache.get(tpl.__uid) || generateCSContent(tpl);
        await writeTextFile(appState.csharpHandle, `${tpl.name}.cs`, content);
      }
    }

    return { enumTemplateSaved, duplicateIdWarnings, listValidationWarnings };
  }

  async function processPendingDeletions() {
    const trashFailures = [];
    const deletionsToProcess = [];
    for (const [name] of Array.from(appState.pendingTemplateDeletions.entries())) {
      if (appState.templates.some((tpl) => tpl && tpl.name === name)) {
        appState.pendingTemplateDeletions.delete(name);
        continue;
      }
      deletionsToProcess.push(name);
    }

    if (deletionsToProcess.length > 0) {
      await ensureTrashDirectory();
      for (const name of deletionsToProcess) {
        const result = await moveTemplateJsonToTrash(name);
        if (result && result.moved) {
          appState.pendingTemplateDeletions.delete(name);
          await deleteCSharpFileIfExists(name);
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
      showMessage('已保存所有更改');
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
    if (!appState.directoryHandle) {
      alert('请先选择工作目录');
      return;
    }

    try {
      const consent = await ensureEngineGenerationConsent('保存并生成文件');
      if (!consent) return;

      await cleanConflictingEngineArtifacts();
      await ensureSubFolders();
      if (isCSharpMode()) {
        await ensureModelStruct();
      }
      await ensureTrashDirectory();

      let templateDecisions = new Map();
      let csCache = new Map();
      if (isCSharpMode()) {
        const plan = await collectCSharpSavePlan();
        if (plan.canceled) {
          showMessage('已取消保存');
          return;
        }
        templateDecisions = plan.templateDecisions;
        csCache = plan.csCache;
      }

      const {
        enumTemplateSaved,
        duplicateIdWarnings,
        listValidationWarnings,
      } = await writeTemplateJsonFiles(templateDecisions, csCache);
      const { trashFailures } = await processPendingDeletions();
      const { ueInvalidNameMessage } = await runPostSaveGenerators();

      if (!enumTemplateSaved) {
        await clearEnumTemplateCache();
        await deleteDataEntityFileIfExists('enum.json');
      }

      await writeManifestForTemplates();
      if (isCSharpMode()) {
        await generateRuntimeLoaderArtifacts();
      }
      await persistEditorConfig();
      appState.lastSavedStructureSnapshot = captureCurrentStructureSnapshot();
      await refreshTrashButtonState();
      await refreshTrashOverlayContents();

      reportSaveWarnings({
        trashFailures,
        duplicateIdWarnings,
        listValidationWarnings,
        ueInvalidNameMessage,
      });
    } catch (err) {
      console.error(err);
      showMessage('保存失败，请检查权限');
    }
  }

  return {
    loadAllTemplates,
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
