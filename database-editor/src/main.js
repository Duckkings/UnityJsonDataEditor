// Legacy runtime implementation. The active entry is `src/main.js`.
import {
  createDefaultReferenceValue,
  ensureParamElementType,
  getListElementTypeForParam,
  getValidListElementType,
  isEnumValueInvalid as isEnumValueInvalidPure,
  isPureNumericName,
  isTemplateNameInvalid as isTemplateNameInvalidPure,
  isUENameCompliant,
  normalizeReferenceList,
  normalizeReferenceValue,
  unwrapReferencePayload,
  wrapReferencePayload as wrapReferencePayloadPure,
} from './core/form-and-reference.js';
import {
  captureCurrentStructureSnapshot as captureCurrentStructureSnapshotPure,
  ensureTemplateUid as ensureTemplateUidPure,
  hasTemplateStructureChanged as hasTemplateStructureChangedPure,
  normalizeContent as normalizeContentPure,
  normalizeTemplateParameterIndexes as normalizeTemplateParameterIndexesPure,
  populateMissingIndexFields as populateMissingIndexFieldsPure,
  snapshotTemplateStructure as snapshotTemplateStructurePure,
  structuresEqual as structuresEqualPure,
} from './domain/template-normalizer.js';
import {
  buildListElementTypeCollections as buildListElementTypeCollectionsPure,
  chooseDuplicateNavigationTarget as chooseDuplicateNavigationTargetPure,
  collectDuplicateIdInfo as collectDuplicateIdInfoPure,
  collectDuplicateIndexInfo as collectDuplicateIndexInfoPure,
  collectInstanceIndexInvalidReasons as collectInstanceIndexInvalidReasonsPure,
  computeExpectedIndexValue as computeExpectedIndexValuePure,
  doesTemplateContainValue,
  doesTemplateHaveField,
  doesTemplateHaveInvalidIndexReferences as doesTemplateHaveInvalidIndexReferencesPure,
  enforceEnumIndexField as enforceEnumIndexFieldPure,
  ensureEnumParamNaming as ensureEnumParamNamingPure,
  evaluateInstanceIndexValidation as evaluateInstanceIndexValidationPure,
  findTemplateByName as findTemplateByNamePure,
  formatIndexCell as formatIndexCellPure,
  getEnumCSharpTypeName as getEnumCSharpTypeNamePure,
  getEnumDefinition as getEnumDefinitionPure,
  getEnumDefinitions as getEnumDefinitionsPure,
  getEnumParamKeysForInstance as getEnumParamKeysForInstancePure,
  getEnumTemplate as getEnumTemplatePure,
  getEnumValues as getEnumValuesPure,
  getInstanceFieldValue,
  getNumericInstanceId as getNumericInstanceIdPure,
  isEnumTemplate as isEnumTemplatePure,
  isEnumType as isEnumTypePure,
  parseIndexDataCell as parseIndexDataCellPure,
  parseIndexTypeCell as parseIndexTypeCellPure,
  resolveIndexFieldMeta as resolveIndexFieldMetaPure,
  sanitizeCSharpMemberName as sanitizeCSharpMemberNamePure,
  sanitizeCSharpTypeName as sanitizeCSharpTypeNamePure,
} from './domain/index-enum-validation.js';
import {
  coerceListElementValue as coerceListElementValuePure,
  collectListTypeViolations as collectListTypeViolationsPure,
  convertValueForType as convertValueForTypePure,
  convertValueToList as convertValueToListPure,
  getDefaultValueForElementType as getDefaultValueForElementTypePure,
  getDefaultValueForType as getDefaultValueForTypePure,
  isListElementValueValid as isListElementValueValidPure,
  validateListValueAgainstType as validateListValueAgainstTypePure,
} from './domain/editor-actions.js';
import { createAppModeModule } from './core/app-mode.js';
import { createWorkspaceStorageModule } from './services/workspace-storage.js';
import { createTemplatePersistenceModule } from './services/template-persistence.js';
import { createCsvServiceModule } from './services/csv-service.js';
import { createSystemPanelsModule } from './ui/system-panels.js';
import { createInteractionModule } from './ui/interaction.js';
import { createPanelsModule } from './ui/panels.js';
import { createSheetModeModule } from './ui/sheet-mode.js';
import { createCSharpRuntimeGeneratorModule } from './generators/csharp-runtime-generator.js';
import { createGodotRuntimeGeneratorModule } from './generators/godot-runtime-generator.js';
import { createUEGeneratorModule } from './generators/ue-generator.js';

(() => {
  // 数据结构：模板列表
  const templates = [];
  const templateUidState = { counter: 0 };
  let lastSavedStructureSnapshot = new Map();
  let currentTemplateIndex = -1;
  let currentInstanceIndex = -1;
  let directoryHandle = null;
  let csharpHandle = null;
  let dataEntityHandle = null;
  let modelStructHandle = null;
  let editorHandle = null;
  let cppModelHandle = null;
  let cppEnumHandle = null;
  let configDirHandle = null;
  let trashHandle = null;
  const TRASH_FOLDER_NAME = 'toilet';
  const pendingTemplateDeletions = new Map();
  let trashButtonBaseLabel = '垃圾箱';
  let trashSelectedTemplateName = null;
  const operationLogs = [];
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
  const ENGINE_MODES = { UNITY: 'unity', GODOT: 'godot', UE: 'ue' };
  let currentEngineMode = ENGINE_MODES.UNITY;
  const ENGINE_LABELS = {
    [ENGINE_MODES.UNITY]: 'Unity',
    [ENGINE_MODES.GODOT]: 'Godot C#',
    [ENGINE_MODES.UE]: 'UE',
  };
  const engineModeNeedsConfirmation = {
    [ENGINE_MODES.UNITY]: false,
    [ENGINE_MODES.GODOT]: true,
    [ENGINE_MODES.UE]: true,
  };
  const CONFIG_DIR_NAME = 'dataEditorConfig';
  const CONFIG_FILE_NAME = 'config.json';
  let appModeModule = null;
  let workspaceStorageModule = null;
  let templatePersistenceModule = null;
  let csvServiceModule = null;
  let interactionModule = null;
  let panelsModule = null;
  let sheetModeModule = null;
  let systemPanelsModule = null;
  let csharpRuntimeGeneratorModule = null;
  let godotRuntimeGeneratorModule = null;
  let ueGeneratorModule = null;
  let appBootstrapped = false;

  function isUnityMode() {
    return appModeModule ? appModeModule.isUnityMode() : currentEngineMode === ENGINE_MODES.UNITY;
  }

  function isGodotMode() {
    return appModeModule ? appModeModule.isGodotMode() : currentEngineMode === ENGINE_MODES.GODOT;
  }

  function isCSharpMode() {
    return appModeModule ? appModeModule.isCSharpMode() : isUnityMode() || isGodotMode();
  }

  function isUEMode() {
    return appModeModule ? appModeModule.isUEMode() : currentEngineMode === ENGINE_MODES.UE;
  }
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
  const dragSelect = {
    isDragging: false,
    type: null,
    indices: new Set(),
    startIndex: undefined,
  };

  // DOM 元素获取
  const $ = (id) => document.getElementById(id);
  const templateNameInput = $("templateName");
  const instanceNameInput = $("instanceName");
  const instanceIdInput = $("instanceId");
  const paramNameInput = $("paramName");
  const paramTypeSelect = $("paramType");
  const listElementTypeSelect = $("listElementType");
  const builtinParamTypeOptions = Array.from(paramTypeSelect.options).map((opt) => ({
    value: opt.value,
    label: opt.textContent,
  }));
  const builtinParamTypeSet = new Set(builtinParamTypeOptions.map((opt) => opt.value));
  let listElementTypeOptions = [
    { value: 'string', label: '字符串' },
    { value: 'int', label: '整数' },
    { value: 'float', label: '浮点数' },
    { value: 'long', label: '长整型' },
    { value: 'bool', label: '布尔' },
    { value: 'object', label: '对象' },
  ];
  let listElementTypeSet = new Set(listElementTypeOptions.map((opt) => opt.value));
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

  function isTemplateNameInvalid(name) {
    return isTemplateNameInvalidPure(name, { isUEMode: isUEMode() });
  }

  function isEnumValueInvalid(value) {
    return isEnumValueInvalidPure(value, { isUEMode: isUEMode() });
  }

  function getSelectedListElementType() {
    if (!listElementTypeSelect) return 'string';
    return getValidListElementType(listElementTypeSelect.value);
  }

  function getListElementTypeLabel(value) {
    const target = listElementTypeOptions.find((opt) => opt.value === value);
    return target ? target.label : value;
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
    setInvalidNameVisual(templateNameInput, isTemplateNameInvalid(templateNameInput.value));
  }

  function updateInstanceNameInputValidity() {
    if (!instanceNameInput) return;
    setInvalidNameVisual(instanceNameInput, isPureNumericName(instanceNameInput.value));
  }

  function updateListElementTypeSelectState(customValue) {
    if (!listElementTypeSelect) return;
    const shouldEnable = paramTypeSelect && paramTypeSelect.value === 'list';
    listElementTypeSelect.disabled = !shouldEnable;
    listElementTypeSelect.style.opacity = shouldEnable ? '' : '0.55';
    listElementTypeSelect.title = shouldEnable ? '' : '列表类型时可选择元素类型';
    const desiredValue = customValue
      ? getValidListElementType(customValue)
      : getValidListElementType(listElementTypeSelect.value);
    if (!Array.from(listElementTypeSelect.options).some((opt) => opt.value === desiredValue)) {
      const optEl = document.createElement('option');
      optEl.value = desiredValue;
      optEl.textContent = desiredValue;
      listElementTypeSelect.appendChild(optEl);
    }
    if (listElementTypeSelect.value !== desiredValue) {
      listElementTypeSelect.value = desiredValue;
    }
  }

  function resolveIndexFieldMeta(tpl) {
    return resolveIndexFieldMetaPure(tpl, INDEXABLE_PARAM_TYPES);
  }

  function formatIndexCell(field, type, value) {
    return formatIndexCellPure(field, type, value);
  }

  function parseIndexTypeCell(cell) {
    return parseIndexTypeCellPure(cell);
  }

  function parseIndexDataCell(cell, fallbackField, fallbackType) {
    return parseIndexDataCellPure(cell, fallbackField, fallbackType);
  }

  function computeExpectedIndexValue(tpl, inst, fieldName) {
    return computeExpectedIndexValuePure(tpl, inst, fieldName);
  }

  function enforceEnumIndexField(tpl) {
    return enforceEnumIndexFieldPure(tpl, { isEnumTemplate });
  }

  function collectDuplicateIdInfo(tpl) {
    return collectDuplicateIdInfoPure(tpl);
  }

  function getNumericInstanceId(inst) {
    return getNumericInstanceIdPure(inst);
  }

  function collectDuplicateIndexInfo(tpl) {
    return collectDuplicateIndexInfoPure(tpl);
  }

  function chooseDuplicateNavigationTarget(group, currentInst) {
    return chooseDuplicateNavigationTargetPure(group, currentInst);
  }

  function isEnumTemplate(tpl) {
    return isEnumTemplatePure(tpl);
  }

  function ensureEnumParamNaming(tpl) {
    return ensureEnumParamNamingPure(tpl);
  }

  function getEnumParamKeysForInstance(tpl, inst) {
    return getEnumParamKeysForInstancePure(tpl, inst);
  }

  function getEnumTemplate() {
    return getEnumTemplatePure(templates);
  }

  function getEnumDefinitions() {
    return getEnumDefinitionsPure(templates);
  }

  function getEnumDefinition(type) {
    return getEnumDefinitionPure(templates, type);
  }

  function isEnumType(type) {
    return isEnumTypePure(templates, type);
  }

  function getEnumValues(type) {
    return getEnumValuesPure(templates, type);
  }

  function getEnumCSharpTypeName(type) {
    return getEnumCSharpTypeNamePure(templates, type);
  }

  function sanitizeCSharpTypeName(name, fallback) {
    return sanitizeCSharpTypeNamePure(name, fallback);
  }

  function sanitizeCSharpMemberName(name, fallback) {
    return sanitizeCSharpMemberNamePure(name, fallback);
  }

  function getBuiltinParamTypeOptionsForCurrentMode() {
    return builtinParamTypeOptions;
  }

  function rebuildListElementTypeCollections(enumDefs, missingTypes, usedElementTypes) {
    const collections = buildListElementTypeCollectionsPure({
      builtinOptions: getBuiltinParamTypeOptionsForCurrentMode(),
      enumDefs,
      missingTypes,
      usedElementTypes,
    });
    listElementTypeOptions = collections.options;
    listElementTypeSet = collections.valueSet;
  }

  function refreshListElementTypeSelect(customValue) {
    if (!listElementTypeSelect) return;
    const previousValue = customValue != null ? customValue : listElementTypeSelect.value;
    listElementTypeSelect.innerHTML = '';
    listElementTypeOptions.forEach((opt) => {
      const optionEl = document.createElement('option');
      optionEl.value = opt.value;
      optionEl.textContent = opt.label;
      listElementTypeSelect.appendChild(optionEl);
    });
    const normalized = previousValue != null ? String(previousValue).trim() : '';
    if (
      normalized &&
      !Array.from(listElementTypeSelect.options).some((opt) => opt.value === normalized)
    ) {
      const fallback = document.createElement('option');
      fallback.value = normalized;
      fallback.textContent = `${normalized} (缺失)`;
      listElementTypeSelect.appendChild(fallback);
    }
    if (normalized && Array.from(listElementTypeSelect.options).some((opt) => opt.value === normalized)) {
      listElementTypeSelect.value = normalized;
    } else if (listElementTypeSelect.options.length > 0) {
      listElementTypeSelect.value = listElementTypeSelect.options[0].value;
    } else {
      listElementTypeSelect.value = 'string';
    }
  }

  function refreshParamTypeOptions() {
    if (!paramTypeSelect) return;
    const previousValue = paramTypeSelect.value;
    const previousElementValue = listElementTypeSelect ? listElementTypeSelect.value : 'string';
    const enumDefs = getEnumDefinitions();
    const missingTypes = new Set();
    const usedElementTypes = new Set();
    templates.forEach((tpl) => {
      if (!tpl || !Array.isArray(tpl.parameters)) return;
      tpl.parameters.forEach((p) => {
        if (!p || !p.type) return;
        if (p.type === 'list' && p.elementType) {
          usedElementTypes.add(String(p.elementType));
        }
        if (builtinParamTypeSet.has(p.type)) return;
        if (enumDefs.some((def) => def.name === p.type)) return;
        missingTypes.add(p.type);
      });
    });
    paramTypeSelect.innerHTML = '';
    const builtinOptions = getBuiltinParamTypeOptionsForCurrentMode();
    builtinOptions.forEach((opt) => {
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
      Array.from(missingTypes)
        .sort()
        .forEach((typeName) => {
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
    rebuildListElementTypeCollections(enumDefs, missingTypes, usedElementTypes);
    refreshListElementTypeSelect(previousElementValue);
    updateListElementTypeSelectState();
  }

  function updateParamTypeSelectEnabledState() {
    if (!paramTypeSelect) return;
    const tpl = templates[currentTemplateIndex];
    const shouldDisable = Boolean(tpl && isEnumTemplate(tpl));
    paramTypeSelect.disabled = shouldDisable;
    if (shouldDisable) {
      paramTypeSelect.value = 'string';
    }
    updateListElementTypeSelectState();
  }

  function applyIndexDisabledState(message) {
    if (!indexTemplateSelect || !indexParamSelect) return;
    indexTemplateSelect.innerHTML = '';
    const templateOption = document.createElement('option');
    templateOption.value = '';
    templateOption.textContent = message;
    indexTemplateSelect.appendChild(templateOption);
    indexTemplateSelect.value = '';
    indexTemplateSelect.disabled = true;
    indexTemplateSelect.dataset.disabledReason = message;

    indexParamSelect.innerHTML = '';
    const paramOption = document.createElement('option');
    paramOption.value = '';
    paramOption.textContent = message;
    indexParamSelect.appendChild(paramOption);
    indexParamSelect.value = '';
    indexParamSelect.disabled = true;
    indexParamSelect.dataset.disabledReason = message;
  }

  function updateParamNameInputEnabledState() {
    if (!paramNameInput) return;
    const tpl = templates[currentTemplateIndex];
    const shouldDisable = Boolean(tpl && isEnumTemplate(tpl));
    paramNameInput.disabled = shouldDisable;
    paramNameInput.placeholder = shouldDisable ? 'enum 自动命名（0,1,2,...）' : '';
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
        } catch (_err) {
          li.scrollIntoView({ block: 'center' });
        }
      }
    });
    const targetInstance = tpl.instances[targetIdx];
    let labelText = '';
    if (targetInstance) {
      const parts = [];
      if (targetInstance.name) parts.push(String(targetInstance.name));
      if (targetInstance.id != null && targetInstance.id !== '') parts.push(`ID:${targetInstance.id}`);
      labelText = parts.join(' ');
    }
    showMessage(labelText ? `已跳转到索引重复的实例：${labelText}` : '已跳转到索引重复的实例', 'warn');
    return true;
  }

  function enforceImportedIndexField(tpl, fileName) {
    void fileName;
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

  function wrapReferencePayload(value, binding, asList, elementType = 'string') {
    return wrapReferencePayloadPure(value, binding, asList, elementType, { convertValueToList });
  }

  function getDefaultValueForElementType(elementType) {
    return getDefaultValueForElementTypePure(elementType, {
      isEnumType,
      getEnumValues,
    });
  }

  function getDefaultValueForType(type, elementType = 'string') {
    return getDefaultValueForTypePure(type, elementType, {
      isEnumType,
      getEnumValues,
      getDefaultValueForElementType,
    });
  }

  function coerceListElementValue(value, elementType) {
    return coerceListElementValuePure(value, elementType, {
      isEnumType,
      getEnumValues,
    });
  }

  function convertValueToList(value, elementType) {
    return convertValueToListPure(value, elementType, {
      coerceListElementValue,
    });
  }

  function convertValueForType(value, type, elementType = 'string') {
    return convertValueForTypePure(value, type, elementType, {
      isEnumType,
      getEnumValues,
      getDefaultValueForType,
      convertValueToList,
    });
  }

  function isListElementValueValid(value, elementType) {
    return isListElementValueValidPure(value, elementType, {
      isEnumType,
      getEnumValues,
    });
  }

  function validateListValueAgainstType(value, elementType, param) {
    return validateListValueAgainstTypePure(value, elementType, param, {
      normalizeReferenceList,
      coerceListElementValue,
      isListElementValueValid,
    });
  }

  function collectListTypeViolations(tpl) {
    return collectListTypeViolationsPure(tpl, {
      getListElementTypeForParam,
      validateListValueAgainstType,
    });
  }

  function getCurrentEngineLabel() {
    return appModeModule
      ? appModeModule.getCurrentEngineLabel()
      : ENGINE_LABELS[currentEngineMode] || '';
  }

  function updateEngineModeUIState() {
    if (engineModeToggleBtn) {
      engineModeToggleBtn.textContent = `切换模式：当前${getCurrentEngineLabel()}`;
    }
    if (regenerateCsBtn) {
      regenerateCsBtn.style.display = isCSharpMode() ? '' : 'none';
      regenerateCsBtn.textContent = isGodotMode()
        ? '重新生成 Godot C# 数据结构脚本'
        : '重新生成 C# 数据结构脚本';
    }
    if (godotQuickInitBtn) {
      godotQuickInitBtn.style.display = isGodotMode() ? '' : 'none';
    }
    if (regenerateCppBtn) {
      regenerateCppBtn.style.display = isUEMode() ? '' : 'none';
    }
    updateTemplateNameInputValidity();
    refreshParamTypeOptions();
  }

  function setEngineMode(newMode) {
    if (appModeModule) {
      appModeModule.setEngineMode(newMode);
      return;
    }
    if (!Object.values(ENGINE_MODES).includes(newMode)) return;
    if (newMode === currentEngineMode) return;
    currentEngineMode = newMode;
    engineModeNeedsConfirmation[newMode] = true;
    updateEngineModeUIState();
    refreshTemplates();
  }

  function toggleEngineMode() {
    if (appModeModule) {
      appModeModule.toggleEngineMode();
      return;
    }
    const orderedModes = [ENGINE_MODES.UNITY, ENGINE_MODES.GODOT, ENGINE_MODES.UE];
    const currentIndex = orderedModes.indexOf(currentEngineMode);
    const nextMode = orderedModes[(currentIndex + 1) % orderedModes.length];
    setEngineMode(nextMode);
  }
  async function getConfigDirectoryHandle(options = {}) {
    if (workspaceStorageModule) {
      return workspaceStorageModule.getConfigDirectoryHandle(options);
    }
    if (!directoryHandle) return null;
    const create = Boolean(options.create);
    if (configDirHandle) return configDirHandle;
    try {
      configDirHandle = await directoryHandle.getDirectoryHandle(CONFIG_DIR_NAME, { create });
    } catch (err) {
      if (!create && err && err.name === 'NotFoundError') {
        configDirHandle = null;
        return null;
      }
      if (create) {
        console.warn('无法创建配置目录', err);
      }
      configDirHandle = null;
      return null;
    }
    return configDirHandle;
  }

  async function readEditorConfig() {
    if (workspaceStorageModule) {
      return workspaceStorageModule.readEditorConfig();
    }
    try {
      const dir = await getConfigDirectoryHandle({ create: false });
      if (!dir) return null;
      const fileHandle = await dir.getFileHandle(CONFIG_FILE_NAME, { create: false });
      const file = await fileHandle.getFile();
      const text = await file.text();
      return JSON.parse(text);
    } catch (err) {
      return null;
    }
  }

  async function persistEditorConfig() {
    if (workspaceStorageModule) {
      return workspaceStorageModule.persistEditorConfig();
    }
    if (!directoryHandle) return;
    try {
      const dir = await getConfigDirectoryHandle({ create: true });
      if (!dir) return;
      const payload = {
        engineMode: currentEngineMode,
      };
      await writeTextFile(dir, CONFIG_FILE_NAME, JSON.stringify(payload, null, 2));
    } catch (err) {
      console.warn('保存编辑器配置失败', err);
    }
  }

  async function loadEditorConfigState() {
    if (workspaceStorageModule) {
      return workspaceStorageModule.loadEditorConfigState();
    }
    if (!directoryHandle) {
      updateEngineModeUIState();
      return;
    }
    try {
      const config = await readEditorConfig();
      const mode = config && config.engineMode;
      if (mode && Object.values(ENGINE_MODES).includes(mode)) {
        if (currentEngineMode !== mode) {
          setEngineMode(mode);
        } else {
          updateEngineModeUIState();
        }
        return;
      }
    } catch (err) {
      console.warn('读取编辑器配置失败', err);
    }
    if (currentEngineMode !== ENGINE_MODES.UNITY) {
      setEngineMode(ENGINE_MODES.UNITY);
    } else {
      updateEngineModeUIState();
    }
  }


  async function ensureEngineGenerationConsent(actionLabel = '生成操作') {
    if (workspaceStorageModule) {
      return workspaceStorageModule.ensureEngineGenerationConsent(actionLabel);
    }
    if (!engineModeNeedsConfirmation[currentEngineMode]) {
      return true;
    }
    const engineName = getCurrentEngineLabel();
    const confirmed = window.confirm(`首次在${engineName}模式执行${actionLabel}，是否继续？`);
    if (!confirmed) {
      return false;
    }
    engineModeNeedsConfirmation[currentEngineMode] = false;
    return true;
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
    return appModeModule
      ? appModeModule.isSheetModeActive()
      : currentEditMode === EDIT_MODES.SHEET;
  }

  function normalizeSheetSelection() {
    if (appModeModule) {
      appModeModule.normalizeSheetSelection();
      return;
    }
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
    return findTemplateByNamePure(templates, name);
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
      setInvalidNameVisual(label, isTemplateNameInvalid(tpl.name));
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

  const chooseDirBtn = $("chooseDir");
  const saveBtn = $("saveBtn");
  const toggleDarkBtn = $("toggleDark");
  const paramWidthSlider = $("paramWidth");
  const paramWidthLabel = $("paramWidthLabel");
  const messageBox = $("message");
  const helpBtn = $("helpBtn");
  const regenerateCsBtn = $("regenerateCs");
  const godotQuickInitBtn = $("godotQuickInit");
  const exportCsvBtn = $("exportCsv");
  const confirmExportCsvBtn = $("confirmExportCsv");
  const cancelExportCsvBtn = $("cancelExportCsv");
  const importCsvBtn = $("importCsv");
  const viewLogsBtn = $("viewLogs");
  const logOverlay = $("logOverlay");
  const logListEl = $("logList");
  const closeLogBtn = $("closeLog");
  const clearLogsBtn = $("clearLogs");
  const engineModeToggleBtn = $("engineModeToggle");
  const regenerateCppBtn = $("regenerateCpp");
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
  const domRefs = {
    templateNameInput,
    instanceNameInput,
    instanceIdInput,
    paramNameInput,
    paramTypeSelect,
    listElementTypeSelect,
    indexTemplateSelect,
    indexParamSelect,
    templateListEl,
    instanceListEl,
    paramListEl,
    searchTemplatesInput,
    searchInstancesInput,
    searchParamsInput,
    toggleCompareValuesBtn,
    currentDirLabel,
    chooseDirBtn,
    saveBtn,
    toggleDarkBtn,
    helpBtn,
    openTrashBtn,
    trashOverlay,
    trashListEl,
    messageBox,
    logOverlay,
    logListEl,
    exportCsvBtn,
    confirmExportCsvBtn,
    cancelExportCsvBtn,
    importCsvBtn,
    regenerateCsBtn,
    regenerateCppBtn,
    toggleEditModeBtn,
    sheetModePanel,
    sheetTemplateListEl,
    luckysheetContainer,
    sheetInstanceTabsEl,
    sheetEmptyStateEl,
    rowHeightSlider,
    rowHeightLabel,
    paramWidthSlider,
    paramWidthLabel,
    engineModeToggleBtn,
  };

  const appState = {
    templates,
    templateUidState,
    pendingTemplateDeletions,
    selectedTemplates,
    selectedInstances,
    selectedParams,
    exportSelections,
    operationLogs,
    sheetRenderedSheetIds,
    sheetDuplicateIdRows,
    sheetTemplateValidation,
    engineModeNeedsConfirmation,
    ENGINE_MODES,
    ENGINE_LABELS,
    EDIT_MODES,
    dragSelect,
    TRASH_FOLDER_NAME,
    CONFIG_DIR_NAME,
    CONFIG_FILE_NAME,
  };

  function bindAppStateProperty(name, getter, setter) {
    Object.defineProperty(appState, name, {
      enumerable: true,
      get: getter,
      set: setter,
    });
  }

  bindAppStateProperty('lastSavedStructureSnapshot', () => lastSavedStructureSnapshot, (value) => {
    lastSavedStructureSnapshot = value;
  });
  bindAppStateProperty('currentTemplateIndex', () => currentTemplateIndex, (value) => {
    currentTemplateIndex = value;
  });
  bindAppStateProperty('currentInstanceIndex', () => currentInstanceIndex, (value) => {
    currentInstanceIndex = value;
  });
  bindAppStateProperty('directoryHandle', () => directoryHandle, (value) => {
    directoryHandle = value;
  });
  bindAppStateProperty('csharpHandle', () => csharpHandle, (value) => {
    csharpHandle = value;
  });
  bindAppStateProperty('dataEntityHandle', () => dataEntityHandle, (value) => {
    dataEntityHandle = value;
  });
  bindAppStateProperty('modelStructHandle', () => modelStructHandle, (value) => {
    modelStructHandle = value;
  });
  bindAppStateProperty('editorHandle', () => editorHandle, (value) => {
    editorHandle = value;
  });
  bindAppStateProperty('cppModelHandle', () => cppModelHandle, (value) => {
    cppModelHandle = value;
  });
  bindAppStateProperty('cppEnumHandle', () => cppEnumHandle, (value) => {
    cppEnumHandle = value;
  });
  bindAppStateProperty('configDirHandle', () => configDirHandle, (value) => {
    configDirHandle = value;
  });
  bindAppStateProperty('trashHandle', () => trashHandle, (value) => {
    trashHandle = value;
  });
  bindAppStateProperty('trashButtonBaseLabel', () => trashButtonBaseLabel, (value) => {
    trashButtonBaseLabel = value;
  });
  bindAppStateProperty('trashSelectedTemplateName', () => trashSelectedTemplateName, (value) => {
    trashSelectedTemplateName = value;
  });
  bindAppStateProperty('exportSelectionMode', () => exportSelectionMode, (value) => {
    exportSelectionMode = value;
  });
  bindAppStateProperty('exportTemplateAnchorIndex', () => exportTemplateAnchorIndex, (value) => {
    exportTemplateAnchorIndex = value;
  });
  bindAppStateProperty('anchorTemplate', () => anchorTemplate, (value) => {
    anchorTemplate = value;
  });
  bindAppStateProperty('anchorInstance', () => anchorInstance, (value) => {
    anchorInstance = value;
  });
  bindAppStateProperty('anchorParam', () => anchorParam, (value) => {
    anchorParam = value;
  });
  bindAppStateProperty('lastSelectedCategory', () => lastSelectedCategory, (value) => {
    lastSelectedCategory = value;
  });
  bindAppStateProperty('copyBuffer', () => copyBuffer, (value) => {
    copyBuffer = value;
  });
  bindAppStateProperty('editingParamIndex', () => editingParamIndex, (value) => {
    editingParamIndex = value;
  });
  bindAppStateProperty('currentEngineMode', () => currentEngineMode, (value) => {
    currentEngineMode = value;
  });
  bindAppStateProperty('currentEditMode', () => currentEditMode, (value) => {
    currentEditMode = value;
  });
  bindAppStateProperty('sheetActiveTemplateIndex', () => sheetActiveTemplateIndex, (value) => {
    sheetActiveTemplateIndex = value;
  });
  bindAppStateProperty('sheetActiveInstanceIndex', () => sheetActiveInstanceIndex, (value) => {
    sheetActiveInstanceIndex = value;
  });
  bindAppStateProperty('sheetRenderedTemplateIndex', () => sheetRenderedTemplateIndex, (value) => {
    sheetRenderedTemplateIndex = value;
  });
  bindAppStateProperty('sheetRenderedInstanceIndex', () => sheetRenderedInstanceIndex, (value) => {
    sheetRenderedInstanceIndex = value;
  });
  bindAppStateProperty('sheetRenderedInstanceCount', () => sheetRenderedInstanceCount, (value) => {
    sheetRenderedInstanceCount = value;
  });
  bindAppStateProperty('sheetRenderedParameterSignature', () => sheetRenderedParameterSignature, (value) => {
    sheetRenderedParameterSignature = value;
  });
  bindAppStateProperty(
    'sheetRenderedTemplatesFingerprint',
    () => sheetRenderedTemplatesFingerprint,
    (value) => {
      sheetRenderedTemplatesFingerprint = value;
    },
  );
  bindAppStateProperty('sheetModeDirty', () => sheetModeDirty, (value) => {
    sheetModeDirty = value;
  });
  bindAppStateProperty('lastDuplicateIndexInfo', () => lastDuplicateIndexInfo, (value) => {
    lastDuplicateIndexInfo = value;
  });
  bindAppStateProperty('compareValueState', () => compareValueState, (value) => {
    compareValueState = value;
  });
  bindAppStateProperty('luckysheetInitialized', () => luckysheetInitialized, (value) => {
    luckysheetInitialized = value;
  });

  appModeModule = createAppModeModule({
    appState,
    updateEngineModeUIState,
    refreshTemplates,
  });

  workspaceStorageModule = createWorkspaceStorageModule({
    appState,
    setCurrentDirectoryLabel: (label) => {
      if (currentDirLabel) {
        currentDirLabel.textContent = label || '';
      }
    },
    updateEngineModeUIState,
    setEngineMode: (...args) => appModeModule.setEngineMode(...args),
    getCurrentEngineLabel: (...args) => appModeModule.getCurrentEngineLabel(...args),
    isUnityMode: (...args) => appModeModule.isUnityMode(...args),
    isGodotMode: (...args) => appModeModule.isGodotMode(...args),
    showMessage,
    loadAllTemplates: (...args) => templatePersistenceModule.loadAllTemplates(...args),
    refreshTemplates,
    refreshInstances,
    refreshParams,
    updateIndexTemplateOptions,
    isSheetModeActive: (...args) => appModeModule.isSheetModeActive(...args),
    updateSheetTemplateNav,
    updateSheetInstanceTabs,
    renderLuckysheetForActiveInstance,
    generateRuntimeLoaderArtifacts,
    ensureModelStruct,
    generateCSContent,
    snapshotTemplateStructure,
    ensureTemplateUid,
    normalizeTemplateParameterIndexes,
    addLogEntry,
  });

  templatePersistenceModule = createTemplatePersistenceModule({
    appState,
    isUnityMode: (...args) => appModeModule.isUnityMode(...args),
    isGodotMode: (...args) => appModeModule.isGodotMode(...args),
    isSheetModeActive: (...args) => appModeModule.isSheetModeActive(...args),
    updateSheetTemplateNav,
    commitActiveSheetEdits,
    ensureEngineGenerationConsent: (...args) =>
      workspaceStorageModule.ensureEngineGenerationConsent(...args),
    cleanConflictingEngineArtifacts: (...args) =>
      workspaceStorageModule.cleanConflictingEngineArtifacts(...args),
    ensureSubFolders: (...args) => workspaceStorageModule.ensureSubFolders(...args),
    ensureModelStruct,
    ensureTrashDirectory,
    saveEnumTemplateCache: (...args) => workspaceStorageModule.saveEnumTemplateCache(...args),
    loadEnumTemplateCache: (...args) => workspaceStorageModule.loadEnumTemplateCache(...args),
    clearEnumTemplateCache: (...args) => workspaceStorageModule.clearEnumTemplateCache(...args),
    readTextFileIfExists: (...args) => workspaceStorageModule.readTextFileIfExists(...args),
    writeTextFile: (...args) => workspaceStorageModule.writeTextFile(...args),
    deleteDataEntityFileIfExists: (...args) =>
      workspaceStorageModule.deleteDataEntityFileIfExists(...args),
    deleteCSharpFileIfExists: (...args) =>
      workspaceStorageModule.deleteCSharpFileIfExists(...args),
    moveTemplateJsonToTrash: (...args) => workspaceStorageModule.moveTemplateJsonToTrash(...args),
    persistEditorConfig: (...args) => workspaceStorageModule.persistEditorConfig(...args),
    refreshTrashButtonState,
    refreshTrashOverlayContents,
    refreshTemplates,
    refreshInstances,
    refreshParams,
    updateIndexTemplateOptions,
    updateTemplateNameInputValidity,
    updateInstanceNameInputValidity,
    updateParamNameInputValidity,
    addLogEntry,
    showMessage,
    generateCSContent,
    generateEnumCSFiles,
    generateRuntimeLoaderArtifacts,
    generateUECppStructuresForCurrentTemplates,
    collectDuplicateIdInfo,
    collectListTypeViolations,
    ensureTemplateUid,
    normalizeTemplateParameterIndexes,
    populateMissingIndexFields,
    captureCurrentStructureSnapshot,
    hasTemplateStructureChanged,
    normalizeContent,
    snapshotTemplateStructure,
    isEnumTemplate,
    ensureEnumParamNaming,
    getEnumTemplate,
  });

  systemPanelsModule = createSystemPanelsModule({
    appState,
    domRefs: {
      openTrashBtn,
      trashOverlay,
      trashListEl,
      messageBox,
      logOverlay,
      logListEl,
    },
    restoreTemplateFromTrash: (...args) => templatePersistenceModule.restoreTemplateFromTrash(...args),
  });

  csharpRuntimeGeneratorModule = createCSharpRuntimeGeneratorModule({
    appState,
    isUnityMode: (...args) => appModeModule.isUnityMode(...args),
    isGodotMode: (...args) => appModeModule.isGodotMode(...args),
    isCSharpMode: (...args) => appModeModule.isCSharpMode(...args),
    getCurrentEngineLabel: (...args) => appModeModule.getCurrentEngineLabel(...args),
    ensureEngineGenerationConsent: (...args) =>
      workspaceStorageModule.ensureEngineGenerationConsent(...args),
    cleanConflictingEngineArtifacts: (...args) =>
      workspaceStorageModule.cleanConflictingEngineArtifacts(...args),
    ensureSubFolders: (...args) => workspaceStorageModule.ensureSubFolders(...args),
    writeTextFile: (...args) => workspaceStorageModule.writeTextFile(...args),
    ensureTemplateUid,
    isEnumTemplate,
    getEnumTemplate,
    getEnumDefinitions,
    sanitizeCSharpMemberName,
    getEnumCSharpTypeName,
    getValidListElementType,
    isEnumType,
    showMessage,
  });

  godotRuntimeGeneratorModule = createGodotRuntimeGeneratorModule({
    appState,
    isGodotMode: (...args) => appModeModule.isGodotMode(...args),
    writeTextFile: (...args) => workspaceStorageModule.writeTextFile(...args),
  });

  ueGeneratorModule = createUEGeneratorModule({
    appState,
    isUEMode: (...args) => appModeModule.isUEMode(...args),
    ensureSubFolders: (...args) => workspaceStorageModule.ensureSubFolders(...args),
    ensureEngineGenerationConsent: (...args) =>
      workspaceStorageModule.ensureEngineGenerationConsent(...args),
    cleanConflictingEngineArtifacts: (...args) =>
      workspaceStorageModule.cleanConflictingEngineArtifacts(...args),
    ensureCppEnumDirectory: (...args) => workspaceStorageModule.ensureCppEnumDirectory(...args),
    shouldIgnoreFileEntry: (...args) => workspaceStorageModule.shouldIgnoreFileEntry(...args),
    writeTextFile: (...args) => workspaceStorageModule.writeTextFile(...args),
    isEnumTemplate,
    getEnumDefinitions,
    isEnumType,
    getListElementTypeForParam,
    isUENameCompliant,
    showMessage,
    addLogEntry,
  });

  // 拖拽选择状态
  sheetModeModule = createSheetModeModule({
    appState,
    domRefs,
    buildLuckysheetCell,
    buildLuckysheetSheetFromRows,
    applyLuckysheetDuplicateIdStyles,
    refreshActiveLuckysheetDuplicateStyles,
    activateLuckysheetSheet,
    getLuckysheetCell,
    extractLuckysheetCellText,
    readLuckysheetCell,
    compareTemplateParameters,
    markSheetTemplateValidation,
    getLuckysheetUsedRange,
    collectLuckysheetRows,
    normalizeSheetRowsForComparison,
    areSheetRowsEqual,
    getTemplateParameterSignature,
    computeSheetTemplatesFingerprint,
    commitActiveSheetEdits,
    updateSheetTemplateNav,
    updateSheetInstanceTabs,
    renderLuckysheetForActiveInstance,
    enterSheetMode,
    exitSheetMode,
    setEditMode,
  });

  csvServiceModule = createCsvServiceModule({
    appState,
    domRefs,
    updateExportButtons,
    beginExportSelection,
    exitExportSelectionMode,
    ensureTemplateUidForExport,
    getExportRecord,
    cleanupExportRecord,
    getTemplateExportCounts,
    getTemplateExportState,
    applyTemplateExportAction,
    handleTemplateExportCheckbox,
    isInstanceSelectedForExport,
    applyInstanceExportSelection,
    handleInstanceExportCheckbox,
    collectTemplatesForExport,
    sanitizeCsvFileName,
    encodeCsvValue,
    rowsToCsv,
    serializeValueForCsv,
    buildCsvRowsForTemplate,
    performExportCsv,
    parseCsvText,
    normalizeCsvRowLength,
    parseBoolCell,
    convertCsvValueByType,
    parseDataRefCell,
    buildTemplateFromCsv,
    applyImportedTemplate,
    importFromCsv,
  });

  panelsModule = createPanelsModule({
    appState,
    domRefs,
    isTemplateNameInvalid,
    doesTemplateHaveInvalidIndexReferences,
    collectListTypeViolations,
    getTemplateExportState,
    handleTemplateExportCheckbox,
    getTemplateExportCounts,
    setInvalidNameVisual,
    collectDuplicateIdInfo,
    collectDuplicateIndexInfo,
    collectInstanceIndexInvalidReasons,
    isInstanceSelectedForExport,
    handleInstanceExportCheckbox,
    ensureTemplateUid,
    isEnumTemplate,
    getEnumParamKeysForInstance,
    getEnumDefinition,
    isEnumType,
    getEnumTemplate,
    getEnumDefinitions,
    getEnumValues,
    getInstanceFieldValue,
    showMessage,
    createDefaultReferenceValue,
    normalizeReferenceValue,
    normalizeReferenceList,
    unwrapReferencePayload,
    isEnumValueInvalid,
    isPureNumericName,
    getListElementTypeLabel,
    getDefaultValueForElementType,
    getDefaultValueForType,
    convertValueToList,
    convertValueForType,
    coerceListElementValue,
    isListElementValueValid,
    jumpToDuplicateIndexInstance,
    evaluateInstanceIndexValidation,
    computeExpectedIndexValue,
    enforceEnumIndexField,
    refreshParamTypeOptions,
    updateTemplateNameInputValidity,
    updateInstanceNameInputValidity,
    updateInstanceIdInputState,
    updateParamNameInputValidity,
    updateParamTypeSelectEnabledState,
    updateListElementTypeSelectState,
    updateParamNameInputEnabledState,
    applyIndexDisabledState,
    getListElementTypeForParam,
    filterList,
    deleteParam,
    pushParamHistory,
    getValueByFieldForInstance,
    isSheetModeActive,
    updateSheetTemplateNav,
    updateSheetInstanceTabs,
    refreshTemplates,
    getSelectedInstanceIndices,
    updateCompareButtonState,
    deactivateCompareValues,
    buildCompareValueSnapshot,
    formatCompareDisplayValue,
    buildInstanceCompareText,
    handleToggleCompareValues,
    refreshInstances,
    refreshParams,
    updateParamValue,
    showSelectedParamDetails,
    updateIndexTemplateOptions,
    updateIndexParamOptions,
    getTemplateParameterSignature,
    renderLuckysheetForActiveInstance,
  });

  interactionModule = createInteractionModule({
    appState,
    domRefs,
    copyInstance,
    pasteInstance,
    deleteInstance,
    ensureTemplateUid,
    isEnumTemplate,
    ensureEnumParamNaming,
    getEnumParamKeysForInstance,
    refreshTemplates,
    refreshInstances,
    refreshParams,
    showSelectedParamDetails,
    updateIndexTemplateOptions,
    showMessage,
  });

  function addLogEntry(...args) {
    return systemPanelsModule.addLogEntry(...args);
  }

  function renderLogs(...args) {
    return systemPanelsModule.renderLogs(...args);
  }

  function formatLogTimestamp(...args) {
    return systemPanelsModule.formatLogTimestamp(...args);
  }

  function openLogOverlay(...args) {
    return systemPanelsModule.openLogOverlay(...args);
  }

  function closeLogOverlay(...args) {
    return systemPanelsModule.closeLogOverlay(...args);
  }

  function clearLogEntries(...args) {
    return systemPanelsModule.clearLogEntries(...args);
  }

  function updateTrashButtonLabel(...args) {
    return systemPanelsModule.updateTrashButtonLabel(...args);
  }

  async function ensureTrashDirectory(...args) {
    return systemPanelsModule.ensureTrashDirectory(...args);
  }

  function formatTrashTimestampText(...args) {
    return systemPanelsModule.formatTrashTimestampText(...args);
  }

  function formatFileSize(...args) {
    return systemPanelsModule.formatFileSize(...args);
  }

  async function listTrashEntries(...args) {
    return systemPanelsModule.listTrashEntries(...args);
  }

  function updateTrashSelectionUI(...args) {
    return systemPanelsModule.updateTrashSelectionUI(...args);
  }

  function setTrashSelection(...args) {
    return systemPanelsModule.setTrashSelection(...args);
  }

  function renderTrashEntries(...args) {
    return systemPanelsModule.renderTrashEntries(...args);
  }

  async function refreshTrashButtonState(...args) {
    return systemPanelsModule.refreshTrashButtonState(...args);
  }

  async function refreshTrashOverlayContents(...args) {
    return systemPanelsModule.refreshTrashOverlayContents(...args);
  }

  async function openTrashOverlayPanel(...args) {
    return systemPanelsModule.openTrashOverlayPanel(...args);
  }

  function closeTrashOverlayPanel(...args) {
    return systemPanelsModule.closeTrashOverlayPanel(...args);
  }

  async function deleteTrashEntry(...args) {
    return systemPanelsModule.deleteTrashEntry(...args);
  }

  function deleteSelectedTrashEntry(...args) {
    return systemPanelsModule.deleteSelectedTrashEntry(...args);
  }

  async function emptyTrashFolder(...args) {
    return systemPanelsModule.emptyTrashFolder(...args);
  }

  async function loadAllTemplates(...args) {
    return templatePersistenceModule.loadAllTemplates(...args);
  }

  async function restoreTemplateFromTrash(...args) {
    return systemPanelsModule.restoreTemplateFromTrash(...args);
  }

  async function saveAll(...args) {
    return templatePersistenceModule.saveAll(...args);
  }

  const originalAlert = window.alert.bind(window);
  window.alert = (message) => {
    addLogEntry('warn', String(message ?? ''));
    originalAlert(message);
  };


  // CSV service delegates
  function updateExportButtons(...args) {
    return csvServiceModule.updateExportButtons(...args);
  }

  function beginExportSelection(...args) {
    return csvServiceModule.beginExportSelection(...args);
  }

  function exitExportSelectionMode(...args) {
    return csvServiceModule.exitExportSelectionMode(...args);
  }

  function ensureTemplateUidForExport(...args) {
    return csvServiceModule.ensureTemplateUidForExport(...args);
  }

  function getExportRecord(...args) {
    return csvServiceModule.getExportRecord(...args);
  }

  function cleanupExportRecord(...args) {
    return csvServiceModule.cleanupExportRecord(...args);
  }

  function getTemplateExportCounts(...args) {
    return csvServiceModule.getTemplateExportCounts(...args);
  }

  function getTemplateExportState(...args) {
    return csvServiceModule.getTemplateExportState(...args);
  }

  function applyTemplateExportAction(...args) {
    return csvServiceModule.applyTemplateExportAction(...args);
  }

  function handleTemplateExportCheckbox(...args) {
    return csvServiceModule.handleTemplateExportCheckbox(...args);
  }

  function isInstanceSelectedForExport(...args) {
    return csvServiceModule.isInstanceSelectedForExport(...args);
  }

  function applyInstanceExportSelection(...args) {
    return csvServiceModule.applyInstanceExportSelection(...args);
  }

  function handleInstanceExportCheckbox(...args) {
    return csvServiceModule.handleInstanceExportCheckbox(...args);
  }

  function collectTemplatesForExport(...args) {
    return csvServiceModule.collectTemplatesForExport(...args);
  }

  function sanitizeCsvFileName(...args) {
    return csvServiceModule.sanitizeCsvFileName(...args);
  }

  function encodeCsvValue(...args) {
    return csvServiceModule.encodeCsvValue(...args);
  }

  function rowsToCsv(...args) {
    return csvServiceModule.rowsToCsv(...args);
  }

  function serializeValueForCsv(...args) {
    return csvServiceModule.serializeValueForCsv(...args);
  }

  function buildCsvRowsForTemplate(...args) {
    return csvServiceModule.buildCsvRowsForTemplate(...args);
  }

  function performExportCsv(...args) {
    return csvServiceModule.performExportCsv(...args);
  }

  function parseCsvText(...args) {
    return csvServiceModule.parseCsvText(...args);
  }

  function normalizeCsvRowLength(...args) {
    return csvServiceModule.normalizeCsvRowLength(...args);
  }

  function parseBoolCell(...args) {
    return csvServiceModule.parseBoolCell(...args);
  }

  function convertCsvValueByType(...args) {
    return csvServiceModule.convertCsvValueByType(...args);
  }

  function parseDataRefCell(...args) {
    return csvServiceModule.parseDataRefCell(...args);
  }

  function buildTemplateFromCsv(...args) {
    return csvServiceModule.buildTemplateFromCsv(...args);
  }

  function applyImportedTemplate(...args) {
    return csvServiceModule.applyImportedTemplate(...args);
  }

  function importFromCsv(...args) {
    return csvServiceModule.importFromCsv(...args);
  }


  // Panel delegates
  function getValueByFieldForInstance(...args) {
    return panelsModule.getValueByFieldForInstance(...args);
  }

  function refreshTemplates(...args) {
    refreshParamTypeOptions();
    return panelsModule.refreshTemplates(...args);
  }

  function getSelectedInstanceIndices(...args) {
    return panelsModule.getSelectedInstanceIndices(...args);
  }

  function updateCompareButtonState(...args) {
    return panelsModule.updateCompareButtonState(...args);
  }

  function deactivateCompareValues(...args) {
    return panelsModule.deactivateCompareValues(...args);
  }

  function buildCompareValueSnapshot(...args) {
    return panelsModule.buildCompareValueSnapshot(...args);
  }

  function formatCompareDisplayValue(...args) {
    return panelsModule.formatCompareDisplayValue(...args);
  }

  function buildInstanceCompareText(...args) {
    return panelsModule.buildInstanceCompareText(...args);
  }

  function handleToggleCompareValues(...args) {
    return panelsModule.handleToggleCompareValues(...args);
  }

  function refreshInstances(...args) {
    refreshParamTypeOptions();
    return panelsModule.refreshInstances(...args);
  }

  function refreshParams(...args) {
    return panelsModule.refreshParams(...args);
  }

  function updateParamValue(...args) {
    return panelsModule.updateParamValue(...args);
  }

  function showSelectedParamDetails(...args) {
    return panelsModule.showSelectedParamDetails(...args);
  }

  function updateIndexTemplateOptions(...args) {
    return panelsModule.updateIndexTemplateOptions(...args);
  }

  function updateIndexParamOptions(...args) {
    return panelsModule.updateIndexParamOptions(...args);
  }


  // Interaction delegates
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
        if (currentTemplateIndex < 0 || currentInstanceIndex < 0) return;
        const inst = templates[currentTemplateIndex].instances[currentInstanceIndex];
        if (!inst.payload) inst.payload = {};
        (copyBuffer.items || []).forEach((obj) => {
          const existing = Object.keys(inst.payload)
            .filter((key) => /^\d+$/.test(key))
            .map((key) => parseInt(key, 10));
          let nextIndex = 0;
          while (existing.includes(nextIndex)) nextIndex += 1;
          inst.payload[String(nextIndex)] =
            obj && Object.prototype.hasOwnProperty.call(obj, 'value') ? obj.value : '';
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
      alert('模板名称已存在');
      return;
    }
    const instance = {
      id: 0,
      name: '默认',
      payload: { template: name, id: 0, name: '默认', index: '0' },
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

  function renameTemplate(newName) {
    if (currentTemplateIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    if (!tpl) return;
    const targetName = (newName || '').trim();
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

  function newInstance() {
    if (currentTemplateIndex < 0) {
      alert('请先选择一个模板');
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
    tpl.parameters.forEach((p) => {
      inst.payload[p.name] = getDefaultValueForType(p.type, getListElementTypeForParam(p));
    });
    inst.payload.template = tpl.name;
    inst.payload.id = nextId;
    inst.payload.name = name;
    inst.payload.index = String(getValueByFieldForInstance(tpl, inst, tpl.indexField || 'id'));
    tpl.instances.push(inst);
    currentInstanceIndex = tpl.instances.length - 1;
    refreshInstances();
    refreshParams();
    updateInstanceNameInputValidity();
    showMessage(`已创建新实例：${name}`);
  }

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

  function copyInstance() {
    if (currentTemplateIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    let indices = Array.from(selectedInstances);
    if (indices.length === 0 && currentInstanceIndex >= 0) indices = [currentInstanceIndex];
    if (indices.length === 0) {
      alert('请选择要复制的实例');
      return;
    }
    copyBuffer = {
      type: 'instance',
      items: indices.map((idx) => JSON.parse(JSON.stringify(tpl.instances[idx]))),
    };
    showMessage(`已复制 ${copyBuffer.items.length} 个实例`);
  }

  function pasteInstance() {
    if (currentTemplateIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    if (!copyBuffer || copyBuffer.type !== 'instance' || !copyBuffer.items || copyBuffer.items.length === 0) {
      alert('没有已复制的实例');
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

  function deleteInstance() {
    if (currentTemplateIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    let indices = Array.from(selectedInstances);
    if (indices.length === 0 && currentInstanceIndex >= 0) indices = [currentInstanceIndex];
    if (indices.length === 0) {
      alert('请选择要删除的实例');
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

  function newParam() {
    if (currentTemplateIndex < 0) {
      alert('请先选择一个模板');
      return;
    }
    const name = paramNameInput.value.trim();
    if (!name && !isEnumTemplate(templates[currentTemplateIndex])) {
      showMessage('请输入参数名称');
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
    const listElementTypeValue = type === 'list' ? getSelectedListElementType() : null;
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
        const targetTpl = templates.find((t) => t.name === idxTpl);
        if (targetTpl && isEnumTemplate(targetTpl)) {
          alert('索引目标不能是 enum 模板');
          indexTemplateSelect.value = '';
          updateIndexParamOptions();
        } else if (targetTpl) {
          const isReservedField = RESERVED_INDEX_FIELDS.has(idxParam);
          const targetParam = (targetTpl.parameters || []).find((p) => p && p.name === idxParam);
          const validParam =
            isReservedField || (targetParam && INDEXABLE_PARAM_TYPES.has(targetParam.type));
          if (!validParam) {
            alert('索引字段类型必须是 int/long/float/string');
            indexParamSelect.value = '';
          } else {
            indexObj = {
              template: idxTpl,
              param: idxParam,
              indexField: targetTpl ? targetTpl.indexField || 'id' : '',
            };
          }
        }
      }
    } else {
      indexTemplateSelect.value = '';
      indexParamSelect.value = '';
    }
    if (editingParamIndex >= 0) {
      const currentTpl = templates[currentTemplateIndex];
      const effectiveName = isEnumTemplate(currentTpl) ? String(editingParamIndex) : name;
      if (!isEnumTemplate(currentTpl) && isPureNumericName(effectiveName)) {
        showMessage('参数名称不能为纯数字');
        return;
      }
      updateParamAtIndex(editingParamIndex, effectiveName, type, indexObj, listElementTypeValue);
      editingParamIndex = -1;
      selectedParams.clear();
      refreshParams();
      showMessage('已更新参数');
      return;
    }
    if (isEnumTemplate(tpl)) {
      if (currentInstanceIndex < 0) {
        alert('请先选择一个实例');
        return;
      }
      const curInst = tpl.instances[currentInstanceIndex];
      if (!curInst.payload) curInst.payload = {};
      const keys = getEnumParamKeysForInstance(tpl, curInst).map((k) => parseInt(k, 10));
      let n = 0;
      while (keys.includes(n)) n++;
      curInst.payload[String(n)] = '';
      refreshParams();
      showMessage('已创建新参数');
      return;
    }
    if (tpl.parameters.some((p) => p.name === name)) {
      showMessage('该参数已存在');
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
    if (type === 'list') {
      param.elementType = listElementTypeValue;
    }
    if (indexBinding) {
      param.parameterIndexes = indexBinding;
    }
    tpl.parameters.push(param);
    tpl.instances.forEach((inst) => {
      if (indexBinding) {
        if (!inst.payload) inst.payload = {};
        if (type === 'list') {
          inst.payload[name] = normalizeReferenceList([], indexBinding);
        } else {
          inst.payload[name] = createDefaultReferenceValue(indexBinding);
        }
      } else {
        inst.payload[name] = getDefaultValueForType(type, getListElementTypeForParam(param));
      }
    });
    refreshParams();
    showMessage(`已创建新参数：${name}`);
  }

  function updateParamAtIndex(index, newName, newType, newIndexObj, newElementType) {
    if (currentTemplateIndex < 0 || index < 0) return;
    const tpl = templates[currentTemplateIndex];
    const param = tpl.parameters[index];
    if (!param) return;
    if (!isEnumTemplate(tpl) && isPureNumericName(newName)) {
      showMessage('参数名称不能为纯数字');
      return;
    }
    if (!isEnumTemplate(tpl) && tpl.parameters.some((p, i) => p.name === newName && i !== index)) {
      alert('参数名称已存在');
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
    if (newIndexObj && newIndexObj.template) {
      const targetTpl = templates.find((t) => t.name === newIndexObj.template);
      if (targetTpl && isEnumTemplate(targetTpl)) {
        alert('索引目标不能是 enum 模板');
        newIndexObj = null;
      } else if (targetTpl) {
        const isReservedField = RESERVED_INDEX_FIELDS.has(newIndexObj.param);
        const targetParam = (targetTpl.parameters || []).find((p) => p && p.name === newIndexObj.param);
        const validParam =
          isReservedField || (targetParam && INDEXABLE_PARAM_TYPES.has(targetParam.type));
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
    const oldElementType = oldType === 'list' ? getValidListElementType(param.elementType) : null;
    const normalizedElementType = newType === 'list' ? getValidListElementType(newElementType) : null;
    param.name = newName;
    param.type = newType;
    const oldIndex = param.parameterIndexes;
    param.parameterIndexes = newIndexObj;
    if (newType === 'list') {
      param.elementType = normalizedElementType;
    } else {
      delete param.elementType;
    }
    tpl.instances.forEach((inst) => {
      if (!inst || typeof inst !== 'object') return;
      if (!inst.payload) inst.payload = {};
      if (oldName !== newName) {
        inst.payload[newName] = inst.payload[oldName];
        delete inst.payload[oldName];
      }
      let currentValue = inst.payload[newName];
      if (oldIndex && !newIndexObj) {
        currentValue = unwrapReferencePayload(currentValue, oldIndex, oldType === 'list');
      }
      if (!newIndexObj) {
        if (newType === 'list') {
          currentValue = convertValueToList(currentValue, normalizedElementType || 'string');
        } else if (oldType !== newType || oldIndex) {
          currentValue = convertValueForType(
            currentValue,
            newType,
            normalizedElementType || 'string',
          );
        }
      }
      if (newIndexObj) {
        currentValue = wrapReferencePayload(
          currentValue,
          newIndexObj,
          newType === 'list',
          normalizedElementType || 'string',
        );
      } else if (
        newType === 'list' &&
        oldElementType &&
        normalizedElementType &&
        oldElementType !== normalizedElementType
      ) {
        currentValue = convertValueToList(currentValue, normalizedElementType);
      }
      if (
        newIndexObj &&
        newType === 'list' &&
        oldElementType &&
        normalizedElementType &&
        oldElementType !== normalizedElementType
      ) {
        const refList = Array.isArray(currentValue)
          ? currentValue
          : wrapReferencePayload(currentValue, newIndexObj, true, normalizedElementType);
        refList.forEach((entry) => {
          if (entry && typeof entry === 'object') {
            const coerced = coerceListElementValue(entry.value, normalizedElementType);
            entry.value = coerced == null ? '' : String(coerced);
          }
        });
        currentValue = refList;
      }
      inst.payload[newName] = currentValue;
    });
  }

  function deleteParam(index) {
    if (currentTemplateIndex < 0) return;
    selectedParams.clear();
    selectedParams.add(index);
    deleteParams();
  }

  /**
   * ����ģ��
   */

  // Interaction clipboard delegates
  function copyTemplates() {
    if (templates.length === 0) return;
    let indices = Array.from(selectedTemplates);
    if (indices.length === 0 && currentTemplateIndex >= 0) indices = [currentTemplateIndex];
    if (indices.length === 0) {
      alert('请先选择要复制的模板');
      return;
    }
    const items = indices.map((idx) => JSON.parse(JSON.stringify(templates[idx])));
    items.forEach((tpl) => {
      if (tpl && tpl.__uid) delete tpl.__uid;
    });
    copyBuffer = { type: 'template', items };
    showMessage(`已复制 ${items.length} 个模板`);
  }

  function pasteTemplates() {
    if (!copyBuffer || copyBuffer.type !== 'template' || !copyBuffer.items) return;
    copyBuffer.items.forEach((sourceTpl) => {
      let newName = sourceTpl.name;
      while (templates.some((tpl) => tpl.name === newName)) {
        newName = `${newName}_副本`;
      }
      const newTpl = JSON.parse(JSON.stringify(sourceTpl));
      newTpl.name = newName;
      delete newTpl.__uid;
      newTpl.instances.forEach((inst, idx) => {
        inst.id = idx;
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

  function deleteTemplates() {
    if (templates.length === 0) return;
    let indices = Array.from(selectedTemplates);
    if (indices.length === 0 && currentTemplateIndex >= 0) indices = [currentTemplateIndex];
    if (indices.length === 0) {
      alert('请先选择要删除的模板');
      return;
    }
    indices.sort((a, b) => b - a);
    indices.forEach((idx) => {
      const tpl = templates[idx];
      if (tpl && tpl.__uid) {
        lastSavedStructureSnapshot.delete(tpl.__uid);
      }
      if (tpl && tpl.__fromDisk) {
        const duplicatedName = templates.some(
          (item, currentIdx) => currentIdx !== idx && item && item.name === tpl.name,
        );
        if (!duplicatedName) {
          pendingTemplateDeletions.set(tpl.name, { name: tpl.name, deletedAt: Date.now() });
        }
      }
      templates.splice(idx, 1);
    });
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

  function copyParams() {
    if (currentTemplateIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    const indices = Array.from(selectedParams);
    if (indices.length === 0) {
      alert('请先选择要复制的参数');
      return;
    }
    if (isEnumTemplate(tpl)) {
      if (currentInstanceIndex < 0) {
        alert('请先选择一个实例');
        return;
      }
      const inst = tpl.instances[currentInstanceIndex];
      const keys = getEnumParamKeysForInstance(tpl, inst);
      const items = indices.map((idx) => ({ value: inst.payload[keys[idx]] }));
      copyBuffer = { type: 'param', items, enumMode: true };
      showMessage(`已复制 ${items.length} 个参数`);
      return;
    }
    const items = indices.map((idx) => {
      const param = JSON.parse(JSON.stringify(tpl.parameters[idx]));
      const values = tpl.instances.map((inst) => inst.payload[param.name]);
      return { param, values };
    });
    copyBuffer = { type: 'param', items };
    showMessage(`已复制 ${items.length} 个参数`);
  }

  function pasteParams() {
    if (currentTemplateIndex < 0) return;
    if (!copyBuffer || copyBuffer.type !== 'param' || !copyBuffer.items) return;
    const tpl = templates[currentTemplateIndex];
    copyBuffer.items.forEach((item) => {
      let newName = item.param.name;
      while (tpl.parameters.some((param) => param.name === newName)) {
        newName = `${newName}_副本`;
      }
      const newParam = JSON.parse(JSON.stringify(item.param));
      newParam.name = newName;
      tpl.parameters.push(newParam);
      tpl.instances.forEach((inst, idx) => {
        inst.payload[newName] = item.values[idx];
      });
    });
    refreshParams();
    showMessage(`已粘贴 ${copyBuffer.items.length} 个参数`);
  }

  function deleteParams() {
    if (currentTemplateIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    let indices = Array.from(selectedParams);
    if (indices.length === 0) {
      alert('请先选择要删除的参数');
      return;
    }
    indices.sort((a, b) => b - a);
    if (isEnumTemplate(tpl)) {
      if (currentInstanceIndex < 0) return;
      const inst = tpl.instances[currentInstanceIndex];
      const keys = Object.keys(inst.payload || {})
        .filter((key) => /^\d+$/.test(key))
        .map((key) => parseInt(key, 10))
        .sort((a, b) => a - b)
        .map((value) => String(value));
      indices.forEach((idx) => {
        const key = keys[idx];
        if (key !== undefined && inst.payload) {
          delete inst.payload[key];
        }
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
  function updateIndexTemplateOptions() {
    const currentTpl = currentTemplateIndex >= 0 ? templates[currentTemplateIndex] : null;
    const previousValue = indexTemplateSelect.value;
    indexTemplateSelect.innerHTML = "";
    const disableReason = (() => {
      if (currentTpl && isEnumTemplate(currentTpl)) return 'enum 模板不支持索引';
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
    opt0.textContent = '选择目标模板';
    indexTemplateSelect.appendChild(opt0);
    // ������ѡ�� enum ģ����Ϊ����Ŀ��
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
   * ����ѡ�е�����ģ����²����б�
   */
  function updateIndexParamOptions() {
    if (indexTemplateSelect.disabled) {
      indexParamSelect.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = indexTemplateSelect.dataset.disabledReason || 'enum 模板不支持索引';
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
      opt.textContent = "选择目标字段";
      indexParamSelect.appendChild(opt);
      indexParamSelect.value = "";
      return;
    }
    const tpl = templates.find((t) => t.name === tplName);
    if (!tpl) return;
    if (isEnumTemplate(tpl)) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "不能指向 enum 模板";
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
    appendParamOption('name', 'name');
    appendParamOption('index', 'index');
    (tpl.parameters || [])
      .filter((p) => p && INDEXABLE_PARAM_TYPES.has(p.type))
      .forEach((p) => appendParamOption(p.name, p.name));

    if (indexableParams.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '无可用字段';
      indexParamSelect.appendChild(opt);
      indexParamSelect.value = '';
      indexParamSelect.disabled = true;
      return;
    }

    const optDef = document.createElement("option");
    optDef.value = "";
    optDef.textContent = "选择目标字段";
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

  if (chooseDirBtn) {
    chooseDirBtn.addEventListener("click", chooseDirectory);
  }
  if (saveBtn) {
    saveBtn.addEventListener("click", saveAll);
  }
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
  if (engineModeToggleBtn) {
    engineModeToggleBtn.addEventListener('click', () => {
      toggleEngineMode();
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
  updateEngineModeUIState();
  updateListElementTypeSelectState();
  if (regenerateCsBtn) {
    regenerateCsBtn.addEventListener("click", regenerateCSharpStructures);
  }
  if (godotQuickInitBtn) {
    godotQuickInitBtn.addEventListener('click', () => {
      workspaceStorageModule.initializeGodotProjectConfiguration();
    });
  }
  if (regenerateCppBtn) {
    regenerateCppBtn.addEventListener('click', regenerateCppStructures);
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
      updateListElementTypeSelectState();
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
    return ensureTemplateUidPure(tpl, templateUidState);
  }

  function snapshotTemplateStructure(tpl) {
    return snapshotTemplateStructurePure(tpl, { isEnumTemplate });
  }

  function structuresEqual(a, b) {
    return structuresEqualPure(a, b);
  }

  function hasTemplateStructureChanged(tpl) {
    return hasTemplateStructureChangedPure(tpl, {
      lastSavedStructureSnapshot,
      ensureTemplateUid,
      snapshotTemplateStructure,
    });
  }

  function captureCurrentStructureSnapshot() {
    return captureCurrentStructureSnapshotPure(templates, {
      ensureTemplateUid,
      snapshotTemplateStructure,
    });
  }

  function normalizeContent(content) {
    return normalizeContentPure(content);
  }

  async function readTextFileIfExists(dirHandle, fileName) {
    if (workspaceStorageModule) {
      return workspaceStorageModule.readTextFileIfExists(dirHandle, fileName);
    }
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
    if (workspaceStorageModule) {
      return workspaceStorageModule.writeTextFile(dirHandle, fileName, content);
    }
    if (!dirHandle) return;
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable({ keepExistingData: false });
    await writable.write(content);
    await writable.close();
  }

  // 参数选择历史（仅记录参数层级的选择）
  const paramHistory = [];

  // Interaction history delegates
  function pushParamHistory() {
    if (currentTemplateIndex < 0 || currentInstanceIndex < 0 || editingParamIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    const param = tpl.parameters[editingParamIndex];
    if (!param) return;
    const snapshot = {
      templateName: tpl.name,
      paramName: param.name,
      instanceId:
        templates[currentTemplateIndex].instances[currentInstanceIndex]?.id ?? currentInstanceIndex,
    };
    const top = paramHistory[paramHistory.length - 1];
    if (
      !top ||
      top.templateName !== snapshot.templateName ||
      top.paramName !== snapshot.paramName ||
      top.instanceId !== snapshot.instanceId
    ) {
      paramHistory.push(snapshot);
    }
  }

  function navigateToParamSnapshot(snapshot) {
    if (!snapshot) return false;
    const targetTemplateIndex = templates.findIndex((tpl) => tpl.name === snapshot.templateName);
    if (targetTemplateIndex < 0) return false;
    currentTemplateIndex = targetTemplateIndex;
    selectedTemplates.clear();
    selectedTemplates.add(targetTemplateIndex);
    const targetInstanceIndex = templates[targetTemplateIndex].instances.findIndex(
      (inst) => inst.id === snapshot.instanceId,
    );
    currentInstanceIndex =
      targetInstanceIndex >= 0
        ? targetInstanceIndex
        : templates[targetTemplateIndex].instances.length > 0
          ? 0
          : -1;
    selectedInstances.clear();
    if (currentInstanceIndex >= 0) {
      selectedInstances.add(currentInstanceIndex);
    }
    const targetParamIndex = templates[targetTemplateIndex].parameters.findIndex(
      (param) => param.name === snapshot.paramName,
    );
    selectedParams.clear();
    if (targetParamIndex >= 0) {
      selectedParams.add(targetParamIndex);
      editingParamIndex = targetParamIndex;
    } else {
      editingParamIndex = -1;
    }
    templateNameInput.value = templates[currentTemplateIndex].name;
    instanceNameInput.value =
      currentInstanceIndex >= 0
        ? templates[currentTemplateIndex].instances[currentInstanceIndex].name
        : '';
    showSelectedParamDetails();
    refreshTemplates();
    refreshInstances();
    refreshParams();
    updateIndexTemplateOptions();
    lastSelectedCategory = 'param';
    return true;
  }
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

  // Interaction drag delegates
  function setupDragSelection(listEl, type) {
    listEl.addEventListener('mousedown', (e) => {
      if (!e.shiftKey) return;
      const selector = type === 'param' ? '.param-item' : 'li';
      const itemEl = e.target.closest(selector);
      if (!itemEl) return;
      const items = Array.from(listEl.querySelectorAll(selector));
      const idx = items.indexOf(itemEl);
      if (idx < 0) return;
      dragSelect.isDragging = false;
      dragSelect.type = type;
      dragSelect.indices.clear();
      dragSelect.startIndex = idx;
    });
    listEl.addEventListener('mouseover', (e) => {
      if (dragSelect.type !== type) return;
      if ((e.buttons & 1) !== 1) return;
      const selector = type === 'param' ? '.param-item' : 'li';
      const items = Array.from(listEl.querySelectorAll(selector));
      const itemEl = e.target.closest(selector);
      if (!itemEl) return;
      const idx = items.indexOf(itemEl);
      if (idx < 0) return;
      if (dragSelect.startIndex === undefined) {
        dragSelect.startIndex = idx;
      }
      if (idx !== dragSelect.startIndex) {
        dragSelect.isDragging = true;
        dragSelect.indices.clear();
        listEl.querySelectorAll('.selecting').forEach((el) => el.classList.remove('selecting'));
        const start = Math.min(dragSelect.startIndex, idx);
        const end = Math.max(dragSelect.startIndex, idx);
        for (let i = start; i <= end; i += 1) {
          dragSelect.indices.add(i);
          const current = items[i];
          if (current) current.classList.add('selecting');
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

  // 点击空白区域取消选中

  // Interaction clear delegates
  function setupClearOnBlank(listEl, type) {
    listEl.addEventListener('click', (e) => {
      const itemSelector = type === 'param' ? '.param-item' : 'li';
      if (e.target.closest(itemSelector)) return;
      if (type === 'template') {
        selectedTemplates.clear();
        currentTemplateIndex = -1;
        currentInstanceIndex = -1;
        templateNameInput.value = '';
        instanceNameInput.value = '';
        selectedInstances.clear();
        selectedParams.clear();
        editingParamIndex = -1;
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
        anchorInstance = null;
        anchorParam = null;
        refreshInstances();
        refreshParams();
      } else if (type === 'param') {
        selectedParams.clear();
        editingParamIndex = -1;
        showSelectedParamDetails();
        refreshParams();
        anchorParam = null;
      }
      lastSelectedCategory = type;
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
    return systemPanelsModule.showMessage(msg, level);
  }

  // 持久化：使用 IndexedDB 保存最近一次的工作目录句柄
  const DB_NAME = 'json-editor';
  const DB_STORE = 'handles';
  const ENUM_CACHE_PREFIX = 'enumCache:';
  function openDB() {
    if (workspaceStorageModule) {
      return workspaceStorageModule.openDB();
    }
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
    if (workspaceStorageModule) {
      return workspaceStorageModule.getEnumCacheKey();
    }
    if (!directoryHandle || !directoryHandle.name) return null;
    return `${ENUM_CACHE_PREFIX}${directoryHandle.name}`;
  }
  async function saveLastDirectoryHandle(handle) {
    if (workspaceStorageModule) {
      return workspaceStorageModule.saveLastDirectoryHandle(handle);
    }
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
    if (workspaceStorageModule) {
      return workspaceStorageModule.getLastDirectoryHandle();
    }
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
    if (workspaceStorageModule) {
      return workspaceStorageModule.saveEnumTemplateCache(tpl);
    }
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
    if (workspaceStorageModule) {
      return workspaceStorageModule.loadEnumTemplateCache();
    }
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
    if (workspaceStorageModule) {
      return workspaceStorageModule.clearEnumTemplateCache();
    }
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
    if (workspaceStorageModule) {
      return workspaceStorageModule.verifyPermission(handle, readWrite);
    }
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
    } catch (_err) {}
    return true;
  }
  async function autoRestoreLastDirectory() {
    if (workspaceStorageModule) {
      return workspaceStorageModule.autoRestoreLastDirectory();
    }
    try {
      const handle = await getLastDirectoryHandle();
      if (!handle) return;
      // 申请持久化存储，提升恢复成功率
      if (navigator.storage && navigator.storage.persist) {
        try { await navigator.storage.persist(); } catch (_err) {}
      }
      const ok = await verifyPermission(handle, true);
      if (!ok) return;
      directoryHandle = handle;
      configDirHandle = null;
      currentDirLabel.textContent = directoryHandle.name;
      await loadEditorConfigState();
      await ensureSubFolders();
      if (isCSharpMode()) {
        await ensureModelStruct();
        await generateRuntimeLoaderArtifacts();
      }
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
    if (workspaceStorageModule) {
      return workspaceStorageModule.chooseDirectory();
    }
    try {
      directoryHandle = await window.showDirectoryPicker();
      configDirHandle = null;
      currentDirLabel.textContent = directoryHandle.name;
      await loadEditorConfigState();
      await ensureSubFolders();
      if (isCSharpMode()) {
        await ensureModelStruct();
        await generateRuntimeLoaderArtifacts();
      }
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
    if (workspaceStorageModule) {
      return workspaceStorageModule.shouldIgnoreFileEntry(entryName);
    }
    if (!entryName) return false;
    const lower = entryName.toLowerCase();
    if (IGNORED_FILE_NAMES.includes(lower)) return true;
    return IGNORED_FILE_SUFFIXES.some((suffix) => lower.endsWith(suffix));
  }

  async function removeDirectoryIfExists(parentHandle, name) {
    if (workspaceStorageModule) {
      return workspaceStorageModule.removeDirectoryIfExists(parentHandle, name);
    }
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
    if (workspaceStorageModule) {
      return workspaceStorageModule.cleanConflictingEngineArtifacts();
    }
    if (!directoryHandle) return;
    let removed = false;
    if (isUnityMode()) {
      removed = (await removeDirectoryIfExists(directoryHandle, 'cppmodel')) || removed;
      cppModelHandle = null;
      cppEnumHandle = null;
    } else {
      removed = (await removeDirectoryIfExists(directoryHandle, 'csharpDate')) || removed;
      removed = (await removeDirectoryIfExists(directoryHandle, 'Editor')) || removed;
    
      csharpHandle = null;
      
      editorHandle = null;
      modelStructHandle = null;
    }
  }

  async function ensureSubFolders() {
    if (workspaceStorageModule) {
      return workspaceStorageModule.ensureSubFolders();
    }
    if (!directoryHandle) return;
    dataEntityHandle = await directoryHandle.getDirectoryHandle("dataEntity", { create: true });
    try {
      trashHandle = await dataEntityHandle.getDirectoryHandle(TRASH_FOLDER_NAME, { create: true });
    } catch (err) {
      console.warn('无法创建或访问垃圾箱目录', err);
      trashHandle = null;
    }
    if (isUnityMode()) {
      cppModelHandle = null;
      cppEnumHandle = null;
      csharpHandle = await directoryHandle.getDirectoryHandle("csharpDate", { create: true });
      try {
        editorHandle = await directoryHandle.getDirectoryHandle("Editor", { create: true });
      } catch (err) {
        console.warn('无法创建或访问 Editor 文件夹', err);
        editorHandle = null;
      }
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
          const hasMethod = /\bvoid\b|\bpublic\b|\bprivate\b/.test(text);
          if (hasMethod) {
            showMessage(`检测到已有 cs 文件包含方法，跳过读取：${entry.name}`);
          }
        }
      }
    } else {
      csharpHandle = null;
      editorHandle = null;
      cppModelHandle = await directoryHandle.getDirectoryHandle("cppmodel", { create: true });
      try {
        cppEnumHandle = await cppModelHandle.getDirectoryHandle("enum", { create: true });
      } catch (err) {
        console.warn('无法创建或访问 enum 目录', err);
        cppEnumHandle = null;
      }
      for await (const entry of cppModelHandle.values()) {
        if (entry.kind === 'directory') continue;
        if (entry.kind === "file" && shouldIgnoreFileEntry(entry.name)) {
          continue;
        }
        if (entry.kind === "file" && !entry.name.toLowerCase().endsWith(".h")) {
          showMessage(`cppmodel 文件夹内仅允许 .h 文件：${entry.name}`);
          throw new Error("Invalid file in cppmodel");
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
  async function ensureCppEnumDirectory() {
    if (workspaceStorageModule) {
      return workspaceStorageModule.ensureCppEnumDirectory();
    }
    if (cppEnumHandle) return cppEnumHandle;
    if (!cppModelHandle) return null;
    try {
      cppEnumHandle = await cppModelHandle.getDirectoryHandle("enum", { create: true });
    } catch (err) {
      console.warn('无法创建或访问 enum 目录', err);
      cppEnumHandle = null;
    }
    return cppEnumHandle;
  }

  /**
   * 确保 csharpDate/modelstruct 与 modelCsharpe.cs 存在
   */
  async function ensureModelStruct() {
    return csharpRuntimeGeneratorModule.ensureModelStruct();
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
    return normalizeTemplateParameterIndexesPure(template, { ensureParamElementType });
  }

  function populateMissingIndexFields(templatesList) {
    return populateMissingIndexFieldsPure(templatesList);
  }

  async function generateRuntimeLoaderArtifacts() {
    if (isUnityMode()) {
      return csharpRuntimeGeneratorModule.generateRuntimeLoaderArtifacts();
    }
    if (isGodotMode()) {
      return godotRuntimeGeneratorModule.generateRuntimeLoaderArtifacts();
    }
    return undefined;
  }

  async function regenerateCSharpStructures() {
    if (!directoryHandle) {
      window.alert('请先选择工作目录');
      return;
    }
    if (!isCSharpMode()) {
      showMessage('请先切换到 Unity 或 Godot C# 模式再生成 C# 脚本', 'warn');
      return;
    }
    try {
      const consent = await ensureEngineGenerationConsent(
        isGodotMode() ? '生成 Godot C# 数据结构脚本' : '生成 C# 数据结构脚本',
      );
      if (!consent) return;
      await cleanConflictingEngineArtifacts();
      await ensureSubFolders();
      await ensureModelStruct();
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
      await generateRuntimeLoaderArtifacts();
      if (updatedAny) {
        showMessage(
          isGodotMode()
            ? '已重新生成 Godot C# 数据结构脚本'
            : '已重新生成 C# 数据结构脚本',
        );
      } else {
        showMessage(
          isGodotMode()
            ? '没有可生成的 Godot C# 数据结构脚本'
            : '没有可生成的 C# 数据结构脚本',
        );
      }
    } catch (err) {
      console.error(err);
      showMessage(
        isGodotMode()
          ? '重新生成 Godot C# 脚本失败，请检查权限'
          : '重新生成 C# 脚本失败，请检查权限',
      );
    }
  }

  async function regenerateCppStructures() {
    return ueGeneratorModule.regenerateCppStructures();
  }

  async function generateEnumCSFiles(enumTpl) {
    return csharpRuntimeGeneratorModule.generateEnumCSFiles(enumTpl);
  }

  function generateCSContent(tpl) {
    return csharpRuntimeGeneratorModule.generateCSContent(tpl);
  }

  function mapToCSharpType(type, param = null) {
    return csharpRuntimeGeneratorModule.mapToCSharpType(type, param);
  }

  function mapCSharpPrimitiveType(type) {
    return csharpRuntimeGeneratorModule.mapCSharpPrimitiveType(type);
  }

  function createUEGenerationContext() {
    return ueGeneratorModule.createUEGenerationContext();
  }

  function getUECounterKey(category) {
    return ueGeneratorModule.getUECounterKey(category);
  }

  function registerUENameReplacement(context, category, originalName) {
    return ueGeneratorModule.registerUENameReplacement(context, category, originalName);
  }

  function toPascalCaseFromIdentifier(value) {
    return ueGeneratorModule.toPascalCaseFromIdentifier(value);
  }

  function resolveUENameParts(name, context, category) {
    return ueGeneratorModule.resolveUENameParts(name, context, category);
  }

  function formatUEInvalidNameMessage(records) {
    return ueGeneratorModule.formatUEInvalidNameMessage(records);
  }

  function mapPrimitiveToUEType(type) {
    return ueGeneratorModule.mapPrimitiveToUEType(type);
  }

  function mapParamToUETypeInfo(param, context) {
    return ueGeneratorModule.mapParamToUETypeInfo(param, context);
  }

  function collectUEEnumIncludePaths(tpl, context) {
    return ueGeneratorModule.collectUEEnumIncludePaths(tpl, context);
  }

  function getUECategoryLabel(nameParts) {
    return ueGeneratorModule.getUECategoryLabel(nameParts);
  }

  function buildUEHeaderContent(tpl, options, context) {
    return ueGeneratorModule.buildUEHeaderContent(tpl, options, context);
  }

  function buildUEEnumHeaderContent(enumName, fileBase, def, context) {
    return ueGeneratorModule.buildUEEnumHeaderContent(enumName, fileBase, def, context);
  }

  function computeIndexFieldInfo(tpl, context) {
    return ueGeneratorModule.computeIndexFieldInfo(tpl, context);
  }

  async function generateUEEnumHeaderFiles(context, enumFiles) {
    return ueGeneratorModule.generateUEEnumHeaderFiles(context, enumFiles);
  }

  async function cleanupCppModelDirectory(validFiles) {
    return ueGeneratorModule.cleanupCppModelDirectory(validFiles);
  }

  async function cleanupCppEnumDirectory(validFiles) {
    return ueGeneratorModule.cleanupCppEnumDirectory(validFiles);
  }

  async function generateUECppStructuresForCurrentTemplates() {
    return ueGeneratorModule.generateUECppStructuresForCurrentTemplates();
  }


  // Interaction filter delegates
  function filterList(listEl, term, isParamList = false) {
    const lower = term.trim().toLowerCase();
    const items = listEl.children;
    let visibleCount = 0;
    let lastVisibleIndex = -1;
    for (let i = 0; i < items.length; i += 1) {
      const el = items[i];
      let text;
      if (isParamList) {
        const label = el.querySelector('label');
        text = label ? label.textContent : '';
      } else {
        text = el.textContent;
      }
      if (!lower || (text && text.toLowerCase().includes(lower))) {
        el.style.display = '';
        visibleCount += 1;
        lastVisibleIndex = i;
      } else {
        el.style.display = 'none';
      }
    }
    if (visibleCount === 1 && !isParamList && lower.length > 0) {
      const item = listEl.children[lastVisibleIndex];
      if (item) item.click();
    }
  }
  
  async function bootstrapLegacyApp() {
    if (appBootstrapped) return;
    appBootstrapped = true;
    document.body.classList.add('dark');
    refreshTemplates();
    updateIndexTemplateOptions();
    await autoRestoreLastDirectory();
  }

  globalThis.__legacyMainContext = Object.assign(globalThis.__legacyMainContext || {}, domRefs, {
    $,
    createDefaultCompareValueState,
    dragSelect,
    RESERVED_INDEX_FIELDS,
    INDEXABLE_PARAM_TYPES,
    builtinParamTypeOptions,
    builtinParamTypeSet,
    createDefaultReferenceValue,
    ensureParamElementType,
    getListElementTypeForParam,
    getValidListElementType,
    isEnumValueInvalidPure,
    isPureNumericName,
    isTemplateNameInvalidPure,
    isUENameCompliant,
    normalizeReferenceList,
    normalizeReferenceValue,
    unwrapReferencePayload,
    wrapReferencePayloadPure,
    captureCurrentStructureSnapshotPure,
    ensureTemplateUidPure,
    hasTemplateStructureChangedPure,
    normalizeContentPure,
    normalizeTemplateParameterIndexesPure,
    populateMissingIndexFieldsPure,
    snapshotTemplateStructurePure,
    structuresEqualPure,
    buildListElementTypeCollectionsPure,
    chooseDuplicateNavigationTargetPure,
    collectDuplicateIdInfoPure,
    collectDuplicateIndexInfoPure,
    collectInstanceIndexInvalidReasonsPure,
    computeExpectedIndexValuePure,
    doesTemplateContainValue,
    doesTemplateHaveField,
    doesTemplateHaveInvalidIndexReferencesPure,
    enforceEnumIndexFieldPure,
    ensureEnumParamNamingPure,
    evaluateInstanceIndexValidationPure,
    findTemplateByNamePure,
    formatIndexCellPure,
    getEnumCSharpTypeNamePure,
    getEnumDefinitionPure,
    getEnumDefinitionsPure,
    getEnumParamKeysForInstancePure,
    getEnumTemplatePure,
    getEnumValuesPure,
    getInstanceFieldValue,
    getNumericInstanceIdPure,
    isEnumTemplatePure,
    isEnumTypePure,
    parseIndexDataCellPure,
    parseIndexTypeCellPure,
    resolveIndexFieldMetaPure,
    sanitizeCSharpMemberNamePure,
    sanitizeCSharpTypeNamePure,
    coerceListElementValuePure,
    collectListTypeViolationsPure,
    convertValueForTypePure,
    convertValueToListPure,
    getDefaultValueForElementTypePure,
    getDefaultValueForTypePure,
    isListElementValueValidPure,
    validateListValueAgainstTypePure,
    isTemplateNameInvalid,
    isEnumValueInvalid,
    wrapReferencePayload,
    isUnityMode,
    isUEMode,
    isSheetModeActive,
    normalizeSheetSelection,
    showMessage,
    addLogEntry,
    refreshTemplates,
    refreshInstances,
    refreshParams,
    updateParamValue,
    showSelectedParamDetails,
    updateIndexTemplateOptions,
    updateIndexParamOptions,
    getValueByFieldForInstance,
    getSelectedInstanceIndices,
    updateCompareButtonState,
    deactivateCompareValues,
    buildCompareValueSnapshot,
    formatCompareDisplayValue,
    buildInstanceCompareText,
    handleToggleCompareValues,
    setInvalidNameVisual,
    updateTemplateNameInputValidity,
    updateInstanceNameInputValidity,
    updateListElementTypeSelectState,
    updateInstanceIdInputState,
    updateParamNameInputValidity,
    getSelectedListElementType,
    getListElementTypeLabel,
    normalizeParamIndexStructure,
    normalizeTemplateParameterIndexes,
    populateMissingIndexFields,
    captureCurrentStructureSnapshot,
    hasTemplateStructureChanged,
    normalizeContent,
    snapshotTemplateStructure,
    structuresEqual,
    findTemplateByName,
    evaluateInstanceIndexValidation,
    collectInstanceIndexInvalidReasons,
    doesTemplateHaveInvalidIndexReferences,
    resolveIndexFieldMeta,
    formatIndexCell,
    parseIndexTypeCell,
    parseIndexDataCell,
    computeExpectedIndexValue,
    enforceEnumIndexField,
    collectDuplicateIdInfo,
    getNumericInstanceId,
    collectDuplicateIndexInfo,
    chooseDuplicateNavigationTarget,
    jumpToDuplicateIndexInstance,
    enforceImportedIndexField,
    isEnumTemplate,
    ensureEnumParamNaming,
    getEnumParamKeysForInstance,
    getEnumTemplate,
    getEnumDefinitions,
    getEnumDefinition,
    isEnumType,
    getEnumValues,
    getEnumCSharpTypeName,
    sanitizeCSharpTypeName,
    sanitizeCSharpMemberName,
    getBuiltinParamTypeOptionsForCurrentMode,
    rebuildListElementTypeCollections,
    refreshListElementTypeSelect,
    refreshParamTypeOptions,
    updateParamTypeSelectEnabledState,
    applyIndexDisabledState,
    updateParamNameInputEnabledState,
    newTemplate,
    renameTemplate,
    newInstance,
    renameInstance,
    commitInstanceIdChange,
    copyInstance,
    pasteInstance,
    deleteInstance,
    newParam,
    updateParamAtIndex,
    convertValueForType,
    deleteParam,
    getDefaultValueForType,
    getDefaultValueForElementType,
    convertValueToList,
    coerceListElementValue,
    isListElementValueValid,
    validateListValueAgainstType,
    collectListTypeViolations,
    persistEditorConfig,
    readTextFileIfExists,
    writeTextFile,
    buildLuckysheetCell,
    buildLuckysheetSheetFromRows,
    applyLuckysheetDuplicateIdStyles,
    refreshActiveLuckysheetDuplicateStyles,
    activateLuckysheetSheet,
    getLuckysheetCell,
    extractLuckysheetCellText,
    readLuckysheetCell,
    compareTemplateParameters,
    markSheetTemplateValidation,
    getLuckysheetUsedRange,
    collectLuckysheetRows,
    normalizeSheetRowsForComparison,
    areSheetRowsEqual,
    getTemplateParameterSignature,
    computeSheetTemplatesFingerprint,
    commitActiveSheetEdits,
    updateSheetTemplateNav,
    updateSheetInstanceTabs,
    renderLuckysheetForActiveInstance,
    enterSheetMode,
    exitSheetMode,
    setEditMode,
    updateExportButtons,
    beginExportSelection,
    exitExportSelectionMode,
    ensureTemplateUidForExport,
    getExportRecord,
    cleanupExportRecord,
    getTemplateExportCounts,
    getTemplateExportState,
    applyTemplateExportAction,
    handleTemplateExportCheckbox,
    isInstanceSelectedForExport,
    applyInstanceExportSelection,
    handleInstanceExportCheckbox,
    collectTemplatesForExport,
    sanitizeCsvFileName,
    encodeCsvValue,
    rowsToCsv,
    serializeValueForCsv,
    buildCsvRowsForTemplate,
    performExportCsv,
    parseCsvText,
    normalizeCsvRowLength,
    parseBoolCell,
    convertCsvValueByType,
    parseDataRefCell,
    buildTemplateFromCsv,
    applyImportedTemplate,
    importFromCsv,
    pushParamHistory,
    navigateToParamSnapshot,
    setupDragSelection,
    setupClearOnBlank,
    handleCopy,
    handlePaste,
    handleDelete,
    copyTemplates,
    pasteTemplates,
    deleteTemplates,
    copyParams,
    pasteParams,
    deleteParams,
    filterList,
  });
  Object.defineProperties(globalThis.__legacyMainContext, {
    listElementTypeOptions: {
      configurable: true,
      enumerable: true,
      get: () => listElementTypeOptions,
      set: (value) => {
        listElementTypeOptions = value;
      },
    },
    listElementTypeSet: {
      configurable: true,
      enumerable: true,
      get: () => listElementTypeSet,
      set: (value) => {
        listElementTypeSet = value;
      },
    },
  });

  window.LegacyApp = {
    state: appState,
    bootstrap: bootstrapLegacyApp,
    modules: {
      appMode: appModeModule,
      formAndReference: {
        isPureNumericName, isUENameCompliant, isTemplateNameInvalid, isEnumValueInvalid,
        getValidListElementType, ensureParamElementType, getListElementTypeForParam, getSelectedListElementType, getListElementTypeLabel,
        setInvalidNameVisual, updateTemplateNameInputValidity, updateInstanceNameInputValidity, updateListElementTypeSelectState, updateInstanceIdInputState, updateParamNameInputValidity,
        createDefaultReferenceValue, normalizeReferenceValue, normalizeReferenceList, unwrapReferencePayload, wrapReferencePayload,
      },
      templateNormalizer: { ensureTemplateUid, snapshotTemplateStructure, structuresEqual, hasTemplateStructureChanged, captureCurrentStructureSnapshot, normalizeContent, normalizeParamIndexStructure, normalizeTemplateParameterIndexes, populateMissingIndexFields },
      workspaceStorage: workspaceStorageModule,
      indexEnumValidation: { findTemplateByName, doesTemplateHaveField, getInstanceFieldValue, doesTemplateContainValue, evaluateInstanceIndexValidation, collectInstanceIndexInvalidReasons, doesTemplateHaveInvalidIndexReferences, resolveIndexFieldMeta, formatIndexCell, parseIndexTypeCell, parseIndexDataCell, computeExpectedIndexValue, enforceEnumIndexField, collectDuplicateIdInfo, getNumericInstanceId, collectDuplicateIndexInfo, chooseDuplicateNavigationTarget, jumpToDuplicateIndexInstance, enforceImportedIndexField, isEnumTemplate, ensureEnumParamNaming, getEnumParamKeysForInstance, getEnumTemplate, getEnumDefinitions, getEnumDefinition, isEnumType, getEnumValues, getEnumCSharpTypeName, sanitizeCSharpTypeName, sanitizeCSharpMemberName, getBuiltinParamTypeOptionsForCurrentMode, rebuildListElementTypeCollections, refreshListElementTypeSelect, refreshParamTypeOptions, updateParamTypeSelectEnabledState, applyIndexDisabledState },
      sheetMode: sheetModeModule,
      csvService: csvServiceModule,
      systemPanels: systemPanelsModule,
      templatePersistence: templatePersistenceModule,
      csharpRuntimeGenerator: csharpRuntimeGeneratorModule,
      ueGenerator: ueGeneratorModule,
      editorActions: { newTemplate, renameTemplate, newInstance, renameInstance, commitInstanceIdChange, copyInstance, pasteInstance, deleteInstance, newParam, updateParamAtIndex, convertValueForType, deleteParam, getDefaultValueForType, getDefaultValueForElementType, convertValueToList, coerceListElementValue, isListElementValueValid, validateListValueAgainstType, collectListTypeViolations },
      panels: panelsModule,
      interaction: interactionModule,
    },
  };

window.AppModules = window.LegacyApp ? window.LegacyApp.modules : null;
window.AppState = window.LegacyApp ? window.LegacyApp.state : null;
})();
