(() => {
  // src/core/form-and-reference.js
  var NUMERIC_NAME_PATTERN = /^\d+$/;
  var UE_NAME_PATTERN = /^[A-Za-z0-9_]+$/;
  function isPureNumericName(name) {
    return NUMERIC_NAME_PATTERN.test(String(name || "").trim());
  }
  function isUENameCompliant(name) {
    if (name == null) return false;
    return UE_NAME_PATTERN.test(String(name).trim());
  }
  function isTemplateNameInvalid(name, { isUEMode = false } = {}) {
    if (isPureNumericName(name)) return true;
    if (isUEMode && !isUENameCompliant(name)) return true;
    return false;
  }
  function isEnumValueInvalid(value, { isUEMode = false } = {}) {
    if (isPureNumericName(value)) return true;
    if (isUEMode && !isUENameCompliant(value)) return true;
    return false;
  }
  function getValidListElementType(value, allowedTypes = null) {
    if (!value && value !== 0) return "string";
    const normalized = String(value).trim();
    if (!normalized) return "string";
    if (allowedTypes instanceof Set && allowedTypes.size > 0 && allowedTypes.has(normalized)) {
      return normalized;
    }
    return normalized;
  }
  function ensureParamElementType(param, allowedTypes = null) {
    if (!param) return;
    if (param.type === "list") {
      param.elementType = getValidListElementType(param.elementType, allowedTypes);
    } else if (param.elementType) {
      delete param.elementType;
    }
  }
  function getListElementTypeForParam(param, allowedTypes = null) {
    if (!param || param.type !== "list") return "string";
    return getValidListElementType(param.elementType, allowedTypes);
  }
  function createDefaultReferenceValue(binding) {
    if (!binding) {
      return { template: "", by: "", value: "" };
    }
    return {
      template: binding.template || "",
      by: binding.param || "",
      value: ""
    };
  }
  function normalizeReferenceValue(raw, binding) {
    if (!binding) return raw;
    const template = binding.template || "";
    const by = binding.param || "";
    const source = Array.isArray(raw) ? raw.length > 0 ? raw[0] : null : raw;
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      return {
        template,
        by,
        value: source == null ? "" : String(source)
      };
    }
    return {
      template,
      by,
      value: source.value == null ? "" : String(source.value)
    };
  }
  function normalizeReferenceList(raw, binding) {
    const arrayValue = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
    const normalized = arrayValue.map((item) => normalizeReferenceValue(item, binding));
    return normalized.length > 0 ? normalized : [createDefaultReferenceValue(binding)];
  }
  function unwrapReferencePayload(value, binding, asList) {
    if (!binding) return value;
    if (asList) {
      const normalized2 = normalizeReferenceList(value, binding);
      return normalized2.map((entry) => entry && typeof entry === "object" ? entry.value : "");
    }
    const normalized = normalizeReferenceValue(value, binding);
    if (normalized && typeof normalized === "object") {
      return normalized.value;
    }
    return normalized;
  }
  function wrapReferencePayload(value, binding, asList, elementType = "string", { convertValueToList: convertValueToList2 = null } = {}) {
    if (!binding) return value;
    const template = binding.template || "";
    const by = binding.param || "";
    if (asList) {
      let list = [];
      if (Array.isArray(value) && value.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
        list = value.map((item) => normalizeReferenceValue(item, binding));
      } else {
        const base = typeof convertValueToList2 === "function" ? convertValueToList2(value, elementType) : Array.isArray(value) ? value.slice() : value == null || value === "" ? [] : [value];
        list = base.map((item) => ({
          template,
          by,
          value: item == null ? "" : String(item)
        }));
      }
      if (list.length === 0) {
        list = [createDefaultReferenceValue(binding)];
      }
      return list;
    }
    const normalized = normalizeReferenceValue(value, binding);
    if (normalized && typeof normalized === "object" && !Array.isArray(normalized)) {
      return normalized;
    }
    const wrapped = createDefaultReferenceValue(binding);
    wrapped.value = normalized == null ? "" : String(normalized);
    return wrapped;
  }

  // src/domain/template-normalizer.js
  function ensureTemplateUid(tpl, uidState, prefix = "tpl_") {
    if (!tpl) return null;
    if (!uidState || typeof uidState !== "object") {
      throw new Error("uidState is required");
    }
    if (!Number.isFinite(uidState.counter)) {
      uidState.counter = 0;
    }
    if (!tpl.__uid) {
      uidState.counter += 1;
      tpl.__uid = `${prefix}${uidState.counter}`;
    }
    return tpl.__uid;
  }
  function snapshotTemplateStructure(tpl, { isEnumTemplate: isEnumTemplate2 = () => false } = {}) {
    return {
      name: tpl.name,
      indexField: tpl.indexField || "id",
      parameters: (tpl.parameters || []).map((param) => {
        if (!param) return null;
        return {
          name: param.name,
          type: param.type,
          parameterIndexes: param.parameterIndexes ? {
            template: param.parameterIndexes.template || "",
            param: param.parameterIndexes.param || "",
            indexField: param.parameterIndexes.indexField || ""
          } : null
        };
      }),
      isEnum: Boolean(isEnumTemplate2(tpl))
    };
  }
  function structuresEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  function hasTemplateStructureChanged(tpl, {
    lastSavedStructureSnapshot = /* @__PURE__ */ new Map(),
    ensureTemplateUid: ensureTemplateUidFn = ensureTemplateUid,
    snapshotTemplateStructure: snapshotTemplateStructureFn = snapshotTemplateStructure
  } = {}) {
    ensureTemplateUidFn(tpl);
    const prev = lastSavedStructureSnapshot.get(tpl.__uid);
    if (!prev) return true;
    const current = snapshotTemplateStructureFn(tpl);
    return !structuresEqual(prev, current);
  }
  function captureCurrentStructureSnapshot(templates, {
    ensureTemplateUid: ensureTemplateUidFn = ensureTemplateUid,
    snapshotTemplateStructure: snapshotTemplateStructureFn = snapshotTemplateStructure
  } = {}) {
    const snapshot = /* @__PURE__ */ new Map();
    const templateList = Array.isArray(templates) ? templates : [];
    templateList.forEach((tpl) => {
      ensureTemplateUidFn(tpl);
      snapshot.set(tpl.__uid, snapshotTemplateStructureFn(tpl));
    });
    return snapshot;
  }
  function normalizeContent(content) {
    return (content || "").replace(/\r\n/g, "\n").trimEnd();
  }
  function normalizeParamIndexStructure(param) {
    if (!param || typeof param !== "object") return;
    if (param.index && !param.parameterIndexes) {
      const legacy = param.index;
      if (legacy && typeof legacy === "object") {
        param.parameterIndexes = {
          template: legacy.template || "",
          param: legacy.param || "",
          indexField: legacy.indexField || ""
        };
      } else {
        param.parameterIndexes = { template: "", param: "", indexField: "" };
      }
      delete param.index;
    } else if (param.index) {
      delete param.index;
    }
    if (param.parameterIndexes && typeof param.parameterIndexes === "object") {
      if (!Object.prototype.hasOwnProperty.call(param.parameterIndexes, "indexField")) {
        param.parameterIndexes.indexField = "";
      }
      if (!Object.prototype.hasOwnProperty.call(param.parameterIndexes, "template")) {
        param.parameterIndexes.template = "";
      }
      if (!Object.prototype.hasOwnProperty.call(param.parameterIndexes, "param")) {
        param.parameterIndexes.param = "";
      }
    }
  }
  function normalizeTemplateParameterIndexes(template, { ensureParamElementType: ensureParamElementTypeFn = null } = {}) {
    if (!template || !Array.isArray(template.parameters)) return;
    template.parameters.forEach((param) => {
      normalizeParamIndexStructure(param);
      if (typeof ensureParamElementTypeFn === "function") {
        ensureParamElementTypeFn(param);
      }
    });
  }
  function populateMissingIndexFields(templatesList) {
    if (!Array.isArray(templatesList)) return;
    templatesList.forEach((tpl) => {
      if (!tpl || !Array.isArray(tpl.parameters)) return;
      tpl.parameters.forEach((param) => {
        if (!param || !param.parameterIndexes || typeof param.parameterIndexes !== "object") return;
        if (!param.parameterIndexes.indexField) {
          const target = templatesList.find((item) => item && item.name === param.parameterIndexes.template);
          if (target) {
            param.parameterIndexes.indexField = target.indexField || "id";
          }
        }
      });
    });
  }

  // src/domain/index-enum-validation.js
  var DEFAULT_RESERVED_INDEX_FIELDS = /* @__PURE__ */ new Set(["template", "id", "name", "index"]);
  var DEFAULT_INDEXABLE_PARAM_TYPES = /* @__PURE__ */ new Set(["int", "long", "float", "string"]);
  function findTemplateByName(templates, name) {
    if (!name) return null;
    const templateList = Array.isArray(templates) ? templates : [];
    return templateList.find((tpl) => tpl && tpl.name === name) || null;
  }
  function doesTemplateHaveField(tpl, fieldName, reservedIndexFields = DEFAULT_RESERVED_INDEX_FIELDS) {
    if (!tpl || !fieldName) return false;
    if (reservedIndexFields.has(fieldName)) return true;
    const params = Array.isArray(tpl.parameters) ? tpl.parameters : [];
    return params.some((param) => param && param.name === fieldName);
  }
  function getInstanceFieldValue(inst, fieldName, fallbackTemplateName = "") {
    if (!inst || !fieldName) return "";
    const payload = inst.payload || {};
    switch (fieldName) {
      case "id":
        return inst.id != null ? inst.id : payload.id;
      case "name":
        return inst.name != null ? inst.name : payload.name;
      case "template":
        return payload.template != null ? payload.template : fallbackTemplateName;
      case "index":
        return payload.index != null ? payload.index : "";
      default:
        return payload[fieldName];
    }
  }
  function doesTemplateContainValue(tpl, fieldName, value, { getInstanceFieldValue: getInstanceFieldValueFn = getInstanceFieldValue } = {}) {
    if (!tpl || !fieldName) return false;
    const normalized = value == null ? "" : String(value).trim();
    if (normalized === "") return false;
    const instList = Array.isArray(tpl.instances) ? tpl.instances : [];
    for (const instance of instList) {
      if (!instance) continue;
      const candidate = getInstanceFieldValueFn(instance, fieldName, tpl.name);
      if (candidate == null) continue;
      if (String(candidate).trim() === normalized) {
        return true;
      }
    }
    return false;
  }
  function isEnumTemplate(tpl) {
    return tpl && tpl.name === "enum";
  }
  function evaluateInstanceIndexValidation(tpl, inst, {
    templates = [],
    reservedIndexFields = DEFAULT_RESERVED_INDEX_FIELDS,
    indexableParamTypes = DEFAULT_INDEXABLE_PARAM_TYPES,
    isEnumTemplate: isEnumTemplateFn = isEnumTemplate
  } = {}) {
    const invalidParams = /* @__PURE__ */ new Map();
    if (!tpl || !inst) {
      return { invalidParams, hasInvalid: false };
    }
    const params = Array.isArray(tpl.parameters) ? tpl.parameters : [];
    params.forEach((param) => {
      if (!param || !param.parameterIndexes) return;
      const binding = inst.payload ? inst.payload[param.name] : void 0;
      const targetTplName = (param.parameterIndexes.template || "").trim();
      const targetParamName = (param.parameterIndexes.param || "").trim();
      const targetTpl = findTemplateByName(templates, targetTplName);
      let reason = "";
      if (!targetTplName) {
        reason = "索引模板未设置";
      } else if (!targetTpl) {
        reason = `索引模板“${targetTplName}”不存在`;
      } else if (isEnumTemplateFn(targetTpl)) {
        reason = "索引目标不能是 enum 模板";
      } else if (!targetParamName) {
        reason = "索引字段未设置";
      } else if (!doesTemplateHaveField(targetTpl, targetParamName, reservedIndexFields)) {
        reason = `模板“${targetTplName}”不存在字段“${targetParamName}”`;
      } else if (!reservedIndexFields.has(targetParamName)) {
        const targetParamDef = Array.isArray(targetTpl.parameters) ? targetTpl.parameters.find((item) => item && item.name === targetParamName) : null;
        if (targetParamDef && !indexableParamTypes.has(targetParamDef.type)) {
          reason = `字段“${targetParamName}”类型不支持索引`;
        }
      }
      if (!reason) {
        let rawValue;
        if (binding == null) {
          reason = "索引值缺失";
        } else if (typeof binding === "object") {
          rawValue = binding.value;
        } else if (typeof binding === "string" || typeof binding === "number" || typeof binding === "boolean") {
          rawValue = binding;
        } else {
          reason = "索引值缺失";
        }
        if (!reason) {
          const normalizedValue = rawValue == null ? "" : String(rawValue).trim();
          if (normalizedValue === "") {
            reason = "索引值为空";
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
  function collectInstanceIndexInvalidReasons(tpl, options = {}) {
    const invalidMap = /* @__PURE__ */ new Map();
    if (!tpl || !Array.isArray(tpl.instances)) {
      return invalidMap;
    }
    tpl.instances.forEach((inst, idx) => {
      const validation = evaluateInstanceIndexValidation(tpl, inst, options);
      if (validation.hasInvalid) {
        invalidMap.set(idx, validation);
      }
    });
    return invalidMap;
  }
  function doesTemplateHaveInvalidIndexReferences(tpl, options = {}) {
    if (!tpl || !Array.isArray(tpl.instances)) {
      return false;
    }
    return tpl.instances.some((inst) => evaluateInstanceIndexValidation(tpl, inst, options).hasInvalid);
  }
  function resolveIndexFieldMeta(tpl, indexableParamTypes = DEFAULT_INDEXABLE_PARAM_TYPES) {
    let field = tpl && tpl.indexField ? tpl.indexField : "id";
    if (field === "id") {
      return { field: "id", type: "int" };
    }
    if (field === "name") {
      return { field: "name", type: "string" };
    }
    const param = (tpl.parameters || []).find((item) => item && item.name === field);
    if (param && indexableParamTypes.has(param.type)) {
      return { field, type: param.type };
    }
    return { field: "id", type: "int" };
  }
  function formatIndexCell(field, type, value) {
    const safeField = field || "id";
    const safeType = type || (safeField === "name" ? "string" : "int");
    const safeValue = value == null ? "" : String(value);
    return `${safeField}/${safeType}/${safeValue}`;
  }
  function parseIndexTypeCell(cell) {
    const raw = String(cell ?? "").trim();
    if (!raw) {
      return { field: "id", type: "int" };
    }
    const parts = raw.split("/");
    const field = (parts[0] || "").trim() || "id";
    const type = (parts[1] || "").trim() || (field === "name" ? "string" : "int");
    return { field, type };
  }
  function parseIndexDataCell(cell, fallbackField, fallbackType) {
    const raw = String(cell ?? "").trim();
    if (!raw) {
      return { field: fallbackField, type: fallbackType, value: "" };
    }
    const parts = raw.split("/");
    const field = (parts[0] || "").trim() || fallbackField;
    const type = (parts[1] || "").trim() || fallbackType;
    const value = parts.length >= 3 ? parts.slice(2).join("/") : "";
    return { field, type, value };
  }
  function computeExpectedIndexValue(tpl, inst, fieldName) {
    if (!inst || !inst.payload) return "";
    if (fieldName === "id") {
      return String(inst.id ?? "");
    }
    if (fieldName === "name") {
      return inst.name != null ? String(inst.name) : "";
    }
    const value = inst.payload[fieldName];
    return value == null ? "" : String(value);
  }
  function enforceEnumIndexField(tpl, { isEnumTemplate: isEnumTemplateFn = isEnumTemplate } = {}) {
    if (!tpl || !isEnumTemplateFn(tpl)) return false;
    let changed = false;
    if (tpl.indexField !== "id") {
      tpl.indexField = "id";
      changed = true;
    }
    const instList = Array.isArray(tpl.instances) ? tpl.instances : [];
    instList.forEach((inst) => {
      const expected = computeExpectedIndexValue(tpl, inst, "id");
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
      return { duplicates: /* @__PURE__ */ new Map(), byIndex: /* @__PURE__ */ new Map() };
    }
    const instList = Array.isArray(tpl.instances) ? tpl.instances : [];
    const buckets = /* @__PURE__ */ new Map();
    instList.forEach((inst, idx) => {
      const raw = inst && inst.id != null ? String(inst.id) : "";
      const trimmed = raw.trim();
      let key = trimmed;
      if (trimmed !== "") {
        const numericValue = Number(trimmed);
        if (Number.isFinite(numericValue)) {
          key = String(Math.trunc(numericValue));
        }
      }
      if (!buckets.has(key)) {
        buckets.set(key, []);
      }
      buckets.get(key).push({ idx, inst, value: key });
    });
    const duplicates = /* @__PURE__ */ new Map();
    const byIndex = /* @__PURE__ */ new Map();
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
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string" && raw.trim() !== "") {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
    return Number.NaN;
  }
  function collectDuplicateIndexInfo(tpl) {
    if (!tpl) {
      return { field: "id", duplicates: /* @__PURE__ */ new Map(), byIndex: /* @__PURE__ */ new Map() };
    }
    const field = tpl.indexField || "id";
    const instList = Array.isArray(tpl.instances) ? tpl.instances : [];
    const buckets = /* @__PURE__ */ new Map();
    instList.forEach((inst, idx) => {
      const rawValue = computeExpectedIndexValue(tpl, inst, field);
      const key = rawValue == null ? "" : String(rawValue);
      if (!buckets.has(key)) {
        buckets.set(key, []);
      }
      buckets.get(key).push({
        idx,
        inst,
        id: getNumericInstanceId(inst),
        value: key
      });
    });
    const duplicates = /* @__PURE__ */ new Map();
    const byIndex = /* @__PURE__ */ new Map();
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
      return others.slice().sort((left, right) => left.idx - right.idx)[0];
    }
    const currentId = currentEntry.id;
    const greater = others.filter((entry) => Number.isFinite(entry.id) && Number.isFinite(currentId) && entry.id > currentId).sort((left, right) => left.id - right.id);
    if (greater.length > 0) {
      return greater[0];
    }
    const smaller = others.filter((entry) => Number.isFinite(entry.id) && Number.isFinite(currentId) && entry.id < currentId).sort((left, right) => left.id - right.id);
    if (smaller.length > 0) {
      return smaller[0];
    }
    return others.slice().sort((left, right) => left.idx - right.idx)[0];
  }
  function ensureEnumParamNaming() {
    return;
  }
  function getEnumParamKeysForInstance(tpl, inst) {
    if (!tpl || !inst || !inst.payload) return [];
    const reserved = /* @__PURE__ */ new Set(["template", "id", "name", "index"]);
    return Object.keys(inst.payload).filter((key) => !reserved.has(key) && /^\d+$/.test(key)).map((key) => parseInt(key, 10)).sort((left, right) => left - right).map((value) => String(value));
  }
  function getEnumTemplate(templates) {
    return findTemplateByName(templates, "enum");
  }
  function sanitizeCSharpTypeName(name, fallback) {
    const base = (name || "").split(/[^A-Za-z0-9]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
    let result = base || fallback || "EnumType";
    result = result.replace(/[^A-Za-z0-9_]/g, "_");
    if (/^[0-9]/.test(result)) {
      result = `_${result}`;
    }
    return result || "EnumType";
  }
  function sanitizeCSharpMemberName(name, fallback) {
    let result = (name == null ? "" : String(name)).trim();
    if (!result) {
      result = fallback || "Member";
    }
    result = result.replace(/[\s]+/g, "_");
    result = result.replace(/[^\p{L}\p{Nd}_]/gu, "_");
    if (!result) {
      result = fallback || "Member";
    }
    if (/^[\p{Nd}]/u.test(result)) {
      result = `_${result}`;
    }
    return result || "Member";
  }
  function getEnumDefinitions(templates) {
    const enumTpl = getEnumTemplate(templates);
    if (!enumTpl || !Array.isArray(enumTpl.instances)) return [];
    const definitions = [];
    const usedTypeNames = /* @__PURE__ */ new Set();
    enumTpl.instances.forEach((inst, idx) => {
      if (!inst) return;
      const displayName = inst.name && inst.name.trim() ? inst.name.trim() : `Enum${inst.id ?? idx}`;
      const fallbackName = `Enum${inst.id ?? idx}`;
      const baseName = sanitizeCSharpTypeName(displayName || fallbackName, fallbackName);
      let csharpName = baseName;
      let suffix = 1;
      while (usedTypeNames.has(csharpName)) {
        csharpName = `${baseName}_${suffix++}`;
      }
      usedTypeNames.add(csharpName);
      const payload = inst.payload || {};
      const seen = /* @__PURE__ */ new Set();
      const values = [];
      Object.keys(payload).filter((key) => /^\d+$/.test(key)).map((key) => parseInt(key, 10)).sort((left, right) => left - right).map((value) => String(value)).forEach((key) => {
        const raw = payload[key];
        if (raw === void 0 || raw === null) return;
        const value = String(raw).trim();
        if (!value || seen.has(value)) return;
        seen.add(value);
        values.push(value);
      });
      definitions.push({
        name: displayName,
        csharpName,
        values
      });
    });
    return definitions;
  }
  function getEnumDefinition(templates, type) {
    if (!type) return null;
    const definitions = getEnumDefinitions(templates);
    return definitions.find((definition) => definition.name === type) || null;
  }
  function isEnumType(templates, type) {
    return Boolean(getEnumDefinition(templates, type));
  }
  function getEnumValues(templates, type) {
    const definition = getEnumDefinition(templates, type);
    return definition ? definition.values.slice() : null;
  }
  function getEnumCSharpTypeName(templates, type) {
    const definition = getEnumDefinition(templates, type);
    return definition ? definition.csharpName : type;
  }
  function buildListElementTypeCollections({
    builtinOptions = [],
    enumDefs = [],
    missingTypes = /* @__PURE__ */ new Set(),
    usedElementTypes = /* @__PURE__ */ new Set()
  } = {}) {
    const nextOptions = [];
    const valueSet = /* @__PURE__ */ new Set();
    const appendOption = (value, label) => {
      if (!value && value !== 0) return;
      const normalized = String(value).trim();
      if (!normalized || normalized === "list" || valueSet.has(normalized)) return;
      valueSet.add(normalized);
      nextOptions.push({ value: normalized, label });
    };
    builtinOptions.forEach((option) => {
      if (option.value === "list") return;
      appendOption(option.value, option.label);
    });
    if (Array.isArray(enumDefs)) {
      enumDefs.forEach((definition) => appendOption(definition.name, definition.name));
    }
    if (missingTypes instanceof Set && missingTypes.size > 0) {
      Array.from(missingTypes).sort().forEach((typeName) => appendOption(typeName, `${typeName} (缺失)`));
    }
    if (usedElementTypes instanceof Set && usedElementTypes.size > 0) {
      Array.from(usedElementTypes).sort().forEach((typeName) => {
        if (!valueSet.has(typeName)) {
          appendOption(typeName, `${typeName} (存在数据)`);
        }
      });
    }
    if (nextOptions.length === 0) {
      nextOptions.push({ value: "string", label: "字符串" });
      valueSet.add("string");
    }
    return { options: nextOptions, valueSet };
  }

  // src/domain/editor-actions.js
  function getDefaultValueForElementType(elementType, { isEnumType: isEnumType2 = () => false, getEnumValues: getEnumValues2 = () => null } = {}) {
    if (isEnumType2(elementType)) {
      const enums = getEnumValues2(elementType);
      return enums && enums.length > 0 ? enums[0] : "";
    }
    switch (elementType) {
      case "int":
      case "long":
        return 0;
      case "float":
        return 0;
      case "bool":
        return false;
      case "object":
        return {};
      case "string":
      default:
        return "";
    }
  }
  function getDefaultValueForType(type, elementType = "string", {
    isEnumType: isEnumType2 = () => false,
    getEnumValues: getEnumValues2 = () => null,
    getDefaultValueForElementType: getDefaultValueForElementTypeFn = getDefaultValueForElementType
  } = {}) {
    if (isEnumType2(type)) {
      const enums = getEnumValues2(type);
      return enums && enums.length > 0 ? enums[0] : "";
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
        return [getDefaultValueForElementTypeFn(elementType)];
      case "object":
        return {};
      default:
        return null;
    }
  }
  function coerceListElementValue(value, elementType, { isEnumType: isEnumType2 = () => false, getEnumValues: getEnumValues2 = () => null } = {}) {
    if (value === null || value === void 0) {
      return "";
    }
    if (elementType === "string") {
      return String(value);
    }
    if (elementType === "bool") {
      if (typeof value === "boolean") return value;
      const normalized = String(value).trim().toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
      return value;
    }
    if (elementType === "float") {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : value;
    }
    if (elementType === "int" || elementType === "long") {
      if (typeof value === "number" && Number.isInteger(value)) return value;
      const normalized = String(value).trim();
      if (/^-?\d+$/.test(normalized)) {
        const parsed = parseInt(normalized, 10);
        if (Number.isFinite(parsed)) return parsed;
      }
      return value;
    }
    if (elementType === "object") {
      if (value && typeof value === "object" && !Array.isArray(value)) return value;
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed;
        }
      } catch (_error) {
        return value;
      }
      return value;
    }
    if (isEnumType2(elementType)) {
      const enums = getEnumValues2(elementType) || [];
      const normalized = String(value);
      if (enums.includes(normalized)) return normalized;
      return enums.length > 0 ? enums[0] : normalized;
    }
    return value;
  }
  function convertValueToList(value, elementType, { coerceListElementValue: coerceListElementValueFn = coerceListElementValue } = {}) {
    let listValue;
    if (Array.isArray(value)) {
      listValue = value.slice();
    } else if (value == null || value === "") {
      listValue = [];
    } else if (typeof value === "string") {
      listValue = value.split(/\s*,\s*/);
    } else {
      listValue = [value];
    }
    return listValue.map((item) => coerceListElementValueFn(item, elementType));
  }
  function convertValueForType(value, type, elementType = "string", {
    isEnumType: isEnumType2 = () => false,
    getEnumValues: getEnumValues2 = () => null,
    getDefaultValueForType: getDefaultValueForTypeFn = getDefaultValueForType,
    convertValueToList: convertValueToListFn = convertValueToList
  } = {}) {
    if (isEnumType2(type)) {
      const enums = getEnumValues2(type);
      const normalized = value == null ? "" : String(value);
      if (enums && enums.includes(normalized)) return normalized;
      return enums && enums.length > 0 ? enums[0] : "";
    }
    if (value === void 0 || value === null) return getDefaultValueForTypeFn(type, elementType);
    switch (type) {
      case "string":
        return String(value);
      case "int":
        return parseInt(value, 10) || 0;
      case "long":
        return parseInt(value, 10) || 0;
      case "float":
        return parseFloat(value) || 0;
      case "bool":
        return Boolean(value);
      case "list":
        return convertValueToListFn(value, elementType);
      case "object":
        try {
          return typeof value === "object" ? value : JSON.parse(value);
        } catch (_error) {
          return {};
        }
      default:
        return value;
    }
  }
  function isListElementValueValid(value, elementType, { isEnumType: isEnumType2 = () => false, getEnumValues: getEnumValues2 = () => null } = {}) {
    if (value === null || value === void 0) return { valid: false, reason: "值为空" };
    if (isEnumType2(elementType)) {
      const enums = getEnumValues2(elementType) || [];
      const normalized = String(value);
      return { valid: enums.includes(normalized), reason: "必须为枚举" };
    }
    if (elementType === "string") {
      return { valid: typeof value === "string", reason: "必须为字符串" };
    }
    if (elementType === "bool") {
      return { valid: typeof value === "boolean", reason: "必须为布尔值" };
    }
    if (elementType === "float") {
      return { valid: typeof value === "number" && Number.isFinite(value), reason: "必须为数字" };
    }
    if (elementType === "int" || elementType === "long") {
      return { valid: typeof value === "number" && Number.isInteger(value), reason: "必须为整数" };
    }
    if (elementType === "object") {
      const ok = value && typeof value === "object" && !Array.isArray(value);
      return { valid: ok, reason: "必须为对象" };
    }
    return { valid: true, reason: "" };
  }
  function validateListValueAgainstType(value, elementType, param, {
    normalizeReferenceList: normalizeReferenceList2 = (currentValue) => currentValue,
    coerceListElementValue: coerceListElementValueFn = coerceListElementValue,
    isListElementValueValid: isListElementValueValidFn = isListElementValueValid
  } = {}) {
    if (!Array.isArray(value)) {
      return { valid: false, errors: [{ index: -1, reason: "值不是列表" }] };
    }
    const errors = [];
    if (param && param.parameterIndexes) {
      const normalized = normalizeReferenceList2(value, param.parameterIndexes);
      normalized.forEach((entry, idx) => {
        const raw = entry && typeof entry === "object" ? entry.value : entry;
        const converted = coerceListElementValueFn(raw, elementType);
        const validation = isListElementValueValidFn(converted, elementType);
        if (!validation.valid) {
          errors.push({ index: idx, reason: validation.reason });
        }
      });
      return { valid: errors.length === 0, errors };
    }
    value.forEach((item, idx) => {
      const validation = isListElementValueValidFn(item, elementType);
      if (!validation.valid) {
        errors.push({ index: idx, reason: validation.reason });
      }
    });
    return { valid: errors.length === 0, errors };
  }
  function collectListTypeViolations(tpl, {
    getListElementTypeForParam: getListElementTypeForParam2 = () => "string",
    validateListValueAgainstType: validateListValueAgainstTypeFn = validateListValueAgainstType
  } = {}) {
    const invalidInstances = /* @__PURE__ */ new Map();
    const invalidParams = /* @__PURE__ */ new Map();
    if (!tpl || !Array.isArray(tpl.parameters) || !Array.isArray(tpl.instances)) {
      return { invalidInstances, invalidParams };
    }
    tpl.parameters.forEach((param) => {
      if (!param || param.type !== "list") return;
      const elementType = getListElementTypeForParam2(param);
      const invalidForParam = /* @__PURE__ */ new Map();
      tpl.instances.forEach((inst, idx) => {
        if (!inst || !inst.payload) return;
        const currentValue = inst.payload[param.name];
        const validation = validateListValueAgainstTypeFn(currentValue, elementType, param);
        if (!validation.valid) {
          invalidForParam.set(idx, validation.errors);
          const list = invalidInstances.get(idx) || [];
          list.push({ paramName: param.name, elementType, errors: validation.errors });
          invalidInstances.set(idx, list);
        }
      });
      if (invalidForParam.size > 0) {
        invalidParams.set(param.name, { elementType, invalidInstances: invalidForParam });
      }
    });
    return { invalidInstances, invalidParams };
  }

  // src/core/app-mode.js
  function ensureContext(context) {
    if (!context || typeof context !== "object") {
      throw new Error("createAppModeModule requires a context object");
    }
    if (!context.appState || typeof context.appState !== "object") {
      throw new Error("createAppModeModule requires appState");
    }
  }
  function createAppModeModule(context) {
    ensureContext(context);
    const {
      appState,
      updateEngineModeUIState = () => {
      },
      refreshTemplates = () => {
      }
    } = context;
    function isUnityMode() {
      return appState.currentEngineMode === appState.ENGINE_MODES.UNITY;
    }
    function isGodotMode() {
      return appState.currentEngineMode === appState.ENGINE_MODES.GODOT;
    }
    function isCSharpMode() {
      return isUnityMode() || isGodotMode();
    }
    function isUEMode() {
      return appState.currentEngineMode === appState.ENGINE_MODES.UE;
    }
    function getCurrentEngineLabel() {
      return appState.ENGINE_LABELS[appState.currentEngineMode] || "";
    }
    function setEngineMode(newMode) {
      if (!Object.values(appState.ENGINE_MODES).includes(newMode)) return;
      if (newMode === appState.currentEngineMode) return;
      appState.currentEngineMode = newMode;
      if (appState.engineModeNeedsConfirmation) {
        appState.engineModeNeedsConfirmation[newMode] = true;
      }
      updateEngineModeUIState();
      refreshTemplates();
    }
    function toggleEngineMode() {
      const orderedModes = [
        appState.ENGINE_MODES.UNITY,
        appState.ENGINE_MODES.GODOT,
        appState.ENGINE_MODES.UE
      ].filter(Boolean);
      const currentIndex = orderedModes.indexOf(appState.currentEngineMode);
      const nextMode = orderedModes[(currentIndex + 1) % orderedModes.length];
      setEngineMode(nextMode);
    }
    function isSheetModeActive() {
      return appState.currentEditMode === appState.EDIT_MODES.SHEET;
    }
    function normalizeSheetSelection() {
      const templates = Array.isArray(appState.templates) ? appState.templates : [];
      if (!templates.length) {
        appState.sheetActiveTemplateIndex = -1;
        appState.sheetActiveInstanceIndex = -1;
        return;
      }
      if (appState.sheetActiveTemplateIndex < 0 || appState.sheetActiveTemplateIndex >= templates.length) {
        appState.sheetActiveTemplateIndex = appState.currentTemplateIndex >= 0 ? appState.currentTemplateIndex : 0;
        if (appState.sheetActiveTemplateIndex >= templates.length) {
          appState.sheetActiveTemplateIndex = templates.length - 1;
        }
      }
      const tpl = templates[appState.sheetActiveTemplateIndex];
      const instList = Array.isArray(tpl?.instances) ? tpl.instances : [];
      if (instList.length === 0) {
        appState.sheetActiveInstanceIndex = -1;
        return;
      }
      if (appState.sheetActiveInstanceIndex < 0 || appState.sheetActiveInstanceIndex >= instList.length) {
        if (appState.currentInstanceIndex >= 0 && appState.currentInstanceIndex < instList.length) {
          appState.sheetActiveInstanceIndex = appState.currentInstanceIndex;
        } else {
          appState.sheetActiveInstanceIndex = 0;
        }
      }
    }
    return {
      isUnityMode,
      isGodotMode,
      isCSharpMode,
      isUEMode,
      getCurrentEngineLabel,
      updateEngineModeUIState,
      setEngineMode,
      toggleEngineMode,
      isSheetModeActive,
      normalizeSheetSelection
    };
  }

  // src/services/workspace-storage.js
  var DB_NAME = "json-editor";
  var DB_STORE = "handles";
  var ENUM_CACHE_PREFIX = "enumCache:";
  var IGNORED_FILE_SUFFIXES = [".meta"];
  var IGNORED_FILE_NAMES = [".ds_store", "thumbs.db"];
  function ensureContext2(context) {
    if (!context || typeof context !== "object") {
      throw new Error("createWorkspaceStorageModule requires a context object");
    }
    if (!context.appState || typeof context.appState !== "object") {
      throw new Error("createWorkspaceStorageModule requires appState");
    }
  }
  function createWorkspaceStorageModule(context) {
    ensureContext2(context);
    const {
      appState,
      setCurrentDirectoryLabel = () => {
      },
      updateEngineModeUIState = () => {
      },
      setEngineMode = () => {
      },
      getCurrentEngineLabel = () => "",
      isUnityMode = () => true,
      isGodotMode = () => false,
      showMessage = () => {
      },
      loadAllTemplates = async () => {
      },
      refreshTemplates = () => {
      },
      updateIndexTemplateOptions = () => {
      },
      generateRuntimeLoaderArtifacts = async () => {
      },
      ensureModelStruct = async () => {
      }
    } = context;
    const isCSharpMode = () => isUnityMode() || isGodotMode();
    const SCRIPT_OUTPUT_ROOT_CANDIDATES = ["scripts", "Script"];
    const DEFAULT_SCRIPT_OUTPUT_ROOT = "scripts";
    async function getDirectoryHandleIfExists(parentHandle, name) {
      if (!parentHandle || !name) return null;
      try {
        return await parentHandle.getDirectoryHandle(name, { create: false });
      } catch (err) {
        if (err && (err.name === "NotFoundError" || err.name === "TypeMismatchError")) {
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
          create: true
        });
      } catch (err) {
        if (!err || err.name !== "TypeMismatchError") {
          throw err;
        }
      }
      try {
        return await appState.directoryHandle.getDirectoryHandle("Script", {
          create: true
        });
      } catch (err) {
        if (!err || err.name !== "TypeMismatchError") {
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
          { create }
        );
      } catch (err) {
        if (!create && err && err.name === "NotFoundError") {
          appState.configDirHandle = null;
          return null;
        }
        if (create) {
          console.warn("无法创建配置目录", err);
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
          engineMode: appState.currentEngineMode
        };
        await writeTextFile(dir, appState.CONFIG_FILE_NAME, JSON.stringify(payload, null, 2));
      } catch (err) {
        console.warn("保存编辑器配置失败", err);
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
        console.warn("读取编辑器配置失败", err);
      }
      if (appState.currentEngineMode !== appState.ENGINE_MODES.UNITY) {
        setEngineMode(appState.ENGINE_MODES.UNITY);
      } else {
        updateEngineModeUIState();
      }
    }
    async function ensureEngineGenerationConsent(actionLabel = "生成操作") {
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
            db.createObjectStore(DB_STORE, { keyPath: "key" });
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
          const tx = db.transaction(DB_STORE, "readwrite");
          tx.objectStore(DB_STORE).put({ key: "workdir", handle });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch (err) {
        console.warn("保存目录句柄失败", err);
      }
    }
    async function getLastDirectoryHandle() {
      try {
        const db = await openDB();
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(DB_STORE, "readonly");
          const req = tx.objectStore(DB_STORE).get("workdir");
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
            indexField: tpl.indexField || "id"
          })
        );
        await new Promise((resolve, reject) => {
          const tx = db.transaction(DB_STORE, "readwrite");
          tx.objectStore(DB_STORE).put({ key, template: payload });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch (err) {
        console.warn("保存枚举模板缓存失败", err);
      }
    }
    async function loadEnumTemplateCache() {
      const key = getEnumCacheKey();
      if (!key) return null;
      try {
        const db = await openDB();
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(DB_STORE, "readonly");
          const req = tx.objectStore(DB_STORE).get(key);
          req.onsuccess = () => {
            const value = req.result && req.result.template;
            resolve(value ? JSON.parse(JSON.stringify(value)) : null);
          };
          req.onerror = () => reject(req.error);
        });
      } catch (err) {
        console.warn("读取枚举模板缓存失败", err);
        return null;
      }
    }
    async function clearEnumTemplateCache() {
      const key = getEnumCacheKey();
      if (!key) return;
      try {
        const db = await openDB();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(DB_STORE, "readwrite");
          tx.objectStore(DB_STORE).delete(key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch (err) {
        console.warn("清除枚举模板缓存失败", err);
      }
    }
    async function verifyPermission(handle, readWrite = false) {
      if (!handle) return false;
      const opts = { mode: readWrite ? "readwrite" : "read" };
      try {
        if (handle.queryPermission) {
          const permission = await handle.queryPermission(opts);
          if (permission === "granted") return true;
          if (permission === "prompt" && handle.requestPermission) {
            const result = await handle.requestPermission(opts);
            return result === "granted";
          }
          return false;
        }
      } catch (_err) {
      }
      return true;
    }
    async function initializeWorkspaceFromHandle(handle, successMessage = "") {
      if (!handle) return;
      appState.directoryHandle = handle;
      appState.configDirHandle = null;
      setCurrentDirectoryLabel(handle.name || "");
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
    }
    async function autoRestoreLastDirectory() {
      try {
        const handle = await getLastDirectoryHandle();
        if (!handle) return;
        if (navigator.storage && navigator.storage.persist) {
          try {
            await navigator.storage.persist();
          } catch (_err) {
          }
        }
        const ok = await verifyPermission(handle, true);
        if (!ok) return;
        await initializeWorkspaceFromHandle(handle, "已自动恢复上次工作目录");
      } catch (err) {
        console.warn("自动恢复目录失败", err);
      }
    }
    async function chooseDirectory() {
      try {
        const handle = await window.showDirectoryPicker();
        if (navigator.storage && navigator.storage.persist) {
          try {
            await navigator.storage.persist();
          } catch (_err) {
          }
        }
        await initializeWorkspaceFromHandle(handle, "工作目录已选择并加载完成");
        await saveLastDirectoryHandle(handle);
      } catch (err) {
        console.error(err);
        showMessage("选择工作目录失败");
      }
    }
    function shouldIgnoreFileEntry(entryName) {
      if (!entryName) return false;
      const lower = entryName.toLowerCase();
      if (IGNORED_FILE_NAMES.includes(lower)) return true;
      return IGNORED_FILE_SUFFIXES.some((suffix) => lower.endsWith(suffix));
    }
    async function removeDirectoryIfExists(parentHandle, name) {
      if (!parentHandle || typeof parentHandle.removeEntry !== "function" || !name) return false;
      try {
        await parentHandle.removeEntry(name, { recursive: true });
        return true;
      } catch (err) {
        if (err && err.name === "NotFoundError") {
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
        await removeScriptOutputDirectoryIfExists("godotCsharpDate");
        await removeDirectoryIfExists(appState.directoryHandle, "godotCsharpDate");
        await removeDirectoryIfExists(appState.directoryHandle, "cppmodel");
        appState.cppModelHandle = null;
        appState.cppEnumHandle = null;
        return;
      }
      if (isGodotMode()) {
        await removeScriptOutputDirectoryIfExists("csharpDate");
        await removeDirectoryIfExists(appState.directoryHandle, "csharpDate");
        await removeDirectoryIfExists(appState.directoryHandle, "cppmodel");
        appState.csharpHandle = null;
        appState.cppModelHandle = null;
        appState.cppEnumHandle = null;
        appState.editorHandle = null;
        appState.modelStructHandle = null;
        return;
      }
      await removeScriptOutputDirectoryIfExists("csharpDate");
      await removeScriptOutputDirectoryIfExists("godotCsharpDate");
      await removeDirectoryIfExists(appState.directoryHandle, "csharpDate");
      await removeDirectoryIfExists(appState.directoryHandle, "godotCsharpDate");
      appState.csharpHandle = null;
      appState.editorHandle = null;
      appState.modelStructHandle = null;
    }
    async function ensureSubFolders() {
      if (!appState.directoryHandle) return;
      appState.dataEntityHandle = await appState.directoryHandle.getDirectoryHandle("dataEntity", {
        create: true
      });
      try {
        appState.trashHandle = await appState.dataEntityHandle.getDirectoryHandle(
          appState.TRASH_FOLDER_NAME,
          { create: true }
        );
      } catch (err) {
        console.warn("无法创建或访问垃圾箱目录", err);
        appState.trashHandle = null;
      }
      if (isCSharpMode()) {
        const csharpFolderName = isGodotMode() ? "godotCsharpDate" : "csharpDate";
        const scriptOutputRootHandle = await resolveScriptOutputRootHandle({ create: true });
        if (!scriptOutputRootHandle) {
          throw new Error("Unable to access scripts output directory");
        }
        appState.cppModelHandle = null;
        appState.cppEnumHandle = null;
        appState.csharpHandle = await scriptOutputRootHandle.getDirectoryHandle(csharpFolderName, {
          create: true
        });
        appState.modelStructHandle = null;
        if (isUnityMode()) {
          try {
            appState.editorHandle = await appState.csharpHandle.getDirectoryHandle("Editor", {
              create: true
            });
          } catch (err) {
            console.warn("无法创建或访问 Editor 文件夹", err);
            appState.editorHandle = null;
          }
        } else {
          appState.editorHandle = null;
        }
        for await (const entry of appState.csharpHandle.values()) {
          if (entry.kind === "file" && shouldIgnoreFileEntry(entry.name)) {
            continue;
          }
          if (entry.kind === "file" && !entry.name.toLowerCase().endsWith(".cs")) {
            showMessage(`${csharpFolderName} 文件夹内仅允许 .cs 文件：${entry.name}`);
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
        appState.csharpHandle = null;
        appState.editorHandle = null;
        appState.modelStructHandle = null;
        appState.cppModelHandle = await appState.directoryHandle.getDirectoryHandle("cppmodel", {
          create: true
        });
        try {
          appState.cppEnumHandle = await appState.cppModelHandle.getDirectoryHandle("enum", {
            create: true
          });
        } catch (err) {
          console.warn("无法创建或访问 enum 目录", err);
          appState.cppEnumHandle = null;
        }
        for await (const entry of appState.cppModelHandle.values()) {
          if (entry.kind === "directory") continue;
          if (entry.kind === "file" && shouldIgnoreFileEntry(entry.name)) {
            continue;
          }
          if (entry.kind === "file" && !entry.name.toLowerCase().endsWith(".h")) {
            showMessage(`cppmodel 文件夹内仅允许 .h 文件：${entry.name}`);
            throw new Error("Invalid file in cppmodel");
          }
        }
      }
      for await (const entry of appState.dataEntityHandle.values()) {
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
      if (appState.cppEnumHandle) return appState.cppEnumHandle;
      if (!appState.cppModelHandle) return null;
      try {
        appState.cppEnumHandle = await appState.cppModelHandle.getDirectoryHandle("enum", {
          create: true
        });
      } catch (err) {
        console.warn("无法创建或访问 enum 目录", err);
        appState.cppEnumHandle = null;
      }
      return appState.cppEnumHandle;
    }
    async function deleteDataEntityFileIfExists(fileName) {
      if (!appState.dataEntityHandle || typeof appState.dataEntityHandle.removeEntry !== "function") {
        return;
      }
      try {
        await appState.dataEntityHandle.removeEntry(fileName);
      } catch (err) {
        if (err && err.name === "NotFoundError") {
          return;
        }
        console.warn(`删除 ${fileName} 失败`, err);
      }
    }
    async function deleteCSharpFileIfExists(templateName) {
      if (!templateName || !appState.csharpHandle || typeof appState.csharpHandle.removeEntry !== "function") {
        return;
      }
      const fileName = `${templateName}.cs`;
      try {
        await appState.csharpHandle.removeEntry(fileName);
      } catch (err) {
        if (err && err.name === "NotFoundError") {
          return;
        }
        console.warn(`删除 ${fileName} 失败`, err);
      }
    }
    async function moveTemplateJsonToTrash(templateName) {
      if (!templateName || !appState.dataEntityHandle) {
        return { moved: false, reason: "no-data-entity" };
      }
      const handle = appState.trashHandle;
      if (!handle) {
        return { moved: false, reason: "no-trash" };
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
        if (typeof appState.dataEntityHandle.removeEntry === "function") {
          await appState.dataEntityHandle.removeEntry(fileName);
        }
        return { moved: true };
      } catch (err) {
        if (err && err.name === "NotFoundError") {
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
      moveTemplateJsonToTrash
    };
  }

  // src/services/template-persistence.js
  function ensureContext3(context) {
    if (!context || typeof context !== "object") {
      throw new Error("createTemplatePersistenceModule requires a context object");
    }
    if (!context.appState || typeof context.appState !== "object") {
      throw new Error("createTemplatePersistenceModule requires appState");
    }
  }
  function createTemplatePersistenceModule(context) {
    ensureContext3(context);
    const {
      appState,
      isUnityMode = () => true,
      isGodotMode = () => false,
      isSheetModeActive = () => false,
      updateSheetTemplateNav = () => {
      },
      commitActiveSheetEdits = () => ({ ok: true }),
      ensureEngineGenerationConsent = async () => true,
      cleanConflictingEngineArtifacts = async () => {
      },
      ensureSubFolders = async () => {
      },
      ensureModelStruct = async () => {
      },
      ensureTrashDirectory = async () => appState.trashHandle,
      saveEnumTemplateCache = async () => {
      },
      loadEnumTemplateCache = async () => null,
      clearEnumTemplateCache = async () => {
      },
      readTextFileIfExists = async () => null,
      writeTextFile = async () => {
      },
      deleteDataEntityFileIfExists = async () => {
      },
      deleteCSharpFileIfExists = async () => {
      },
      moveTemplateJsonToTrash = async () => ({ moved: false }),
      persistEditorConfig = async () => {
      },
      refreshTrashButtonState = async () => {
      },
      refreshTrashOverlayContents = async () => {
      },
      refreshTemplates = () => {
      },
      refreshInstances = () => {
      },
      refreshParams = () => {
      },
      updateIndexTemplateOptions = () => {
      },
      updateTemplateNameInputValidity = () => {
      },
      updateInstanceNameInputValidity = () => {
      },
      updateParamNameInputValidity = () => {
      },
      addLogEntry = () => {
      },
      showMessage = () => {
      },
      generateCSContent = () => "",
      generateEnumCSFiles = async () => {
      },
      generateRuntimeLoaderArtifacts = async () => {
      },
      generateUECppStructuresForCurrentTemplates = async () => ({ invalidMessage: "" }),
      collectDuplicateIdInfo: collectDuplicateIdInfo2 = () => ({ duplicates: /* @__PURE__ */ new Map(), byIndex: /* @__PURE__ */ new Map() }),
      collectListTypeViolations: collectListTypeViolations2 = () => ({ invalidInstances: /* @__PURE__ */ new Map() }),
      ensureTemplateUid: ensureTemplateUid2 = () => null,
      normalizeTemplateParameterIndexes: normalizeTemplateParameterIndexes2 = () => {
      },
      populateMissingIndexFields: populateMissingIndexFields2 = () => {
      },
      captureCurrentStructureSnapshot: captureCurrentStructureSnapshot2 = () => /* @__PURE__ */ new Map(),
      hasTemplateStructureChanged: hasTemplateStructureChanged2 = () => true,
      normalizeContent: normalizeContent2 = (value) => value || "",
      snapshotTemplateStructure: snapshotTemplateStructure2 = () => ({}),
      isEnumTemplate: isEnumTemplate2 = () => false,
      ensureEnumParamNaming: ensureEnumParamNaming2 = () => {
      },
      getEnumTemplate: getEnumTemplate2 = () => null
    } = context;
    const isCSharpMode = () => isUnityMode() || isGodotMode();
    function buildEnumTemplateJson(tpl) {
      if (!tpl || !isEnumTemplate2(tpl)) return null;
      const indexField = "id";
      const parameters = Array.isArray(tpl.parameters) ? tpl.parameters.map((param, idx) => {
        if (!param || typeof param !== "object") return param;
        const clone = JSON.parse(JSON.stringify(param));
        clone.name = clone.name != null && clone.name !== "" ? clone.name : String(idx);
        clone.type = "string";
        if (clone.parameterIndexes) {
          delete clone.parameterIndexes;
        }
        return clone;
      }) : [];
      const instances = Array.isArray(tpl.instances) ? tpl.instances.map((inst, instIdx) => {
        if (!inst || typeof inst !== "object") return inst;
        const clone = JSON.parse(JSON.stringify(inst));
        if (clone.id == null) {
          clone.id = instIdx;
        }
        if (!clone.payload || typeof clone.payload !== "object") {
          clone.payload = {};
        }
        if (clone.payload.id == null) {
          clone.payload.id = clone.id;
        }
        if (clone.payload.template == null) {
          clone.payload.template = tpl.name;
        }
        if (clone.payload.name == null) {
          clone.payload.name = clone.name != null ? clone.name : "";
        }
        const indexSource = clone.payload[indexField];
        clone.payload.index = indexSource == null ? String(clone.payload.id ?? "") : String(indexSource);
        return clone;
      }) : [];
      return {
        name: tpl.name,
        indexField,
        parameters,
        instances
      };
    }
    async function writeManifestForTemplates() {
      if (!appState.dataEntityHandle) return;
      const manifest = appState.templates.filter((tpl) => !isEnumTemplate2(tpl)).map((tpl) => ({ template: tpl.name, path: `${tpl.name}.json` }));
      await writeTextFile(appState.dataEntityHandle, "manifest.json", JSON.stringify(manifest, null, 2));
    }
    function askCSharpReplacementBulk(templateNames) {
      const readableList = templateNames.join("、");
      const lines = [
        "以下模板的结构发生变化，检测到 C# 脚本内容可能发生变化：",
        readableList,
        "请选择操作：",
        "1. 替换 C#，同时保存 JSON 数据",
        "2. 只保存 JSON 数据，不替换脚本",
        "3. 取消保存"
      ];
      while (true) {
        const input = prompt(lines.join("\n"), "1");
        if (input === null) return "cancel";
        const trimmed = String(input).trim();
        if (trimmed === "1") return "replace";
        if (trimmed === "2") return "jsonOnly";
        if (trimmed === "3") return "cancel";
      }
    }
    function resetTemplateLoadState() {
      appState.templates.length = 0;
      appState.currentTemplateIndex = -1;
      appState.currentInstanceIndex = -1;
      appState.templateUidState.counter = 0;
      appState.lastSavedStructureSnapshot = /* @__PURE__ */ new Map();
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
        indexField: obj.indexField || "id"
      };
      normalizeTemplateParameterIndexes2(template);
      if (isEnumTemplate2(template) && Array.isArray(template.parameters)) {
        template.parameters = template.parameters.map((param) => {
          if (!param) return param;
          return { ...param, type: "string" };
        });
        ensureEnumParamNaming2(template);
      }
      ensureTemplateUid2(template);
      template.__fromDisk = true;
      return template;
    }
    async function loadAllTemplates() {
      resetTemplateLoadState();
      let enumLoadedFromJson = false;
      for await (const entry of appState.dataEntityHandle.values()) {
        if (entry.kind !== "file" || !entry.name.toLowerCase().endsWith(".json")) {
          continue;
        }
        if (entry.name.toLowerCase() === "manifest.json") continue;
        try {
          const file = await entry.getFile();
          const obj = JSON.parse(await file.text());
          const template = hydrateTemplateFromJson(obj);
          if (!template) continue;
          if (isEnumTemplate2(template)) {
            enumLoadedFromJson = true;
          }
          appState.templates.push(template);
        } catch (_err) {
          showMessage(`无法解析 ${entry.name}，已跳过`);
        }
      }
      if (!enumLoadedFromJson) {
        const cachedEnum = await loadEnumTemplateCache();
        if (cachedEnum && isEnumTemplate2(cachedEnum)) {
          ensureEnumParamNaming2(cachedEnum);
          if (!Array.isArray(cachedEnum.parameters)) cachedEnum.parameters = [];
          if (!Array.isArray(cachedEnum.instances)) cachedEnum.instances = [];
          ensureTemplateUid2(cachedEnum);
          cachedEnum.__fromDisk = false;
          appState.templates.push(cachedEnum);
        }
      }
      appState.templates.sort((a, b) => a.name.localeCompare(b.name));
      populateMissingIndexFields2(appState.templates);
      if (appState.templates.length > 0) {
        appState.currentTemplateIndex = 0;
        appState.currentInstanceIndex = appState.templates[0].instances.length > 0 ? 0 : -1;
      }
      appState.lastSavedStructureSnapshot = captureCurrentStructureSnapshot2();
      await refreshTrashButtonState();
    }
    async function restoreTemplateFromTrash(templateName) {
      if (!templateName) return;
      if (!appState.directoryHandle) {
        showMessage("请先选择工作目录", "warn");
        return;
      }
      try {
        await cleanConflictingEngineArtifacts();
        await ensureSubFolders();
      } catch (err) {
        console.warn("恢复模板时无法确保目录结构", err);
        showMessage("恢复失败，请检查权限", "warn");
        return;
      }
      const handle = await ensureTrashDirectory();
      if (!handle) {
        showMessage("垃圾箱目录不可用", "warn");
        return;
      }
      const fileName = `${templateName}.json`;
      let fileText = "";
      let parsed = null;
      try {
        const fileHandle = await handle.getFileHandle(fileName, { create: false });
        const file = await fileHandle.getFile();
        fileText = await file.text();
        parsed = JSON.parse(fileText);
      } catch (err) {
        console.warn("读取垃圾箱模板失败", err);
        showMessage("读取垃圾箱文件失败", "warn");
        return;
      }
      if (!parsed || typeof parsed !== "object" || !parsed.name) {
        showMessage("模板 JSON 不合法，无法恢复", "warn");
        return;
      }
      if (appState.templates.some((tpl) => tpl && tpl.name === parsed.name)) {
        showMessage("已有同名模板，请先处理重名", "warn");
        return;
      }
      try {
        await writeTextFile(appState.dataEntityHandle, fileName, fileText);
        if (typeof handle.removeEntry === "function") {
          await handle.removeEntry(fileName);
        }
      } catch (err) {
        console.warn("恢复模板写入失败", err);
        showMessage("恢复失败，请检查权限", "warn");
        return;
      }
      const template = {
        name: parsed.name,
        parameters: Array.isArray(parsed.parameters) ? parsed.parameters : [],
        instances: Array.isArray(parsed.instances) ? parsed.instances : [],
        indexField: parsed.indexField || "id"
      };
      normalizeTemplateParameterIndexes2(template);
      if (isEnumTemplate2(template)) {
        ensureEnumParamNaming2(template);
      }
      ensureTemplateUid2(template);
      template.__fromDisk = true;
      appState.templates.push(template);
      populateMissingIndexFields2(appState.templates);
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
        appState.currentInstanceIndex = appState.currentTemplateIndex >= 0 && appState.templates[appState.currentTemplateIndex].instances.length > 0 ? 0 : -1;
      }
      appState.editingParamIndex = -1;
      refreshTemplates();
      refreshInstances();
      refreshParams();
      updateIndexTemplateOptions();
      updateTemplateNameInputValidity();
      updateInstanceNameInputValidity();
      updateParamNameInputValidity();
      appState.lastSelectedCategory = "template";
      appState.pendingTemplateDeletions.delete(templateName);
      if (template.__uid) {
        appState.lastSavedStructureSnapshot.set(template.__uid, snapshotTemplateStructure2(template));
      }
      let restoreInvalidMessage = "";
      try {
        if (isEnumTemplate2(template)) {
          await saveEnumTemplateCache(template);
          const enumJson = buildEnumTemplateJson(template);
          if (enumJson) {
            await writeTextFile(
              appState.dataEntityHandle,
              `${template.name}.json`,
              JSON.stringify(enumJson, null, 2)
            );
          }
        }
        await writeManifestForTemplates();
        if (isCSharpMode()) {
          if (!isEnumTemplate2(template)) {
            const csContent = generateCSContent(template);
            await writeTextFile(appState.csharpHandle, `${template.name}.cs`, csContent);
          }
          await generateEnumCSFiles(getEnumTemplate2());
          await generateRuntimeLoaderArtifacts();
        } else {
          const result = await generateUECppStructuresForCurrentTemplates();
          if (result.invalidMessage) {
            restoreInvalidMessage = result.invalidMessage;
            addLogEntry("warn", result.invalidMessage);
          }
        }
      } catch (err) {
        console.warn("恢复模板后生成文件失败", err);
        showMessage("模板已恢复，但生成关联文件失败，请手动保存", "warn");
        await refreshTrashButtonState();
        await refreshTrashOverlayContents();
        return;
      }
      if (restoreInvalidMessage) {
        showMessage(`${restoreInvalidMessage}（模板：${template.name}）`, "warn");
      } else {
        showMessage(`已恢复模板：${template.name}`);
      }
      await refreshTrashButtonState();
      await refreshTrashOverlayContents();
    }
    async function collectCSharpSavePlan() {
      const templateDecisions = /* @__PURE__ */ new Map();
      const csCache = /* @__PURE__ */ new Map();
      const pendingStructureDecision = [];
      for (const tpl of appState.templates) {
        ensureTemplateUid2(tpl);
        if (isEnumTemplate2(tpl)) continue;
        const structureChanged = hasTemplateStructureChanged2(tpl);
        if (!structureChanged) {
          templateDecisions.set(tpl.__uid, { decision: "jsonOnly", structureChanged: false });
          continue;
        }
        const csContent = generateCSContent(tpl);
        const existingCs = await readTextFileIfExists(appState.csharpHandle, `${tpl.name}.cs`);
        csCache.set(tpl.__uid, csContent);
        if (existingCs != null && normalizeContent2(existingCs) === normalizeContent2(csContent)) {
          templateDecisions.set(tpl.__uid, { decision: "jsonOnly", structureChanged: true });
          continue;
        }
        pendingStructureDecision.push(tpl);
      }
      if (pendingStructureDecision.length > 0) {
        const answer = askCSharpReplacementBulk(pendingStructureDecision.map((tpl) => tpl.name));
        if (answer === "cancel") {
          return { canceled: true };
        }
        for (const tpl of pendingStructureDecision) {
          templateDecisions.set(tpl.__uid, {
            decision: answer === "replace" ? "replace" : "jsonOnly",
            structureChanged: true
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
          id: inst && Object.prototype.hasOwnProperty.call(inst, "id") ? inst.id : "",
          name: inst && inst.name,
          params: paramErrors
        });
      });
      return {
        invalidListIndices,
        warning: {
          name: tpl.name,
          count: invalidListIndices.size,
          instances: skippedListEntries
        }
      };
    }
    async function writeTemplateJsonFiles(templateDecisions, csCache) {
      let enumTemplateSaved = false;
      const duplicateIdWarnings = [];
      const listValidationWarnings = [];
      for (const tpl of appState.templates) {
        ensureTemplateUid2(tpl);
        normalizeTemplateParameterIndexes2(tpl);
        if (isEnumTemplate2(tpl)) {
          await saveEnumTemplateCache(tpl);
          enumTemplateSaved = true;
          const enumJsonObj = buildEnumTemplateJson(tpl);
          if (enumJsonObj) {
            await writeTextFile(
              appState.dataEntityHandle,
              `${tpl.name}.json`,
              JSON.stringify(enumJsonObj, null, 2)
            );
          }
          tpl.__fromDisk = true;
          continue;
        }
        const duplicateIdInfo = collectDuplicateIdInfo2(tpl);
        const duplicateIndices = new Set(duplicateIdInfo.byIndex.keys());
        const listValidation = collectListTypeViolations2(tpl);
        const { invalidListIndices, warning } = buildInvalidListEntry(tpl, listValidation);
        const cleanedInstances = Array.isArray(tpl.instances) ? tpl.instances.filter((_, idx) => !duplicateIndices.has(idx) && !invalidListIndices.has(idx)) : [];
        if (duplicateIndices.size > 0) {
          duplicateIdWarnings.push({
            name: tpl.name,
            count: duplicateIndices.size,
            values: Array.from(duplicateIdInfo.duplicates.keys()).map(
              (key) => key === "" ? "（空）" : key
            )
          });
        }
        if (invalidListIndices.size > 0) {
          listValidationWarnings.push(warning);
        }
        const json = JSON.stringify(
          {
            name: tpl.name,
            indexField: tpl.indexField || "id",
            parameters: tpl.parameters,
            instances: cleanedInstances
          },
          null,
          2
        );
        await writeTextFile(appState.dataEntityHandle, `${tpl.name}.json`, json);
        tpl.__fromDisk = true;
        const meta = templateDecisions.get(tpl.__uid);
        if (meta && meta.decision === "replace") {
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
      let ueInvalidNameMessage = "";
      if (isCSharpMode()) {
        await generateEnumCSFiles(getEnumTemplate2());
      } else {
        ueGenerationInfo = await generateUECppStructuresForCurrentTemplates();
        if (ueGenerationInfo && ueGenerationInfo.invalidMessage) {
          ueInvalidNameMessage = ueGenerationInfo.invalidMessage;
          addLogEntry("warn", ueInvalidNameMessage);
        }
      }
      return { ueGenerationInfo, ueInvalidNameMessage };
    }
    function reportSaveWarnings({
      trashFailures,
      duplicateIdWarnings,
      listValidationWarnings,
      ueInvalidNameMessage
    }) {
      if (duplicateIdWarnings.length > 0) {
        const detail = duplicateIdWarnings.map((item) => {
          const preview = item.values.slice(0, 5).join(", ");
          const suffix = item.values.length > 5 ? "…" : "";
          return `${item.name}: 跳过 ${item.count} 项（${preview}${suffix}）`;
        }).join("\n");
        addLogEntry("warn", "部分实例因 ID 重复未写入 JSON", { detail });
      }
      const warningMessages = [];
      if (trashFailures.length > 0) {
        const detail = trashFailures.join(", ");
        addLogEntry("warn", "以下模板移入垃圾箱失败", { detail });
        warningMessages.push("部分模板移入垃圾箱失败，请检查日志");
      }
      if (duplicateIdWarnings.length > 0) {
        warningMessages.push(
          `以下模板存在重复 ID：${duplicateIdWarnings.map((item) => item.name).join(", ")}`
        );
      }
      if (listValidationWarnings.length > 0) {
        const names = listValidationWarnings.map((item) => item.name).join(", ");
        const detail = listValidationWarnings.map((item) => {
          const instanceLines = (item.instances || []).map((info) => {
            const headerParts = [`序号 ${info.index + 1}`];
            if (info.id !== void 0 && info.id !== null && info.id !== "") {
              headerParts.push(`ID ${info.id}`);
            }
            if (info.name) {
              headerParts.push(`名称 ${info.name}`);
            }
            const paramLines = (info.params || []).map((paramError) => {
              const errorDetails = (paramError.errors || []).map((err) => {
                if (err && Number.isInteger(err.index) && err.index >= 0) {
                  return `${err.reason || "类型不匹配"} @${err.index + 1}`;
                }
                return err && err.reason ? err.reason : "类型不匹配";
              }).join(" / ");
              return `${paramError.paramName}: ${errorDetails || "类型不匹配"}`;
            }).join("；");
            return `${headerParts.join("，")} -> ${paramLines || "类型不匹配"}`;
          }).join("\n    ");
          return `${item.name}:
    ${instanceLines || "无实例信息"}`;
        }).join("\n");
        addLogEntry("warn", "以下模板包含无效的列表数据，相关实例已跳过保存", { detail });
        warningMessages.push(`以下模板包含无效的列表数据：${names}`);
      }
      if (ueInvalidNameMessage) {
        warningMessages.push(ueInvalidNameMessage);
      }
      if (warningMessages.length > 0) {
        showMessage(warningMessages.join("；"), "warn");
      } else {
        showMessage("已保存所有更改");
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
        alert("请先选择工作目录");
        return;
      }
      try {
        const consent = await ensureEngineGenerationConsent("保存并生成文件");
        if (!consent) return;
        await cleanConflictingEngineArtifacts();
        await ensureSubFolders();
        if (isCSharpMode()) {
          await ensureModelStruct();
        }
        await ensureTrashDirectory();
        let templateDecisions = /* @__PURE__ */ new Map();
        let csCache = /* @__PURE__ */ new Map();
        if (isCSharpMode()) {
          const plan = await collectCSharpSavePlan();
          if (plan.canceled) {
            showMessage("已取消保存");
            return;
          }
          templateDecisions = plan.templateDecisions;
          csCache = plan.csCache;
        }
        const {
          enumTemplateSaved,
          duplicateIdWarnings,
          listValidationWarnings
        } = await writeTemplateJsonFiles(templateDecisions, csCache);
        const { trashFailures } = await processPendingDeletions();
        const { ueInvalidNameMessage } = await runPostSaveGenerators();
        if (!enumTemplateSaved) {
          await clearEnumTemplateCache();
          await deleteDataEntityFileIfExists("enum.json");
        }
        await writeManifestForTemplates();
        if (isCSharpMode()) {
          await generateRuntimeLoaderArtifacts();
        }
        await persistEditorConfig();
        appState.lastSavedStructureSnapshot = captureCurrentStructureSnapshot2();
        await refreshTrashButtonState();
        await refreshTrashOverlayContents();
        reportSaveWarnings({
          trashFailures,
          duplicateIdWarnings,
          listValidationWarnings,
          ueInvalidNameMessage
        });
      } catch (err) {
        console.error(err);
        showMessage("保存失败，请检查权限");
      }
    }
    return {
      loadAllTemplates,
      buildEnumTemplateJson,
      writeManifestForTemplates,
      askCSharpReplacementBulk,
      restoreTemplateFromTrash,
      saveAll
    };
  }

  // src/services/csv-service.js
  function ensureContext4(context) {
    if (!context || typeof context !== "object") {
      throw new Error("CsvServiceModule requires a context object");
    }
    if (!context.appState || typeof context.appState !== "object") {
      throw new Error("CsvServiceModule requires appState");
    }
  }
  function resolveDomRefs(domRefs, domMap) {
    const resolved = { ...domRefs || {} };
    Object.entries(domMap || {}).forEach(([name, id]) => {
      if (!resolved[name] && id) {
        resolved[name] = document.getElementById(id);
      }
    });
    return resolved;
  }
  function createLegacyScope(context, domMap, extraLocals = {}) {
    const { appState, domRefs = {}, ...helpers } = context;
    const resolvedDomRefs = resolveDomRefs(domRefs, domMap);
    const localState = {
      ...helpers,
      ...resolvedDomRefs,
      ...extraLocals,
      appState,
      window,
      document
    };
    return new Proxy(/* @__PURE__ */ Object.create(null), {
      has() {
        return true;
      },
      get(_target, prop) {
        if (prop === Symbol.unscopables) return void 0;
        if (Object.prototype.hasOwnProperty.call(localState, prop)) {
          return localState[prop];
        }
        if (appState && Object.prototype.hasOwnProperty.call(appState, prop)) {
          return appState[prop];
        }
        const shared = globalThis.__legacyMainContext;
        if (shared && prop in shared) {
          return shared[prop];
        }
        return globalThis[prop];
      },
      set(_target, prop, value) {
        if (appState && Object.prototype.hasOwnProperty.call(appState, prop)) {
          appState[prop] = value;
          return true;
        }
        const shared = globalThis.__legacyMainContext;
        if (shared && prop in shared) {
          shared[prop] = value;
          return true;
        }
        localState[prop] = value;
        return true;
      }
    });
  }
  var DOM_ID_MAP = {
    "exportCsvBtn": "exportCsv",
    "confirmExportCsvBtn": "confirmExportCsv",
    "cancelExportCsvBtn": "cancelExportCsv",
    "paramTypeSelect": "paramType",
    "listElementTypeSelect": "listElementType"
  };
  var FACTORY_SOURCE = "with (scope) {\n  function updateExportButtons() {\n    if (!exportCsvBtn || !confirmExportCsvBtn || !cancelExportCsvBtn) return;\n    if (exportSelectionMode) {\n      exportCsvBtn.style.display = 'none';\n      confirmExportCsvBtn.style.display = '';\n      cancelExportCsvBtn.style.display = '';\n    } else {\n      exportCsvBtn.style.display = '';\n      confirmExportCsvBtn.style.display = 'none';\n      cancelExportCsvBtn.style.display = 'none';\n    }\n  }\n\n  function beginExportSelection() {\n    const missingDirectory = !directoryHandle || !dataEntityHandle;\n    exportSelectionMode = true;\n    exportTemplateAnchorIndex = null;\n    updateExportButtons();\n    const message = missingDirectory\n      ? '未选择工作目录，请先勾选需要导出的模板或实例，导出时会提示选择目录'\n      : '已进入导出选择模式，勾选需要导出的模板或实例';\n    showMessage(message, missingDirectory ? 'warn' : 'info');\n    refreshTemplates();\n    refreshInstances();\n  }\n\n  function exitExportSelectionMode(clearSelection) {\n    exportSelectionMode = false;\n    exportTemplateAnchorIndex = null;\n    if (clearSelection) {\n      exportSelections.clear();\n    }\n    updateExportButtons();\n    refreshTemplates();\n    refreshInstances();\n  }\n\n  function ensureTemplateUidForExport(tpl) {\n    ensureTemplateUid(tpl);\n    return tpl.__uid;\n  }\n\n  function getExportRecord(tpl, createIfMissing = false) {\n    const key = ensureTemplateUidForExport(tpl);\n    let record = exportSelections.get(key);\n    if (!record && createIfMissing) {\n      record = { allSelected: false, selectedInstances: new Set(), anchorIndex: null };\n      exportSelections.set(key, record);\n    }\n    if (record) {\n      // 清理无效实例 id\n      const validIds = new Set((tpl.instances || []).map((inst) => inst.id));\n      if (!record.allSelected && record.selectedInstances.size > 0) {\n        for (const id of Array.from(record.selectedInstances)) {\n          if (!validIds.has(id)) {\n            record.selectedInstances.delete(id);\n          }\n        }\n      }\n    }\n    return record || null;\n  }\n\n  function cleanupExportRecord(tpl) {\n    const key = tpl.__uid;\n    if (!key) return;\n    const record = exportSelections.get(key);\n    if (!record) return;\n    if (!record.allSelected && record.selectedInstances.size === 0) {\n      exportSelections.delete(key);\n    }\n  }\n\n  function getTemplateExportCounts(tpl) {\n    const total = (tpl.instances || []).length;\n    const record = getExportRecord(tpl);\n    if (!record) {\n      return { selected: 0, total };\n    }\n    if (record.allSelected) {\n      return { selected: total, total };\n    }\n    let selected = 0;\n    const ids = new Set(record.selectedInstances);\n    (tpl.instances || []).forEach((inst) => {\n      if (ids.has(inst.id)) selected += 1;\n    });\n    return { selected, total };\n  }\n\n  function getTemplateExportState(tpl) {\n    const { selected, total } = getTemplateExportCounts(tpl);\n    if (selected <= 0) return 'none';\n    if (selected >= total && total > 0) return 'all';\n    if (total === 0) {\n      const record = getExportRecord(tpl);\n      return record && record.allSelected ? 'all' : 'none';\n    }\n    return 'partial';\n  }\n\n  function applyTemplateExportAction(tpl, action) {\n    const record = getExportRecord(tpl, action === 'all');\n    if (!record) return;\n    if (action === 'clear') {\n      exportSelections.delete(tpl.__uid);\n      return;\n    }\n    record.allSelected = true;\n    record.selectedInstances.clear();\n    record.anchorIndex = null;\n  }\n\n  function handleTemplateExportCheckbox(templateIndex, prevState, event) {\n    const tpl = templates[templateIndex];\n    if (!tpl) return;\n    let action = 'all';\n    if (prevState === 'all') {\n      action = 'clear';\n    }\n    if (prevState === 'partial') {\n      action = 'all';\n    }\n    if (event && event.shiftKey && exportTemplateAnchorIndex !== null) {\n      const start = Math.min(exportTemplateAnchorIndex, templateIndex);\n      const end = Math.max(exportTemplateAnchorIndex, templateIndex);\n      for (let i = start; i <= end; i += 1) {\n        const targetTpl = templates[i];\n        if (!targetTpl) continue;\n        applyTemplateExportAction(targetTpl, action);\n      }\n    } else {\n      applyTemplateExportAction(tpl, action);\n    }\n    exportTemplateAnchorIndex = templateIndex;\n    refreshTemplates();\n    refreshInstances();\n  }\n\n  function isInstanceSelectedForExport(tpl, inst) {\n    const record = getExportRecord(tpl);\n    if (!record) return false;\n    if (record.allSelected) return true;\n    return record.selectedInstances.has(inst.id);\n  }\n\n  function applyInstanceExportSelection(tpl, inst, shouldSelect, record) {\n    if (!record) return;\n    if (shouldSelect) {\n      if (record.allSelected) return;\n      record.selectedInstances.add(inst.id);\n      const total = (tpl.instances || []).length;\n      if (record.selectedInstances.size >= total && total > 0) {\n        record.allSelected = true;\n        record.selectedInstances.clear();\n      }\n    } else {\n      if (record.allSelected) {\n        record.allSelected = false;\n        record.selectedInstances = new Set((tpl.instances || []).map((item) => item.id));\n      }\n      record.selectedInstances.delete(inst.id);\n    }\n    cleanupExportRecord(tpl);\n  }\n\n  function handleInstanceExportCheckbox(templateIndex, instanceIndex, wasSelected, event) {\n    const tpl = templates[templateIndex];\n    if (!tpl) return;\n    const record = getExportRecord(tpl, true);\n    if (!record) return;\n    const shouldSelect = !wasSelected;\n    if (event && event.shiftKey && record.anchorIndex !== null) {\n      const start = Math.min(record.anchorIndex, instanceIndex);\n      const end = Math.max(record.anchorIndex, instanceIndex);\n      for (let i = start; i <= end; i += 1) {\n        const inst = tpl.instances[i];\n        if (!inst) continue;\n        applyInstanceExportSelection(tpl, inst, shouldSelect, record);\n      }\n    } else {\n      const inst = tpl.instances[instanceIndex];\n      if (inst) {\n        applyInstanceExportSelection(tpl, inst, shouldSelect, record);\n      }\n    }\n    record.anchorIndex = instanceIndex;\n    refreshTemplates();\n    refreshInstances();\n  }\n\n  function collectTemplatesForExport() {\n    const selected = [];\n    templates.forEach((tpl) => {\n      const record = getExportRecord(tpl);\n      if (!record) return;\n      const allInstances = (tpl.instances || []);\n      const instances = record.allSelected\n        ? allInstances.slice()\n        : allInstances.filter((inst) => record.selectedInstances.has(inst.id));\n      if (record.allSelected || instances.length > 0 || (allInstances.length === 0 && record.allSelected)) {\n        selected.push({ tpl, instances });\n      }\n    });\n    return selected;\n  }\n\n  function sanitizeCsvFileName(name) {\n    return (name || 'template').replace(/[\\\\/:*?\"<>|]/g, '_');\n  }\n\n  function encodeCsvValue(value) {\n    const str = value == null ? '' : String(value);\n    if (/[\",\\n]/.test(str)) {\n      return `\"${str.replace(/\"/g, '\"\"')}\"`;\n    }\n    return str;\n  }\n\n  function rowsToCsv(rows) {\n    return rows.map((row) => row.map(encodeCsvValue).join(',')).join('\\n');\n  }\n\n  function serializeValueForCsv(param, value) {\n    if (param && param.parameterIndexes) {\n      if (value && typeof value === 'object') {\n        try {\n          return JSON.stringify({\n            template: value.template ?? param.parameterIndexes.template,\n            by: value.by ?? param.parameterIndexes.param,\n            value: value.value ?? '',\n          });\n        } catch (_) {\n          return '';\n        }\n      }\n      if (value == null || value === '') {\n        return '';\n      }\n      return JSON.stringify({ template: param.parameterIndexes.template, by: param.parameterIndexes.param, value: String(value) });\n    }\n    if (Array.isArray(value)) {\n      try {\n        return JSON.stringify(value);\n      } catch (_) {\n        return '';\n      }\n    }\n    if (value && typeof value === 'object') {\n      try {\n        return JSON.stringify(value);\n      } catch (_) {\n        return '';\n      }\n    }\n    if (typeof value === 'boolean') {\n      return value ? 'true' : 'false';\n    }\n    if (value == null) return '';\n    return String(value);\n  }\n\n  function resolveIndexFieldMeta(tpl) {\n    return resolveIndexFieldMetaPure(tpl, INDEXABLE_PARAM_TYPES);\n  }\n\n  function formatIndexCell(field, type, value) {\n    return formatIndexCellPure(field, type, value);\n  }\n\n  function parseIndexTypeCell(cell) {\n    return parseIndexTypeCellPure(cell);\n  }\n\n  function parseIndexDataCell(cell, fallbackField, fallbackType) {\n    return parseIndexDataCellPure(cell, fallbackField, fallbackType);\n  }\n\n  function buildCsvRowsForTemplate(tpl, instances) {\n    const indexMeta = resolveIndexFieldMeta(tpl);\n    const headers = ['template', 'id', 'index', 'name'];\n    const types = [\n      'string',\n      'int',\n      `${indexMeta.field}/${indexMeta.type}`,\n      'string',\n    ];\n    const paramList = [];\n    const seenNames = new Set();\n    (tpl.parameters || []).forEach((p) => {\n      if (!p || !p.name) return;\n      paramList.push(p);\n      seenNames.add(p.name);\n    });\n    if (isEnumTemplate(tpl)) {\n      const numericKeys = new Set();\n      (Array.isArray(instances) ? instances : []).forEach((inst) => {\n        const payload = inst && inst.payload ? inst.payload : {};\n        Object.keys(payload || {}).forEach((key) => {\n          if (/^\\d+$/.test(key)) numericKeys.add(key);\n        });\n      });\n      Array.from(numericKeys)\n        .sort((a, b) => {\n          const na = Number(a);\n          const nb = Number(b);\n          if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) {\n            return na - nb;\n          }\n          return a.localeCompare(b, 'zh-Hans-CN');\n        })\n        .forEach((key) => {\n          if (seenNames.has(key)) return;\n          paramList.push({ name: key, type: 'string' });\n          seenNames.add(key);\n        });\n    }\n    paramList.forEach((p) => {\n      headers.push(p.name);\n      if (p.parameterIndexes && p.parameterIndexes.template && p.parameterIndexes.param) {\n        const idxField = p.parameterIndexes.indexField || '';\n        const suffix = idxField ? `/${idxField}` : '';\n        types.push(`${p.type}/${p.parameterIndexes.template}/${p.parameterIndexes.param}${suffix}`);\n      } else {\n        types.push(p.type);\n      }\n    });\n    const rows = [headers, types];\n    instances.forEach((inst) => {\n      const payload = inst && inst.payload ? inst.payload : {};\n      const row = [\n        tpl.name,\n        String(inst && inst.id != null ? inst.id : ''),\n        formatIndexCell(\n          indexMeta.field,\n          indexMeta.type,\n          computeExpectedIndexValue(tpl, inst, indexMeta.field)\n        ),\n        inst && inst.name != null ? inst.name : '',\n      ];\n      paramList.forEach((p) => {\n        if (!p) return;\n        row.push(serializeValueForCsv(p, payload[p.name]));\n      });\n      rows.push(row);\n    });\n    return rows;\n  }\n\n  async function performExportCsv() {\n    if (!directoryHandle || !dataEntityHandle) {\n      showMessage('请先选择工作目录', 'warn');\n      return;\n    }\n    const selected = collectTemplatesForExport();\n    if (selected.length === 0) {\n      showMessage('请至少选择一个模板或实例进行导出', 'warn');\n      return;\n    }\n    try {\n      const csvDir = await dataEntityHandle.getDirectoryHandle('csvoutput', { create: true });\n      for (const item of selected) {\n        const rows = buildCsvRowsForTemplate(item.tpl, item.instances);\n        const csvText = rowsToCsv(rows);\n        const fileName = `${sanitizeCsvFileName(item.tpl.name)}.csv`;\n        await writeTextFile(csvDir, fileName, csvText);\n      }\n      const names = selected.map((item) => item.tpl.name).join(', ');\n      showMessage(`已导出 ${selected.length} 个模板的 CSV`, 'info');\n      addLogEntry('info', `导出 CSV：${names}`);\n      exitExportSelectionMode(true);\n    } catch (err) {\n      console.error(err);\n      addLogEntry('error', `导出 CSV 失败：${err && err.message ? err.message : err}`, { detail: err && err.stack ? err.stack : '' });\n      showMessage('导出 CSV 失败，请检查日志', 'warn');\n    }\n  }\n\n  function parseCsvText(text) {\n    const rows = [];\n    let current = '';\n    let row = [];\n    let inQuotes = false;\n    for (let i = 0; i < text.length; i += 1) {\n      const ch = text[i];\n      if (inQuotes) {\n        if (ch === '\"') {\n          if (text[i + 1] === '\"') {\n            current += '\"';\n            i += 1;\n          } else {\n            inQuotes = false;\n          }\n        } else {\n          current += ch;\n        }\n      } else if (ch === '\"') {\n        inQuotes = true;\n      } else if (ch === ',') {\n        row.push(current);\n        current = '';\n      } else if (ch === '\\r') {\n        // ignore\n      } else if (ch === '\\n') {\n        row.push(current);\n        rows.push(row);\n        row = [];\n        current = '';\n      } else {\n        current += ch;\n      }\n    }\n    if (inQuotes) {\n      throw new Error('CSV 引号未闭合');\n    }\n    row.push(current);\n    if (row.length > 1 || (row.length === 1 && row[0].length > 0)) {\n      rows.push(row);\n    }\n    while (rows.length > 0 && rows[rows.length - 1].every((cell) => (cell || '').trim() === '')) {\n      rows.pop();\n    }\n    return rows;\n  }\n\n  function normalizeCsvRowLength(row, targetLength) {\n    const normalized = row.slice();\n    while (normalized.length < targetLength) {\n      normalized.push('');\n    }\n    if (normalized.length > targetLength) {\n      throw new Error('CSV 列数不一致');\n    }\n    return normalized;\n  }\n\n  function parseBoolCell(raw) {\n    const trimmed = String(raw ?? '').trim().toLowerCase();\n    if (!trimmed) return false;\n    if (['true', '1', 'yes', 'y', '是'].includes(trimmed)) return true;\n    if (['false', '0', 'no', 'n', '否'].includes(trimmed)) return false;\n    throw new Error(`无法解析布尔值：${raw}`);\n  }\n\n  function convertCsvValueByType(type, raw) {\n    const base = (type || '').toLowerCase();\n    if (base === 'int' || base === 'long') {\n      const trimmed = String(raw ?? '').trim();\n      if (!trimmed) return 0;\n      const num = Number(trimmed);\n      if (!Number.isFinite(num)) throw new Error(`无法解析数字：${raw}`);\n      return Math.trunc(num);\n    }\n    if (base === 'float') {\n      const trimmed = String(raw ?? '').trim();\n      if (!trimmed) return 0;\n      const num = Number(trimmed);\n      if (!Number.isFinite(num)) throw new Error(`无法解析浮点数：${raw}`);\n      return num;\n    }\n    if (base === 'bool') {\n      return parseBoolCell(raw);\n    }\n    if (base === 'list') {\n      const trimmed = String(raw ?? '').trim();\n      if (!trimmed) return [];\n      const parsed = JSON.parse(trimmed);\n      if (!Array.isArray(parsed)) throw new Error(`列表列必须是 JSON 数组：${raw}`);\n      return parsed;\n    }\n    if (base === 'object') {\n      const trimmed = String(raw ?? '').trim();\n      if (!trimmed) return {};\n      const parsed = JSON.parse(trimmed);\n      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {\n        throw new Error(`对象列必须是 JSON 对象：${raw}`);\n      }\n      return parsed;\n    }\n    // 其它类型（包含字符串/枚举等）按字符串处理\n    return raw == null ? '' : String(raw);\n  }\n\n  function parseDataRefCell(raw, param) {\n    const trimmed = String(raw ?? '').trim();\n    if (!trimmed) {\n      return { template: param.parameterIndexes.template, by: param.parameterIndexes.param, value: '' };\n    }\n    try {\n      const parsed = JSON.parse(trimmed);\n      if (parsed && typeof parsed === 'object') {\n        return {\n          template: parsed.template || param.parameterIndexes.template,\n          by: parsed.by || param.parameterIndexes.param,\n          value: parsed.value != null ? String(parsed.value) : '',\n        };\n      }\n    } catch (_) {\n      // fallback to plain string\n    }\n    return { template: param.parameterIndexes.template, by: param.parameterIndexes.param, value: trimmed };\n  }\n\n  function buildTemplateFromCsv(rows, fileName) {\n    if (!rows || rows.length < 2) {\n      throw new Error('CSV 至少需要包含两行数据');\n    }\n    const headers = rows[0].map((cell) => String(cell || '').trim());\n    const typesRow = normalizeCsvRowLength(rows[1], headers.length).map((cell) => String(cell || '').trim());\n    const reserved = new Set(['template', 'id', 'name', 'index']);\n    const dataRows = rows.slice(2).map((row) => normalizeCsvRowLength(row, headers.length));\n    const nonEmptyDataRows = dataRows.filter((row) => row.some((cell) => String(cell || '').trim().length > 0));\n\n    const templateIdx = headers.indexOf('template');\n    const idIdx = headers.indexOf('id');\n    const nameIdx = headers.indexOf('name');\n    const indexIdx = headers.indexOf('index');\n    if (templateIdx < 0 || idIdx < 0 || nameIdx < 0 || indexIdx < 0) {\n      throw new Error('CSV 必须包含 template、id、name、index 四列');\n    }\n\n    const columnIndexMap = new Map();\n    headers.forEach((name, idx) => {\n      if (!name) {\n        throw new Error(`第 ${idx + 1} 列缺少列名`);\n      }\n      if (columnIndexMap.has(name)) {\n        throw new Error(`重复的列名：${name}`);\n      }\n      columnIndexMap.set(name, idx);\n    });\n\n    let templateName = '';\n    nonEmptyDataRows.forEach((row) => {\n      const raw = row[templateIdx];\n      const value = String(raw ?? '').trim();\n      if (!value) return;\n      if (!templateName) {\n        templateName = value;\n      } else if (templateName !== value) {\n        throw new Error('template 列存在不一致的名称');\n      }\n    });\n    if (!templateName) {\n      if (nonEmptyDataRows.length === 0) {\n        templateName = (fileName || '').replace(/\\.csv$/i, '').trim() || '导入模板';\n      } else {\n        throw new Error('template 列不能为空');\n      }\n    }\n\n    const csvIndexMeta = parseIndexTypeCell(typesRow[indexIdx]);\n    const csvIndexField = csvIndexMeta.field || 'id';\n    const csvIndexType = csvIndexMeta.type || 'int';\n\n    const parameterDefs = [];\n    headers.forEach((name, idx) => {\n      if (reserved.has(name)) return;\n      const info = (typesRow[idx] || '').split('/').map((part) => part.trim());\n      const baseType = info[0];\n      if (!baseType) {\n        throw new Error(`${name} 缺少类型定义`);\n      }\n      const param = { name, type: baseType };\n      if (info.length >= 3 && info[1] && info[2]) {\n        param.parameterIndexes = {\n          template: info[1],\n          param: info[2],\n          indexField: info[3] || '',\n        };\n      }\n      parameterDefs.push(param);\n    });\n\n    let indexFieldMismatch = false;\n    const instances = nonEmptyDataRows.map((row) => {\n      const record = {};\n      const payload = {};\n      const idRaw = row[idIdx];\n      const idTrimmed = String(idRaw ?? '').trim();\n      const parsedId = idTrimmed ? Number(idTrimmed) : 0;\n      if (idTrimmed && !Number.isFinite(parsedId)) {\n        throw new Error(`无法解析 id：${idRaw}`);\n      }\n      const normalizedId = Math.trunc(parsedId);\n      const nameValue = row[nameIdx] != null ? String(row[nameIdx]) : '';\n      payload.template = templateName;\n      payload.name = nameValue;\n      const indexCell = parseIndexDataCell(row[indexIdx], csvIndexField, csvIndexType);\n      payload.index = indexCell.value != null ? String(indexCell.value) : '';\n      if (indexCell.field && indexCell.field !== csvIndexField) {\n        indexFieldMismatch = true;\n      }\n      parameterDefs.forEach((param) => {\n        const colIdx = columnIndexMap.get(param.name);\n        const raw = row[colIdx];\n        if (param.parameterIndexes) {\n          payload[param.name] = parseDataRefCell(raw, param);\n        } else {\n          payload[param.name] = convertCsvValueByType(param.type, raw);\n        }\n      });\n      record.id = normalizedId;\n      record.name = nameValue;\n      record.payload = payload;\n      payload.id = normalizedId;\n      return record;\n    });\n\n    instances.forEach((inst) => {\n      inst.payload.template = templateName;\n      inst.payload.name = inst.name;\n    });\n\n    return {\n      name: templateName,\n      parameters: parameterDefs,\n      instances,\n      indexField: indexFieldMismatch ? 'id' : (csvIndexField || 'id'),\n    };\n  }\n\n  function computeExpectedIndexValue(tpl, inst, fieldName) {\n    return computeExpectedIndexValuePure(tpl, inst, fieldName);\n  }\n\n  function enforceEnumIndexField(tpl) {\n    return enforceEnumIndexFieldPure(tpl, { isEnumTemplate });\n  }\n\n\n  function collectDuplicateIdInfo(tpl) {\n    return collectDuplicateIdInfoPure(tpl);\n  }\n\n  function getNumericInstanceId(inst) {\n    return getNumericInstanceIdPure(inst);\n  }\n\n  function collectDuplicateIndexInfo(tpl) {\n    return collectDuplicateIndexInfoPure(tpl);\n  }\n\n  function chooseDuplicateNavigationTarget(group, currentInst) {\n    return chooseDuplicateNavigationTargetPure(group, currentInst);\n  }\n\n  function isEnumTemplate(tpl) {\n    return isEnumTemplatePure(tpl);\n  }\n\n  function ensureEnumParamNaming(tpl) {\n    return ensureEnumParamNamingPure(tpl);\n  }\n\n  function getEnumParamKeysForInstance(tpl, inst) {\n    return getEnumParamKeysForInstancePure(tpl, inst);\n  }\n\n  function getEnumTemplate() {\n    return getEnumTemplatePure(templates);\n  }\n\n  function getEnumDefinitions() {\n    return getEnumDefinitionsPure(templates);\n  }\n\n  function getEnumDefinition(type) {\n    return getEnumDefinitionPure(templates, type);\n  }\n\n  function isEnumType(type) {\n    return isEnumTypePure(templates, type);\n  }\n\n  function getEnumValues(type) {\n    return getEnumValuesPure(templates, type);\n  }\n\n  function getEnumCSharpTypeName(type) {\n    return getEnumCSharpTypeNamePure(templates, type);\n  }\n\n  function sanitizeCSharpTypeName(name, fallback) {\n    return sanitizeCSharpTypeNamePure(name, fallback);\n  }\n\n  function sanitizeCSharpMemberName(name, fallback) {\n    return sanitizeCSharpMemberNamePure(name, fallback);\n  }\n\n  function getBuiltinParamTypeOptionsForCurrentMode() {\n    return builtinParamTypeOptions;\n  }\n\n  function rebuildListElementTypeCollections(enumDefs, missingTypes, usedElementTypes) {\n    const collections = buildListElementTypeCollectionsPure({\n      builtinOptions: getBuiltinParamTypeOptionsForCurrentMode(),\n      enumDefs,\n      missingTypes,\n      usedElementTypes,\n    });\n    listElementTypeOptions = collections.options;\n    listElementTypeSet = collections.valueSet;\n  }\n\n  function refreshListElementTypeSelect(customValue) {\n    if (!listElementTypeSelect) return;\n    const previousValue = customValue != null ? customValue : listElementTypeSelect.value;\n    listElementTypeSelect.innerHTML = '';\n    listElementTypeOptions.forEach((opt) => {\n      const optionEl = document.createElement('option');\n      optionEl.value = opt.value;\n      optionEl.textContent = opt.label;\n      listElementTypeSelect.appendChild(optionEl);\n    });\n    const normalized = previousValue != null ? String(previousValue).trim() : '';\n    if (\n      normalized &&\n      !Array.from(listElementTypeSelect.options).some((opt) => opt.value === normalized)\n    ) {\n      const fallback = document.createElement('option');\n      fallback.value = normalized;\n      fallback.textContent = `${normalized} (缺失)`;\n      listElementTypeSelect.appendChild(fallback);\n    }\n    if (normalized && Array.from(listElementTypeSelect.options).some((opt) => opt.value === normalized)) {\n      listElementTypeSelect.value = normalized;\n    } else if (listElementTypeSelect.options.length > 0) {\n      listElementTypeSelect.value = listElementTypeSelect.options[0].value;\n    } else {\n      listElementTypeSelect.value = 'string';\n    }\n  }\n\n  function refreshParamTypeOptions() {\n    if (!paramTypeSelect) return;\n    const previousValue = paramTypeSelect.value;\n    const previousElementValue = listElementTypeSelect ? listElementTypeSelect.value : 'string';\n    const enumDefs = getEnumDefinitions();\n    const missingTypes = new Set();\n    const usedElementTypes = new Set();\n    templates.forEach((tpl) => {\n      if (!tpl || !Array.isArray(tpl.parameters)) return;\n      tpl.parameters.forEach((p) => {\n        if (!p || !p.type) return;\n        if (p.type === 'list' && p.elementType) {\n          usedElementTypes.add(String(p.elementType));\n        }\n        if (builtinParamTypeSet.has(p.type)) return;\n        if (enumDefs.some((def) => def.name === p.type)) return;\n        missingTypes.add(p.type);\n      });\n    });\n    paramTypeSelect.innerHTML = '';\n    const builtinOptions = getBuiltinParamTypeOptionsForCurrentMode();\n    builtinOptions.forEach((opt) => {\n      const optionEl = document.createElement('option');\n      optionEl.value = opt.value;\n      optionEl.textContent = opt.label;\n      paramTypeSelect.appendChild(optionEl);\n    });\n    if (enumDefs.length > 0) {\n      const group = document.createElement('optgroup');\n      group.label = '枚举类型';\n      enumDefs\n        .slice()\n        .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))\n        .forEach((def) => {\n          const opt = document.createElement('option');\n          opt.value = def.name;\n          opt.textContent = def.name;\n          group.appendChild(opt);\n        });\n      paramTypeSelect.appendChild(group);\n    }\n    if (missingTypes.size > 0) {\n      const missingGroup = document.createElement('optgroup');\n      missingGroup.label = '缺失类型';\n      Array.from(missingTypes)\n        .sort()\n        .forEach((typeName) => {\n          const opt = document.createElement('option');\n          opt.value = typeName;\n          opt.textContent = `${typeName} (缺失)`;\n          missingGroup.appendChild(opt);\n        });\n      paramTypeSelect.appendChild(missingGroup);\n    }\n    if (previousValue && Array.from(paramTypeSelect.options).some((opt) => opt.value === previousValue)) {\n      paramTypeSelect.value = previousValue;\n    } else {\n      paramTypeSelect.value = 'string';\n    }\n    rebuildListElementTypeCollections(enumDefs, missingTypes, usedElementTypes);\n    refreshListElementTypeSelect(previousElementValue);\n    updateListElementTypeSelectState();\n  }\n\n  function updateParamTypeSelectEnabledState() {\n    if (!paramTypeSelect) return;\n    const tpl = templates[currentTemplateIndex];\n    const shouldDisable = Boolean(tpl && isEnumTemplate(tpl));\n    paramTypeSelect.disabled = shouldDisable;\n    if (shouldDisable) {\n      paramTypeSelect.value = 'string';\n    }\n    updateListElementTypeSelectState();\n  }\n\n  function applyIndexDisabledState(message) {\n    if (!indexTemplateSelect || !indexParamSelect) return;\n    indexTemplateSelect.innerHTML = '';\n    const optTpl = document.createElement('option');\n    optTpl.value = '';\n    optTpl.textContent = message;\n    indexTemplateSelect.appendChild(optTpl);\n    indexTemplateSelect.value = '';\n    indexTemplateSelect.disabled = true;\n    indexTemplateSelect.dataset.disabledReason = message;\n\n    indexParamSelect.innerHTML = '';\n    const optParam = document.createElement('option');\n    optParam.value = '';\n    optParam.textContent = message;\n    indexParamSelect.appendChild(optParam);\n    indexParamSelect.value = '';\n    indexParamSelect.disabled = true;\n    indexParamSelect.dataset.disabledReason = message;\n  }\n\n  function updateParamNameInputEnabledState() {\n    if (!paramNameInput) return;\n    const tpl = templates[currentTemplateIndex];\n    const shouldDisable = Boolean(tpl && isEnumTemplate(tpl));\n    paramNameInput.disabled = shouldDisable;\n    if (shouldDisable) {\n      paramNameInput.placeholder = 'enum 自动命名（0,1,2,...）';\n    } else {\n      paramNameInput.placeholder = '';\n    }\n  }\n\n  function jumpToDuplicateIndexInstance(tpl, inst) {\n    if (!tpl || !inst) return false;\n    ensureTemplateUid(tpl);\n    let info = null;\n    if (lastDuplicateIndexInfo && lastDuplicateIndexInfo.uid === tpl.__uid) {\n      info = lastDuplicateIndexInfo.info;\n    }\n    if (!info) {\n      info = collectDuplicateIndexInfo(tpl);\n      lastDuplicateIndexInfo = { uid: tpl.__uid, info };\n    }\n    const field = info.field;\n    const key = computeExpectedIndexValue(tpl, inst, field);\n    const normalized = key == null ? '' : String(key);\n    const group = info.duplicates.get(normalized);\n    if (!group || group.length <= 1) {\n      showMessage('该索引值没有重复', 'info');\n      return false;\n    }\n    const target = chooseDuplicateNavigationTarget(group, inst);\n    if (!target) {\n      showMessage('该索引值没有其他重复项', 'info');\n      return false;\n    }\n    let targetIdx = target.idx;\n    if (!(targetIdx >= 0 && targetIdx < tpl.instances.length)) {\n      targetIdx = tpl.instances.indexOf(target.inst);\n    }\n    if (!(targetIdx >= 0 && targetIdx < tpl.instances.length)) {\n      showMessage('未能定位到重复索引的实例', 'warn');\n      return false;\n    }\n    currentInstanceIndex = targetIdx;\n    selectedInstances.clear();\n    selectedInstances.add(targetIdx);\n    anchorInstance = targetIdx;\n    instanceNameInput.value = tpl.instances[targetIdx]?.name || '';\n    refreshInstances();\n    refreshParams();\n    lastSelectedCategory = 'instance';\n    requestAnimationFrame(() => {\n      const li = instanceListEl.children[targetIdx];\n      if (li && typeof li.scrollIntoView === 'function') {\n        try {\n          li.scrollIntoView({ block: 'center', behavior: 'smooth' });\n        } catch (err) {\n          li.scrollIntoView({ block: 'center' });\n        }\n      }\n    });\n    const instLabel = tpl.instances[targetIdx];\n    let labelText = '';\n    if (instLabel) {\n      const parts = [];\n      if (instLabel.name) parts.push(String(instLabel.name));\n      if (instLabel.id != null && instLabel.id !== '') parts.push(`ID:${instLabel.id}`);\n      labelText = parts.join(' ');\n    }\n    showMessage(labelText ? `已跳转到索引重复的实例：${labelText}` : '已跳转到索引重复的实例', 'warn');\n    return true;\n  }\n\n  function enforceImportedIndexField(tpl, fileName) {\n    if (isEnumTemplate(tpl)) {\n      const changed = enforceEnumIndexField(tpl);\n      if (changed) {\n        showMessage(`${tpl.name}模版的index清空`, 'warn');\n      }\n      return;\n    }\n    let idxField = tpl.indexField || 'id';\n    let needReset = false;\n    const params = Array.isArray(tpl.parameters) ? tpl.parameters : [];\n    if (idxField !== 'id' && idxField !== 'name') {\n      const targetParam = params.find((p) => p && p.name === idxField);\n      if (!targetParam || !INDEXABLE_PARAM_TYPES.has(targetParam.type)) {\n        needReset = true;\n      }\n    }\n    const instList = Array.isArray(tpl.instances) ? tpl.instances : [];\n    if (!needReset) {\n      for (const inst of instList) {\n        const actual = inst.payload && inst.payload.index != null ? String(inst.payload.index) : '';\n        const expected = computeExpectedIndexValue(tpl, inst, idxField);\n        if (actual !== expected) {\n          needReset = true;\n          break;\n        }\n      }\n    }\n    if (needReset) {\n      idxField = 'id';\n      tpl.indexField = 'id';\n      instList.forEach((inst) => {\n        const newIndex = computeExpectedIndexValue(tpl, inst, 'id');\n        if (!inst.payload) inst.payload = {};\n        inst.payload.index = newIndex;\n      });\n      showMessage(`${tpl.name}模版的index清空`, 'warn');\n    } else {\n      instList.forEach((inst) => {\n        const expected = computeExpectedIndexValue(tpl, inst, idxField);\n        if (!inst.payload) inst.payload = {};\n        inst.payload.index = expected;\n      });\n    }\n  }\n\n  function applyImportedTemplate(tpl, fileName) {\n    enforceImportedIndexField(tpl, fileName);\n    const existingIdx = templates.findIndex((item) => item.name === tpl.name);\n    if (existingIdx >= 0) {\n      const existing = templates[existingIdx];\n      const existingIndexField = existing && existing.indexField ? existing.indexField : 'id';\n      const newIndexField = tpl.indexField || 'id';\n      if (newIndexField !== 'id' && existingIndexField !== newIndexField) {\n        tpl.indexField = 'id';\n        (tpl.instances || []).forEach((inst) => {\n          const expected = computeExpectedIndexValue(tpl, inst, 'id');\n          if (!inst.payload) inst.payload = {};\n          inst.payload.index = expected;\n        });\n        showMessage(`${tpl.name}模版的index清空`, 'warn');\n      }\n      tpl.__uid = existing.__uid;\n      tpl.__fromDisk = existing ? existing.__fromDisk : false;\n      templates[existingIdx] = tpl;\n      if (currentTemplateIndex === existingIdx) {\n        currentInstanceIndex = tpl.instances.length > 0 ? 0 : -1;\n      }\n      return existingIdx;\n    }\n    ensureTemplateUid(tpl);\n    tpl.__fromDisk = false;\n    templates.push(tpl);\n    return templates.length - 1;\n  }\n\n  async function importFromCsv() {\n    let fileHandles;\n    try {\n      fileHandles = await window.showOpenFilePicker({\n        multiple: true,\n        types: [\n          {\n            description: 'CSV 文件',\n            accept: { 'text/csv': ['.csv'] },\n          },\n        ],\n      });\n    } catch (err) {\n      if (err && err.name === 'AbortError') return;\n      console.error(err);\n      addLogEntry('error', `打开文件失败：${err && err.message ? err.message : err}`);\n      showMessage('打开 CSV 文件失败', 'warn');\n      return;\n    }\n    if (!fileHandles || fileHandles.length === 0) return;\n    if (exportSelectionMode) {\n      exitExportSelectionMode(true);\n    }\n    let successCount = 0;\n    let lastImportedName = null;\n    exportSelections.clear();\n    for (const handle of fileHandles) {\n      try {\n        const file = await handle.getFile();\n        const text = await file.text();\n        const rows = parseCsvText(text);\n        const tpl = buildTemplateFromCsv(rows, handle.name);\n        applyImportedTemplate(tpl, handle.name);\n        successCount += 1;\n        lastImportedName = tpl.name;\n        addLogEntry('info', `导入 CSV：${tpl.name}`);\n      } catch (err) {\n        console.error(err);\n        addLogEntry('error', `导入 CSV 失败（${handle.name}）：${err && err.message ? err.message : err}`, {\n          detail: err && err.stack ? err.stack : '',\n        });\n      }\n    }\n    if (successCount > 0) {\n      templates.sort((a, b) => a.name.localeCompare(b.name));\n      if (lastImportedName) {\n        const idx = templates.findIndex((tpl) => tpl.name === lastImportedName);\n        currentTemplateIndex = idx;\n        currentInstanceIndex = idx >= 0 && templates[idx].instances.length > 0 ? 0 : -1;\n      }\n      selectedTemplates.clear();\n      selectedInstances.clear();\n      selectedParams.clear();\n      if (currentTemplateIndex >= 0) {\n        selectedTemplates.add(currentTemplateIndex);\n        if (currentInstanceIndex >= 0) {\n          selectedInstances.add(currentInstanceIndex);\n        }\n      }\n      anchorTemplate = null;\n      anchorInstance = null;\n      anchorParam = null;\n      refreshTemplates();\n      refreshInstances();\n      refreshParams();\n      updateIndexTemplateOptions();\n      showMessage(`成功导入 ${successCount} 个 CSV`, 'info');\n    } else {\n      showMessage('CSV 导入失败，请查看日志', 'warn');\n    }\n  }\n\n  // 事件绑定\n\nreturn { updateExportButtons, beginExportSelection, exitExportSelectionMode, ensureTemplateUidForExport, getExportRecord, cleanupExportRecord, getTemplateExportCounts, getTemplateExportState, applyTemplateExportAction, handleTemplateExportCheckbox, isInstanceSelectedForExport, applyInstanceExportSelection, handleInstanceExportCheckbox, collectTemplatesForExport, sanitizeCsvFileName, encodeCsvValue, rowsToCsv, serializeValueForCsv, buildCsvRowsForTemplate, performExportCsv, parseCsvText, normalizeCsvRowLength, parseBoolCell, convertCsvValueByType, parseDataRefCell, buildTemplateFromCsv, applyImportedTemplate, importFromCsv };\n}";
  function createCsvServiceModule(context) {
    ensureContext4(context);
    const extraLocals = (() => {
      const paramTypeSelect = context.domRefs?.paramTypeSelect || document.getElementById("paramType");
      const builtinParamTypeOptions = Array.from(paramTypeSelect?.options || []).map((opt) => ({
        value: opt.value,
        label: opt.textContent || opt.value
      }));
      return {
        $: (id) => document.getElementById(id),
        RESERVED_INDEX_FIELDS: context.RESERVED_INDEX_FIELDS || /* @__PURE__ */ new Set(["template", "id", "name", "index"]),
        INDEXABLE_PARAM_TYPES: context.INDEXABLE_PARAM_TYPES || /* @__PURE__ */ new Set(["int", "long", "float", "string"]),
        builtinParamTypeOptions,
        builtinParamTypeSet: new Set(builtinParamTypeOptions.map((item) => item.value)),
        listElementTypeOptions: [],
        listElementTypeSet: /* @__PURE__ */ new Set()
      };
    })();
    const scope = createLegacyScope(context, DOM_ID_MAP, extraLocals);
    const factory = new Function("scope", FACTORY_SOURCE);
    return factory(scope);
  }

  // src/ui/system-panels.js
  function ensureContext5(context) {
    if (!context || typeof context !== "object") {
      throw new Error("createSystemPanelsModule requires a context object");
    }
    if (!context.appState || typeof context.appState !== "object") {
      throw new Error("createSystemPanelsModule requires appState");
    }
  }
  function createSystemPanelsModule(context) {
    ensureContext5(context);
    const {
      appState,
      domRefs = {},
      restoreTemplateFromTrash: restoreTemplateFromTrashHandler = async () => {
      }
    } = context;
    const {
      openTrashBtn = null,
      trashOverlay = null,
      trashListEl = null,
      messageBox = null,
      logOverlay = null,
      logListEl = null
    } = domRefs;
    let messageTimeoutId = null;
    function ensureOperationLogs() {
      if (!Array.isArray(appState.operationLogs)) {
        appState.operationLogs = [];
      }
      return appState.operationLogs;
    }
    function addLogEntry(level, message, extra) {
      const operationLogs = ensureOperationLogs();
      const entry = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        level: level || "info",
        message: String(message ?? ""),
        time: /* @__PURE__ */ new Date(),
        extra: extra || null
      };
      operationLogs.push(entry);
      if (operationLogs.length > 500) {
        operationLogs.splice(0, operationLogs.length - 500);
      }
      if (logOverlay && logOverlay.style.display !== "none") {
        renderLogs();
      }
    }
    function renderLogs() {
      if (!logListEl) return;
      const operationLogs = ensureOperationLogs();
      logListEl.innerHTML = "";
      if (operationLogs.length === 0) {
        const empty = document.createElement("div");
        empty.className = "log-empty";
        empty.textContent = "暂无日志";
        logListEl.appendChild(empty);
        return;
      }
      operationLogs.forEach((entry) => {
        const div = document.createElement("div");
        div.className = `log-entry ${entry.level}`;
        const timeSpan = document.createElement("span");
        timeSpan.className = "time";
        timeSpan.textContent = formatLogTimestamp(entry.time);
        div.appendChild(timeSpan);
        const msgSpan = document.createElement("span");
        msgSpan.textContent = entry.message;
        div.appendChild(msgSpan);
        if (entry.extra && entry.extra.detail) {
          const detail = document.createElement("div");
          detail.textContent = entry.extra.detail;
          detail.style.marginTop = "4px";
          detail.style.whiteSpace = "pre-wrap";
          div.appendChild(detail);
        }
        logListEl.appendChild(div);
      });
    }
    function formatLogTimestamp(date) {
      if (!(date instanceof Date)) return "";
      const pad = (n) => String(n).padStart(2, "0");
      return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }
    function openLogOverlay() {
      if (!logOverlay) return;
      renderLogs();
      logOverlay.style.display = "flex";
    }
    function closeLogOverlay() {
      if (!logOverlay) return;
      logOverlay.style.display = "none";
    }
    function clearLogEntries() {
      const operationLogs = ensureOperationLogs();
      operationLogs.length = 0;
      renderLogs();
    }
    function showMessage(msg, level = "info") {
      if (!messageBox) return;
      messageBox.textContent = msg;
      messageBox.style.display = "block";
      addLogEntry(level, msg);
      if (messageTimeoutId) {
        clearTimeout(messageTimeoutId);
      }
      messageTimeoutId = window.setTimeout(() => {
        messageBox.style.display = "none";
        messageTimeoutId = null;
      }, 2e3);
    }
    function updateTrashButtonLabel(count) {
      if (!openTrashBtn) return;
      const base = appState.trashButtonBaseLabel || "垃圾箱";
      const total = Number.isFinite(count) && count > 0 ? count : 0;
      openTrashBtn.textContent = total > 0 ? `${base} (${total})` : base;
      if (total > 0) {
        openTrashBtn.classList.add("has-items");
      } else {
        openTrashBtn.classList.remove("has-items");
      }
    }
    async function ensureTrashDirectory() {
      if (!appState.dataEntityHandle) {
        appState.trashHandle = null;
        return null;
      }
      if (appState.trashHandle) {
        return appState.trashHandle;
      }
      try {
        appState.trashHandle = await appState.dataEntityHandle.getDirectoryHandle(
          appState.TRASH_FOLDER_NAME,
          { create: true }
        );
      } catch (err) {
        console.warn("无法访问垃圾箱目录", err);
        appState.trashHandle = null;
      }
      return appState.trashHandle;
    }
    function formatTrashTimestampText(ms) {
      if (!ms) return "未知时间";
      const date = new Date(ms);
      if (Number.isNaN(date.getTime())) return "未知时间";
      const pad = (n) => String(n).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
        date.getHours()
      )}:${pad(date.getMinutes())}`;
    }
    function formatFileSize(bytes) {
      if (typeof bytes !== "number" || Number.isNaN(bytes) || bytes <= 0) return "0 B";
      if (bytes < 1024) return `${bytes} B`;
      const units = ["KB", "MB", "GB"];
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
          if (entry.kind === "file" && entry.name.toLowerCase().endsWith(".json")) {
            try {
              const file = await entry.getFile();
              items.push({
                templateName: entry.name.replace(/\.json$/i, ""),
                fileName: entry.name,
                lastModified: file.lastModified,
                size: file.size
              });
            } catch (err) {
              console.warn("读取垃圾箱文件失败", err);
            }
          }
        }
      } catch (err) {
        console.warn("遍历垃圾箱目录失败", err);
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
      const items = trashListEl.querySelectorAll(".trash-item");
      items.forEach((item) => {
        const name = item.dataset.name || "";
        item.classList.toggle(
          "selected",
          Boolean(appState.trashSelectedTemplateName) && name === appState.trashSelectedTemplateName
        );
      });
    }
    function setTrashSelection(name) {
      appState.trashSelectedTemplateName = name || null;
      updateTrashSelectionUI();
    }
    function renderTrashEntries(entries) {
      if (!trashListEl) return;
      trashListEl.innerHTML = "";
      if (!Array.isArray(entries) || entries.length === 0) {
        const emptyEl = document.createElement("div");
        emptyEl.className = "trash-empty";
        emptyEl.textContent = "垃圾箱为空";
        trashListEl.appendChild(emptyEl);
        appState.trashSelectedTemplateName = null;
        return;
      }
      if (!entries.some((entry) => entry.templateName === appState.trashSelectedTemplateName)) {
        appState.trashSelectedTemplateName = entries[0].templateName;
      }
      const list = document.createElement("ul");
      list.className = "trash-list";
      entries.forEach((entry) => {
        const li = document.createElement("li");
        li.className = "trash-item";
        li.dataset.name = entry.templateName;
        if (entry.templateName === appState.trashSelectedTemplateName) {
          li.classList.add("selected");
        }
        li.addEventListener("click", () => {
          setTrashSelection(entry.templateName);
        });
        const info = document.createElement("div");
        info.className = "trash-info";
        const nameSpan = document.createElement("span");
        nameSpan.className = "trash-name";
        nameSpan.textContent = entry.templateName;
        info.appendChild(nameSpan);
        const metaSpan = document.createElement("span");
        metaSpan.className = "trash-meta";
        metaSpan.textContent = `${formatTrashTimestampText(entry.lastModified)} · ${formatFileSize(
          entry.size
        )}`;
        info.appendChild(metaSpan);
        const actions = document.createElement("div");
        actions.className = "trash-item-actions";
        const restoreBtn = document.createElement("button");
        restoreBtn.textContent = "恢复";
        restoreBtn.addEventListener("click", (evt) => {
          evt.stopPropagation();
          void restoreTemplateFromTrash(entry.templateName);
        });
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "删除";
        deleteBtn.addEventListener("click", (evt) => {
          evt.stopPropagation();
          void deleteTrashEntry(entry.templateName);
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
      if (!trashOverlay || trashOverlay.style.display === "none") return;
      const entries = await refreshTrashButtonState();
      renderTrashEntries(entries);
      updateTrashSelectionUI();
    }
    async function openTrashOverlayPanel() {
      if (!trashOverlay) return;
      if (!appState.directoryHandle || !appState.dataEntityHandle) {
        showMessage("请先选择工作目录", "warn");
        return;
      }
      const entries = await refreshTrashButtonState();
      renderTrashEntries(entries);
      trashOverlay.style.display = "flex";
      trashOverlay.setAttribute("aria-hidden", "false");
      try {
        trashOverlay.focus({ preventScroll: true });
      } catch (_err) {
      }
    }
    function closeTrashOverlayPanel() {
      if (!trashOverlay) return;
      trashOverlay.style.display = "none";
      trashOverlay.setAttribute("aria-hidden", "true");
      appState.trashSelectedTemplateName = null;
    }
    async function deleteTrashEntry(templateName) {
      if (!templateName) return;
      const handle = await ensureTrashDirectory();
      if (!handle || typeof handle.removeEntry !== "function") {
        showMessage("垃圾箱目录不可用", "warn");
        return;
      }
      const fileName = `${templateName}.json`;
      try {
        await handle.removeEntry(fileName);
        if (appState.trashSelectedTemplateName === templateName) {
          appState.trashSelectedTemplateName = null;
        }
        showMessage(`已从垃圾箱删除：${templateName}`);
      } catch (err) {
        if (err && err.name === "NotFoundError") {
          showMessage("垃圾箱中未找到该模板", "warn");
        } else {
          console.warn("删除垃圾箱文件失败", err);
          showMessage("删除失败，请检查权限", "warn");
        }
      }
      await refreshTrashOverlayContents();
    }
    function deleteSelectedTrashEntry() {
      if (!appState.trashSelectedTemplateName) return;
      void deleteTrashEntry(appState.trashSelectedTemplateName);
    }
    async function emptyTrashFolder() {
      const handle = await ensureTrashDirectory();
      if (!handle || typeof handle.removeEntry !== "function") {
        showMessage("垃圾箱目录不可用", "warn");
        return;
      }
      const targets = [];
      try {
        for await (const entry of handle.values()) {
          if (entry.kind === "file" && entry.name.toLowerCase().endsWith(".json")) {
            targets.push(entry.name);
          }
        }
      } catch (err) {
        console.warn("遍历垃圾箱目录失败", err);
        showMessage("清空垃圾箱失败", "warn");
        return;
      }
      try {
        for (const name of targets) {
          await handle.removeEntry(name);
        }
        appState.trashSelectedTemplateName = null;
        showMessage("垃圾箱已清空");
      } catch (err) {
        console.warn("清空垃圾箱失败", err);
        showMessage("清空垃圾箱失败，请检查权限", "warn");
      }
      await refreshTrashOverlayContents();
    }
    async function restoreTemplateFromTrash(templateName) {
      return restoreTemplateFromTrashHandler(templateName);
    }
    return {
      addLogEntry,
      renderLogs,
      formatLogTimestamp,
      openLogOverlay,
      closeLogOverlay,
      clearLogEntries,
      showMessage,
      updateTrashButtonLabel,
      ensureTrashDirectory,
      formatTrashTimestampText,
      formatFileSize,
      listTrashEntries,
      updateTrashSelectionUI,
      setTrashSelection,
      renderTrashEntries,
      refreshTrashButtonState,
      refreshTrashOverlayContents,
      openTrashOverlayPanel,
      closeTrashOverlayPanel,
      deleteTrashEntry,
      deleteSelectedTrashEntry,
      emptyTrashFolder,
      restoreTemplateFromTrash
    };
  }

  // src/ui/interaction.js
  function ensureContext6(context) {
    if (!context || typeof context !== "object") {
      throw new Error("InteractionModule requires a context object");
    }
    if (!context.appState || typeof context.appState !== "object") {
      throw new Error("InteractionModule requires appState");
    }
  }
  function resolveDomRefs2(domRefs, domMap) {
    const resolved = { ...domRefs || {} };
    Object.entries(domMap || {}).forEach(([name, id]) => {
      if (!resolved[name] && id) {
        resolved[name] = document.getElementById(id);
      }
    });
    return resolved;
  }
  function createLegacyScope2(context, domMap, extraLocals = {}) {
    const { appState, domRefs = {}, ...helpers } = context;
    const resolvedDomRefs = resolveDomRefs2(domRefs, domMap);
    const localState = {
      ...helpers,
      ...resolvedDomRefs,
      ...extraLocals,
      appState,
      window,
      document
    };
    return new Proxy(/* @__PURE__ */ Object.create(null), {
      has() {
        return true;
      },
      get(_target, prop) {
        if (prop === Symbol.unscopables) return void 0;
        if (Object.prototype.hasOwnProperty.call(localState, prop)) {
          return localState[prop];
        }
        if (appState && Object.prototype.hasOwnProperty.call(appState, prop)) {
          return appState[prop];
        }
        const shared = globalThis.__legacyMainContext;
        if (shared && prop in shared) {
          return shared[prop];
        }
        return globalThis[prop];
      },
      set(_target, prop, value) {
        if (appState && Object.prototype.hasOwnProperty.call(appState, prop)) {
          appState[prop] = value;
          return true;
        }
        const shared = globalThis.__legacyMainContext;
        if (shared && prop in shared) {
          shared[prop] = value;
          return true;
        }
        localState[prop] = value;
        return true;
      }
    });
  }
  var DOM_ID_MAP2 = {
    templateListEl: "templateList",
    instanceListEl: "instanceList",
    paramListEl: "paramList",
    templateNameInput: "templateName",
    instanceNameInput: "instanceName"
  };
  var FACTORY_SOURCE2 = "with (scope) {\n  function handleCopy() {\n    if (lastSelectedCategory === 'param') {\n      copyParams();\n    } else if (lastSelectedCategory === 'instance') {\n      copyInstance();\n    } else if (lastSelectedCategory === 'template') {\n      copyTemplates();\n    }\n  }\n  function handlePaste() {\n    if (!copyBuffer) return;\n    if (copyBuffer.type === 'param') {\n      const tpl = templates[currentTemplateIndex];\n      if (tpl && isEnumTemplate(tpl)) {\n        // enum ʹ��ʵ���ֲ�ճ��\n        if (currentTemplateIndex < 0 || currentInstanceIndex < 0) return;\n        const inst = templates[currentTemplateIndex].instances[currentInstanceIndex];\n        if (!inst.payload) inst.payload = {};\n        (copyBuffer.items || []).forEach((obj) => {\n          const exist = Object.keys(inst.payload).filter(k=>/^\\d+$/.test(k)).map(k=>parseInt(k,10));\n          let n = 0; while (exist.includes(n)) n++;\n          inst.payload[String(n)] = obj && Object.prototype.hasOwnProperty.call(obj,'value') ? obj.value : '';\n        });\n        refreshParams();\n        showMessage(`��ճ�� ${copyBuffer.items.length} ������`);\n      } else {\n        pasteParams();\n      }\n    } else if (copyBuffer.type === 'instance') {\n      pasteInstance();\n    } else if (copyBuffer.type === 'template') {\n      pasteTemplates();\n    }\n  }\n  function handleDelete() {\n    if (lastSelectedCategory === 'param') {\n      deleteParams();\n    } else if (lastSelectedCategory === 'instance') {\n      deleteInstance();\n    } else if (lastSelectedCategory === 'template') {\n      deleteTemplates();\n    }\n  }\n\n  function copyTemplates() {\n    if (templates.length === 0) return;\n    let indices = Array.from(selectedTemplates);\n    if (indices.length === 0 && currentTemplateIndex >= 0) indices = [currentTemplateIndex];\n    if (indices.length === 0) {\n      alert('��ѡ��Ҫ���Ƶ�ģ��');\n      return;\n    }\n    const items = indices.map((idx) => JSON.parse(JSON.stringify(templates[idx])));\n    items.forEach((tpl) => {\n      if (tpl && tpl.__uid) delete tpl.__uid;\n    });\n    copyBuffer = { type: 'template', items };\n    showMessage(`�Ѹ��� ${items.length} ��ģ��`);\n  }\n\n  /**\n   * ճ��ģ��\n   */\n  function pasteTemplates() {\n    if (!copyBuffer || copyBuffer.type !== 'template' || !copyBuffer.items) return;\n    copyBuffer.items.forEach((srcTpl) => {\n      let newName = srcTpl.name;\n      // ��������\n      while (templates.some((t) => t.name === newName)) {\n        newName = `${newName}_����`;\n      }\n      const newTpl = JSON.parse(JSON.stringify(srcTpl));\n      newTpl.name = newName;\n      delete newTpl.__uid;\n      // ����ʵ���е� template �ֶκ� id\n      newTpl.instances.forEach((inst, idx) => {\n        inst.id = idx;\n        inst.name = `${inst.name}`;\n        inst.payload.template = newName;\n        inst.payload.id = idx;\n        inst.payload.name = inst.name;\n      });\n      ensureTemplateUid(newTpl);\n      newTpl.__fromDisk = false;\n      templates.push(newTpl);\n    });\n    refreshTemplates();\n    showMessage(`��ճ�� ${copyBuffer.items.length} ��ģ��`);\n  }\n\n  /**\n   * ɾ��ģ��\n   */\n  function deleteTemplates() {\n    if (templates.length === 0) return;\n    let indices = Array.from(selectedTemplates);\n    if (indices.length === 0 && currentTemplateIndex >= 0) indices = [currentTemplateIndex];\n    if (indices.length === 0) {\n      alert('��ѡ��Ҫɾ����ģ��');\n      return;\n    }\n    indices.sort((a, b) => b - a);\n    indices.forEach((idx) => {\n      const tpl = templates[idx];\n      if (tpl && tpl.__uid) {\n        lastSavedStructureSnapshot.delete(tpl.__uid);\n      }\n      if (tpl && tpl.__fromDisk) {\n        if (!templates.some((t, currentIdx) => currentIdx !== idx && t && t.name === tpl.name)) {\n          pendingTemplateDeletions.set(tpl.name, { name: tpl.name, deletedAt: Date.now() });\n        }\n      }\n      templates.splice(idx, 1);\n    });\n    // ���µ�ǰģ������\n    if (templates.length === 0) {\n      currentTemplateIndex = -1;\n      currentInstanceIndex = -1;\n    } else {\n      currentTemplateIndex = 0;\n      currentInstanceIndex = templates[0].instances.length > 0 ? 0 : -1;\n    }\n    selectedTemplates.clear();\n    selectedInstances.clear();\n    selectedParams.clear();\n    editingParamIndex = -1;\n    refreshTemplates();\n    refreshInstances();\n    refreshParams();\n    showMessage(`��ɾ�� ${indices.length} ��ģ��`);\n  }\n\n  /**\n   * ���Ʋ���\n   */\n  function copyParams() {\n    if (currentTemplateIndex < 0) return;\n    const tpl = templates[currentTemplateIndex];\n    let indices = Array.from(selectedParams);\n    if (indices.length === 0) {\n      alert('��ѡ��Ҫ���ƵĲ���');\n      return;\n    }\n    if (isEnumTemplate(tpl)) {\n      if (currentInstanceIndex < 0) { alert('����ѡ��һ��ʵ��'); return; }\n      const inst = tpl.instances[currentInstanceIndex];\n      const keys = getEnumParamKeysForInstance(tpl, inst);\n      const items = indices.map((idx) => ({ value: inst.payload[keys[idx]] }));\n      copyBuffer = { type: 'param', items, enumMode: true };\n    } else {\n      // ����������壬������ÿ������������ʵ���е�ֵ\n      const items = indices.map((idx) => {\n        const param = JSON.parse(JSON.stringify(tpl.parameters[idx]));\n        const values = tpl.instances.map((inst) => inst.payload[param.name]);\n        return { param, values };\n      });\n      copyBuffer = { type: 'param', items };\n    }\n    showMessage(`�Ѹ��� ${items.length} ������`);\n  }\n\n  /**\n   * ճ������\n   */\n  function pasteParams() {\n    if (currentTemplateIndex < 0) return;\n    if (!copyBuffer || copyBuffer.type !== 'param' || !copyBuffer.items) return;\n    const tpl = templates[currentTemplateIndex];\n    copyBuffer.items.forEach((obj) => {\n      let newName = isEnumTemplate(tpl) ? String(tpl.parameters.length) : obj.param.name;\n      while (tpl.parameters.some((p) => p.name === newName)) {\n        newName = `${newName}_����`;\n      }\n      const newParam = JSON.parse(JSON.stringify(obj.param));\n      newParam.name = newName;\n      if (isEnumTemplate(tpl)) {\n        newParam.type = 'string';\n        delete newParam.parameterIndexes;\n      }\n      tpl.parameters.push(newParam);\n      // Ϊÿ��ʵ������ֵ\n      tpl.instances.forEach((inst, idx) => {\n        inst.payload[newName] = obj.values[idx];\n      });\n    });\n    if (isEnumTemplate(tpl)) {\n      ensureEnumParamNaming(tpl);\n    }\n    refreshParams();\n    showMessage(`��ճ�� ${copyBuffer.items.length} ������`);\n  }\n\n  /**\n   * ɾ������\n   */\n  function deleteParams() {\n    if (currentTemplateIndex < 0) return;\n    const tpl = templates[currentTemplateIndex];\n    let indices = Array.from(selectedParams);\n    if (indices.length === 0) {\n      alert('��ѡ��Ҫɾ���Ĳ���');\n      return;\n    }\n    indices.sort((a, b) => b - a);\n    if (isEnumTemplate(tpl)) {\n      if (currentInstanceIndex < 0) return;\n      const inst = tpl.instances[currentInstanceIndex];\n      const keys = Object.keys(inst.payload || {}).filter(k=>/^\\d+$/.test(k)).map(k=>parseInt(k,10)).sort((a,b)=>a-b).map(n=>String(n));\n      indices.forEach((idx) => {\n        const key = keys[idx];\n        if (key !== undefined && inst.payload) delete inst.payload[key];\n      });\n    } else {\n      indices.forEach((idx) => {\n        const param = tpl.parameters[idx];\n        tpl.parameters.splice(idx, 1);\n        tpl.instances.forEach((inst) => {\n          delete inst.payload[param.name];\n        });\n      });\n    }\n    selectedParams.clear();\n    editingParamIndex = -1;\n    refreshParams();\n\n  const paramHistory = [];\n  function pushParamHistory() {\n    if (currentTemplateIndex < 0 || currentInstanceIndex < 0 || editingParamIndex < 0) return;\n    const tpl = templates[currentTemplateIndex];\n    const param = tpl.parameters[editingParamIndex];\n    if (!param) return;\n    const snapshot = {\n      templateName: tpl.name,\n      paramName: param.name,\n      instanceId: templates[currentTemplateIndex].instances[currentInstanceIndex]?.id ?? currentInstanceIndex,\n    };\n    // 若与栈顶相同则不重复压栈\n    const top = paramHistory[paramHistory.length - 1];\n    if (!top || top.templateName !== snapshot.templateName || top.paramName !== snapshot.paramName || top.instanceId !== snapshot.instanceId) {\n      paramHistory.push(snapshot);\n    }\n  }\n  function navigateToParamSnapshot(snap) {\n    if (!snap) return false;\n    const tIdx = templates.findIndex(t => t.name === snap.templateName);\n    if (tIdx < 0) return false;\n    currentTemplateIndex = tIdx;\n    selectedTemplates.clear();\n    selectedTemplates.add(tIdx);\n    const instIdx = templates[tIdx].instances.findIndex(i => (i.id === snap.instanceId));\n    currentInstanceIndex = instIdx >= 0 ? instIdx : (templates[tIdx].instances.length > 0 ? 0 : -1);\n    selectedInstances.clear();\n    if (currentInstanceIndex >= 0) selectedInstances.add(currentInstanceIndex);\n    const pIdx = templates[tIdx].parameters.findIndex(p => p.name === snap.paramName);\n    selectedParams.clear();\n    if (pIdx >= 0) {\n      selectedParams.add(pIdx);\n      editingParamIndex = pIdx;\n    } else {\n      editingParamIndex = -1;\n    }\n    templateNameInput.value = templates[currentTemplateIndex].name;\n    instanceNameInput.value = currentInstanceIndex >= 0 ? templates[currentTemplateIndex].instances[currentInstanceIndex].name : '';\n    // 确保编辑区域与所选参数同步（或清空）\n    showSelectedParamDetails();\n    refreshTemplates();\n    refreshInstances();\n    refreshParams();\n    updateIndexTemplateOptions();\n    lastSelectedCategory = 'param';\n    return true;\n  }\n\n  // 实例列表拖拽选择\n  // 通用拖拽多选逻辑，支持模板、实例、参数\n  function setupDragSelection(listEl, type) {\n    listEl.addEventListener('mousedown', (e) => {\n      if (!e.shiftKey) return;\n      const selector = type === 'param' ? '.param-item' : 'li';\n      const itemEl = e.target.closest(selector);\n      if (!itemEl) return;\n      const items = Array.from(listEl.querySelectorAll(selector));\n      const idx = items.indexOf(itemEl);\n      if (idx < 0) return;\n      dragSelect.isDragging = false; // 初始为非拖拽，仅当移动到其他项时才置为 true\n      dragSelect.type = type;\n      dragSelect.indices.clear();\n      dragSelect.startIndex = idx;\n    });\n    listEl.addEventListener('mouseover', (e) => {\n      if (dragSelect.type !== type) return;\n      // 仅在按住鼠标左键进行移动时才认为是拖拽\n      if ((e.buttons & 1) !== 1) return;\n      const selector = type === 'param' ? '.param-item' : 'li';\n      const items = Array.from(listEl.querySelectorAll(selector));\n      const itemEl = e.target.closest(selector);\n      if (!itemEl) return;\n      const idx = items.indexOf(itemEl);\n      if (idx < 0) return;\n      if (dragSelect.startIndex === undefined) dragSelect.startIndex = idx;\n      if (idx !== dragSelect.startIndex) {\n        dragSelect.isDragging = true;\n        dragSelect.indices.clear();\n        // 清除旧的 selecting 临时样式\n        listEl.querySelectorAll('.selecting').forEach((el) => el.classList.remove('selecting'));\n        const start = Math.min(dragSelect.startIndex, idx);\n        const end = Math.max(dragSelect.startIndex, idx);\n        for (let i = start; i <= end; i++) {\n          dragSelect.indices.add(i);\n          const el = items[i];\n          if (el) el.classList.add('selecting');\n        }\n      }\n    });\n  }\n\n\n  // 点击空白区域取消选中\n  function setupClearOnBlank(listEl, type) {\n    listEl.addEventListener('click', (e) => {\n      const itemSelector = type === 'param' ? '.param-item' : 'li';\n      if (!e.target.closest(itemSelector)) {\n        if (type === 'template') {\n          selectedTemplates.clear();\n          currentTemplateIndex = -1;\n          currentInstanceIndex = -1;\n          templateNameInput.value = '';\n          instanceNameInput.value = '';\n          selectedInstances.clear();\n          selectedParams.clear();\n          editingParamIndex = -1;\n          // 清除锚点\n          anchorTemplate = null;\n          anchorInstance = null;\n          anchorParam = null;\n          refreshTemplates();\n          refreshInstances();\n          refreshParams();\n        } else if (type === 'instance') {\n          selectedInstances.clear();\n          currentInstanceIndex = -1;\n          instanceNameInput.value = '';\n          selectedParams.clear();\n          editingParamIndex = -1;\n          // 清除实例和参数锚点\n          anchorInstance = null;\n          anchorParam = null;\n          refreshInstances();\n          refreshParams();\n        } else if (type === 'param') {\n          selectedParams.clear();\n          editingParamIndex = -1;\n          showSelectedParamDetails();\n          refreshParams();\n          // 清除参数锚点\n          anchorParam = null;\n        }\n        lastSelectedCategory = type;\n      }\n    });\n  }\n\n  }\n\n  function filterList(listEl, term, isParamList = false) {\n    const lower = term.trim().toLowerCase();\n    const items = listEl.children;\n    let visibleCount = 0;\n    let lastVisibleIndex = -1;\n    for (let i = 0; i < items.length; i++) {\n      const el = items[i];\n      let text;\n      if (isParamList) {\n        // 参数列表，标签在第一个 label 或 span\n        const label = el.querySelector('label');\n        text = label ? label.textContent : '';\n      } else {\n        text = el.textContent;\n      }\n      if (!lower || (text && text.toLowerCase().includes(lower))) {\n        el.style.display = '';\n        visibleCount++;\n        lastVisibleIndex = i;\n      } else {\n        el.style.display = 'none';\n      }\n    }\n    // 仅在存在搜索关键字时，且只有一个匹配项时自动选择\n    if (visibleCount === 1 && !isParamList && lower.length > 0) {\n      if (listEl === templateListEl) {\n        const li = listEl.children[lastVisibleIndex];\n        li.click();\n      } else if (listEl === instanceListEl) {\n        const li = listEl.children[lastVisibleIndex];\n        li.click();\n      }\n    }\n  }\n\nreturn { pushParamHistory, navigateToParamSnapshot, setupDragSelection, setupClearOnBlank, handleCopy, handlePaste, handleDelete, copyTemplates, pasteTemplates, deleteTemplates, copyParams, pasteParams, deleteParams, filterList };\n}";
  function createInteractionModule(context) {
    ensureContext6(context);
    const extraLocals = (() => ({
      $: (id) => document.getElementById(id),
      dragSelect: context.appState.dragSelect || { isDragging: false, type: null, indices: /* @__PURE__ */ new Set(), startIndex: void 0 }
    }))();
    const scope = createLegacyScope2(context, DOM_ID_MAP2, extraLocals);
    const factory = new Function("scope", FACTORY_SOURCE2);
    return factory(scope);
  }

  // src/ui/panels.js
  function ensureContext7(context) {
    if (!context || typeof context !== "object") {
      throw new Error("PanelsModule requires a context object");
    }
    if (!context.appState || typeof context.appState !== "object") {
      throw new Error("PanelsModule requires appState");
    }
  }
  function resolveDomRefs3(domRefs, domMap) {
    const resolved = { ...domRefs || {} };
    Object.entries(domMap || {}).forEach(([name, id]) => {
      if (!resolved[name] && id) {
        resolved[name] = document.getElementById(id);
      }
    });
    return resolved;
  }
  function createLegacyScope3(context, domMap, extraLocals = {}) {
    const { appState, domRefs = {}, ...helpers } = context;
    const resolvedDomRefs = resolveDomRefs3(domRefs, domMap);
    const localState = {
      ...helpers,
      ...resolvedDomRefs,
      ...extraLocals,
      appState,
      window,
      document
    };
    return new Proxy(/* @__PURE__ */ Object.create(null), {
      has() {
        return true;
      },
      get(_target, prop) {
        if (prop === Symbol.unscopables) return void 0;
        if (Object.prototype.hasOwnProperty.call(localState, prop)) {
          return localState[prop];
        }
        if (appState && Object.prototype.hasOwnProperty.call(appState, prop)) {
          return appState[prop];
        }
        const shared = globalThis.__legacyMainContext;
        if (shared && prop in shared) {
          return shared[prop];
        }
        return globalThis[prop];
      },
      set(_target, prop, value) {
        if (appState && Object.prototype.hasOwnProperty.call(appState, prop)) {
          appState[prop] = value;
          return true;
        }
        const shared = globalThis.__legacyMainContext;
        if (shared && prop in shared) {
          shared[prop] = value;
          return true;
        }
        localState[prop] = value;
        return true;
      }
    });
  }
  var DOM_ID_MAP3 = {
    "templateNameInput": "templateName",
    "instanceNameInput": "instanceName",
    "instanceIdInput": "instanceId",
    "paramNameInput": "paramName",
    "paramTypeSelect": "paramType",
    "listElementTypeSelect": "listElementType",
    "indexTemplateSelect": "indexTemplate",
    "indexParamSelect": "indexParam",
    "templateListEl": "templateList",
    "instanceListEl": "instanceList",
    "paramListEl": "paramList",
    "searchTemplatesInput": "searchTemplates",
    "searchInstancesInput": "searchInstances",
    "searchParamsInput": "searchParams",
    "toggleCompareValuesBtn": "toggleCompareValues",
    "sheetModePanel": "sheetMode",
    "sheetTemplateListEl": "sheetTemplateList",
    "sheetInstanceTabsEl": "sheetInstanceTabs",
    "sheetEmptyStateEl": "sheetEmptyState",
    "luckysheetContainer": "luckysheet"
  };
  var FACTORY_SOURCE3 = "with (scope) {\n  function getValueByFieldForInstance(tpl, inst, fieldName) {\n    if (!inst || !inst.payload) return '';\n    if (fieldName === 'template' || fieldName === 'id' || fieldName === 'name') return inst.payload[fieldName];\n    return inst.payload[fieldName];\n  }\n\n  /**\n   * ˢ��ģ���б�\n   */\n  function refreshTemplates() {\n    templateListEl.innerHTML = \"\";\n    templates.forEach((tpl, idx) => {\n      const li = document.createElement(\"li\");\n      li.setAttribute('draggable','true');\n      li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(idx)); });\n      li.addEventListener('dragover', (e) => { e.preventDefault(); });\n      li.addEventListener('drop', (e) => {\n        e.preventDefault();\n        const from = parseInt(e.dataTransfer.getData('text/plain'));\n        const to = idx;\n        if (isNaN(from) || from === to) return;\n        const it = templates.splice(from,1)[0];\n        templates.splice(to,0,it);\n        if (currentTemplateIndex === from) currentTemplateIndex = to;\n        else if (from < currentTemplateIndex && to >= currentTemplateIndex) currentTemplateIndex--;\n        else if (from > currentTemplateIndex && to <= currentTemplateIndex) currentTemplateIndex++;\n        refreshTemplates();\n      });\n      // ����ѡ��״̬���ظ� ID ��ʾ\n      const tooltipParts = [];\n      const duplicateIdInfo = collectDuplicateIdInfo(tpl);\n      const duplicateIdKeys = Array.from(duplicateIdInfo.duplicates.keys());\n      if (duplicateIdKeys.length > 0) {\n        li.classList.add('duplicate-id');\n        const preview = duplicateIdKeys\n          .map((key) => (key === '' ? '���գ�' : key))\n          .slice(0, 3)\n          .join(', ');\n        const suffix = duplicateIdKeys.length > 3 ? '��' : '';\n        tooltipParts.push(`�����ظ� ID��${preview}${suffix}`);\n      } else {\n        li.classList.remove('duplicate-id');\n      }\n      const hasInvalidReferences = doesTemplateHaveInvalidIndexReferences(tpl);\n      const listValidation = collectListTypeViolations(tpl);\n      const hasListErrors = listValidation.invalidInstances.size > 0;\n      li.classList.toggle('invalid-reference', hasInvalidReferences || hasListErrors);\n      if (hasInvalidReferences) {\n        tooltipParts.push('������Ч����������');\n      }\n      if (hasListErrors) {\n        tooltipParts.push('������Ч���б�����');\n      }\n      if (tooltipParts.length > 0) {\n        li.title = tooltipParts.join('\\n');\n      } else {\n        li.removeAttribute('title');\n      }\n      // ����ѡ��״̬\n      if (selectedTemplates.has(idx)) li.classList.add('active');\n      let exportState = 'none';\n      if (exportSelectionMode) {\n        exportState = getTemplateExportState(tpl);\n        if (exportState === 'all') li.classList.add('export-all');\n        if (exportState === 'partial') li.classList.add('export-partial');\n        const checkbox = document.createElement('input');\n        checkbox.type = 'checkbox';\n        checkbox.checked = exportState === 'all';\n        checkbox.indeterminate = exportState === 'partial';\n        checkbox.addEventListener('click', (e) => {\n          e.stopPropagation();\n          handleTemplateExportCheckbox(idx, exportState, e);\n        });\n        li.appendChild(checkbox);\n      }\n      const nameSpan = document.createElement('span');\n      nameSpan.textContent = tpl.name;\n      setInvalidNameVisual(nameSpan, isTemplateNameInvalid(tpl.name));\n      li.appendChild(nameSpan);\n      if (exportSelectionMode) {\n        const counts = getTemplateExportCounts(tpl);\n        const countSpan = document.createElement('span');\n        countSpan.className = 'export-count';\n        countSpan.textContent = `${counts.selected}/${counts.total}`;\n        li.appendChild(countSpan);\n      }\n      li.addEventListener('click', (e) => {\n        // Ctrl+������л�����ѡ��״̬������ʧ����ѡ��\n        if (e.ctrlKey) {\n          if (selectedTemplates.has(idx)) {\n            selectedTemplates.delete(idx);\n          } else {\n            selectedTemplates.add(idx);\n          }\n          const arr = Array.from(selectedTemplates).sort((a,b)=>a-b);\n          if (arr.length > 0) {\n            currentTemplateIndex = arr[arr.length - 1];\n            templateNameInput.value = templates[currentTemplateIndex].name;\n            anchorTemplate = currentTemplateIndex;\n          } else {\n            currentTemplateIndex = -1;\n            templateNameInput.value = '';\n            instanceNameInput.value = '';\n            anchorTemplate = null;\n          }\n        // Shift+�����Χѡ��\n        } else if (e.shiftKey) {\n          // ���δ����ê�㣬���Ե�ǰѡ��ģ�������Ϊê��\n          if (anchorTemplate === null) {\n            anchorTemplate = currentTemplateIndex >= 0 ? currentTemplateIndex : idx;\n          }\n          const start = Math.min(anchorTemplate, idx);\n          const end = Math.max(anchorTemplate, idx);\n          selectedTemplates.clear();\n          for (let i = start; i <= end; i++) {\n            selectedTemplates.add(i);\n          }\n          currentTemplateIndex = idx;\n          templateNameInput.value = tpl.name;\n          // ����ê��Ϊ��ǰ\n          anchorTemplate = idx;\n        } else {\n          // ������ѡ�е�Ψһģ�� => ȡ��ѡ��\n          if (selectedTemplates.has(idx) && selectedTemplates.size === 1) {\n            selectedTemplates.clear();\n            currentTemplateIndex = -1;\n            currentInstanceIndex = -1;\n            templateNameInput.value = '';\n            instanceNameInput.value = '';\n            selectedInstances.clear();\n            selectedParams.clear();\n            editingParamIndex = -1;\n            // ���ê��\n            anchorTemplate = null;\n            anchorInstance = null;\n            anchorParam = null;\n            refreshTemplates();\n            refreshInstances();\n            refreshParams();\n            updateIndexTemplateOptions();\n            lastSelectedCategory = 'template';\n            e.stopPropagation();\n            return;\n          }\n          // ��ѡ\n          selectedTemplates.clear();\n          selectedTemplates.add(idx);\n          currentTemplateIndex = idx;\n          templateNameInput.value = tpl.name;\n          // ����ê��\n          anchorTemplate = idx;\n        }\n        // �л�ģ��ʱ������ʵ���Ͳ���ѡ��\n        currentInstanceIndex = currentTemplateIndex >= 0 && templates[currentTemplateIndex].instances.length > 0 ? 0 : -1;\n        selectedInstances.clear();\n        selectedParams.clear();\n        editingParamIndex = -1;\n        // ���ʵ���Ͳ���ê��\n        anchorInstance = null;\n        anchorParam = null;\n        refreshTemplates();\n        refreshInstances();\n        refreshParams();\n        updateIndexTemplateOptions();\n        lastSelectedCategory = 'template';\n        e.stopPropagation();\n      });\n      templateListEl.appendChild(li);\n    });\n    if (currentTemplateIndex >= 0) {\n      templateNameInput.value = templates[currentTemplateIndex].name;\n    } else {\n      templateNameInput.value = \"\";\n    }\n    updateTemplateNameInputValidity();\n    updateInstanceNameInputValidity();\n    refreshInstances();\n    refreshParams();\n    // Ӧ��ģ����������\n    filterList(templateListEl, searchTemplatesInput.value);\n    if (isSheetModeActive()) {\n      updateSheetTemplateNav();\n      updateSheetInstanceTabs();\n    }\n  }\n\n  /**\n   * ��ȡѡ�е�ʵ������\n   */\n  function getSelectedInstanceIndices() {\n    return Array.from(selectedInstances).sort((a, b) => a - b);\n  }\n\n  function updateCompareButtonState() {\n    if (!toggleCompareValuesBtn) return;\n    const isActive = !!compareValueState.active;\n    toggleCompareValuesBtn.classList.toggle('active', isActive);\n    toggleCompareValuesBtn.setAttribute('aria-pressed', isActive ? 'true' : 'false');\n  }\n\n  function deactivateCompareValues(options = {}) {\n    const force = Boolean(options.force);\n    if (!compareValueState.active && !force) return;\n    compareValueState = createDefaultCompareValueState();\n    updateCompareButtonState();\n  }\n\n  function buildCompareValueSnapshot() {\n    if (currentTemplateIndex < 0) {\n      showMessage('����ѡ��ģ��', 'warn');\n      return null;\n    }\n    const tpl = templates[currentTemplateIndex];\n    if (!tpl) return null;\n    ensureTemplateUid(tpl);\n    if (isEnumTemplate(tpl)) {\n      if (currentInstanceIndex < 0) {\n        showMessage('����ѡ��һ��ʵ��', 'warn');\n        return null;\n      }\n      const indices = Array.from(selectedParams).sort((a, b) => a - b);\n      if (indices.length === 0) {\n        showMessage('��ѡ��Ҫ�ԱȵĲ���', 'warn');\n        return null;\n      }\n      const inst = tpl.instances[currentInstanceIndex];\n      if (!inst) return null;\n      const keys = getEnumParamKeysForInstance(tpl, inst);\n      const selectedKeys = indices\n        .map((idx) => keys[idx])\n        .filter((key) => key != null);\n      if (selectedKeys.length === 0) {\n        showMessage('δ�ҵ��ɶԱȵĲ���', 'warn');\n        return null;\n      }\n      return {\n        active: true,\n        templateUid: tpl.__uid,\n        type: 'enum',\n        params: [],\n        keys: selectedKeys,\n      };\n    }\n    const indices = Array.from(selectedParams).sort((a, b) => a - b);\n    if (indices.length === 0) {\n      showMessage('��ѡ��Ҫ�ԱȵĲ���', 'warn');\n      return null;\n    }\n    const params = indices\n      .map((idx) => tpl.parameters[idx])\n      .filter((param) => param && param.name)\n      .map((param) => ({\n        name: param.name,\n        type: param.type,\n        parameterIndexes: param.parameterIndexes\n          ? {\n              template: param.parameterIndexes.template || '',\n              param: param.parameterIndexes.param || '',\n            }\n          : null,\n      }));\n    if (params.length === 0) {\n      showMessage('δ�ҵ��ɶԱȵĲ���', 'warn');\n      return null;\n    }\n    return {\n      active: true,\n      templateUid: tpl.__uid,\n      type: 'normal',\n      params,\n      keys: [],\n    };\n  }\n\n  function formatCompareDisplayValue(value, meta) {\n    let result = value;\n    if (meta && meta.parameterIndexes && result && typeof result === 'object' && !Array.isArray(result) && 'value' in result) {\n      result = result.value;\n    }\n    if (Array.isArray(result)) {\n      if (result.length === 0) return '���գ�';\n      const joined = result\n        .map((item) => (item == null ? '' : String(item)))\n        .join(', ');\n      return joined.trim() ? joined : '���գ�';\n    }\n    if (result === null || result === undefined) return '���գ�';\n    if (typeof result === 'string') {\n      return result.length === 0 ? '���գ�' : result;\n    }\n    if (typeof result === 'boolean') {\n      return result ? 'true' : 'false';\n    }\n    if (typeof result === 'number') {\n      return Number.isFinite(result) ? String(result) : '���գ�';\n    }\n    if (typeof result === 'object') {\n      try {\n        const str = JSON.stringify(result);\n        return str && str !== '{}' ? str : '���գ�';\n      } catch (err) {\n        return String(result);\n      }\n    }\n    return String(result);\n  }\n\n  function buildInstanceCompareText(tpl, inst) {\n    if (!compareValueState.active || !tpl || compareValueState.templateUid !== tpl.__uid) return '';\n    if (!inst || !inst.payload) return '';\n    if (compareValueState.type === 'enum') {\n      const keys = Array.isArray(compareValueState.keys) ? compareValueState.keys : [];\n      if (keys.length === 0) return '';\n      const parts = keys\n        .map((key) => {\n          const raw = inst.payload ? inst.payload[key] : undefined;\n          const formatted = formatCompareDisplayValue(raw);\n          return `${key}: ${formatted}`;\n        })\n        .filter((text) => text && text.length > 0);\n      return parts.join(' | ');\n    }\n    const params = Array.isArray(compareValueState.params) ? compareValueState.params : [];\n    if (params.length === 0) return '';\n    const parts = params\n      .map((meta) => {\n        if (!meta || !meta.name) return '';\n        const raw = inst.payload ? inst.payload[meta.name] : undefined;\n        const formatted = formatCompareDisplayValue(raw, meta);\n        return `${meta.name}: ${formatted}`;\n      })\n      .filter((text) => text && text.length > 0);\n    return parts.join(' | ');\n  }\n\n  function handleToggleCompareValues() {\n    if (!compareValueState.active) {\n      const snapshot = buildCompareValueSnapshot();\n      if (!snapshot) return;\n      compareValueState = snapshot;\n      updateCompareButtonState();\n      refreshInstances();\n      return;\n    }\n    compareValueState = createDefaultCompareValueState();\n    updateCompareButtonState();\n    refreshInstances();\n  }\n\n  /**\n   * ˢ��ʵ���б�\n   */\n  function refreshInstances() {\n    instanceListEl.innerHTML = \"\";\n    if (currentTemplateIndex < 0) {\n      if (compareValueState.active) {\n        deactivateCompareValues({ force: true });\n      }\n      lastDuplicateIndexInfo = null;\n      if (instanceIdInput) {\n        instanceIdInput.value = '';\n        instanceIdInput.disabled = true;\n        instanceIdInput.classList.remove('invalid-name');\n        instanceIdInput.removeAttribute('title');\n      }\n      return;\n    }\n    const tpl = templates[currentTemplateIndex];\n    if (!tpl) {\n      if (instanceIdInput) {\n        instanceIdInput.value = '';\n        instanceIdInput.disabled = true;\n        instanceIdInput.classList.remove('invalid-name');\n        instanceIdInput.removeAttribute('title');\n      }\n      return;\n    }\n    ensureTemplateUid(tpl);\n    if (compareValueState.active && compareValueState.templateUid && compareValueState.templateUid !== tpl.__uid) {\n      deactivateCompareValues({ force: true });\n    }\n    const duplicateInfo = collectDuplicateIndexInfo(tpl);\n    const duplicateIdInfo = collectDuplicateIdInfo(tpl);\n     const invalidInstanceMap = collectInstanceIndexInvalidReasons(tpl);\n    const listValidation = collectListTypeViolations(tpl);\n    lastDuplicateIndexInfo = { uid: tpl.__uid, info: duplicateInfo };\n    const duplicatesByIndex = duplicateInfo.byIndex;\n    const duplicatesById = duplicateIdInfo.byIndex;\n    const templateIdxForExport = currentTemplateIndex;\n    tpl.instances.forEach((inst, idx) => {\n      const li = document.createElement(\"li\");\n      li.setAttribute('draggable','true');\n      li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(idx)); });\n      li.addEventListener('dragover', (e) => { e.preventDefault(); });\n      li.addEventListener('drop', (e) => {\n        e.preventDefault();\n        const from = parseInt(e.dataTransfer.getData('text/plain'));\n        const to = idx;\n        if (isNaN(from) || from === to) return;\n        const it = tpl.instances.splice(from,1)[0];\n        tpl.instances.splice(to,0,it);\n        if (currentInstanceIndex === from) currentInstanceIndex = to;\n        else if (from < currentInstanceIndex && to >= currentInstanceIndex) currentInstanceIndex--;\n        else if (from > currentInstanceIndex && to <= currentInstanceIndex) currentInstanceIndex++;\n        refreshInstances();\n      });\n      li.setAttribute('draggable','true');\n      li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(idx)); });\n      li.addEventListener('dragover', (e) => { e.preventDefault(); });\n      li.addEventListener('drop', (e) => {\n        e.preventDefault();\n        const from = parseInt(e.dataTransfer.getData('text/plain'));\n        const to = idx;\n        if (isNaN(from) || from === to) return;\n        const it = tpl.instances.splice(from,1)[0];\n        tpl.instances.splice(to,0,it);\n        if (currentInstanceIndex === from) currentInstanceIndex = to;\n        else if (from < currentInstanceIndex && to >= currentInstanceIndex) currentInstanceIndex--;\n        else if (from > currentInstanceIndex && to <= currentInstanceIndex) currentInstanceIndex++;\n        refreshInstances();\n      });\n      // ���������ظ�״̬��ѡ��״̬\n      const tooltipParts = [];\n      const duplicateEntry = duplicatesByIndex.get(idx);\n      if (duplicateEntry) {\n        li.classList.add('duplicate-index');\n        const displayValue = duplicateEntry.value !== '' ? duplicateEntry.value : '���գ�';\n        tooltipParts.push(`����ֵ�ظ���${displayValue}`);\n      }\n      const duplicateIdEntry = duplicatesById.get(idx);\n      if (duplicateIdEntry) {\n        li.classList.add('duplicate-id');\n        const displayId = duplicateIdEntry.value !== '' ? duplicateIdEntry.value : '���գ�';\n        const idEntries = Array.isArray(duplicateIdEntry.entries) ? duplicateIdEntry.entries : [];\n        const idPositions = idEntries\n          .map((item) => (item && Number.isInteger(item.idx) ? item.idx + 1 : null))\n          .filter((pos) => pos != null);\n        const idDetailParts = [];\n        if (idEntries.length > 0) {\n          idDetailParts.push(`�� ${idEntries.length} ��`);\n        }\n        if (idPositions.length > 0) {\n          idDetailParts.push(`λ�� ${idPositions.join(', ')}`);\n        }\n        const idDetailSuffix = idDetailParts.length > 0 ? `��${idDetailParts.join('��')}��` : '';\n        tooltipParts.push(`ID �ظ�${idDetailSuffix}��${displayId}`);\n      }\n      const invalidReference = invalidInstanceMap.get(idx);\n      if (invalidReference && invalidReference.hasInvalid) {\n        li.classList.add('invalid-reference');\n        const invalidDetails = Array.from(invalidReference.invalidParams.entries())\n          .map(([name, reason]) => `${name}: ${reason}`)\n          .join('��');\n        if (invalidDetails) {\n          tooltipParts.push(`�������ô���${invalidDetails}`);\n        }\n      }\n      const invalidListEntry = listValidation.invalidInstances.get(idx);\n      if (invalidListEntry && invalidListEntry.length > 0) {\n        li.classList.add('invalid-reference');\n        const listDetail = invalidListEntry\n          .map((entry) => {\n            const reasons = Array.isArray(entry.errors) ? entry.errors : [];\n            const positions = reasons\n              .filter((err) => err && Number.isInteger(err.index) && err.index >= 0)\n              .map((err) => err.index + 1)\n              .join(', ');\n            const reasonLabel = reasons.length > 0 ? reasons[0].reason : '���Ͳ�ƥ��';\n            const positionLabel = positions ? `��λ�� ${positions}��` : '';\n            return `${entry.paramName}: ${reasonLabel}${positionLabel}`;\n          })\n          .join('��');\n        tooltipParts.push(`�б����ʹ���${listDetail}`);\n      }\n      if (tooltipParts.length > 0) {\n        li.title = tooltipParts.join('\\n');\n      } else {\n        li.removeAttribute('title');\n      }\n      if (selectedInstances.has(idx)) li.classList.add('active');\n      let instanceExportSelected = false;\n      if (exportSelectionMode) {\n        instanceExportSelected = isInstanceSelectedForExport(tpl, inst);\n        const checkbox = document.createElement('input');\n        checkbox.type = 'checkbox';\n        checkbox.checked = instanceExportSelected;\n        checkbox.addEventListener('click', (e) => {\n          e.stopPropagation();\n          handleInstanceExportCheckbox(templateIdxForExport, idx, instanceExportSelected, e);\n        });\n        li.appendChild(checkbox);\n      }\n      const nameSpan = document.createElement('span');\n      nameSpan.textContent = `${inst.id}: ${inst.name}`;\n      setInvalidNameVisual(nameSpan, isPureNumericName(inst.name));\n      li.appendChild(nameSpan);\n      const compareText = buildInstanceCompareText(tpl, inst);\n      if (compareText) {\n        const compareSpan = document.createElement('span');\n        compareSpan.className = 'instance-compare-values';\n        compareSpan.textContent = ` ${compareText}`;\n        li.appendChild(compareSpan);\n      }\n      li.addEventListener('click', (e) => {\n        if (e.ctrlKey) {\n          // Ctrl+������л���ʵ��ѡ��״̬\n          if (selectedInstances.has(idx)) {\n            selectedInstances.delete(idx);\n          } else {\n            selectedInstances.add(idx);\n          }\n          const arr = Array.from(selectedInstances).sort((a,b)=>a-b);\n          if (arr.length > 0) {\n            currentInstanceIndex = arr[arr.length - 1];\n          } else {\n            currentInstanceIndex = -1;\n          }\n          // ����ʵ��ê��\n          anchorInstance = currentInstanceIndex >= 0 ? currentInstanceIndex : null;\n        } else if (e.shiftKey) {\n          // ���δ����ʵ��ê�㣬���Ե�ǰʵ������Ϊê��\n          if (anchorInstance === null) {\n            anchorInstance = currentInstanceIndex >= 0 ? currentInstanceIndex : idx;\n          }\n          const start = Math.min(anchorInstance, idx);\n          const end = Math.max(anchorInstance, idx);\n          selectedInstances.clear();\n          for (let i = start; i <= end; i++) {\n            selectedInstances.add(i);\n          }\n          currentInstanceIndex = idx;\n          // ����ʵ��ê��\n          anchorInstance = idx;\n        } else {\n          // ������ѡ�е�Ψһʵ�� => ȡ��ѡ��\n          if (selectedInstances.has(idx) && selectedInstances.size === 1) {\n            selectedInstances.clear();\n            currentInstanceIndex = -1;\n            instanceNameInput.value = '';\n            // �������ѡ����ê��\n            selectedParams.clear();\n            editingParamIndex = -1;\n            anchorParam = null;\n            refreshInstances();\n            refreshParams();\n            lastSelectedCategory = 'instance';\n            e.stopPropagation();\n            return;\n          }\n          selectedInstances.clear();\n          selectedInstances.add(idx);\n          currentInstanceIndex = idx;\n          // ����ʵ��ê��\n          anchorInstance = idx;\n        }\n        instanceNameInput.value = (currentTemplateIndex >= 0 && currentInstanceIndex >= 0)\n          ? templates[currentTemplateIndex].instances[currentInstanceIndex].name\n          : '';\n        updateInstanceNameInputValidity();\n        // �л�ʵ��ʱ�������ѡ��\n        selectedParams.clear();\n        editingParamIndex = -1;\n        // �������ê��\n        anchorParam = null;\n        refreshInstances();\n        refreshParams();\n        lastSelectedCategory = 'instance';\n        e.stopPropagation();\n      });\n      instanceListEl.appendChild(li);\n    });\n    // Ӧ��ʵ����������\n    filterList(instanceListEl, searchInstancesInput.value);\n    updateInstanceNameInputValidity();\n    updateInstanceIdInputState(duplicateIdInfo);\n    if (isSheetModeActive()) {\n      if (sheetActiveTemplateIndex === currentTemplateIndex && currentInstanceIndex >= 0) {\n        sheetActiveInstanceIndex = currentInstanceIndex;\n      }\n      updateSheetInstanceTabs();\n      if (!sheetModeDirty && sheetActiveTemplateIndex === currentTemplateIndex) {\n        const tpl = templates[currentTemplateIndex];\n        const expectedCount = tpl?.instances?.length || 0;\n        const expectedSignature = getTemplateParameterSignature(tpl);\n        if (\n          sheetRenderedTemplateIndex !== sheetActiveTemplateIndex ||\n          sheetRenderedInstanceCount !== expectedCount ||\n          sheetRenderedParameterSignature !== expectedSignature\n        ) {\n          renderLuckysheetForActiveInstance();\n        }\n      }\n    }\n  }\n\n  /**\n   * ˢ�²����б�\n   */\n  function refreshParams() {\n    paramListEl.innerHTML = \"\";\n    paramListEl.classList.remove('has-invalid-reference');\n    paramListEl.removeAttribute('title');\n    updateParamTypeSelectEnabledState();\n    updateParamNameInputEnabledState();\n    refreshParamTypeOptions();\n    updateIndexTemplateOptions();\n    if (currentTemplateIndex < 0 || currentInstanceIndex < 0) {\n      updateParamNameInputValidity();\n      return;\n    }\n    const tpl = templates[currentTemplateIndex];\n    const inst = tpl.instances[currentInstanceIndex];\n    const indexValidation = evaluateInstanceIndexValidation(tpl, inst);\n    const listValidation = collectListTypeViolations(tpl);\n    if (indexValidation.hasInvalid) {\n      const tooltip = Array.from(indexValidation.invalidParams.entries())\n        .map(([name, reason]) => `${name}: ${reason}`)\n        .join('\\n');\n      if (tooltip) {\n        paramListEl.title = tooltip;\n      } else {\n        paramListEl.removeAttribute('title');\n      }\n    } else {\n      paramListEl.removeAttribute('title');\n    }\n    const isEnumTpl = isEnumTemplate(tpl);\n    if (isEnumTpl) {\n      enforceEnumIndexField(tpl);\n    }\n    // �����ֶ�\n    const reserved = [\n      { name: \"template\", type: \"string\" },\n      { name: \"id\", type: \"int\" },\n      { name: \"name\", type: \"string\" },\n      { name: \"index\", type: \"string\" },\n    ];\n    reserved.forEach((f) => {\n      const item = document.createElement(\"div\");\n      item.classList.add(\"param-item\", \"reserved\");\n      const label = document.createElement(\"label\");\n      label.textContent = f.name;\n      item.appendChild(label);\n      if (f.name === 'index') {\n        const select = document.createElement('select');\n        const candidates = isEnumTpl\n          ? ['id']\n          : ['id', 'name', ...tpl.parameters.map((p) => p.name).filter((n) => n !== 'index')];\n        candidates.forEach((n) => {\n          const opt = document.createElement('option');\n          opt.value = n;\n          opt.textContent = n;\n          select.appendChild(opt);\n        });\n        select.value = tpl.indexField || 'id';\n        if (isEnumTpl) {\n          select.disabled = true;\n          select.title = 'enum ģ��������̶�Ϊ id';\n        } else {\n          select.addEventListener('change', () => {\n            tpl.indexField = select.value || 'id';\n            tpl.instances.forEach((one) => {\n              const vv = getValueByFieldForInstance(tpl, one, tpl.indexField);\n              if (!one.payload) one.payload = {};\n              one.payload.index = vv == null ? '' : String(vv);\n            });\n            refreshInstances();\n            refreshParams();\n          });\n        }\n        const valueSpan = document.createElement('span');\n        valueSpan.style.flex = '1';\n        const vNow = getValueByFieldForInstance(tpl, inst, tpl.indexField || 'id');\n        valueSpan.textContent = vNow == null ? '' : String(vNow);\n        if (!inst.payload) inst.payload = {};\n        inst.payload.index = valueSpan.textContent;\n        item.appendChild(select);\n        item.appendChild(valueSpan);\n        item.addEventListener('mousedown', (evt) => {\n          if (evt.button !== 0 || !evt.altKey) return;\n          evt.preventDefault();\n          evt.stopPropagation();\n          jumpToDuplicateIndexInstance(tpl, inst);\n        });\n      } else {\n        const span = document.createElement(\"span\");\n        span.textContent = inst.payload[f.name];\n        span.style.flex = '1';\n        item.appendChild(span);\n      }\n      paramListEl.appendChild(item);\n    });\n    // enum��������ʵ����Ӧ��ʹ��ʵ�����������ּ���Ⱦ������\n    if (isEnumTpl) {\n      const keys = getEnumParamKeysForInstance(tpl, inst);\n      keys.forEach((key, idx) => {\n        const item = document.createElement('div');\n        item.classList.add('param-item');\n        const label = document.createElement('label');\n        label.textContent = key;\n        item.appendChild(label);\n        if (selectedParams.has(idx)) item.classList.add('active');\n        const inputEl = document.createElement('input');\n        inputEl.type = 'text';\n        inputEl.style.flex = '1';\n        inputEl.value = inst.payload && inst.payload[key] != null ? String(inst.payload[key]) : '';\n        const updateEnumValueValidity = () => {\n          setInvalidNameVisual(inputEl, isEnumValueInvalid(inputEl.value));\n        };\n        updateEnumValueValidity();\n        // ��ֹ�������򴥷�����ѡ���߼�����ϱ༭\n        inputEl.addEventListener('mousedown', (e) => e.stopPropagation());\n        inputEl.addEventListener('click', (e) => e.stopPropagation());\n        inputEl.addEventListener('keydown', (e) => e.stopPropagation());\n        inputEl.addEventListener('input', () => {\n          updateEnumValueValidity();\n        });\n        inputEl.addEventListener('change', () => {\n          if (!inst.payload) inst.payload = {};\n          inst.payload[key] = inputEl.value;\n          updateEnumValueValidity();\n        });\n        item.appendChild(inputEl);\n        const del = document.createElement('button');\n        del.className = 'delete-param';\n        del.textContent = 'ɾ��';\n        del.addEventListener('click', (e) => { e.stopPropagation(); deleteParam(idx); });\n        item.appendChild(del);\n        item.addEventListener('click', (e) => {\n          if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON')) return;\n          if (e.ctrlKey) {\n            if (selectedParams.has(idx)) selectedParams.delete(idx); else selectedParams.add(idx);\n            const arr = Array.from(selectedParams).sort((a, b) => a - b);\n            editingParamIndex = arr.length > 0 ? arr[arr.length - 1] : -1;\n          } else if (e.shiftKey) {\n            if (anchorParam === null) anchorParam = editingParamIndex >= 0 ? editingParamIndex : idx;\n            const start = Math.min(anchorParam, idx);\n            const end = Math.max(anchorParam, idx);\n            selectedParams.clear();\n            for (let i = start; i <= end; i++) selectedParams.add(i);\n            editingParamIndex = idx;\n            anchorParam = idx;\n          } else {\n            if (selectedParams.has(idx) && selectedParams.size === 1) {\n              selectedParams.clear();\n              editingParamIndex = -1;\n              anchorParam = null;\n            } else {\n              selectedParams.clear();\n              selectedParams.add(idx);\n              editingParamIndex = idx;\n              anchorParam = idx;\n            }\n          }\n          refreshParams();\n          lastSelectedCategory = 'param';\n        });\n        paramListEl.appendChild(item);\n      });\n      // ���ˣ����ı�ֵ�ɱ����ˣ�\n      filterList(paramListEl, searchParamsInput.value, true);\n      updateParamNameInputValidity();\n      return;\n    }\n    // �Զ������\n    tpl.parameters.forEach((p, idx) => {\n      const item = document.createElement(\"div\");\n      item.classList.add(\"param-item\");\n      const label = document.createElement('label');\n      if (p.type === 'list') {\n        const elementTypeLabel = getListElementTypeLabel(getListElementTypeForParam(p));\n        label.textContent = `${p.name} (�б�: ${elementTypeLabel})`;\n      } else {\n        label.textContent = p.name;\n      }\n      setInvalidNameVisual(label, isPureNumericName(p.name));\n      item.appendChild(label);\n      if (selectedParams.has(idx)) item.classList.add('active');\n      const invalidReason = indexValidation.invalidParams.get(p.name);\n      if (invalidReason) {\n        item.classList.add('invalid-reference');\n        item.title = invalidReason;\n      }\n      const invalidListInfo = listValidation.invalidParams.get(p.name);\n      if (invalidListInfo) {\n        item.classList.add('invalid-reference');\n        const instanceDetails = Array.from(invalidListInfo.invalidInstances.entries()).map(([instIdx, errors]) => {\n          const idxLabel = `#${instIdx + 1}`;\n          const reasons = Array.isArray(errors) ? errors : [];\n          const baseReason = reasons.length > 0 ? reasons[0].reason : '���Ͳ�ƥ��';\n          const positions = reasons\n            .filter((err) => err && Number.isInteger(err.index) && err.index >= 0)\n            .map((err) => err.index + 1)\n            .join(', ');\n          const positionLabel = positions ? `��λ�� ${positions}` : '';\n          return `${idxLabel}��${baseReason}${positionLabel}��`;\n        });\n        const detail = `�б�Ԫ�����ʹ���${instanceDetails.join('��')}`;\n        item.title = item.title ? `${item.title}\\n${detail}` : detail;\n      }\n      if (p.parameterIndexes) {\n        const info = document.createElement('span');\n        info.textContent = `������${p.parameterIndexes.template} �� ${p.parameterIndexes.param}`;\n        info.style.marginRight = '8px';\n        item.appendChild(info);\n      }\n      if (p.parameterIndexes && p.type !== 'list') {\n        let refObj = inst.payload[p.name];\n        if (refObj == null) {\n          refObj = { template: p.parameterIndexes.template, by: p.parameterIndexes.param, value: '' };\n          inst.payload[p.name] = refObj;\n        } else if (typeof refObj !== 'object') {\n          refObj = { template: p.parameterIndexes.template, by: p.parameterIndexes.param, value: String(refObj) };\n          inst.payload[p.name] = refObj;\n        } else {\n          refObj.template = p.parameterIndexes.template;\n          refObj.by = p.parameterIndexes.param;\n          if (refObj.value == null) refObj.value = '';\n        }\n        const suggestId = `idx-suggest-${p.name}-${idx}`;\n        const dataList = document.createElement('datalist');\n        dataList.id = suggestId;\n        const targetTpl = templates.find(t => t.name === p.parameterIndexes.template);\n        if (targetTpl && !isEnumTemplate(targetTpl)) {\n          targetTpl.instances.forEach((it, instIdx) => {\n            const v = it.payload ? it.payload[p.parameterIndexes.param] : undefined;\n            const sv = v == null ? '' : String(v);\n            if (!sv) return;\n            const rawName = getInstanceFieldValue(it, 'name', targetTpl.name);\n            const instName = rawName != null && String(rawName).trim() !== ''\n              ? String(rawName).trim()\n              : (() => {\n                  const idValue = getInstanceFieldValue(it, 'id', targetTpl.name);\n                  if (idValue != null && String(idValue).trim() !== '') {\n                    return `ID:${String(idValue).trim()}`;\n                  }\n                  return `ʵ��${instIdx + 1}`;\n                })();\n            const opt = document.createElement('option');\n            opt.value = sv;\n            const label = `${sv}��${instName}��`;\n            opt.label = label;\n            opt.textContent = label;\n            dataList.appendChild(opt);\n          });\n        }\n        item.appendChild(dataList);\n        const inputElIdx = document.createElement('input');\n        inputElIdx.type = 'text';\n        inputElIdx.style.flex = '1';\n        inputElIdx.placeholder = '����ֵ';\n        inputElIdx.setAttribute('list', suggestId);\n        inputElIdx.value = refObj.value ?? '';\n        inputElIdx.addEventListener('change', () => {\n          let obj = inst.payload[p.name];\n          if (!obj || typeof obj !== 'object') {\n            obj = { template: p.parameterIndexes.template, by: p.parameterIndexes.param, value: '' };\n            inst.payload[p.name] = obj;\n          }\n          const tt = templates.find(t => t.name === p.parameterIndexes.template);\n          if (tt && isEnumTemplate(tt)) {\n            showMessage('����Ŀ�겻���� enum ģ��');\n            indexTemplateSelect.value = '';\n            updateIndexParamOptions();\n            obj.template = '';\n            obj.by = '';\n          } else {\n            obj.template = p.parameterIndexes.template;\n            obj.by = p.parameterIndexes.param;\n          }\n          obj.value = inputElIdx.value;\n        });\n        item.appendChild(inputElIdx);\n      } else {\n        let inputEl;\n        let value = inst.payload[p.name];\n        if (isEnumType(p.type)) {\n          const def = getEnumDefinition(p.type);\n          const select = document.createElement('select');\n          select.style.flex = '1';\n          // ��ֹѡ������ʱ�����������������ȡ��ѡ���ˢ��\n          select.addEventListener('mousedown', (e) => e.stopPropagation());\n          select.addEventListener('click', (e) => e.stopPropagation());\n          const enumValues = def ? def.values : [];\n          value = convertValueForType(value, p.type);\n          if (inst.payload[p.name] !== value) {\n            inst.payload[p.name] = value;\n          }\n          if (enumValues && enumValues.length > 0) {\n            enumValues.forEach((val) => {\n              const opt = document.createElement('option');\n              opt.value = val;\n              opt.textContent = val;\n              select.appendChild(opt);\n            });\n          }\n          if (value && (!enumValues || !enumValues.includes(value))) {\n            const opt = document.createElement('option');\n            opt.value = value;\n            opt.textContent = value;\n            select.appendChild(opt);\n          }\n          select.value = value ?? '';\n          if (!enumValues || enumValues.length === 0) {\n            select.disabled = true;\n          }\n          inputEl = select;\n        } else {\n          switch (p.type) {\n            case 'string':\n              inputEl = document.createElement('input');\n              inputEl.type = 'text';\n              inputEl.value = value ?? '';\n              break;\n            case 'int':\n            case 'long':\n            case 'float':\n              inputEl = document.createElement('input');\n              inputEl.type = 'number';\n              inputEl.value = value ?? 0;\n              break;\n            case 'bool':\n              inputEl = document.createElement('input');\n              inputEl.type = 'checkbox';\n              inputEl.checked = !!value;\n              break;\n            case 'list': {\n              const elementType = getListElementTypeForParam(p);\n              const hasReferenceBinding = Boolean(p.parameterIndexes);\n              let arr = hasReferenceBinding\n                ? normalizeReferenceList(inst.payload[p.name], p.parameterIndexes)\n                : convertValueToList(value, elementType);\n              if (!hasReferenceBinding && arr.length === 0) {\n                arr = [getDefaultValueForElementType(elementType)];\n              }\n              inst.payload[p.name] = arr;\n              const listWrap = document.createElement('div');\n              listWrap.classList.add('list-editor');\n              listWrap.style.display = 'flex';\n              listWrap.style.flexDirection = 'column';\n              listWrap.style.flex = '1';\n              const renderList = () => {\n                listWrap.innerHTML = '';\n                arr.forEach((val, i) => {\n                  const row = document.createElement('div');\n                  row.classList.add('list-row');\n                  row.style.display = 'flex';\n                  row.style.gap = 'calc(4px * var(--row-scale))';\n                  row.style.marginBottom = 'calc(4px * var(--row-scale))';\n                  let control = null;\n                  if (hasReferenceBinding) {\n                    const refObj = normalizeReferenceValue(arr[i], p.parameterIndexes);\n                    arr[i] = refObj;\n                    const input = document.createElement('input');\n                    input.type = 'text';\n                    input.style.flex = '1';\n                    input.value = refObj.value || '';\n                    const suggestId = `idx-suggest-${p.name}-${idx}-${i}`;\n                    input.setAttribute('list', suggestId);\n                    const dataList = document.createElement('datalist');\n                    dataList.id = suggestId;\n                    const targetTpl = templates.find((t) => t.name === p.parameterIndexes.template);\n                    if (targetTpl && !isEnumTemplate(targetTpl)) {\n                      targetTpl.instances.forEach((it, instIdx) => {\n                        const v = it.payload ? it.payload[p.parameterIndexes.param] : undefined;\n                        const sv = v == null ? '' : String(v);\n                        if (!sv) return;\n                        const rawName = getInstanceFieldValue(it, 'name', targetTpl.name);\n                        const instName = rawName != null && String(rawName).trim() !== ''\n                          ? String(rawName).trim()\n                          : (() => {\n                              const idxBased = instIdx + 1;\n                              return `#${idxBased}`;\n                            })();\n                        const opt = document.createElement('option');\n                        opt.value = sv;\n                        opt.textContent = `${sv}��${instName}��`;\n                        dataList.appendChild(opt);\n                      });\n                    }\n                    input.addEventListener('change', () => {\n                      refObj.value = input.value;\n                      const converted = coerceListElementValue(input.value, elementType);\n                      const validation = isListElementValueValid(converted, elementType);\n                      setInvalidNameVisual(input, !validation.valid);\n                    });\n                    const currentValidation = isListElementValueValid(\n                      coerceListElementValue(refObj.value, elementType),\n                      elementType\n                    );\n                    setInvalidNameVisual(input, !currentValidation.valid);\n                    row.appendChild(input);\n                    row.appendChild(dataList);\n                    control = input;\n                  } else if (isEnumType(elementType)) {\n                    const def = getEnumDefinition(elementType);\n                    const enumValues = def ? def.values : [];\n                    const select = document.createElement('select');\n                    select.style.flex = '1';\n                    if (enumValues && enumValues.length > 0) {\n                      enumValues.forEach((enumVal) => {\n                        const opt = document.createElement('option');\n                        opt.value = enumVal;\n                        opt.textContent = enumVal;\n                        select.appendChild(opt);\n                      });\n                    }\n                    if (val && (!enumValues || !enumValues.includes(val))) {\n                      const opt = document.createElement('option');\n                      opt.value = val;\n                      opt.textContent = val;\n                      select.appendChild(opt);\n                    }\n                    select.value = val ?? '';\n                    select.addEventListener('change', () => {\n                      arr[i] = select.value;\n                    });\n                    control = select;\n                    row.appendChild(select);\n                  } else {\n                    switch (elementType) {\n                      case 'string': {\n                        const input = document.createElement('input');\n                        input.type = 'text';\n                        input.style.flex = '1';\n                        input.value = val == null ? '' : String(val);\n                        input.addEventListener('change', () => {\n                          arr[i] = input.value;\n                        });\n                        control = input;\n                        row.appendChild(input);\n                        break;\n                      }\n                      case 'bool': {\n                        const checkbox = document.createElement('input');\n                        checkbox.type = 'checkbox';\n                        checkbox.checked = !!val;\n                        checkbox.addEventListener('change', () => {\n                          arr[i] = checkbox.checked;\n                        });\n                        control = checkbox;\n                        row.appendChild(checkbox);\n                        break;\n                      }\n                      case 'float':\n                      case 'int':\n                      case 'long': {\n                        const input = document.createElement('input');\n                        input.type = 'number';\n                        input.style.flex = '1';\n                        input.value = val == null ? '' : String(val);\n                        input.step = elementType === 'float' ? 'any' : '1';\n                        input.addEventListener('change', () => {\n                          const converted = coerceListElementValue(input.value, elementType);\n                          arr[i] = converted;\n                          const validation = isListElementValueValid(converted, elementType);\n                          setInvalidNameVisual(input, !validation.valid);\n                        });\n                        const validation = isListElementValueValid(val, elementType);\n                        setInvalidNameVisual(input, !validation.valid);\n                        control = input;\n                        row.appendChild(input);\n                        break;\n                      }\n                      case 'object': {\n                        const textarea = document.createElement('textarea');\n                        textarea.style.flex = '1';\n                        textarea.rows = 1;\n                        textarea.value = val && typeof val === 'object' ? JSON.stringify(val) : '';\n                        textarea.addEventListener('change', () => {\n                          if (!textarea.value.trim()) {\n                            arr[i] = {};\n                            setInvalidNameVisual(textarea, false);\n                            return;\n                          }\n                          try {\n                            const parsed = JSON.parse(textarea.value);\n                            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {\n                              arr[i] = parsed;\n                              setInvalidNameVisual(textarea, false);\n                            } else {\n                              setInvalidNameVisual(textarea, true);\n                            }\n                          } catch (_err) {\n                            setInvalidNameVisual(textarea, true);\n                          }\n                        });\n                        const validObject = val && typeof val === 'object' && !Array.isArray(val);\n                        setInvalidNameVisual(textarea, !validObject);\n                        control = textarea;\n                        row.appendChild(textarea);\n                        break;\n                      }\n                      default: {\n                        const input = document.createElement('input');\n                        input.type = 'text';\n                        input.style.flex = '1';\n                        input.value = val == null ? '' : String(val);\n                        input.addEventListener('change', () => {\n                          arr[i] = input.value;\n                        });\n                        control = input;\n                        row.appendChild(input);\n                        break;\n                      }\n                    }\n                  }\n                  listWrap.appendChild(row);\n                });\n              };\n              renderList();\n              item.appendChild(listWrap);\n              const addBtn = document.createElement('button');\n              addBtn.textContent = '����Ԫ��';\n              addBtn.classList.add('list-control-btn');\n              addBtn.addEventListener('click', (e2) => {\n                e2.stopPropagation();\n                if (hasReferenceBinding) {\n                  inst.payload[p.name].push(createDefaultReferenceValue(p.parameterIndexes));\n                } else {\n                  inst.payload[p.name].push(getDefaultValueForElementType(elementType));\n                }\n                arr = inst.payload[p.name];\n                renderList();\n              });\n              const removeBtn = document.createElement('button');\n              removeBtn.textContent = 'ɾ��Ԫ��';\n              removeBtn.classList.add('list-control-btn');\n              removeBtn.addEventListener('click', (e2) => {\n                e2.stopPropagation();\n                if (inst.payload[p.name].length > 1) {\n                  inst.payload[p.name].pop();\n                  arr = inst.payload[p.name];\n                  renderList();\n                }\n              });\n              item.appendChild(addBtn);\n              item.appendChild(removeBtn);\n              inputEl = null;\n              break;\n            }\n          case 'object':\n            inputEl = document.createElement('input');\n            inputEl.type = 'text';\n            inputEl.value = value && typeof value === 'object' ? JSON.stringify(value) : '';\n              break;\n            default:\n              inputEl = document.createElement('input');\n              inputEl.type = 'text';\n              inputEl.value = value ?? '';\n          }\n        }\n        if (inputEl) {\n          if (inputEl.tagName !== 'SELECT') {\n            inputEl.style.flex = '1';\n          }\n          inputEl.addEventListener('change', () => updateParamValue(idx, inputEl));\n          item.appendChild(inputEl);\n        }\n      }\n      const del = document.createElement('button');\n      del.className = 'delete-param';\n      del.textContent = 'ɾ��';\n      del.addEventListener('click', (e) => {\n        e.stopPropagation();\n        deleteParam(idx);\n      });\n      item.appendChild(del);\n      // ����������ѡ��/ȡ��ѡ�񣬻�ִ�� Alt ��ת\n        item.addEventListener('click', (e) => {\n          // �������/ѡ��/ɾ��������ѡ���߼�\n          if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return;\n        // Alt+�������Ϊ������������ת\n        if (e.altKey && p.parameterIndexes) {\n          // ����ǰ����ѡ��ѹջ\n          pushParamHistory();\n          const ref = inst.payload[p.name];\n          const targetTplName = ref && typeof ref === 'object' ? (ref.template || p.parameterIndexes.template) : p.parameterIndexes.template;\n          const byField = ref && typeof ref === 'object' ? (ref.by || p.parameterIndexes.param) : p.parameterIndexes.param;\n          const byValue = ref && typeof ref === 'object' ? (ref.value ?? '') : '';\n          // ��ֹ��ת�� enum ģ��\n          if (isEnumTemplate({ name: targetTplName })) {\n            showMessage('����Ŀ�겻���� enum ģ��');\n            return;\n          }\n          const tIdx = templates.findIndex(t => t.name === targetTplName);\n          if (tIdx < 0) {\n            showMessage('δ�ҵ�Ŀ��ģ��');\n            return;\n          }\n          currentTemplateIndex = tIdx;\n          selectedTemplates.clear();\n          selectedTemplates.add(tIdx);\n          const t = templates[tIdx];\n          let iIdx = -1;\n          for (let i = 0; i < t.instances.length; i++) {\n            const v = t.instances[i].payload ? t.instances[i].payload[byField] : undefined;\n            if ((v !== undefined && v !== null) && String(v) === String(byValue)) { iIdx = i; break; }\n          }\n        if (iIdx < 0) {\n          showMessage('δ�ҵ���������ֵ��ʵ��');\n          // ��Ȼ����ģ�壬���ʵ�������\n          currentInstanceIndex = -1;\n          selectedInstances.clear();\n          selectedParams.clear();\n          editingParamIndex = -1;\n        } else {\n          currentInstanceIndex = iIdx;\n          selectedInstances.clear();\n          selectedInstances.add(iIdx);\n          // ѡ��Ŀ���ֶζ�Ӧ�Ĳ����������ڣ�\n          const pIdx = t.parameters.findIndex(pp => pp.name === byField);\n          selectedParams.clear();\n          if (pIdx >= 0) {\n            selectedParams.add(pIdx);\n            editingParamIndex = pIdx;\n          } else {\n            editingParamIndex = -1;\n            showMessage('Ŀ���ֶ�Ϊϵͳ�ֶλ򲻴��ڣ�δѡ�в���');\n          }\n        }\n        templateNameInput.value = templates[currentTemplateIndex]?.name || '';\n        instanceNameInput.value = (currentTemplateIndex >= 0 && currentInstanceIndex >= 0) ? templates[currentTemplateIndex].instances[currentInstanceIndex].name : '';\n        // ͬ���༭���򣬱��������һ�εĲ�����Ϣ\n        showSelectedParamDetails();\n        refreshTemplates();\n        refreshInstances();\n        refreshParams();\n        updateIndexTemplateOptions();\n        lastSelectedCategory = 'param';\n        e.stopPropagation();\n        return;\n      }\n        if (e.ctrlKey) {\n          // Ctrl+������л��ò���ѡ��״̬\n          pushParamHistory();\n          if (selectedParams.has(idx)) {\n            selectedParams.delete(idx);\n          } else {\n            selectedParams.add(idx);\n          }\n          const arr = Array.from(selectedParams).sort((a,b)=>a-b);\n          editingParamIndex = arr.length > 0 ? arr[arr.length - 1] : -1;\n          anchorParam = editingParamIndex >= 0 ? editingParamIndex : null;\n        } else if (e.shiftKey) {\n          // ���δ����ê�㣬���Ե�ǰ���ڱ༭�Ĳ����򱾴�����Ϊê��\n          pushParamHistory();\n          if (anchorParam === null) {\n            if (editingParamIndex >= 0) {\n              anchorParam = editingParamIndex;\n            } else {\n              anchorParam = idx;\n            }\n          }\n          const start = Math.min(anchorParam, idx);\n          const end = Math.max(anchorParam, idx);\n          selectedParams.clear();\n          for (let i = start; i <= end; i++) {\n            selectedParams.add(i);\n          }\n          editingParamIndex = idx;\n          anchorParam = idx;\n        } else {\n          // ��ͨ���ǰ����¼��ǰ��������ʷ\n          if (editingParamIndex !== idx) pushParamHistory();\n          // ������ѡ�е�Ψһ���� => ȡ��ѡ��\n          if (selectedParams.has(idx) && selectedParams.size === 1) {\n            selectedParams.clear();\n            editingParamIndex = -1;\n            anchorParam = null;\n          } else {\n            selectedParams.clear();\n            selectedParams.add(idx);\n            editingParamIndex = idx;\n            anchorParam = idx;\n          }\n        }\n        showSelectedParamDetails();\n        refreshParams();\n        lastSelectedCategory = 'param';\n        e.stopPropagation();\n      });\n      paramListEl.appendChild(item);\n    });\n    // Ӧ�ò�����������\n    filterList(paramListEl, searchParamsInput.value, true);\n    updateParamNameInputValidity();\n  }\n\n  /**\n   * ���²���ֵ\n   */\n  function updateParamValue(paramIndex, inputEl) {\n    if (currentTemplateIndex < 0 || currentInstanceIndex < 0) return;\n    const tpl = templates[currentTemplateIndex];\n    const inst = tpl.instances[currentInstanceIndex];\n    const param = tpl.parameters[paramIndex];\n    if (!inst.payload) inst.payload = {};\n    let shouldRefreshInstances = compareValueState.active && compareValueState.templateUid === tpl.__uid;\n    switch (param.type) {\n      case \"string\":\n        inst.payload[param.name] = inputEl.value;\n        break;\n      case \"int\":\n        inst.payload[param.name] = parseInt(inputEl.value) || 0;\n        break;\n      case \"long\":\n        inst.payload[param.name] = parseInt(inputEl.value) || 0;\n        break;\n      case \"float\":\n        inst.payload[param.name] = parseFloat(inputEl.value) || 0;\n        break;\n      case \"bool\":\n        inst.payload[param.name] = inputEl.checked;\n        break;\n      case \"list\":\n        {\n          const elementType = getListElementTypeForParam(param);\n          inst.payload[param.name] = convertValueToList(inputEl.value, elementType);\n        }\n        break;\n      case \"object\":\n        try {\n          inst.payload[param.name] = inputEl.value ? JSON.parse(inputEl.value) : {};\n        } catch (err) {\n          alert(\"�����ʽ��Ϊ�Ϸ� JSON\");\n        }\n        break;\n      default:\n        inst.payload[param.name] = inputEl.value;\n    }\n    if (tpl.indexField === param.name) {\n      const newIndexValue = computeExpectedIndexValue(tpl, inst, tpl.indexField);\n      inst.payload.index = newIndexValue == null ? '' : String(newIndexValue);\n      shouldRefreshInstances = true;\n    }\n    if (shouldRefreshInstances) {\n      refreshInstances();\n    }\n  }\n\n  /**\n   * ���ݵ�ǰѡ��Ĳ�����ʾ����Ϣ������\n   */\n  function showSelectedParamDetails() {\n    if (currentTemplateIndex < 0) return;\n    const tpl = templates[currentTemplateIndex];\n    updateParamTypeSelectEnabledState();\n    updateIndexTemplateOptions();\n    if (selectedParams.size === 0) {\n      // û��ѡ�У���������\n      paramNameInput.value = '';\n      paramTypeSelect.value = 'string';\n       updateListElementTypeSelectState();\n      updateParamNameInputValidity();\n      if (!indexTemplateSelect.disabled) {\n        indexTemplateSelect.value = '';\n        updateIndexParamOptions();\n      } else {\n        indexParamSelect.value = '';\n      }\n      editingParamIndex = -1;\n      $('newParam').textContent = '�½�����';\n      updateIndexTemplateOptions();\n      return;\n    }\n    const idxs = Array.from(selectedParams);\n    const idx = idxs[idxs.length - 1];\n    const p = tpl.parameters[idx];\n    if (!p) return;\n    editingParamIndex = idx;\n    paramNameInput.value = p.name;\n    updateParamNameInputValidity();\n    paramTypeSelect.value = p.type;\n    if (isEnumTemplate(tpl)) {\n      paramTypeSelect.value = 'string';\n    }\n    if (p.type === 'list') {\n      updateListElementTypeSelectState(getListElementTypeForParam(p));\n    } else {\n      updateListElementTypeSelectState();\n    }\n    updateIndexTemplateOptions();\n    // ������������\n    if (!indexTemplateSelect.disabled) {\n      if (p.parameterIndexes) {\n        indexTemplateSelect.value = p.parameterIndexes.template;\n        updateIndexParamOptions();\n        indexParamSelect.value = p.parameterIndexes.param;\n      } else {\n        indexTemplateSelect.value = '';\n        updateIndexParamOptions();\n      }\n    }\n    $('newParam').textContent = '���²���';\n  }\n\n  /**\n   * ��ݼ�����\n   */\n\nreturn { getValueByFieldForInstance, refreshTemplates, getSelectedInstanceIndices, updateCompareButtonState, deactivateCompareValues, buildCompareValueSnapshot, formatCompareDisplayValue, buildInstanceCompareText, handleToggleCompareValues, refreshInstances, refreshParams, updateParamValue, showSelectedParamDetails, updateIndexTemplateOptions, updateIndexParamOptions };\n}";
  function sanitizeFactorySource(source) {
    const replacements = [
      [/ö�ٲ�֧������/g, "enum 模板不支持索引"],
      [/ö�����Ͳ�����֧������/g, "枚举类型参数不支持索引"],
      [/������ָ�� enum/g, "不能指向 enum 模板"],
      [/�޿��ò���/g, "无可用字段"],
      [/ѡ�����/g, "选择目标字段"],
      [/label\.textContent = `\$\{p\.name\} \([^)]*:\s\$\{elementTypeLabel\}\)`;/g, "label.textContent = `${p.name} (列表: ${elementTypeLabel})`;"],
      [/appendParamOption\('id', 'id'\);/g, "appendParamOption('id', 'id');\n    appendParamOption('name', 'name');\n    appendParamOption('index', 'index');"],
      [/return 'ö�ٲ�֧������';/g, "return 'enum 模板不支持索引';"],
      [/return 'ö�����Ͳ�����֧������';/g, "return '枚举类型参数不支持索引';"],
      [/opt0\.textContent = '������';/g, "opt0.textContent = '选择目标模板';"],
      [/opt\.textContent = indexTemplateSelect\.dataset\.disabledReason \|\| 'ö�ٲ�֧������';/g, "opt.textContent = indexTemplateSelect.dataset.disabledReason || 'enum 模板不支持索引';"],
      [/opt\.textContent = \"������\";/g, "opt.textContent = '选择目标字段';"],
      [/opt\.textContent = \"������ָ�� enum\";/g, "opt.textContent = '不能指向 enum 模板';"],
      [/opt\.textContent = '�޿��ò���';/g, "opt.textContent = '无可用字段';"],
      [/optDef\.textContent = \"ѡ�����\";/g, "optDef.textContent = '选择目标字段';"],
      [/addBtn\.textContent = '[^']*';/g, "addBtn.textContent = '添加元素';"],
      [/removeBtn\.textContent = '[^']*';/g, "removeBtn.textContent = '删除元素';"],
      [/del\.textContent = '[^']*';/g, "del.textContent = '删除';"],
      [/inputElIdx\.placeholder = '[^']*';/g, "inputElIdx.placeholder = '索引值';"],
      [/info\.textContent = `[^`]*\$\{p\.parameterIndexes\.template\}[^`]*\$\{p\.parameterIndexes\.param\}`;/g, "info.textContent = `引用: ${p.parameterIndexes.template} / ${p.parameterIndexes.param}`;"],
      [/const reasonLabel = reasons\.length > 0 \? reasons\[0\]\.reason : '[^']*';/g, "const reasonLabel = reasons.length > 0 ? reasons[0].reason : '类型不匹配';"],
      [/const detail = `[^`]*\$\{instanceDetails\.join\('[^']*'\)\}`;/g, "const detail = `列表元素类型错误: ${instanceDetails.join('；')}`;"],
      [/tooltipParts\.push\(`[^`]*\$\{listDetail\}`\);/g, "tooltipParts.push(`列表类型错误: ${listDetail}`);"],
      [/return `[^`]*\$\{instIdx \+ 1\}`;/g, "return `实例${instIdx + 1}`;"],
      [/const label = `\$\{sv\}[^`]*\$\{instName\}[^`]*`;/g, "const label = `${sv} (${instName})`;"],
      [/opt\.textContent = `\$\{sv\}[^`]*\$\{instName\}[^`]*`;/g, "opt.textContent = `${sv} (${instName})`;"],
      [/showMessage\('[^']*enum [^']*'\);/g, "showMessage('目标不能是 enum 模板');"],
      [/\$\('newParam'\)\.textContent = '[^']*';/g, "$('newParam').textContent = '新建参数';"]
    ];
    return replacements.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), source);
  }
  function createPanelsModule(context) {
    ensureContext7(context);
    const extraLocals = (() => {
      return {
        $: (id) => document.getElementById(id),
        RESERVED_INDEX_FIELDS: context.RESERVED_INDEX_FIELDS || /* @__PURE__ */ new Set(["template", "id", "name", "index"]),
        INDEXABLE_PARAM_TYPES: context.INDEXABLE_PARAM_TYPES || /* @__PURE__ */ new Set(["int", "long", "float", "string"]),
        isSheetModeActive: context.isSheetModeActive || (() => false),
        updateSheetTemplateNav: context.updateSheetTemplateNav || (() => {
        }),
        updateSheetInstanceTabs: context.updateSheetInstanceTabs || (() => {
        }),
        createDefaultCompareValueState: context.createDefaultCompareValueState || (() => ({ active: false, templateUid: null, type: "normal", params: [], keys: [] }))
      };
    })();
    const scope = createLegacyScope3(context, DOM_ID_MAP3, extraLocals);
    const factory = new Function("scope", sanitizeFactorySource(FACTORY_SOURCE3));
    return factory(scope);
  }

  // src/ui/sheet-mode.js
  function ensureContext8(context) {
    if (!context || typeof context !== "object") {
      throw new Error("createSheetModeModule requires a context object");
    }
    if (!context.appState || typeof context.appState !== "object") {
      throw new Error("createSheetModeModule requires appState");
    }
  }
  function resolveDomRefs4(domRefs, domMap) {
    const resolved = { ...domRefs || {} };
    Object.entries(domMap || {}).forEach(([name, id]) => {
      if (!resolved[name] && id) {
        resolved[name] = document.getElementById(id);
      }
    });
    return resolved;
  }
  function createLegacyScope4(context, domMap, extraLocals = {}) {
    const { appState, domRefs = {}, ...helpers } = context;
    const resolvedDomRefs = resolveDomRefs4(domRefs, domMap);
    const localState = {
      ...helpers,
      ...resolvedDomRefs,
      ...extraLocals,
      appState,
      window,
      document
    };
    return new Proxy(/* @__PURE__ */ Object.create(null), {
      has() {
        return true;
      },
      get(_target, prop) {
        if (prop === Symbol.unscopables) return void 0;
        if (Object.prototype.hasOwnProperty.call(localState, prop)) {
          return localState[prop];
        }
        if (appState && Object.prototype.hasOwnProperty.call(appState, prop)) {
          return appState[prop];
        }
        const shared = globalThis.__legacyMainContext;
        if (shared && prop in shared) {
          return shared[prop];
        }
        return globalThis[prop];
      },
      set(_target, prop, value) {
        if (appState && Object.prototype.hasOwnProperty.call(appState, prop)) {
          appState[prop] = value;
          return true;
        }
        const shared = globalThis.__legacyMainContext;
        if (shared && prop in shared) {
          shared[prop] = value;
          return true;
        }
        localState[prop] = value;
        return true;
      }
    });
  }
  var DOM_ID_MAP4 = {
    "sheetModePanel": "sheetMode",
    "sheetTemplateListEl": "sheetTemplateList",
    "luckysheetContainer": "luckysheet",
    "sheetInstanceTabsEl": "sheetInstanceTabs",
    "sheetEmptyStateEl": "sheetEmptyState"
  };
  var FACTORY_SOURCE4 = "with (scope) {\n  function buildLuckysheetCell(text, options = {}) {\n    const str = text == null ? '' : String(text);\n    return Object.assign(\n      {\n        v: str,\n        m: str,\n        ct: { t: 'g', fa: 'General' },\n      },\n      options || {}\n    );\n  }\n\n  function buildLuckysheetSheetFromRows(rows, sheetName, options = {}) {\n    const {\n      index: sheetIndex = 0,\n      order = 0,\n      status = 0,\n      duplicateIdRows = null,\n    } = options || {};\n    const celldata = [];\n    const header = rows[0] || [];\n    const columnlen = {};\n    header.forEach((_, idx) => {\n      columnlen[idx] = idx === 0 ? 200 : 160;\n    });\n    rows.forEach((row, rIdx) => {\n      (row || []).forEach((value, cIdx) => {\n        const cellOptions = {};\n        if (rIdx === 0) {\n          cellOptions.bg = '#f3f6ff';\n          cellOptions.fc = '#1f4fbf';\n          cellOptions.bl = 1;\n        } else if (rIdx === 1) {\n          cellOptions.bg = '#fff8dc';\n          cellOptions.fc = '#9c6f19';\n        } else if (cIdx === 0) {\n          cellOptions.fc = '#6a6a6a';\n        }\n        if (duplicateIdRows instanceof Set && duplicateIdRows.has(rIdx) && rIdx >= 2 && cIdx === 1) {\n          cellOptions.bg = '#ffecec';\n          cellOptions.fc = '#c53030';\n          cellOptions.bl = 1;\n        }\n        celldata.push({ r: rIdx, c: cIdx, v: buildLuckysheetCell(value, cellOptions) });\n      });\n    });\n    return {\n      name: sheetName || '实例',\n      order,\n      index: sheetIndex,\n      status,\n      celldata,\n      row: Math.max(rows.length, 20),\n      column: Math.max(header.length, 1),\n      config: { columnlen },\n    };\n  }\n\n  function applyLuckysheetDuplicateIdStyles(sheetId, rowsSet) {\n    if (!sheetId) return;\n    const api = window.luckysheet;\n    const nextSet = rowsSet instanceof Set ? rowsSet : new Set(rowsSet || []);\n    const prevSet = sheetDuplicateIdRows.get(sheetId) || new Set();\n    if (!api || typeof api.setRangeStyle !== 'function') {\n      sheetDuplicateIdRows.set(sheetId, new Set(nextSet));\n      return;\n    }\n    const prevRows = Array.from(prevSet);\n    const nextRows = Array.from(nextSet);\n    const toClear = prevRows.filter((row) => !nextSet.has(row));\n    if (toClear.length > 0) {\n      api.setRangeStyle({\n        range: toClear.map((row) => ({ row: [row, row], column: [1, 1] })),\n        style: { bg: '#ffffff', fc: '#000000', bl: 0 },\n      });\n    }\n    const toApply = nextRows.filter((row) => row >= 2 && !prevSet.has(row));\n    if (toApply.length > 0) {\n      api.setRangeStyle({\n        range: toApply.map((row) => ({ row: [row, row], column: [1, 1] })),\n        style: { bg: '#ffecec', fc: '#c53030', bl: 1 },\n      });\n    }\n    sheetDuplicateIdRows.set(sheetId, new Set(nextSet));\n  }\n\n  function refreshActiveLuckysheetDuplicateStyles() {\n    if (!window.luckysheet || typeof window.luckysheet.getluckysheetfile !== 'function') return;\n    if (sheetActiveTemplateIndex < 0) return;\n    const sheetId = sheetRenderedSheetIds.get(sheetActiveTemplateIndex);\n    if (!sheetId) return;\n    const workbook = window.luckysheet.getluckysheetfile();\n    if (!Array.isArray(workbook)) return;\n    const sheet = workbook.find((item) => {\n      if (!item) return false;\n      return item.index === sheetId || item.id === sheetId || item.sheetId === sheetId;\n    });\n    if (!sheet) return;\n    const rows = collectLuckysheetRows(sheet);\n    const buckets = new Map();\n    for (let r = 2; r < rows.length; r += 1) {\n      const row = rows[r] || [];\n      const idValue = row[1];\n      const trimmed = String(idValue ?? '').trim();\n      let key = trimmed;\n      if (trimmed !== '') {\n        const num = Number(trimmed);\n        if (Number.isFinite(num)) {\n          key = String(Math.trunc(num));\n        }\n      }\n      if (!buckets.has(key)) {\n        buckets.set(key, []);\n      }\n      buckets.get(key).push(r);\n    }\n    const duplicateRows = new Set();\n    buckets.forEach((list) => {\n      if (list.length > 1) {\n        list.forEach((rowIndex) => duplicateRows.add(rowIndex));\n      }\n    });\n    applyLuckysheetDuplicateIdStyles(sheetId, duplicateRows);\n  }\n\n  function activateLuckysheetSheet(sheetId) {\n    if (!sheetId || !window.luckysheet) return false;\n    const api = window.luckysheet;\n    const workbook = typeof api.getluckysheetfile === 'function' ? api.getluckysheetfile() : null;\n    let targetIndex = -1;\n    if (Array.isArray(workbook)) {\n      targetIndex = workbook.findIndex((sheet) => {\n        if (!sheet) return false;\n        return sheet.index === sheetId || sheet.id === sheetId || sheet.sheetId === sheetId;\n      });\n    }\n    const tryCall = (methodName, value) => {\n      const method = api[methodName];\n      if (typeof method !== 'function') return false;\n      try {\n        method.call(api, value);\n        return true;\n      } catch (err) {\n        console.warn(`Failed to call luckysheet.${methodName}:`, err);\n        return false;\n      }\n    };\n    if (targetIndex >= 0) {\n      const orderMethods = ['setSheetActive', 'setSheetActivate', 'changeSheet', 'setSheetActiveByIndex', 'setSheetActivateByIndex', 'changeSheetByIndex'];\n      for (let i = 0; i < orderMethods.length; i += 1) {\n        if (tryCall(orderMethods[i], targetIndex)) {\n          return true;\n        }\n      }\n    }\n    const idMethods = ['setSheetActiveById', 'setSheetActivateById', 'changeSheetById'];\n    for (let i = 0; i < idMethods.length; i += 1) {\n      if (tryCall(idMethods[i], sheetId)) {\n        return true;\n      }\n    }\n    if (targetIndex >= 0) {\n      return tryCall('changeSheet', targetIndex);\n    }\n    return false;\n  }\n\n  function getLuckysheetCell(sheet, row, column) {\n    if (!sheet) return null;\n    if (Array.isArray(sheet.data) && sheet.data[row] && sheet.data[row][column]) {\n      return sheet.data[row][column];\n    }\n    if (Array.isArray(sheet.celldata)) {\n      for (let i = 0; i < sheet.celldata.length; i += 1) {\n        const cell = sheet.celldata[i];\n        if (cell && cell.r === row && cell.c === column) {\n          return cell.v != null ? cell.v : cell;\n        }\n      }\n    }\n    return null;\n  }\n\n  function extractLuckysheetCellText(cell) {\n    if (!cell) return '';\n    if (cell.v != null && typeof cell.v === 'object') {\n      return extractLuckysheetCellText(cell.v);\n    }\n    if (cell.m != null && cell.m !== '') {\n      return String(cell.m);\n    }\n    if (cell.v != null && cell.v !== '') {\n      if (typeof cell.v === 'object') {\n        if (cell.v.m != null && cell.v.m !== '') {\n          return String(cell.v.m);\n        }\n        if (cell.v.v != null && cell.v.v !== '') {\n          return String(cell.v.v);\n        }\n      }\n      return String(cell.v);\n    }\n    if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') {\n      return String(cell);\n    }\n    return '';\n  }\n\n  function readLuckysheetCell(sheet, row, column) {\n    const cell = getLuckysheetCell(sheet, row, column);\n    return extractLuckysheetCellText(cell);\n  }\n\n  function compareTemplateParameters(a, b) {\n    const left = Array.isArray(a) ? a : [];\n    const right = Array.isArray(b) ? b : [];\n    if (left.length !== right.length) return false;\n    for (let i = 0; i < left.length; i += 1) {\n      const pa = left[i] || {};\n      const pb = right[i] || {};\n      if ((pa.name || '') !== (pb.name || '')) return false;\n      if ((pa.type || '').toLowerCase() !== (pb.type || '').toLowerCase()) return false;\n      const idxA = pa.parameterIndexes || null;\n      const idxB = pb.parameterIndexes || null;\n      const keyA = idxA ? `${idxA.template || ''}/${idxA.param || ''}/${idxA.indexField || ''}` : '';\n      const keyB = idxB ? `${idxB.template || ''}/${idxB.param || ''}/${idxB.indexField || ''}` : '';\n      if (keyA !== keyB) return false;\n    }\n    return true;\n  }\n\n  function markSheetTemplateValidation(tpl, isValid, message) {\n    if (!tpl) return;\n    ensureTemplateUid(tpl);\n    if (isValid) {\n      sheetTemplateValidation.delete(tpl.__uid);\n    } else {\n      sheetTemplateValidation.set(tpl.__uid, { message: message || '' });\n    }\n  }\n\n  function getLuckysheetUsedRange(sheet) {\n    let maxRow = 1;\n    let maxColumn = 3;\n    const checkCell = (row, column, cell) => {\n      const text = extractLuckysheetCellText(cell);\n      if (text !== '') {\n        if (row > maxRow) maxRow = row;\n        if (column > maxColumn) maxColumn = column;\n      }\n    };\n    if (Array.isArray(sheet?.data)) {\n      sheet.data.forEach((row, rIdx) => {\n        if (!Array.isArray(row)) return;\n        row.forEach((cell, cIdx) => {\n          if (cell == null) return;\n          checkCell(rIdx, cIdx, cell);\n        });\n      });\n    }\n    if (Array.isArray(sheet?.celldata)) {\n      sheet.celldata.forEach((item) => {\n        if (!item) return;\n        const cell = item.v != null ? item.v : item;\n        checkCell(item.r, item.c, cell);\n      });\n    }\n    return { maxRow: Math.max(maxRow, 1), maxColumn: Math.max(maxColumn, 3) };\n  }\n\n  function collectLuckysheetRows(sheet) {\n    const { maxRow, maxColumn } = getLuckysheetUsedRange(sheet);\n    const rows = [];\n    const columnCount = Math.max(maxColumn + 1, 4);\n    const rowCount = Math.max(maxRow + 1, 2);\n    for (let r = 0; r < rowCount; r += 1) {\n      const rowValues = [];\n      for (let c = 0; c < columnCount; c += 1) {\n        rowValues.push(readLuckysheetCell(sheet, r, c));\n      }\n      rows.push(rowValues);\n    }\n    return rows;\n  }\n\n  function normalizeSheetRowsForComparison(rows) {\n    if (!Array.isArray(rows)) return [];\n    const normalized = rows.map((row) => {\n      const list = Array.isArray(row)\n        ? row.map((cell) => String(cell ?? '').trim())\n        : [];\n      let lastIdx = list.length - 1;\n      while (lastIdx >= 0 && list[lastIdx] === '') {\n        lastIdx -= 1;\n      }\n      return list.slice(0, lastIdx + 1);\n    });\n    let lastRow = normalized.length - 1;\n    while (lastRow >= 0 && normalized[lastRow].every((cell) => cell === '')) {\n      lastRow -= 1;\n    }\n    return normalized.slice(0, lastRow + 1);\n  }\n\n  function areSheetRowsEqual(leftRows, rightRows) {\n    const left = normalizeSheetRowsForComparison(leftRows);\n    const right = normalizeSheetRowsForComparison(rightRows);\n    if (left.length !== right.length) return false;\n    for (let r = 0; r < left.length; r += 1) {\n      const rowA = left[r];\n      const rowB = right[r] || [];\n      if (rowA.length !== rowB.length) return false;\n      for (let c = 0; c < rowA.length; c += 1) {\n        if (rowA[c] !== (rowB[c] || '')) return false;\n      }\n    }\n    return true;\n  }\n\n  function getTemplateParameterSignature(tpl) {\n    if (!tpl) return '';\n    const params = (tpl.parameters || []).map((p) => {\n      if (!p) return null;\n      const indexes = p.parameterIndexes || {};\n      return {\n        name: p.name || '',\n        type: p.type || '',\n        template: indexes.template || '',\n        param: indexes.param || '',\n        indexField: indexes.indexField || '',\n      };\n    });\n    return JSON.stringify({ params, indexField: tpl.indexField || 'id' });\n  }\n\n  function computeSheetTemplatesFingerprint() {\n    const items = templates.map((tpl, idx) => {\n      if (!tpl) return null;\n      ensureTemplateUid(tpl);\n      const instances = Array.isArray(tpl.instances) ? tpl.instances : [];\n      return {\n        uid: tpl.__uid,\n        index: idx,\n        count: instances.length,\n        signature: getTemplateParameterSignature(tpl),\n        name: tpl.name || '',\n      };\n    });\n    return JSON.stringify(items);\n  }\n\n  function commitActiveSheetEdits() {\n    if (!isSheetModeActive()) {\n      sheetModeDirty = false;\n      return { ok: true };\n    }\n    if (sheetRenderedTemplateIndex < 0) {\n      sheetModeDirty = false;\n      return { ok: true };\n    }\n    if (!window.luckysheet || typeof window.luckysheet.getluckysheetfile !== 'function') {\n      sheetModeDirty = false;\n      return { ok: true };\n    }\n    const tpl = templates[sheetRenderedTemplateIndex];\n    if (!tpl) {\n      sheetModeDirty = false;\n      return { ok: true };\n    }\n    const sheetId = sheetRenderedSheetIds.get(sheetRenderedTemplateIndex) || tpl.__uid;\n    if (!sheetId) {\n      sheetModeDirty = false;\n      return { ok: true };\n    }\n    const workbook = window.luckysheet.getluckysheetfile();\n    if (!Array.isArray(workbook) || workbook.length === 0) {\n      sheetModeDirty = false;\n      return { ok: true };\n    }\n    const sheet = workbook.find((item) => {\n      if (!item) return false;\n      return item.index === sheetId || item.id === sheetId || item.sheetId === sheetId;\n    }) || workbook.find((item) => Number(item?.status) === 1) || workbook[0];\n    const mergedRows = collectLuckysheetRows(sheet);\n    const currentRows = buildCsvRowsForTemplate(tpl, tpl.instances || []);\n    if (!sheetModeDirty && areSheetRowsEqual(mergedRows, currentRows)) {\n      markSheetTemplateValidation(tpl, true);\n      return { ok: true };\n    }\n    try {\n      const parsed = buildTemplateFromCsv(mergedRows, `${tpl.name || 'template'}.csv`);\n      if ((parsed.name || tpl.name) !== tpl.name) {\n        throw new Error('表格模式不可修改模板名称');\n      }\n      const expectedIndexField = tpl.indexField || 'id';\n      if ((parsed.indexField || 'id') !== expectedIndexField) {\n        throw new Error('表格模式不可修改索引列定义');\n      }\n      const nextParameters = Array.isArray(parsed.parameters) ? parsed.parameters : [];\n      const nextInstances = Array.isArray(parsed.instances) ? parsed.instances : [];\n      tpl.parameters = nextParameters;\n      tpl.instances = nextInstances;\n      tpl.indexField = parsed.indexField || tpl.indexField || 'id';\n      sheetModeDirty = false;\n      currentTemplateIndex = sheetRenderedTemplateIndex;\n      if (tpl.instances.length > 0) {\n        if (currentInstanceIndex < 0) {\n          currentInstanceIndex = 0;\n        }\n        if (currentInstanceIndex >= tpl.instances.length) {\n          currentInstanceIndex = tpl.instances.length - 1;\n        }\n      } else {\n        currentInstanceIndex = -1;\n      }\n      selectedInstances.clear();\n      if (currentInstanceIndex >= 0) {\n        selectedInstances.add(currentInstanceIndex);\n      }\n      markSheetTemplateValidation(tpl, true);\n      sheetRenderedInstanceCount = tpl.instances.length;\n      sheetRenderedParameterSignature = getTemplateParameterSignature(tpl);\n      refreshTemplates();\n      refreshInstances();\n      refreshParams();\n      sheetRenderedTemplatesFingerprint = computeSheetTemplatesFingerprint();\n      refreshActiveLuckysheetDuplicateStyles();\n      return { ok: true };\n    } catch (err) {\n      console.error(err);\n      showMessage(err && err.message ? `表格数据校验失败：${err.message}` : '表格数据校验失败', 'warn');\n      markSheetTemplateValidation(tpl, false, err && err.message ? err.message : '表格数据校验失败');\n      return { ok: false, error: err };\n    }\n  }\n\n  function updateSheetTemplateNav() {\n    if (!sheetTemplateListEl) return;\n    normalizeSheetSelection();\n    sheetTemplateListEl.innerHTML = '';\n    templates.forEach((tpl, idx) => {\n      ensureTemplateUid(tpl);\n      const validation = sheetTemplateValidation.get(tpl.__uid);\n      const li = document.createElement('li');\n      const classes = [];\n      if (idx === sheetActiveTemplateIndex) classes.push('active');\n      if (validation) classes.push('invalid');\n      const duplicateIdInfo = collectDuplicateIdInfo(tpl);\n      const duplicateIdKeys = Array.from(duplicateIdInfo.duplicates.keys());\n      if (duplicateIdKeys.length > 0) {\n        classes.push('duplicate-id');\n      }\n      li.className = classes.join(' ');\n      const tooltipParts = [];\n      if (validation && validation.message) {\n        tooltipParts.push(validation.message);\n      }\n      if (duplicateIdKeys.length > 0) {\n        const preview = duplicateIdKeys\n          .map((key) => (key === '' ? '（空）' : key))\n          .slice(0, 3)\n          .join(', ');\n        const suffix = duplicateIdKeys.length > 3 ? '…' : '';\n        tooltipParts.push(`存在重复 ID：${preview}${suffix}`);\n      }\n      if (tooltipParts.length > 0) {\n        li.title = tooltipParts.join('\\n');\n      } else {\n        li.removeAttribute('title');\n      }\n      const label = document.createElement('span');\n      label.textContent = tpl.name || `模板${idx + 1}`;\n      setInvalidNameVisual(label, isTemplateNameInvalid(tpl.name));\n      li.appendChild(label);\n      li.addEventListener('click', () => {\n        if (idx === sheetActiveTemplateIndex) return;\n        const result = commitActiveSheetEdits();\n        if (result && result.ok === false) {\n          updateSheetTemplateNav();\n          return;\n        }\n        sheetActiveTemplateIndex = idx;\n        currentTemplateIndex = idx;\n        selectedTemplates.clear();\n        selectedTemplates.add(idx);\n        const instanceCount = Array.isArray(templates[idx]?.instances) ? templates[idx].instances.length : 0;\n        currentInstanceIndex = instanceCount > 0 ? Math.min(Math.max(currentInstanceIndex, 0), instanceCount - 1) : -1;\n        sheetActiveInstanceIndex = currentInstanceIndex;\n        selectedInstances.clear();\n        if (currentInstanceIndex >= 0) {\n          selectedInstances.add(currentInstanceIndex);\n        }\n        refreshTemplates();\n        refreshInstances();\n        refreshParams();\n        updateSheetTemplateNav();\n        updateSheetInstanceTabs();\n        renderLuckysheetForActiveInstance();\n      });\n      sheetTemplateListEl.appendChild(li);\n    });\n  }\n\n  function updateSheetInstanceTabs() {\n    if (!sheetInstanceTabsEl) return;\n    normalizeSheetSelection();\n    sheetInstanceTabsEl.innerHTML = '';\n    const tpl = sheetActiveTemplateIndex >= 0 ? templates[sheetActiveTemplateIndex] : null;\n    const instList = tpl && Array.isArray(tpl.instances) ? tpl.instances : [];\n    const info = document.createElement('div');\n    info.className = 'sheet-tabs-empty';\n    if (!tpl) {\n      info.textContent = '暂无模板，无法进入表格编辑。';\n    } else if (instList.length === 0) {\n      info.textContent = '该模板还没有实例，请在三列模式下创建后再切换。';\n    } else {\n      info.textContent = `当前模板共有 ${instList.length} 个实例，均已在表格中显示。`;\n    }\n    sheetInstanceTabsEl.appendChild(info);\n  }\n\n  function renderLuckysheetForActiveInstance() {\n    if (!luckysheetContainer || !sheetModePanel) return;\n    normalizeSheetSelection();\n    if (!window.luckysheet) {\n      showMessage('Luckysheet 库未加载，无法进入表格模式', 'warn');\n      return;\n    }\n    if (sheetActiveTemplateIndex < 0 || sheetActiveTemplateIndex >= templates.length) {\n      sheetRenderedTemplateIndex = -1;\n      sheetRenderedInstanceIndex = -1;\n      sheetRenderedInstanceCount = 0;\n      sheetRenderedParameterSignature = '';\n      if (sheetEmptyStateEl) {\n        sheetEmptyStateEl.style.display = 'flex';\n        const msg = sheetEmptyStateEl.querySelector('p');\n        if (msg) {\n          msg.textContent = '请选择一个包含实例的模板以进入表格编辑模式。';\n        }\n      }\n      luckysheetContainer.style.display = 'none';\n      return;\n    }\n    const tpl = templates[sheetActiveTemplateIndex];\n    const instList = Array.isArray(tpl.instances) ? tpl.instances : [];\n    const fingerprint = computeSheetTemplatesFingerprint();\n    const needsRebuild = !luckysheetInitialized || sheetRenderedTemplatesFingerprint !== fingerprint;\n    if (needsRebuild) {\n      const workbookSheets = [];\n      sheetRenderedSheetIds.clear();\n      sheetDuplicateIdRows.clear();\n      let activeSheetPrepared = false;\n      templates.forEach((template, idx) => {\n        if (!template) return;\n        ensureTemplateUid(template);\n        const instances = Array.isArray(template.instances) ? template.instances : [];\n        if (instances.length === 0) return;\n        const sheetId = template.__uid;\n        const rows = buildCsvRowsForTemplate(template, instances);\n        const sheetName = template?.name || `模板${idx + 1}`;\n        const status = idx === sheetActiveTemplateIndex && instList.length > 0 ? 1 : 0;\n        if (status === 1) {\n          activeSheetPrepared = true;\n        }\n        const duplicateIdInfo = collectDuplicateIdInfo(template);\n        const duplicateRowSet = new Set(\n          Array.from(duplicateIdInfo.byIndex.keys()).map((instanceIdx) => instanceIdx + 2)\n        );\n        const sheetData = buildLuckysheetSheetFromRows(rows, sheetName, {\n          index: sheetId,\n          order: workbookSheets.length,\n          status,\n          duplicateIdRows: duplicateRowSet,\n        });\n        workbookSheets.push(sheetData);\n        sheetRenderedSheetIds.set(idx, sheetId);\n        sheetDuplicateIdRows.set(sheetId, duplicateRowSet);\n      });\n      if (workbookSheets.length === 0) {\n        if (window.luckysheet?.destroy && luckysheetInitialized) {\n          window.luckysheet.destroy();\n        }\n        luckysheetInitialized = false;\n        sheetModeDirty = false;\n        sheetRenderedTemplatesFingerprint = fingerprint;\n      } else {\n        if (!activeSheetPrepared) {\n          workbookSheets[0].status = 1;\n        }\n        if (window.luckysheet?.destroy && luckysheetInitialized) {\n          window.luckysheet.destroy();\n        }\n        const hook = {\n          cellUpdateBefore(row, column) {\n            if (column === 0) {\n              showMessage('模板列由系统维护，无法修改', 'warn');\n              return false;\n            }\n            if (column === 1 && row <= 1) {\n              showMessage('ID 列标题不可修改', 'warn');\n              return false;\n            }\n            if (column === 2) {\n              showMessage('索引列由系统维护，无法修改', 'warn');\n              return false;\n            }\n            if ((row === 0 || row === 1) && column === 3) {\n              showMessage('保留字段不可编辑', 'warn');\n              return false;\n            }\n            return true;\n          },\n          cellUpdate() {\n            sheetModeDirty = true;\n            setTimeout(refreshActiveLuckysheetDuplicateStyles, 0);\n          },\n        };\n        window.luckysheet?.create({\n          container: 'luckysheet',\n          data: workbookSheets,\n          showtoolbar: false,\n          showsheetbar: false,\n          showinfobar: false,\n          lang: 'zh',\n          hook,\n        });\n        luckysheetInitialized = true;\n        sheetModeDirty = false;\n        sheetRenderedTemplatesFingerprint = fingerprint;\n      }\n    }\n    if (!luckysheetInitialized || sheetRenderedSheetIds.size === 0) {\n      sheetRenderedTemplateIndex = -1;\n      sheetRenderedInstanceIndex = -1;\n      sheetRenderedInstanceCount = 0;\n      sheetRenderedParameterSignature = '';\n      if (sheetEmptyStateEl) {\n        sheetEmptyStateEl.style.display = 'flex';\n        const msg = sheetEmptyStateEl.querySelector('p');\n        if (msg) {\n          if (templates.length === 0) {\n            msg.textContent = '暂无模板，无法进入表格编辑模式。';\n          } else {\n            msg.textContent = '请选择一个包含实例的模板以进入表格编辑模式。';\n          }\n        }\n      }\n      luckysheetContainer.style.display = 'none';\n      return;\n    }\n    if (instList.length === 0 || !sheetRenderedSheetIds.has(sheetActiveTemplateIndex)) {\n      sheetRenderedTemplateIndex = sheetActiveTemplateIndex;\n      sheetRenderedInstanceIndex = -1;\n      sheetRenderedInstanceCount = 0;\n      sheetRenderedParameterSignature = '';\n      if (sheetEmptyStateEl) {\n        sheetEmptyStateEl.style.display = 'flex';\n        const msg = sheetEmptyStateEl.querySelector('p');\n        if (msg) {\n          msg.textContent = '当前模板没有实例，请回到三列模式新增实例。';\n        }\n      }\n      luckysheetContainer.style.display = 'none';\n      return;\n    }\n    const activeSheetId = sheetRenderedSheetIds.get(sheetActiveTemplateIndex);\n    if (!needsRebuild) {\n      const activated = activateLuckysheetSheet(activeSheetId);\n      if (!activated) {\n        if (window.luckysheet?.destroy && luckysheetInitialized) {\n          window.luckysheet.destroy();\n        }\n        luckysheetInitialized = false;\n        sheetRenderedTemplatesFingerprint = '';\n        renderLuckysheetForActiveInstance();\n        return;\n      }\n    }\n    sheetRenderedTemplateIndex = sheetActiveTemplateIndex;\n    sheetRenderedInstanceIndex = -1;\n    sheetRenderedInstanceCount = instList.length;\n    sheetRenderedParameterSignature = getTemplateParameterSignature(tpl);\n    luckysheetContainer.style.display = 'block';\n    if (sheetEmptyStateEl) sheetEmptyStateEl.style.display = 'none';\n    refreshActiveLuckysheetDuplicateStyles();\n  }\n\n  function enterSheetMode() {\n    document.body.classList.add('sheet-mode');\n    normalizeSheetSelection();\n    updateSheetTemplateNav();\n    updateSheetInstanceTabs();\n    renderLuckysheetForActiveInstance();\n  }\n\n  function exitSheetMode() {\n    document.body.classList.remove('sheet-mode');\n    if (window.luckysheet?.destroy && luckysheetInitialized) {\n      window.luckysheet.destroy();\n    }\n    luckysheetInitialized = false;\n    sheetModeDirty = false;\n    sheetRenderedTemplateIndex = -1;\n    sheetRenderedInstanceIndex = -1;\n    sheetRenderedInstanceCount = 0;\n    sheetRenderedParameterSignature = '';\n    sheetRenderedTemplatesFingerprint = '';\n    sheetRenderedSheetIds.clear();\n    sheetDuplicateIdRows.clear();\n    if (luckysheetContainer) luckysheetContainer.style.display = 'none';\n    if (sheetEmptyStateEl) sheetEmptyStateEl.style.display = 'none';\n  }\n\n  function setEditMode(nextMode) {\n    if (nextMode === currentEditMode) return;\n    if (nextMode === EDIT_MODES.SHEET && (!window.luckysheet || typeof window.luckysheet.create !== 'function')) {\n      showMessage('Luckysheet 库未加载，无法切换到表格模式', 'warn');\n      return;\n    }\n    if (currentEditMode === EDIT_MODES.SHEET) {\n      const result = commitActiveSheetEdits();\n      if (result && result.ok === false) {\n        updateSheetTemplateNav();\n        return;\n      }\n    }\n    currentEditMode = nextMode;\n    if (toggleEditModeBtn) {\n      toggleEditModeBtn.dataset.mode = nextMode;\n      toggleEditModeBtn.textContent = nextMode === EDIT_MODES.SHEET ? '返回三列模式' : '表格模式';\n    }\n    if (nextMode === EDIT_MODES.SHEET) {\n      enterSheetMode();\n    } else {\n      exitSheetMode();\n    }\n  }\n\nreturn { buildLuckysheetCell, buildLuckysheetSheetFromRows, applyLuckysheetDuplicateIdStyles, refreshActiveLuckysheetDuplicateStyles, activateLuckysheetSheet, getLuckysheetCell, extractLuckysheetCellText, readLuckysheetCell, compareTemplateParameters, markSheetTemplateValidation, getLuckysheetUsedRange, collectLuckysheetRows, normalizeSheetRowsForComparison, areSheetRowsEqual, getTemplateParameterSignature, computeSheetTemplatesFingerprint, commitActiveSheetEdits, updateSheetTemplateNav, updateSheetInstanceTabs, renderLuckysheetForActiveInstance, enterSheetMode, exitSheetMode, setEditMode };\n}";
  function createSheetModeModule(context) {
    ensureContext8(context);
    const extraLocals = (() => {
      return {
        $: (id) => document.getElementById(id),
        createDefaultCompareValueState: context.createDefaultCompareValueState || (() => ({ active: false, templateUid: null, type: "normal", params: [], keys: [] }))
      };
    })();
    const scope = createLegacyScope4(context, DOM_ID_MAP4, extraLocals);
    const factory = new Function("scope", FACTORY_SOURCE4);
    return factory(scope);
  }

  // src/generators/csharp-runtime-generator.js
  function ensureContext9(context) {
    if (!context || typeof context !== "object") {
      throw new Error("createCSharpRuntimeGeneratorModule requires a context object");
    }
    if (!context.appState || typeof context.appState !== "object") {
      throw new Error("createCSharpRuntimeGeneratorModule requires appState");
    }
  }
  function buildModelStructContent() {
    return [
      "using System;",
      "using System.Collections.Generic;",
      "using Newtonsoft.Json;",
      "using Newtonsoft.Json.Linq;",
      "",
      "[Serializable]",
      "public class TableSchema",
      "{",
      "    public string name;",
      "    public string indexField;",
      "    public List<ParamDef> parameters;",
      "    public Dictionary<string, object> instances;",
      "}",
      "",
      "[Serializable]",
      "public class ParamDef",
      "{",
      "    public string name;",
      "    public string type;",
      "    public ParameterIndexBinding parameterIndexes;",
      "}",
      "",
      "[Serializable]",
      "public class ParameterIndexBinding",
      "{",
      "    public string template;",
      "    public string param;",
      "    public string indexField;",
      "}",
      "",
      "[Serializable]",
      "public class Row",
      "{",
      "    public int id;",
      "    public string name;",
      "    public Dictionary<string, object> payload; // 或Newtonsoft.Json.Linq.JObject payload;",
      "}",
      "",
      "[Serializable]",
      "public class DataRef",
      "{",
      '    public string template;  // 对应 JSON 里的 "template"',
      '    public string by;        // 对应 JSON 里的 "by"',
      '    public string value;     // 对应 JSON 里的 "value"',
      "",
      "    [JsonIgnore]",
      "    public object instance;  // 解析完后指向目标实例",
      "}",
      "",
      "public class DataRefConverter : JsonConverter<DataRef>",
      "{",
      "    public override DataRef ReadJson(JsonReader reader, Type objectType, DataRef existingValue, bool hasExistingValue, JsonSerializer serializer)",
      "    {",
      "        if (reader == null)",
      "        {",
      "            return null;",
      "        }",
      "        if (reader.TokenType == JsonToken.Null)",
      "        {",
      "            return null;",
      "        }",
      "        if (reader.TokenType == JsonToken.String)",
      "        {",
      "            return new DataRef { value = reader.Value?.ToString() };",
      "        }",
      "        var jToken = JToken.Load(reader);",
      "        if (jToken == null || jToken.Type == JTokenType.Null)",
      "        {",
      "            return null;",
      "        }",
      "        if (jToken.Type == JTokenType.String)",
      "        {",
      "            return new DataRef { value = jToken.ToString() };",
      "        }",
      "        return jToken.ToObject<DataRef>();",
      "    }",
      "",
      "    public override void WriteJson(JsonWriter writer, DataRef value, JsonSerializer serializer)",
      "    {",
      "        if (writer == null)",
      "        {",
      "            return;",
      "        }",
      "        if (value == null)",
      "        {",
      "            writer.WriteNull();",
      "            return;",
      "        }",
      "        var jObject = JObject.FromObject(value, serializer);",
      "        jObject.WriteTo(writer);",
      "    }",
      "}",
      ""
    ].join("\n");
  }
  function buildUnityRuntimeLoaderContent() {
    return `
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
    private const string DefaultManifestName = "manifest.json";
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

    private static readonly Dictionary<string, string> ManifestIndex = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    private static readonly Dictionary<string, TableSchema> SchemaCache = new Dictionary<string, TableSchema>(StringComparer.OrdinalIgnoreCase);
    private static string _dataDirectory = string.Empty;
    private static bool _initialized;

    public static IReadOnlyDictionary<string, TableSchema> Schemas => SchemaCache;

    public static void Initialize(string dataDirectory = null)
    {
        _dataDirectory = string.IsNullOrWhiteSpace(dataDirectory)
            ? Path.GetFullPath(Path.Combine(Application.dataPath, "dataEntity"))
            : Path.GetFullPath(dataDirectory);
        LoadAll();
    }

    public static TableSchema GetSchema(string templateName)
    {
        EnsureInitialized();
        if (!SchemaCache.TryGetValue(templateName, out var schema))
        {
            throw new KeyNotFoundException($"\\u6a21\\u677f {templateName} \\u672a\\u52a0\\u8f7d\\u3002");
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
            throw new ArgumentException("\\u6a21\\u677f\\u540d\\u4e0d\\u80fd\\u4e3a\\u7a7a", nameof(templateName));
        }
        if (string.IsNullOrWhiteSpace(parameterName))
        {
            throw new ArgumentException("\\u53c2\\u6570\\u540d\\u4e0d\\u80fd\\u4e3a\\u7a7a", nameof(parameterName));
        }
        if (!SchemaCache.TryGetValue(templateName, out var schema))
        {
            throw new KeyNotFoundException($"\\u6a21\\u677f {templateName} \\u672a\\u627e\\u5230\\u3002");
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
                throw new InvalidOperationException($"{identifier} \\u662f\\u7d22\\u5f15\\u53c2\\u6570\\uff0c\\u65e0\\u6cd5\\u6b63\\u5e38\\u8bfb\\u53d6");
            }
        }
        else if (!string.IsNullOrWhiteSpace(getParameter))
        {
            var identifier = FormatInstanceIdentifier(templateName, instanceName, indexKey, parameterName);
            throw new InvalidOperationException($"{identifier} \\u4e0d\\u662f\\u7d22\\u5f15\\u53c2\\u6570\\uff0c\\u4e0d\\u914dgetparameter\\u3002");
        }

        var instance = LocateInstance(schema, instanceName, indexKey);
        var payload = ExtractPayload(instance);
        if (payload == null)
        {
            throw new InvalidOperationException($"\\u5b9e\\u4f8b {instanceName ?? indexKey} \\u4e0d\\u5305\\u542b payload\\u3002");
        }
        if (!payload.TryGetValue(parameterName, out var rawValue))
        {
            throw new KeyNotFoundException($"\\u5b9e\\u4f8b\\u4e2d\\u672a\\u627e\\u5230\\u53c2\\u6570 {parameterName}\\u3002");
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
            throw new InvalidOperationException($"{identifierFull} \\u7d22\\u5f15\\u89e3\\u6790\\u5931\\u8d25\\u3002");
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
            throw new KeyNotFoundException($"{identifierFull} \\u672a\\u627e\\u5230\\u7d22\\u5f15\\u5b9e\\u4f8b\\u3002");
        }

        var referencedPayload = ExtractPayload(dataRef.instance);
        if (referencedPayload == null || !referencedPayload.TryGetValue(getParameter, out var indexedValue))
        {
            throw new KeyNotFoundException($"{identifierFull} \\u7d22\\u5f15\\u5b9e\\u4f8b\\u6ca1\\u6709\\u53c2\\u6570 {getParameter}\\u3002");
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
                throw new InvalidOperationException("\\u8bf7\\u5148\\u8c03\\u7528 Initialize \\u6307\\u5b9a\\u6570\\u636e\\u76ee\\u5f55\\u3002");
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
            throw new FileNotFoundException($"\\u672a\\u627e\\u5230 manifest \\u6587\\u4ef6: {manifestPath}");
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
                Debug.LogError($"\\u52a0\\u8f7d\\u6a21\\u677f {kv.Key} \\u5931\\u8d25: {ex.Message}\\n{ex.StackTrace}");
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
                    param.parameterIndexes.indexField = target.indexField ?? "id";
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
            throw new FileNotFoundException($"\\u627e\\u4e0d\\u5230\\u6a21\\u677f {templateName} \\u7684\\u6570\\u636e\\u6587\\u4ef6", filePath);
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
            indexField = string.IsNullOrWhiteSpace(raw.indexField) ? "id" : raw.indexField,
            parameters = raw.parameters ?? new List<ParamDef>(),
            instances = BuildInstanceDictionary(templateName, raw.instances)
        };
        return schema;
    }

    private static Dictionary<string, object> BuildInstanceDictionary(string templateName, List<RawInstance> instances)
    {
        var result = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        if (instances == null || instances.Count == 0)
        {
            return result;
        }

        var grouped = new Dictionary<string, List<RawInstance>>(StringComparer.OrdinalIgnoreCase);
        foreach (var inst in instances)
        {
            var payloadIndex = inst?.payload?.Value<string>("index");
            var key = string.IsNullOrWhiteSpace(payloadIndex) ? inst?.id.ToString() ?? Guid.NewGuid().ToString("N") : payloadIndex;
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
                    .Select(r => !string.IsNullOrEmpty(r?.name) ? r.name : r?.payload?.Value<string>("name") ?? string.Empty)
                    .Where(n => !string.IsNullOrEmpty(n))
                    .ToList();
                if (names.Count > 0)
                {
                    duplicateMessages.Add($"{templateName}[{string.Join(",", names)}]");
                }
            }
            for (var i = 0; i < ordered.Count; i++)
            {
                var suffix = i == 0 ? string.Empty : $"_{i}";
                var baseKey = string.IsNullOrEmpty(kv.Key) ? ordered[i]?.id.ToString() ?? $"__generated_{i}" : kv.Key;
                var finalKey = baseKey + suffix;
                var attempt = 1;
                while (result.ContainsKey(finalKey))
                {
                    finalKey = $"{baseKey}_{attempt++}";
                }
                result[finalKey] = ordered[i]?.ToDictionary();
            }
        }

        if (duplicateMessages.Count > 0)
        {
            Debug.LogError($"{string.Join(",", duplicateMessages)} \\u91cd\\u590d\\u5b9e\\u4f8b \\u8fd9\\u4e9b\\u5b9e\\u4f8b\\u7684index\\u91cd\\u590d\\u5bfc\\u5165\\u5931\\u8d25");
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
        return schema.parameters.FirstOrDefault(p => p != null && string.Equals(p.name, parameterName, StringComparison.OrdinalIgnoreCase));
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
            Debug.LogError($"{FormatInstanceIdentifier(ownerSchema?.name, instanceName, indexKey, paramDef?.name)} \\u5f15\\u7528\\u7684\\u6a21\\u677f {targetTemplate} \\u672a\\u52a0\\u8f7d\\u3002");
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
            Debug.LogError($"{FormatInstanceIdentifier(ownerSchema?.name, instanceName, indexKey, paramDef?.name)} \\u7d22\\u5f15 {targetTemplate}.{matchField} = {dataRef.value} \\u672a\\u627e\\u5230\\u7d22\\u5f15\\u5b9e\\u4f8b\\u3002");
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
            if (string.Equals(fieldName, "index", StringComparison.OrdinalIgnoreCase)
                || (!string.IsNullOrEmpty(schema.indexField) && string.Equals(fieldName, schema.indexField, StringComparison.OrdinalIgnoreCase)))
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
            if (string.Equals(candidateValue, expectedValue, StringComparison.OrdinalIgnoreCase))
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
            throw new InvalidOperationException($"\\u6a21\\u677f {schema.name} \\u6ca1\\u6709\\u52a0\\u8f7d\\u4efb\\u4f55\\u5b9e\\u4f8b\\u3002");
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
                var name = payload != null && payload.TryGetValue("name", out var v) ? v?.ToString() : null;
                if (!string.IsNullOrEmpty(name) && string.Equals(name, instanceName, StringComparison.OrdinalIgnoreCase))
                {
                    return kv.Value;
                }
            }
        }

        throw new KeyNotFoundException($"\\u672a\\u627e\\u5230\\u5b9e\\u4f8b\\uff1a\\u6a21\\u677f={schema.name}, \\u540d\\u79f0={instanceName}, \\u7d22\\u5f15={indexKey}");
    }

    private static Dictionary<string, object> ExtractPayload(object instance)
    {
        if (instance is RawInstance raw)
        {
            return raw.payload?.ToObject<Dictionary<string, object>>();
        }
        if (instance is Dictionary<string, object> dict)
        {
            if (dict.TryGetValue("payload", out var payloadObj))
            {
                return ConvertToDictionary(payloadObj);
            }
            return dict;
        }
        if (instance is JObject jObject)
        {
            var payload = jObject["payload"] ?? jObject;
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
            throw new InvalidCastException($"\\u6a21\\u677f {templateName} \\u7684\\u53c2\\u6570 {parameterName} \\u65e0\\u6cd5\\u8f6c\\u6362\\u4e3a {targetType.Name}", ex);
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
        var sanitized = relativePath.Replace("\\\\", "/").TrimStart('.', '/');
        if (sanitized.StartsWith("dataEntity/", StringComparison.OrdinalIgnoreCase))
        {
            sanitized = sanitized.Substring("dataEntity/".Length);
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
                { "id", id },
                { "name", name },
                { "payload", payload != null ? payload.ToObject<Dictionary<string, object>>() : new Dictionary<string, object>() }
            };
        }
    }
}
`;
  }
  function buildUnityRuntimeLoaderGuideContent() {
    return `
DataEntityRuntimeLoader 使用说明
================================

1. 初始化
   // dataEntity 目录位于 Assets 目录下时可直接调用
   DataEntityRuntimeLoader.Initialize();
   // 或者显式传入路径
   DataEntityRuntimeLoader.Initialize(Path.Combine(Application.dataPath, "dataEntity"));

2. 读取参数
   // 普通参数：支持通过实例名或索引键查询
   var damage = DataEntityRuntimeLoader.GetValue<int>("TemplateName", null, "indexKey", "damage");
   // 索引参数：通过 getParameter 指定引用实例中的字段
   var hp = DataEntityRuntimeLoader.GetValue<int>("TemplateName", "实例名称", null, "refParam", "hp");
   // 若需直接访问 DataRef 及其索引值
   var dataRef = DataEntityRuntimeLoader.GetIndexReference("TemplateName", "实例名称", null, "refParam");
   var refKey = DataEntityRuntimeLoader.GetIndexValue("TemplateName", "实例名称", null, "refParam");

3. 获取完整模板
   var schema = DataEntityRuntimeLoader.GetSchema("TemplateName");
   // schema.instances 为 Dictionary<string, object>

4. 热重载
   DataEntityRuntimeLoader.Reload(); // 自动暂停并恢复 EditorApplication.isPaused

注意事项:
- manifest.json 位于 dataEntity 目录，path 字段是 JSON 文件名。
- 重复的实例索引会在控制台输出错误，并为后续实例追加 _1/_2 后缀。
- 索引参数必须通过带 getParameter 的 GetValue 重载或 GetIndexReference/GetIndexValue 访问，直接读取会抛出异常。
- 如果索引实例缺少 getParameter 指定的字段，会抛出异常并在控制台打印错误。
- 如果请求的参数类型不匹配会抛出 InvalidCastException。
`;
  }
  function buildUnityRuntimeTesterContent() {
    return `
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
  }
  function buildRuntimeTesterEditorContent() {
    return `
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
  }
  function buildUnityRuntimeTesterGuideContent() {
    return `
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
  }
  function buildGodotReloadBlock() {
    return `public static void Reload()
    {
        if (string.IsNullOrWhiteSpace(_dataDirectory))
        {
            throw new InvalidOperationException("Please call Initialize before Reload.");
        }
        LoadAll();
    }`;
  }
  function buildGodotResolvePathBlock() {
    return `    private static string ResolvePath(string relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath))
        {
            return _dataDirectory;
        }
        if (IsVirtualPath(relativePath))
        {
            return NormalizeSeparators(relativePath);
        }
        if (Path.IsPathRooted(relativePath))
        {
            return Path.GetFullPath(relativePath);
        }
        var sanitized = NormalizeSeparators(relativePath).TrimStart('.', '/');
        if (sanitized.StartsWith("dataEntity/", StringComparison.OrdinalIgnoreCase))
        {
            sanitized = sanitized.Substring("dataEntity/".Length);
        }
        if (string.IsNullOrEmpty(_dataDirectory))
        {
            return sanitized;
        }
        if (IsVirtualPath(_dataDirectory))
        {
            return CombineVirtualPath(_dataDirectory, sanitized);
        }
        return Path.GetFullPath(Path.Combine(_dataDirectory, sanitized));
    }`;
  }
  function buildGodotLoaderHelpersBlock() {
    return `    private static string NormalizeDataDirectory(string dataDirectory)
    {
        var basePath = string.IsNullOrWhiteSpace(dataDirectory) ? "res://dataEntity" : dataDirectory;
        if (IsVirtualPath(basePath))
        {
            return NormalizeSeparators(basePath);
        }
        return Path.GetFullPath(basePath);
    }

    private static bool FileExists(string path)
    {
        return IsVirtualPath(path) ? GodotFileAccess.FileExists(path) : File.Exists(path);
    }

    private static string ReadAllText(string path)
    {
        if (!IsVirtualPath(path))
        {
            return File.ReadAllText(path);
        }
        using var file = GodotFileAccess.Open(path, GodotFileAccess.ModeFlags.Read);
        if (file == null)
        {
            throw new FileNotFoundException($"Failed to open file: {path}; error={GodotFileAccess.GetOpenError()}");
        }
        return file.GetAsText();
    }

    private static void LogError(string message)
    {
        GD.PrintErr(message);
    }

    private static bool IsVirtualPath(string path)
    {
        return !string.IsNullOrWhiteSpace(path)
            && (path.StartsWith("res://", StringComparison.OrdinalIgnoreCase)
                || path.StartsWith("user://", StringComparison.OrdinalIgnoreCase));
    }

    private static string NormalizeSeparators(string path)
    {
        return string.IsNullOrWhiteSpace(path) ? string.Empty : path.Replace("\\\\", "/");
    }

    private static string CombineVirtualPath(string basePath, string relativePath)
    {
        var left = NormalizeSeparators(basePath).TrimEnd('/');
        var right = NormalizeSeparators(relativePath).TrimStart('/');
        return string.IsNullOrEmpty(right) ? left : $"{left}/{right}";
    }

`;
  }
  function buildGodotRuntimeLoaderContent() {
    return buildUnityRuntimeLoaderContent().replace(
      `using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif`,
      `using Godot;
using GodotFileAccess = Godot.FileAccess;`
    ).replace(
      `_dataDirectory = string.IsNullOrWhiteSpace(dataDirectory)
            ? Path.GetFullPath(Path.Combine(Application.dataPath, "dataEntity"))
            : Path.GetFullPath(dataDirectory);`,
      `_dataDirectory = NormalizeDataDirectory(dataDirectory);`
    ).replace(
      `public static void Reload()
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
                throw new InvalidOperationException("\\u8bf7\\u5148\\u8c03\\u7528 Initialize \\u6307\\u5b9a\\u6570\\u636e\\u76ee\\u5f55\\u3002");
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
    }`,
      buildGodotReloadBlock()
    ).replaceAll("Debug.LogError", "LogError").replaceAll("File.Exists", "FileExists").replaceAll("File.ReadAllText", "ReadAllText").replace(
      `    private static string ResolvePath(string relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath))
        {
            return _dataDirectory;
        }
        if (Path.IsPathRooted(relativePath))
        {
            return relativePath;
        }
        var sanitized = relativePath.Replace("\\\\", "/").TrimStart('.', '/');
        if (sanitized.StartsWith("dataEntity/", StringComparison.OrdinalIgnoreCase))
        {
            sanitized = sanitized.Substring("dataEntity/".Length);
        }
        var combined = string.IsNullOrEmpty(_dataDirectory) ? sanitized : Path.Combine(_dataDirectory, sanitized);
        return Path.GetFullPath(combined);
    }`,
      buildGodotResolvePathBlock()
    ).replace("    private class ManifestRecord", `${buildGodotLoaderHelpersBlock()}    private class ManifestRecord`);
  }
  function buildGodotRuntimeLoaderGuideContent() {
    return `
DataEntityRuntimeLoader for Godot
================================

1. Dependency
- Add the Newtonsoft.Json package to your Godot C# project.
- Generated files still use Newtonsoft.Json / Newtonsoft.Json.Linq, just like Unity mode.

2. Initialize
- Default data directory: \`res://dataEntity\`
- Or pass an absolute path / \`user://\` / \`res://\` path manually.

3. Read values
- \`DataEntityRuntimeLoader.GetValue<T>("Template", null, "indexKey", "damage")\`
- \`DataEntityRuntimeLoader.GetValue<T>("Template", "InstanceName", null, "refParam", "hp")\`
- \`DataEntityRuntimeLoader.GetIndexReference(...)\`

4. Reload
- \`DataEntityRuntimeLoader.Reload()\`
- Godot mode does not generate a Unity-style custom inspector or Editor pause behavior.

Notes
- Keep \`manifest.json\` and all template JSON files under \`dataEntity/\`.
- Virtual Godot paths (\`res://\`, \`user://\`) are read via \`Godot.FileAccess\`.
- Absolute OS paths are read via \`System.IO\`.
`;
  }
  function buildGodotRuntimeTesterContent() {
    return `
using System;
using System.Collections.Generic;
using Godot;

[GlobalClass]
public partial class DataEntityRuntimeTester : Node
{
    public enum TestOperation
    {
        Initialize,
        Reload,
        GetValue,
    }

    [Export]
    public bool ExecuteOnReady { get; set; }

    [Export]
    public TestOperation Operation { get; set; } = TestOperation.Initialize;

    [Export]
    public string DataDirectory { get; set; } = string.Empty;

    [Export]
    public string TemplateName { get; set; } = string.Empty;

    [Export]
    public string InstanceName { get; set; } = string.Empty;

    [Export]
    public string IndexKey { get; set; } = string.Empty;

    [Export]
    public string ParameterName { get; set; } = string.Empty;

    [Export]
    public string ParameterType { get; set; } = "string";

    [Export]
    public string GetParameter { get; set; } = string.Empty;

    public override void _Ready()
    {
        if (ExecuteOnReady)
        {
            ExecuteSelectedOperation();
        }
    }

    public void ExecuteSelectedOperation()
    {
        try
        {
            switch (Operation)
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
                    GD.PushError("Unsupported operation");
                    break;
            }
        }
        catch (Exception ex)
        {
            GD.PushError($"[DataEntityRuntimeTester] {ex.Message}\\n{ex}");
        }
    }

    private void ExecuteInitialize()
    {
        var path = string.IsNullOrWhiteSpace(DataDirectory) ? null : DataDirectory;
        DataEntityRuntimeLoader.Initialize(path);
        GD.Print("[DataEntityRuntimeTester] Initialize completed");
    }

    private void ExecuteReload()
    {
        DataEntityRuntimeLoader.Reload();
        GD.Print("[DataEntityRuntimeTester] Reload completed");
    }

    private void ExecuteGetValue()
    {
        if (string.IsNullOrWhiteSpace(TemplateName) || string.IsNullOrWhiteSpace(ParameterName))
        {
            GD.PushError("输入不合法");
            return;
        }

        var type = ResolveParameterType(ParameterType);
        if (type == null)
        {
            GD.PushError("参数类型不合法");
            return;
        }

        var instance = string.IsNullOrWhiteSpace(InstanceName) ? null : InstanceName;
        var index = string.IsNullOrWhiteSpace(IndexKey) ? null : IndexKey;

        object value;
        if (string.IsNullOrWhiteSpace(GetParameter))
        {
            value = DataEntityRuntimeLoader.GetValue(TemplateName, instance, index, ParameterName, type);
        }
        else
        {
            value = DataEntityRuntimeLoader.GetValue(TemplateName, instance, index, ParameterName, type, GetParameter);
        }

        var identifier = !string.IsNullOrWhiteSpace(instance) ? instance : index;
        var valueText = value == null ? "<null>" : value.ToString();
        GD.Print($"{TemplateName}/{identifier ?? "(null)"}/{ParameterName}/{valueText}");
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
  }
  function buildGodotRuntimeTesterGuideContent() {
    return `
DataEntityRuntimeTester (Godot C#) 使用说明
================================

挂载脚本
1. 将 godotCsharpDate/DataEntityRuntimeTester.cs 挂到任意 Node。
2. 默认读取 res://dataEntity；如果导出目录不在项目根目录，可在 DataDirectory 中填写绝对路径。
3. Godot 侧没有 Unity Inspector 那样的自定义按钮面板，建议通过以下任一方式执行：
   - 在 Inspector 中将 ExecuteOnReady 设为 true，然后直接运行场景。
   - 在自己的调试脚本中调用 tester.ExecuteSelectedOperation()。

操作说明
- Initialize：初始化运行时缓存，空路径时默认使用 res://dataEntity。
- Reload：重新读取 manifest.json 与全部模板 JSON。
- GetValue：读取模板参数；若目标参数是索引参数，请在 GetParameter 中填写要追读的字段。

注意事项
- 该测试脚本依赖 DataEntityRuntimeLoader.cs 与 modelCsharpe.cs 一起存在。
- Godot 项目需要引用 Newtonsoft.Json。
- 输出日志使用 GD.Print / GD.PushError，可在 Output 面板查看。
`;
  }
  function createCSharpRuntimeGeneratorModule(context) {
    ensureContext9(context);
    const {
      appState,
      isUnityMode = () => true,
      isGodotMode = () => false,
      isCSharpMode = () => isUnityMode() || isGodotMode(),
      getCurrentEngineLabel = () => "C#",
      ensureEngineGenerationConsent = async () => true,
      cleanConflictingEngineArtifacts = async () => {
      },
      ensureSubFolders = async () => {
      },
      writeTextFile = async () => {
      },
      ensureTemplateUid: ensureTemplateUid2 = () => null,
      isEnumTemplate: isEnumTemplate2 = () => false,
      getEnumTemplate: getEnumTemplate2 = () => null,
      getEnumDefinitions: getEnumDefinitions2 = () => [],
      sanitizeCSharpMemberName: sanitizeCSharpMemberName2 = (value) => value,
      getEnumCSharpTypeName: getEnumCSharpTypeName2 = (value) => value,
      getValidListElementType: getValidListElementType2 = () => "string",
      isEnumType: isEnumType2 = () => false,
      showMessage = () => {
      }
    } = context;
    function getCurrentRuntimeVariant() {
      return isGodotMode() ? "godot" : "unity";
    }
    async function ensureModelStruct() {
      if (!appState.csharpHandle) return;
      try {
        appState.modelStructHandle = await appState.csharpHandle.getDirectoryHandle("modelstruct", {
          create: true
        });
        await writeTextFile(
          appState.modelStructHandle,
          "modelCsharpe.cs",
          buildModelStructContent()
        );
      } catch (err) {
        console.warn("ensureModelStruct failed", err);
      }
    }
    async function generateRuntimeLoaderArtifacts() {
      if (!isCSharpMode()) return;
      if (!appState.csharpHandle) return;
      if (!appState.modelStructHandle) {
        await ensureModelStruct();
      }
      if (!appState.modelStructHandle) return;
      const runtimeVariant = getCurrentRuntimeVariant();
      if (runtimeVariant === "unity" && !appState.editorHandle && appState.csharpHandle) {
        try {
          appState.editorHandle = await appState.csharpHandle.getDirectoryHandle("Editor", {
            create: true
          });
        } catch (err) {
          console.warn("generateRuntimeLoaderArtifacts 无法访问 Editor 文件夹", err);
          appState.editorHandle = null;
        }
      }
      if (runtimeVariant !== "unity") {
        appState.editorHandle = null;
      }
      await writeTextFile(
        appState.modelStructHandle,
        "DataEntityRuntimeLoader.cs",
        runtimeVariant === "godot" ? buildGodotRuntimeLoaderContent() : buildUnityRuntimeLoaderContent()
      );
      await writeTextFile(
        appState.modelStructHandle,
        "DataEntityRuntimeLoaderGuide.txt",
        runtimeVariant === "godot" ? buildGodotRuntimeLoaderGuideContent() : buildUnityRuntimeLoaderGuideContent()
      );
      await writeTextFile(
        appState.csharpHandle,
        "DataEntityRuntimeTester.cs",
        runtimeVariant === "godot" ? buildGodotRuntimeTesterContent() : buildUnityRuntimeTesterContent()
      );
      if (runtimeVariant === "unity" && appState.editorHandle) {
        await writeTextFile(
          appState.editorHandle,
          "DataEntityRuntimeTesterEditor.cs",
          buildRuntimeTesterEditorContent()
        );
        await writeTextFile(
          appState.editorHandle,
          "DataEntityRuntimeTesterGuide.txt",
          buildUnityRuntimeTesterGuideContent()
        );
      } else {
        await writeTextFile(
          appState.modelStructHandle,
          "DataEntityRuntimeTesterGuide.txt",
          buildGodotRuntimeTesterGuideContent()
        );
      }
    }
    async function generateEnumCSFiles(enumTpl) {
      if (!appState.csharpHandle) return;
      let enumDir = appState.csharpHandle;
      let useSubDir = true;
      try {
        enumDir = await appState.csharpHandle.getDirectoryHandle("enums", { create: true });
      } catch (err) {
        console.warn("无法访问 enums 目录，枚举将生成到 csharpDate 根目录", err);
        enumDir = appState.csharpHandle;
        useSubDir = false;
      }
      const definitions = enumTpl ? getEnumDefinitions2() : [];
      const generatedFiles = /* @__PURE__ */ new Set();
      for (const def of definitions) {
        if (!def || !def.csharpName) continue;
        const members = [];
        const seenMembers = /* @__PURE__ */ new Set();
        def.values.forEach((raw, idx) => {
          if (!raw) return;
          const fallback = `Member${idx + 1}`;
          const baseName = sanitizeCSharpMemberName2(raw, fallback);
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
        lines.push("using System;");
        lines.push("");
        lines.push("[Serializable]");
        lines.push(`public enum ${def.csharpName}`);
        lines.push("{");
        members.forEach((member, index) => {
          if (member.original && member.original !== member.name) {
            lines.push(`    // ${member.original}`);
          }
          const suffix = index === members.length - 1 ? "" : ",";
          lines.push(`    ${member.name}${suffix}`);
        });
        lines.push("}");
        const fileName = `${def.csharpName}.cs`;
        await writeTextFile(enumDir, fileName, lines.join("\n") + "\n");
        generatedFiles.add(fileName);
      }
      if (useSubDir) {
        for await (const entry of enumDir.values()) {
          if (entry.kind === "file" && !generatedFiles.has(entry.name)) {
            await enumDir.removeEntry(entry.name);
          }
        }
      }
    }
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
      const idxField = tpl.indexField || "id";
      let idxType = "string";
      if (idxField === "id") idxType = "long";
      else if (idxField === "name") idxType = "string";
      else {
        const pp = tpl.parameters.find((p) => p.name === idxField);
        if (pp) idxType = mapToCSharpType(pp.type, pp);
      }
      lines.push(`    public ${idxType} index;`);
      tpl.parameters.forEach((p) => {
        if (!p) return;
        if (p.parameterIndexes) {
          if (p.type === "list") {
            lines.push(`    public List<DataRef> ${p.name};`);
          } else {
            lines.push(`    public DataRef ${p.name};`);
          }
        } else {
          const csType = mapToCSharpType(p.type, p);
          lines.push(`    public ${csType} ${p.name};`);
        }
      });
      lines.push("}");
      return lines.join("\n");
    }
    function mapToCSharpType(type, param = null) {
      if (isEnumType2(type)) {
        return getEnumCSharpTypeName2(type);
      }
      if (type === "list") {
        const elementType = getValidListElementType2(param && param.elementType);
        if (isEnumType2(elementType)) {
          return `List<${getEnumCSharpTypeName2(elementType)}>`;
        }
        const inner = mapCSharpPrimitiveType(elementType);
        return `List<${inner}>`;
      }
      return mapCSharpPrimitiveType(type);
    }
    function mapCSharpPrimitiveType(type) {
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
        case "object":
          return "object";
        default:
          return "object";
      }
    }
    async function regenerateCSharpStructures() {
      if (!appState.directoryHandle) {
        window.alert("请先选择工作目录");
        return;
      }
      if (!isCSharpMode()) {
        showMessage("请先切换到 Unity 或 Godot C# 模式再生成 C# 脚本", "warn");
        return;
      }
      try {
        const consent = await ensureEngineGenerationConsent("生成 C# 数据结构脚本");
        if (!consent) return;
        await cleanConflictingEngineArtifacts();
        await ensureSubFolders();
        await ensureModelStruct();
        let updatedAny = false;
        for (const tpl of appState.templates) {
          ensureTemplateUid2(tpl);
          if (isEnumTemplate2(tpl)) continue;
          const content = generateCSContent(tpl);
          await writeTextFile(appState.csharpHandle, `${tpl.name}.cs`, content);
          updatedAny = true;
        }
        const enumTpl = getEnumTemplate2();
        await generateEnumCSFiles(enumTpl);
        if (enumTpl) {
          updatedAny = true;
        }
        if (updatedAny) {
          showMessage(`已重新生成 ${getCurrentEngineLabel()} C# 数据结构脚本`);
        } else {
          showMessage(`没有可生成的 ${getCurrentEngineLabel()} C# 数据结构脚本`);
        }
        await generateRuntimeLoaderArtifacts();
      } catch (err) {
        console.error(err);
        showMessage("重新生成 C# 脚本失败，请检查权限");
      }
    }
    return {
      ensureModelStruct,
      generateRuntimeLoaderArtifacts,
      regenerateCSharpStructures,
      generateEnumCSFiles,
      generateCSContent,
      mapToCSharpType,
      mapCSharpPrimitiveType
    };
  }

  // src/generators/godot-runtime-generator.js
  function ensureContext10(context) {
    if (!context || typeof context !== "object") {
      throw new Error("createGodotRuntimeGeneratorModule requires a context object");
    }
    if (!context.appState || typeof context.appState !== "object") {
      throw new Error("createGodotRuntimeGeneratorModule requires appState");
    }
  }
  function createGodotRuntimeGeneratorModule(context) {
    ensureContext10(context);
    const {
      appState,
      isGodotMode = () => false,
      writeTextFile = async () => {
      }
    } = context;
    async function generateRuntimeLoaderArtifacts() {
      if (!isGodotMode()) return;
      if (!appState.csharpHandle || !appState.modelStructHandle) return;
      await writeTextFile(
        appState.modelStructHandle,
        "DataEntityRuntimeLoader.cs",
        buildGodotRuntimeLoaderContent()
      );
      await writeTextFile(
        appState.modelStructHandle,
        "DataEntityRuntimeLoaderGuide.txt",
        buildGodotRuntimeLoaderGuideContent()
      );
      await writeTextFile(
        appState.csharpHandle,
        "DataEntityRuntimeTester.cs",
        buildGodotRuntimeTesterContent()
      );
      await writeTextFile(
        appState.modelStructHandle,
        "DataEntityRuntimeTesterGuide.txt",
        buildGodotRuntimeTesterGuideContent()
      );
    }
    return {
      generateRuntimeLoaderArtifacts
    };
  }

  // src/generators/ue-generator.js
  function ensureContext11(context) {
    if (!context || typeof context !== "object") {
      throw new Error("createUEGeneratorModule requires a context object");
    }
    if (!context.appState || typeof context.appState !== "object") {
      throw new Error("createUEGeneratorModule requires appState");
    }
  }
  function createUEGeneratorModule(context) {
    ensureContext11(context);
    const {
      appState,
      isUEMode = () => false,
      ensureSubFolders = async () => {
      },
      ensureEngineGenerationConsent = async () => true,
      cleanConflictingEngineArtifacts = async () => {
      },
      ensureCppEnumDirectory = async () => appState.cppEnumHandle,
      shouldIgnoreFileEntry = () => false,
      writeTextFile = async () => {
      },
      isEnumTemplate: isEnumTemplate2 = () => false,
      getEnumDefinitions: getEnumDefinitions2 = () => [],
      isEnumType: isEnumType2 = () => false,
      getListElementTypeForParam: getListElementTypeForParam2 = () => "string",
      isUENameCompliant: isUENameCompliant2 = () => true,
      showMessage = () => {
      },
      addLogEntry = () => {
      }
    } = context;
    function createUEGenerationContext() {
      return {
        counters: {
          template: 0,
          enumType: 0,
          enumValue: 0
        },
        replacements: [],
        enumTypeNames: /* @__PURE__ */ new Map(),
        enumHeaderIncludes: /* @__PURE__ */ new Map()
      };
    }
    function getUECounterKey(category) {
      if (category === "enumType") return "enumType";
      if (category === "enumValue") return "enumValue";
      return "template";
    }
    function registerUENameReplacement(targetContext, category, originalName) {
      if (!targetContext) return "filter0";
      if (!targetContext.counters) {
        targetContext.counters = { template: 0, enumType: 0, enumValue: 0 };
      }
      const key = getUECounterKey(category);
      if (typeof targetContext.counters[key] !== "number") {
        targetContext.counters[key] = 0;
      }
      const replacement = `filter${targetContext.counters[key]++}`;
      targetContext.replacements.push({
        category: category || "template",
        original: originalName || "",
        replacement
      });
      return replacement;
    }
    function toPascalCaseFromIdentifier(value) {
      const parts = String(value || "").split(/_+/).map((segment) => segment.trim()).filter((segment) => segment.length > 0);
      if (parts.length === 0) {
        return "";
      }
      return parts.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1)).join("");
    }
    function resolveUENameParts(name, targetContext, category) {
      const raw = String(name ?? "").trim();
      let fileBase = raw;
      let baseForPascal = raw;
      let usedReplacement = false;
      if (!raw || !isUENameCompliant2(raw)) {
        const replacement = registerUENameReplacement(targetContext, category, raw);
        fileBase = replacement;
        baseForPascal = replacement;
        usedReplacement = true;
      }
      let pascalBase = toPascalCaseFromIdentifier(baseForPascal);
      if (!pascalBase) {
        const fallback = usedReplacement ? baseForPascal : registerUENameReplacement(targetContext, category, raw);
        fileBase = fallback;
        pascalBase = toPascalCaseFromIdentifier(fallback) || "Data";
      }
      if (/^\d/.test(pascalBase)) {
        pascalBase = `N${pascalBase}`;
      }
      if (!fileBase) {
        fileBase = pascalBase;
      }
      if (fileBase.toLowerCase() === "datareftypes") {
        fileBase = `${fileBase}_Data`;
      }
      return { fileBase, pascalBase };
    }
    function formatUEInvalidNameMessage(records) {
      if (!Array.isArray(records) || records.length === 0) return "";
      const parts = records.map((item) => {
        const categoryLabel = item.category === "enumValue" ? "枚举项" : item.category === "enumType" ? "枚举" : "模板";
        const original = item.original != null && item.original !== "" ? item.original : "（空）";
        return `${categoryLabel}「${original}」→ ${item.replacement}`;
      });
      return `生成完成，但以下名称不合规：${parts.join("；")}`;
    }
    function mapPrimitiveToUEType(type) {
      switch (type) {
        case "int":
          return { type: "int32", defaultValue: "0" };
        case "long":
          return { type: "int64", defaultValue: "0" };
        case "float":
          return { type: "float", defaultValue: "0.0f" };
        case "bool":
          return { type: "bool", defaultValue: "false" };
        case "string":
        case "object":
        default:
          return { type: "FString", defaultValue: 'TEXT("")' };
      }
    }
    function mapParamToUETypeInfo(param, targetContext) {
      if (!param) {
        return mapPrimitiveToUEType("string");
      }
      if (param.parameterIndexes) {
        if (param.type === "list") {
          return { type: "TArray<FDataRef>", defaultValue: null };
        }
        return { type: "FDataRef", defaultValue: null };
      }
      if (param.type === "list") {
        const elementType = getListElementTypeForParam2(param);
        if (isEnumType2(elementType)) {
          const enumName = targetContext?.enumTypeNames?.get(elementType);
          if (enumName) {
            return { type: `TArray<${enumName}>`, defaultValue: null };
          }
        }
        const elementInfo = mapPrimitiveToUEType(elementType);
        return { type: `TArray<${elementInfo.type}>`, defaultValue: null };
      }
      if (isEnumType2(param.type)) {
        const enumName = targetContext?.enumTypeNames?.get(param.type);
        if (enumName) {
          return { type: enumName, defaultValue: null };
        }
      }
      return mapPrimitiveToUEType(param.type);
    }
    function collectUEEnumIncludePaths(tpl, targetContext) {
      if (!tpl || !targetContext || !targetContext.enumHeaderIncludes) return [];
      const includeSet = /* @__PURE__ */ new Set();
      const includeMap = targetContext.enumHeaderIncludes;
      if (!(includeMap instanceof Map) || includeMap.size === 0) {
        return [];
      }
      const addInclude = (enumType) => {
        if (!enumType) return;
        const path = includeMap.get(enumType);
        if (path) {
          includeSet.add(path);
        }
      };
      const params = Array.isArray(tpl.parameters) ? tpl.parameters : [];
      params.forEach((param) => {
        if (!param || param.parameterIndexes) return;
        if (param.type === "list") {
          const elementType = getListElementTypeForParam2(param);
          if (isEnumType2(elementType)) {
            addInclude(elementType);
          }
        } else if (isEnumType2(param.type)) {
          addInclude(param.type);
        }
      });
      return Array.from(includeSet);
    }
    function getUECategoryLabel(nameParts) {
      return nameParts?.pascalBase || "DataTable";
    }
    function buildUEHeaderContent(tpl, options, targetContext) {
      const { fileBase, structName, className, categoryLabel, indexFieldInfo } = options;
      const includeName = `${fileBase}.generated.h`;
      const lines = [];
      lines.push("#pragma once");
      lines.push("");
      lines.push('#include "CoreMinimal.h"');
      lines.push('#include "Engine/DataAsset.h"');
      lines.push('#include "DataRefTypes.h"');
      const enumIncludes = collectUEEnumIncludePaths(tpl, targetContext);
      enumIncludes.forEach((includePath) => {
        lines.push(`#include "${includePath}"`);
      });
      lines.push(`#include "${includeName}"`);
      lines.push("");
      lines.push("USTRUCT(BlueprintType)");
      lines.push(`struct ${structName}`);
      lines.push("{");
      lines.push("    GENERATED_BODY()");
      lines.push("");
      const commonCategory = categoryLabel;
      lines.push(`    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="${commonCategory}")`);
      lines.push('    FString Template = TEXT("");');
      lines.push("");
      lines.push(`    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="${commonCategory}")`);
      lines.push("    int32 Id = 0;");
      lines.push("");
      lines.push(`    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="${commonCategory}")`);
      lines.push('    FString Name = TEXT("");');
      lines.push("");
      lines.push(`    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="${commonCategory}")`);
      if (indexFieldInfo.defaultValue != null) {
        lines.push(`    ${indexFieldInfo.type} Index = ${indexFieldInfo.defaultValue};`);
      } else {
        lines.push(`    ${indexFieldInfo.type} Index;`);
      }
      lines.push("");
      const params = Array.isArray(tpl.parameters) ? tpl.parameters : [];
      params.forEach((param, idx) => {
        if (!param) return;
        const typeInfo = mapParamToUETypeInfo(param, targetContext);
        lines.push(`    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="${commonCategory}")`);
        if (typeInfo.defaultValue != null) {
          lines.push(`    ${typeInfo.type} ${param.name} = ${typeInfo.defaultValue};`);
        } else {
          lines.push(`    ${typeInfo.type} ${param.name};`);
        }
        if (idx < params.length - 1) {
          lines.push("");
        }
      });
      lines.push("};");
      lines.push("");
      lines.push("UCLASS(BlueprintType)");
      lines.push(`class ${className} : public UDataAsset`);
      lines.push("{");
      lines.push("    GENERATED_BODY()");
      lines.push("");
      lines.push("public:");
      lines.push("");
      lines.push(`    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="${commonCategory}")`);
      lines.push(`    TMap<FName, ${structName}> Rows;`);
      lines.push("};");
      return lines.join("\n");
    }
    function buildUEEnumHeaderContent(enumName, fileBase, def, targetContext) {
      const lines = [];
      lines.push("#pragma once");
      lines.push("");
      lines.push('#include "CoreMinimal.h"');
      lines.push(`#include "${fileBase}.generated.h"`);
      lines.push("");
      lines.push("UENUM(BlueprintType)");
      lines.push(`enum class ${enumName} : uint8`);
      lines.push("{");
      lines.push('    None UMETA(DisplayName="None"),');
      const seen = /* @__PURE__ */ new Set(["None"]);
      const members = def?.values || [];
      members.forEach((raw, idx) => {
        if (!raw) return;
        let candidate = String(raw).trim();
        if (!candidate) return;
        let baseName = candidate;
        let usedReplacement = false;
        if (!isUENameCompliant2(candidate)) {
          baseName = registerUENameReplacement(targetContext, "enumValue", candidate);
          usedReplacement = true;
        }
        let finalName = usedReplacement ? baseName : toPascalCaseFromIdentifier(baseName);
        if (!finalName) {
          const fallback = registerUENameReplacement(targetContext, "enumValue", candidate);
          finalName = fallback || `Member${idx + 1}`;
          usedReplacement = true;
        }
        if (!usedReplacement && /^\d/.test(finalName)) {
          finalName = `N${finalName}`;
        }
        const baseFinalName = finalName;
        let suffix = 1;
        while (seen.has(finalName)) {
          finalName = `${baseFinalName}_${suffix++}`;
        }
        seen.add(finalName);
        const displayName = candidate.replace(/"/g, '\\"');
        lines.push(`    ${finalName} UMETA(DisplayName="${displayName}"),`);
      });
      lines.push("};");
      return lines.join("\n");
    }
    function computeIndexFieldInfo(tpl, targetContext) {
      const idxField = tpl.indexField || "id";
      if (idxField === "id") {
        return mapPrimitiveToUEType("int");
      }
      if (idxField === "name") {
        return mapPrimitiveToUEType("string");
      }
      const targetParam = Array.isArray(tpl.parameters) ? tpl.parameters.find((param) => param && param.name === idxField) : null;
      if (targetParam) {
        return mapParamToUETypeInfo(targetParam, targetContext);
      }
      return mapPrimitiveToUEType("string");
    }
    async function generateUEEnumHeaderFiles(targetContext, enumFiles) {
      if (!targetContext) return { updatedAny: false };
      const enumDir = await ensureCppEnumDirectory();
      if (!enumDir) return { updatedAny: false };
      const definitions = getEnumDefinitions2();
      targetContext.enumTypeNames.clear();
      if (targetContext.enumHeaderIncludes instanceof Map) {
        targetContext.enumHeaderIncludes.clear();
      }
      if (definitions.length === 0) {
        return { updatedAny: false };
      }
      let updatedAny = false;
      for (const def of definitions) {
        const nameInfo = resolveUENameParts(def.name, targetContext, "enumType");
        const enumName = `E${nameInfo.pascalBase}`;
        targetContext.enumTypeNames.set(def.name, enumName);
        let fileName = `${nameInfo.fileBase}.h`;
        let attempt = 1;
        while (enumFiles && enumFiles.has(fileName)) {
          fileName = `${nameInfo.fileBase}_${attempt++}.h`;
        }
        const baseName = fileName.replace(/\.h$/, "");
        const useEnumSubDir = Boolean(enumDir === appState.cppEnumHandle && appState.cppEnumHandle);
        const prefix = useEnumSubDir ? "enum/" : "";
        const headerIncludePath = `${prefix}${fileName}`;
        const content = buildUEEnumHeaderContent(enumName, baseName, def, targetContext);
        await writeTextFile(enumDir, fileName, content);
        if (targetContext.enumHeaderIncludes instanceof Map) {
          targetContext.enumHeaderIncludes.set(def.name, headerIncludePath);
        }
        if (enumFiles) {
          enumFiles.add(fileName);
        }
        updatedAny = true;
      }
      return { updatedAny };
    }
    async function cleanupCppModelDirectory(validFiles) {
      if (!appState.cppModelHandle) return;
      for await (const entry of appState.cppModelHandle.values()) {
        if (entry.kind !== "file") continue;
        if (shouldIgnoreFileEntry(entry.name)) continue;
        if (!validFiles.has(entry.name)) {
          try {
            await appState.cppModelHandle.removeEntry(entry.name);
          } catch (err) {
            console.warn(`删除无效的 C++ 文件失败：${entry.name}`, err);
          }
        }
      }
    }
    async function cleanupCppEnumDirectory(validFiles) {
      if (!appState.cppEnumHandle) return;
      for await (const entry of appState.cppEnumHandle.values()) {
        if (entry.kind !== "file") continue;
        if (shouldIgnoreFileEntry(entry.name)) continue;
        if (!validFiles.has(entry.name)) {
          try {
            await appState.cppEnumHandle.removeEntry(entry.name);
          } catch (err) {
            console.warn(`删除无效的枚举 C++ 文件失败：${entry.name}`, err);
          }
        }
      }
    }
    async function generateUECppStructuresForCurrentTemplates() {
      if (!isUEMode()) {
        return { updatedAny: false, invalidMessage: "", invalidNames: [] };
      }
      if (!appState.cppModelHandle) {
        await ensureSubFolders();
      }
      if (!appState.cppModelHandle) {
        throw new Error("无法访问 cppmodel 目录");
      }
      const targetContext = createUEGenerationContext();
      const generatedFiles = /* @__PURE__ */ new Set();
      const generatedEnumFiles = /* @__PURE__ */ new Set();
      const dataRefContent = [
        "#pragma once",
        "",
        '#include "CoreMinimal.h"',
        '#include "DataRefTypes.generated.h"',
        "",
        "USTRUCT(BlueprintType)",
        "struct FDataRef",
        "{",
        "    GENERATED_BODY()",
        "",
        '    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="DataRef")',
        "    FString Template;",
        "",
        '    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="DataRef")',
        "    FString By;",
        "",
        '    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="DataRef")',
        "    FString Value;",
        "};",
        ""
      ].join("\n");
      await writeTextFile(appState.cppModelHandle, "DataRefTypes.h", dataRefContent);
      generatedFiles.add("DataRefTypes.h");
      const enumResult = await generateUEEnumHeaderFiles(targetContext, generatedEnumFiles);
      let updatedAny = enumResult.updatedAny;
      for (const tpl of appState.templates) {
        if (!tpl || isEnumTemplate2(tpl)) continue;
        const nameInfo = resolveUENameParts(tpl.name, targetContext, "template");
        let fileName = `${nameInfo.fileBase}.h`;
        let suffix = 1;
        while (generatedFiles.has(fileName)) {
          fileName = `${nameInfo.fileBase}_${suffix++}.h`;
        }
        const structBaseName = nameInfo.pascalBase.endsWith("Row") ? nameInfo.pascalBase : `${nameInfo.pascalBase}Row`;
        const structName = `F${structBaseName}`;
        const className = `U${nameInfo.pascalBase}`;
        const categoryLabel = getUECategoryLabel(nameInfo);
        const indexFieldInfo = computeIndexFieldInfo(tpl, targetContext);
        const content = buildUEHeaderContent(
          tpl,
          {
            fileBase: fileName.replace(/\.h$/, ""),
            structName,
            className,
            categoryLabel,
            indexFieldInfo
          },
          targetContext
        );
        await writeTextFile(appState.cppModelHandle, fileName, content);
        generatedFiles.add(fileName);
        updatedAny = true;
      }
      await cleanupCppModelDirectory(generatedFiles);
      await cleanupCppEnumDirectory(generatedEnumFiles);
      return {
        updatedAny,
        invalidNames: targetContext.replacements.slice(),
        invalidMessage: formatUEInvalidNameMessage(targetContext.replacements)
      };
    }
    async function regenerateCppStructures() {
      if (!appState.directoryHandle) {
        window.alert("请先选择工作目录");
        return;
      }
      if (!isUEMode()) {
        showMessage("请先切换到 UE 模式再生成 C++ 脚本", "warn");
        return;
      }
      try {
        const consent = await ensureEngineGenerationConsent("生成 C++ 数据结构脚本");
        if (!consent) return;
        await cleanConflictingEngineArtifacts();
        await ensureSubFolders();
        const result = await generateUECppStructuresForCurrentTemplates();
        if (result.updatedAny) {
          if (result.invalidMessage) {
            addLogEntry("warn", result.invalidMessage);
            showMessage(result.invalidMessage, "warn");
          } else {
            showMessage("已重新生成 C++ 数据结构脚本");
          }
        } else {
          showMessage("没有可生成的 C++ 数据结构脚本");
        }
      } catch (err) {
        console.error(err);
        showMessage("重新生成 C++ 脚本失败，请检查权限");
      }
    }
    return {
      regenerateCppStructures,
      createUEGenerationContext,
      getUECounterKey,
      registerUENameReplacement,
      toPascalCaseFromIdentifier,
      resolveUENameParts,
      formatUEInvalidNameMessage,
      mapPrimitiveToUEType,
      mapParamToUETypeInfo,
      collectUEEnumIncludePaths,
      getUECategoryLabel,
      buildUEHeaderContent,
      buildUEEnumHeaderContent,
      computeIndexFieldInfo,
      generateUEEnumHeaderFiles,
      cleanupCppModelDirectory,
      cleanupCppEnumDirectory,
      generateUECppStructuresForCurrentTemplates
    };
  }

  // src/main.js
  (() => {
    const templates = [];
    const templateUidState = { counter: 0 };
    let lastSavedStructureSnapshot = /* @__PURE__ */ new Map();
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
    const TRASH_FOLDER_NAME = "toilet";
    const pendingTemplateDeletions = /* @__PURE__ */ new Map();
    let trashButtonBaseLabel = "垃圾箱";
    let trashSelectedTemplateName = null;
    const operationLogs = [];
    let copyBuffer = null;
    const selectedTemplates = /* @__PURE__ */ new Set();
    const selectedInstances = /* @__PURE__ */ new Set();
    const selectedParams = /* @__PURE__ */ new Set();
    let exportSelectionMode = false;
    const exportSelections = /* @__PURE__ */ new Map();
    let exportTemplateAnchorIndex = null;
    let anchorTemplate = null;
    let anchorInstance = null;
    let anchorParam = null;
    let lastSelectedCategory = null;
    let editingParamIndex = -1;
    const ENGINE_MODES = { UNITY: "unity", GODOT: "godot", UE: "ue" };
    let currentEngineMode = ENGINE_MODES.UNITY;
    const ENGINE_LABELS = {
      [ENGINE_MODES.UNITY]: "Unity",
      [ENGINE_MODES.GODOT]: "Godot C#",
      [ENGINE_MODES.UE]: "UE"
    };
    const engineModeNeedsConfirmation = {
      [ENGINE_MODES.UNITY]: false,
      [ENGINE_MODES.GODOT]: true,
      [ENGINE_MODES.UE]: true
    };
    const CONFIG_DIR_NAME = "dataEditorConfig";
    const CONFIG_FILE_NAME = "config.json";
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
    let lastDuplicateIndexInfo = null;
    const EDIT_MODES = { CLASSIC: "classic", SHEET: "sheet" };
    let currentEditMode = EDIT_MODES.CLASSIC;
    let sheetActiveTemplateIndex = -1;
    let sheetActiveInstanceIndex = -1;
    let sheetRenderedTemplateIndex = -1;
    let sheetRenderedInstanceIndex = -1;
    let sheetRenderedInstanceCount = 0;
    let sheetRenderedParameterSignature = "";
    let sheetRenderedTemplatesFingerprint = "";
    const sheetRenderedSheetIds = /* @__PURE__ */ new Map();
    const sheetDuplicateIdRows = /* @__PURE__ */ new Map();
    let sheetModeDirty = false;
    let luckysheetInitialized = false;
    const sheetTemplateValidation = /* @__PURE__ */ new Map();
    const createDefaultCompareValueState = () => ({
      active: false,
      templateUid: null,
      type: "normal",
      params: [],
      keys: []
    });
    let compareValueState = createDefaultCompareValueState();
    const dragSelect = {
      isDragging: false,
      type: null,
      indices: /* @__PURE__ */ new Set(),
      startIndex: void 0
    };
    const $ = (id) => document.getElementById(id);
    const templateNameInput = $("templateName");
    const instanceNameInput = $("instanceName");
    const instanceIdInput = $("instanceId");
    const paramNameInput = $("paramName");
    const paramTypeSelect = $("paramType");
    const listElementTypeSelect = $("listElementType");
    const builtinParamTypeOptions = Array.from(paramTypeSelect.options).map((opt) => ({
      value: opt.value,
      label: opt.textContent
    }));
    const builtinParamTypeSet = new Set(builtinParamTypeOptions.map((opt) => opt.value));
    let listElementTypeOptions = [
      { value: "string", label: "字符串" },
      { value: "int", label: "整数" },
      { value: "float", label: "浮点数" },
      { value: "long", label: "长整型" },
      { value: "bool", label: "布尔" },
      { value: "object", label: "对象" }
    ];
    let listElementTypeSet = new Set(listElementTypeOptions.map((opt) => opt.value));
    const indexTemplateSelect = $("indexTemplate");
    const indexParamSelect = $("indexParam");
    const INDEXABLE_PARAM_TYPES = /* @__PURE__ */ new Set(["int", "long", "float", "string"]);
    const RESERVED_INDEX_FIELDS = /* @__PURE__ */ new Set(["template", "id", "name", "index"]);
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
    function isTemplateNameInvalid2(name) {
      return isTemplateNameInvalid(name, { isUEMode: isUEMode() });
    }
    function isEnumValueInvalid2(value) {
      return isEnumValueInvalid(value, { isUEMode: isUEMode() });
    }
    function getSelectedListElementType() {
      if (!listElementTypeSelect) return "string";
      return getValidListElementType(listElementTypeSelect.value);
    }
    function getListElementTypeLabel(value) {
      const target = listElementTypeOptions.find((opt) => opt.value === value);
      return target ? target.label : value;
    }
    function setInvalidNameVisual(element, invalid) {
      if (!element) return;
      if (invalid) {
        element.classList.add("invalid-name");
      } else {
        element.classList.remove("invalid-name");
      }
    }
    function updateTemplateNameInputValidity() {
      if (!templateNameInput) return;
      setInvalidNameVisual(templateNameInput, isTemplateNameInvalid2(templateNameInput.value));
    }
    function updateInstanceNameInputValidity() {
      if (!instanceNameInput) return;
      setInvalidNameVisual(instanceNameInput, isPureNumericName(instanceNameInput.value));
    }
    function updateListElementTypeSelectState(customValue) {
      if (!listElementTypeSelect) return;
      const shouldEnable = paramTypeSelect && paramTypeSelect.value === "list";
      listElementTypeSelect.disabled = !shouldEnable;
      listElementTypeSelect.style.opacity = shouldEnable ? "" : "0.55";
      listElementTypeSelect.title = shouldEnable ? "" : "列表类型时可选择元素类型";
      const desiredValue = customValue ? getValidListElementType(customValue) : getValidListElementType(listElementTypeSelect.value);
      if (!Array.from(listElementTypeSelect.options).some((opt) => opt.value === desiredValue)) {
        const optEl = document.createElement("option");
        optEl.value = desiredValue;
        optEl.textContent = desiredValue;
        listElementTypeSelect.appendChild(optEl);
      }
      if (listElementTypeSelect.value !== desiredValue) {
        listElementTypeSelect.value = desiredValue;
      }
    }
    function resolveIndexFieldMeta2(tpl) {
      return resolveIndexFieldMeta(tpl, INDEXABLE_PARAM_TYPES);
    }
    function formatIndexCell2(field, type, value) {
      return formatIndexCell(field, type, value);
    }
    function parseIndexTypeCell2(cell) {
      return parseIndexTypeCell(cell);
    }
    function parseIndexDataCell2(cell, fallbackField, fallbackType) {
      return parseIndexDataCell(cell, fallbackField, fallbackType);
    }
    function computeExpectedIndexValue2(tpl, inst, fieldName) {
      return computeExpectedIndexValue(tpl, inst, fieldName);
    }
    function enforceEnumIndexField2(tpl) {
      return enforceEnumIndexField(tpl, { isEnumTemplate: isEnumTemplate2 });
    }
    function collectDuplicateIdInfo2(tpl) {
      return collectDuplicateIdInfo(tpl);
    }
    function getNumericInstanceId2(inst) {
      return getNumericInstanceId(inst);
    }
    function collectDuplicateIndexInfo2(tpl) {
      return collectDuplicateIndexInfo(tpl);
    }
    function chooseDuplicateNavigationTarget2(group, currentInst) {
      return chooseDuplicateNavigationTarget(group, currentInst);
    }
    function isEnumTemplate2(tpl) {
      return isEnumTemplate(tpl);
    }
    function ensureEnumParamNaming2(tpl) {
      return ensureEnumParamNaming(tpl);
    }
    function getEnumParamKeysForInstance2(tpl, inst) {
      return getEnumParamKeysForInstance(tpl, inst);
    }
    function getEnumTemplate2() {
      return getEnumTemplate(templates);
    }
    function getEnumDefinitions2() {
      return getEnumDefinitions(templates);
    }
    function getEnumDefinition2(type) {
      return getEnumDefinition(templates, type);
    }
    function isEnumType2(type) {
      return isEnumType(templates, type);
    }
    function getEnumValues2(type) {
      return getEnumValues(templates, type);
    }
    function getEnumCSharpTypeName2(type) {
      return getEnumCSharpTypeName(templates, type);
    }
    function sanitizeCSharpTypeName2(name, fallback) {
      return sanitizeCSharpTypeName(name, fallback);
    }
    function sanitizeCSharpMemberName2(name, fallback) {
      return sanitizeCSharpMemberName(name, fallback);
    }
    function getBuiltinParamTypeOptionsForCurrentMode() {
      return builtinParamTypeOptions;
    }
    function rebuildListElementTypeCollections(enumDefs, missingTypes, usedElementTypes) {
      const collections = buildListElementTypeCollections({
        builtinOptions: getBuiltinParamTypeOptionsForCurrentMode(),
        enumDefs,
        missingTypes,
        usedElementTypes
      });
      listElementTypeOptions = collections.options;
      listElementTypeSet = collections.valueSet;
    }
    function refreshListElementTypeSelect(customValue) {
      if (!listElementTypeSelect) return;
      const previousValue = customValue != null ? customValue : listElementTypeSelect.value;
      listElementTypeSelect.innerHTML = "";
      listElementTypeOptions.forEach((opt) => {
        const optionEl = document.createElement("option");
        optionEl.value = opt.value;
        optionEl.textContent = opt.label;
        listElementTypeSelect.appendChild(optionEl);
      });
      const normalized = previousValue != null ? String(previousValue).trim() : "";
      if (normalized && !Array.from(listElementTypeSelect.options).some((opt) => opt.value === normalized)) {
        const fallback = document.createElement("option");
        fallback.value = normalized;
        fallback.textContent = `${normalized} (缺失)`;
        listElementTypeSelect.appendChild(fallback);
      }
      if (normalized && Array.from(listElementTypeSelect.options).some((opt) => opt.value === normalized)) {
        listElementTypeSelect.value = normalized;
      } else if (listElementTypeSelect.options.length > 0) {
        listElementTypeSelect.value = listElementTypeSelect.options[0].value;
      } else {
        listElementTypeSelect.value = "string";
      }
    }
    function refreshParamTypeOptions() {
      if (!paramTypeSelect) return;
      const previousValue = paramTypeSelect.value;
      const previousElementValue = listElementTypeSelect ? listElementTypeSelect.value : "string";
      const enumDefs = getEnumDefinitions2();
      const missingTypes = /* @__PURE__ */ new Set();
      const usedElementTypes = /* @__PURE__ */ new Set();
      templates.forEach((tpl) => {
        if (!tpl || !Array.isArray(tpl.parameters)) return;
        tpl.parameters.forEach((p) => {
          if (!p || !p.type) return;
          if (p.type === "list" && p.elementType) {
            usedElementTypes.add(String(p.elementType));
          }
          if (builtinParamTypeSet.has(p.type)) return;
          if (enumDefs.some((def) => def.name === p.type)) return;
          missingTypes.add(p.type);
        });
      });
      paramTypeSelect.innerHTML = "";
      const builtinOptions = getBuiltinParamTypeOptionsForCurrentMode();
      builtinOptions.forEach((opt) => {
        const optionEl = document.createElement("option");
        optionEl.value = opt.value;
        optionEl.textContent = opt.label;
        paramTypeSelect.appendChild(optionEl);
      });
      if (enumDefs.length > 0) {
        const group = document.createElement("optgroup");
        group.label = "枚举类型";
        enumDefs.slice().sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN")).forEach((def) => {
          const opt = document.createElement("option");
          opt.value = def.name;
          opt.textContent = def.name;
          group.appendChild(opt);
        });
        paramTypeSelect.appendChild(group);
      }
      if (missingTypes.size > 0) {
        const missingGroup = document.createElement("optgroup");
        missingGroup.label = "缺失类型";
        Array.from(missingTypes).sort().forEach((typeName) => {
          const opt = document.createElement("option");
          opt.value = typeName;
          opt.textContent = `${typeName} (缺失)`;
          missingGroup.appendChild(opt);
        });
        paramTypeSelect.appendChild(missingGroup);
      }
      if (previousValue && Array.from(paramTypeSelect.options).some((opt) => opt.value === previousValue)) {
        paramTypeSelect.value = previousValue;
      } else {
        paramTypeSelect.value = "string";
      }
      rebuildListElementTypeCollections(enumDefs, missingTypes, usedElementTypes);
      refreshListElementTypeSelect(previousElementValue);
      updateListElementTypeSelectState();
    }
    function updateParamTypeSelectEnabledState() {
      if (!paramTypeSelect) return;
      const tpl = templates[currentTemplateIndex];
      const shouldDisable = Boolean(tpl && isEnumTemplate2(tpl));
      paramTypeSelect.disabled = shouldDisable;
      if (shouldDisable) {
        paramTypeSelect.value = "string";
      }
      updateListElementTypeSelectState();
    }
    function applyIndexDisabledState(message) {
      if (!indexTemplateSelect || !indexParamSelect) return;
      indexTemplateSelect.innerHTML = "";
      const templateOption = document.createElement("option");
      templateOption.value = "";
      templateOption.textContent = message;
      indexTemplateSelect.appendChild(templateOption);
      indexTemplateSelect.value = "";
      indexTemplateSelect.disabled = true;
      indexTemplateSelect.dataset.disabledReason = message;
      indexParamSelect.innerHTML = "";
      const paramOption = document.createElement("option");
      paramOption.value = "";
      paramOption.textContent = message;
      indexParamSelect.appendChild(paramOption);
      indexParamSelect.value = "";
      indexParamSelect.disabled = true;
      indexParamSelect.dataset.disabledReason = message;
    }
    function updateParamNameInputEnabledState() {
      if (!paramNameInput) return;
      const tpl = templates[currentTemplateIndex];
      const shouldDisable = Boolean(tpl && isEnumTemplate2(tpl));
      paramNameInput.disabled = shouldDisable;
      paramNameInput.placeholder = shouldDisable ? "enum 自动命名（0,1,2,...）" : "";
    }
    function jumpToDuplicateIndexInstance(tpl, inst) {
      if (!tpl || !inst) return false;
      ensureTemplateUid2(tpl);
      let info = null;
      if (lastDuplicateIndexInfo && lastDuplicateIndexInfo.uid === tpl.__uid) {
        info = lastDuplicateIndexInfo.info;
      }
      if (!info) {
        info = collectDuplicateIndexInfo2(tpl);
        lastDuplicateIndexInfo = { uid: tpl.__uid, info };
      }
      const field = info.field;
      const key = computeExpectedIndexValue2(tpl, inst, field);
      const normalized = key == null ? "" : String(key);
      const group = info.duplicates.get(normalized);
      if (!group || group.length <= 1) {
        showMessage("该索引值没有重复", "info");
        return false;
      }
      const target = chooseDuplicateNavigationTarget2(group, inst);
      if (!target) {
        showMessage("该索引值没有其他重复项", "info");
        return false;
      }
      let targetIdx = target.idx;
      if (!(targetIdx >= 0 && targetIdx < tpl.instances.length)) {
        targetIdx = tpl.instances.indexOf(target.inst);
      }
      if (!(targetIdx >= 0 && targetIdx < tpl.instances.length)) {
        showMessage("未能定位到重复索引的实例", "warn");
        return false;
      }
      currentInstanceIndex = targetIdx;
      selectedInstances.clear();
      selectedInstances.add(targetIdx);
      anchorInstance = targetIdx;
      instanceNameInput.value = tpl.instances[targetIdx]?.name || "";
      refreshInstances();
      refreshParams();
      lastSelectedCategory = "instance";
      requestAnimationFrame(() => {
        const li = instanceListEl.children[targetIdx];
        if (li && typeof li.scrollIntoView === "function") {
          try {
            li.scrollIntoView({ block: "center", behavior: "smooth" });
          } catch (_err) {
            li.scrollIntoView({ block: "center" });
          }
        }
      });
      const targetInstance = tpl.instances[targetIdx];
      let labelText = "";
      if (targetInstance) {
        const parts = [];
        if (targetInstance.name) parts.push(String(targetInstance.name));
        if (targetInstance.id != null && targetInstance.id !== "") parts.push(`ID:${targetInstance.id}`);
        labelText = parts.join(" ");
      }
      showMessage(labelText ? `已跳转到索引重复的实例：${labelText}` : "已跳转到索引重复的实例", "warn");
      return true;
    }
    function enforceImportedIndexField(tpl, fileName) {
      void fileName;
      if (isEnumTemplate2(tpl)) {
        const changed = enforceEnumIndexField2(tpl);
        if (changed) {
          showMessage(`${tpl.name}模版的index清空`, "warn");
        }
        return;
      }
      let idxField = tpl.indexField || "id";
      let needReset = false;
      const params = Array.isArray(tpl.parameters) ? tpl.parameters : [];
      if (idxField !== "id" && idxField !== "name") {
        const targetParam = params.find((p) => p && p.name === idxField);
        if (!targetParam || !INDEXABLE_PARAM_TYPES.has(targetParam.type)) {
          needReset = true;
        }
      }
      const instList = Array.isArray(tpl.instances) ? tpl.instances : [];
      if (!needReset) {
        for (const inst of instList) {
          const actual = inst.payload && inst.payload.index != null ? String(inst.payload.index) : "";
          const expected = computeExpectedIndexValue2(tpl, inst, idxField);
          if (actual !== expected) {
            needReset = true;
            break;
          }
        }
      }
      if (needReset) {
        idxField = "id";
        tpl.indexField = "id";
        instList.forEach((inst) => {
          const newIndex = computeExpectedIndexValue2(tpl, inst, "id");
          if (!inst.payload) inst.payload = {};
          inst.payload.index = newIndex;
        });
        showMessage(`${tpl.name}模版的index清空`, "warn");
      } else {
        instList.forEach((inst) => {
          const expected = computeExpectedIndexValue2(tpl, inst, idxField);
          if (!inst.payload) inst.payload = {};
          inst.payload.index = expected;
        });
      }
    }
    function wrapReferencePayload2(value, binding, asList, elementType = "string") {
      return wrapReferencePayload(value, binding, asList, elementType, { convertValueToList: convertValueToList2 });
    }
    function getDefaultValueForElementType2(elementType) {
      return getDefaultValueForElementType(elementType, {
        isEnumType: isEnumType2,
        getEnumValues: getEnumValues2
      });
    }
    function getDefaultValueForType2(type, elementType = "string") {
      return getDefaultValueForType(type, elementType, {
        isEnumType: isEnumType2,
        getEnumValues: getEnumValues2,
        getDefaultValueForElementType: getDefaultValueForElementType2
      });
    }
    function coerceListElementValue2(value, elementType) {
      return coerceListElementValue(value, elementType, {
        isEnumType: isEnumType2,
        getEnumValues: getEnumValues2
      });
    }
    function convertValueToList2(value, elementType) {
      return convertValueToList(value, elementType, {
        coerceListElementValue: coerceListElementValue2
      });
    }
    function convertValueForType2(value, type, elementType = "string") {
      return convertValueForType(value, type, elementType, {
        isEnumType: isEnumType2,
        getEnumValues: getEnumValues2,
        getDefaultValueForType: getDefaultValueForType2,
        convertValueToList: convertValueToList2
      });
    }
    function isListElementValueValid2(value, elementType) {
      return isListElementValueValid(value, elementType, {
        isEnumType: isEnumType2,
        getEnumValues: getEnumValues2
      });
    }
    function validateListValueAgainstType2(value, elementType, param) {
      return validateListValueAgainstType(value, elementType, param, {
        normalizeReferenceList,
        coerceListElementValue: coerceListElementValue2,
        isListElementValueValid: isListElementValueValid2
      });
    }
    function collectListTypeViolations2(tpl) {
      return collectListTypeViolations(tpl, {
        getListElementTypeForParam,
        validateListValueAgainstType: validateListValueAgainstType2
      });
    }
    function getCurrentEngineLabel() {
      return appModeModule ? appModeModule.getCurrentEngineLabel() : ENGINE_LABELS[currentEngineMode] || "";
    }
    function updateEngineModeUIState() {
      if (engineModeToggleBtn) {
        engineModeToggleBtn.textContent = `切换模式：当前${getCurrentEngineLabel()}`;
      }
      if (regenerateCsBtn) {
        regenerateCsBtn.style.display = isCSharpMode() ? "" : "none";
        regenerateCsBtn.textContent = isGodotMode() ? "重新生成 Godot C# 数据结构脚本" : "重新生成 C# 数据结构脚本";
      }
      if (regenerateCppBtn) {
        regenerateCppBtn.style.display = isUEMode() ? "" : "none";
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
        if (!create && err && err.name === "NotFoundError") {
          configDirHandle = null;
          return null;
        }
        if (create) {
          console.warn("无法创建配置目录", err);
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
          engineMode: currentEngineMode
        };
        await writeTextFile(dir, CONFIG_FILE_NAME, JSON.stringify(payload, null, 2));
      } catch (err) {
        console.warn("保存编辑器配置失败", err);
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
        console.warn("读取编辑器配置失败", err);
      }
      if (currentEngineMode !== ENGINE_MODES.UNITY) {
        setEngineMode(ENGINE_MODES.UNITY);
      } else {
        updateEngineModeUIState();
      }
    }
    async function ensureEngineGenerationConsent(actionLabel = "生成操作") {
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
        instanceIdInput.value = "";
        instanceIdInput.disabled = true;
        instanceIdInput.classList.remove("invalid-name");
        instanceIdInput.removeAttribute("title");
        return;
      }
      const inst = tpl.instances[currentInstanceIndex];
      instanceIdInput.disabled = false;
      const value = inst && inst.id != null ? inst.id : "";
      instanceIdInput.value = value;
      if (duplicateIdInfo && duplicateIdInfo.byIndex && typeof duplicateIdInfo.byIndex.get === "function") {
        const duplicateEntry = duplicateIdInfo.byIndex.get(currentInstanceIndex);
        if (duplicateEntry) {
          instanceIdInput.classList.add("invalid-name");
          const display = duplicateEntry.value !== "" ? duplicateEntry.value : "（空）";
          const entries = Array.isArray(duplicateEntry.entries) ? duplicateEntry.entries : [];
          const positions = entries.map((item) => item && Number.isInteger(item.idx) ? item.idx + 1 : null).filter((idx) => idx != null);
          const detailParts = [];
          if (entries.length > 0) {
            detailParts.push(`共 ${entries.length} 项`);
          }
          if (positions.length > 0) {
            detailParts.push(`位置 ${positions.join(", ")}`);
          }
          const detailSuffix = detailParts.length > 0 ? `（${detailParts.join("，")}）` : "";
          instanceIdInput.title = `ID 重复${detailSuffix}：${display}`;
        } else {
          instanceIdInput.classList.remove("invalid-name");
          instanceIdInput.removeAttribute("title");
        }
      } else {
        instanceIdInput.classList.remove("invalid-name");
        instanceIdInput.removeAttribute("title");
      }
    }
    function updateParamNameInputValidity() {
      if (!paramNameInput) return;
      const tpl = templates[currentTemplateIndex];
      if (tpl && isEnumTemplate2(tpl)) {
        setInvalidNameVisual(paramNameInput, false);
        return;
      }
      setInvalidNameVisual(paramNameInput, isPureNumericName(paramNameInput.value));
    }
    function isSheetModeActive() {
      return appModeModule ? appModeModule.isSheetModeActive() : currentEditMode === EDIT_MODES.SHEET;
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
    function findTemplateByName2(name) {
      return findTemplateByName(templates, name);
    }
    function evaluateInstanceIndexValidation2(tpl, inst) {
      const invalidParams = /* @__PURE__ */ new Map();
      if (!tpl || !inst) {
        return { invalidParams, hasInvalid: false };
      }
      const params = Array.isArray(tpl.parameters) ? tpl.parameters : [];
      params.forEach((param) => {
        if (!param || !param.parameterIndexes) return;
        const binding = inst.payload ? inst.payload[param.name] : void 0;
        const targetTplName = (param.parameterIndexes.template || "").trim();
        const targetParamName = (param.parameterIndexes.param || "").trim();
        const targetTpl = findTemplateByName2(targetTplName);
        let reason = "";
        if (!targetTplName) {
          reason = "索引模板未设置";
        } else if (!targetTpl) {
          reason = `索引模板“${targetTplName}”不存在`;
        } else if (isEnumTemplate2(targetTpl)) {
          reason = "索引目标不能是 enum 模板";
        } else if (!targetParamName) {
          reason = "索引字段未设置";
        } else if (!doesTemplateHaveField(targetTpl, targetParamName)) {
          reason = `模板“${targetTplName}”不存在字段“${targetParamName}”`;
        } else if (!RESERVED_INDEX_FIELDS.has(targetParamName)) {
          const targetParamDef = Array.isArray(targetTpl.parameters) ? targetTpl.parameters.find((p) => p && p.name === targetParamName) : null;
          if (targetParamDef && !INDEXABLE_PARAM_TYPES.has(targetParamDef.type)) {
            reason = `字段“${targetParamName}”类型不支持索引`;
          }
        }
        if (!reason) {
          let rawValue;
          if (binding == null) {
            reason = "索引值缺失";
          } else if (typeof binding === "object") {
            rawValue = binding.value;
          } else if (typeof binding === "string" || typeof binding === "number" || typeof binding === "boolean") {
            rawValue = binding;
          } else {
            reason = "索引值缺失";
          }
          if (!reason) {
            const normalizedValue = rawValue == null ? "" : String(rawValue).trim();
            if (normalizedValue === "") {
              reason = "索引值为空";
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
    function collectInstanceIndexInvalidReasons2(tpl) {
      const invalidMap = /* @__PURE__ */ new Map();
      if (!tpl || !Array.isArray(tpl.instances)) {
        return invalidMap;
      }
      tpl.instances.forEach((inst, idx) => {
        const validation = evaluateInstanceIndexValidation2(tpl, inst);
        if (validation.hasInvalid) {
          invalidMap.set(idx, validation);
        }
      });
      return invalidMap;
    }
    function doesTemplateHaveInvalidIndexReferences2(tpl) {
      if (!tpl || !Array.isArray(tpl.instances)) {
        return false;
      }
      return tpl.instances.some((inst) => {
        const validation = evaluateInstanceIndexValidation2(tpl, inst);
        return validation.hasInvalid;
      });
    }
    function buildLuckysheetCell(text, options = {}) {
      const str = text == null ? "" : String(text);
      return Object.assign(
        {
          v: str,
          m: str,
          ct: { t: "g", fa: "General" }
        },
        options || {}
      );
    }
    function buildLuckysheetSheetFromRows(rows, sheetName, options = {}) {
      const {
        index: sheetIndex = 0,
        order = 0,
        status = 0,
        duplicateIdRows = null
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
            cellOptions.bg = "#f3f6ff";
            cellOptions.fc = "#1f4fbf";
            cellOptions.bl = 1;
          } else if (rIdx === 1) {
            cellOptions.bg = "#fff8dc";
            cellOptions.fc = "#9c6f19";
          } else if (cIdx === 0) {
            cellOptions.fc = "#6a6a6a";
          }
          if (duplicateIdRows instanceof Set && duplicateIdRows.has(rIdx) && rIdx >= 2 && cIdx === 1) {
            cellOptions.bg = "#ffecec";
            cellOptions.fc = "#c53030";
            cellOptions.bl = 1;
          }
          celldata.push({ r: rIdx, c: cIdx, v: buildLuckysheetCell(value, cellOptions) });
        });
      });
      return {
        name: sheetName || "实例",
        order,
        index: sheetIndex,
        status,
        celldata,
        row: Math.max(rows.length, 20),
        column: Math.max(header.length, 1),
        config: { columnlen }
      };
    }
    function applyLuckysheetDuplicateIdStyles(sheetId, rowsSet) {
      if (!sheetId) return;
      const api = window.luckysheet;
      const nextSet = rowsSet instanceof Set ? rowsSet : new Set(rowsSet || []);
      const prevSet = sheetDuplicateIdRows.get(sheetId) || /* @__PURE__ */ new Set();
      if (!api || typeof api.setRangeStyle !== "function") {
        sheetDuplicateIdRows.set(sheetId, new Set(nextSet));
        return;
      }
      const prevRows = Array.from(prevSet);
      const nextRows = Array.from(nextSet);
      const toClear = prevRows.filter((row) => !nextSet.has(row));
      if (toClear.length > 0) {
        api.setRangeStyle({
          range: toClear.map((row) => ({ row: [row, row], column: [1, 1] })),
          style: { bg: "#ffffff", fc: "#000000", bl: 0 }
        });
      }
      const toApply = nextRows.filter((row) => row >= 2 && !prevSet.has(row));
      if (toApply.length > 0) {
        api.setRangeStyle({
          range: toApply.map((row) => ({ row: [row, row], column: [1, 1] })),
          style: { bg: "#ffecec", fc: "#c53030", bl: 1 }
        });
      }
      sheetDuplicateIdRows.set(sheetId, new Set(nextSet));
    }
    function refreshActiveLuckysheetDuplicateStyles() {
      if (!window.luckysheet || typeof window.luckysheet.getluckysheetfile !== "function") return;
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
      const buckets = /* @__PURE__ */ new Map();
      for (let r = 2; r < rows.length; r += 1) {
        const row = rows[r] || [];
        const idValue = row[1];
        const trimmed = String(idValue ?? "").trim();
        let key = trimmed;
        if (trimmed !== "") {
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
      const duplicateRows = /* @__PURE__ */ new Set();
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
      const workbook = typeof api.getluckysheetfile === "function" ? api.getluckysheetfile() : null;
      let targetIndex = -1;
      if (Array.isArray(workbook)) {
        targetIndex = workbook.findIndex((sheet) => {
          if (!sheet) return false;
          return sheet.index === sheetId || sheet.id === sheetId || sheet.sheetId === sheetId;
        });
      }
      const tryCall = (methodName, value) => {
        const method = api[methodName];
        if (typeof method !== "function") return false;
        try {
          method.call(api, value);
          return true;
        } catch (err) {
          console.warn(`Failed to call luckysheet.${methodName}:`, err);
          return false;
        }
      };
      if (targetIndex >= 0) {
        const orderMethods = ["setSheetActive", "setSheetActivate", "changeSheet", "setSheetActiveByIndex", "setSheetActivateByIndex", "changeSheetByIndex"];
        for (let i = 0; i < orderMethods.length; i += 1) {
          if (tryCall(orderMethods[i], targetIndex)) {
            return true;
          }
        }
      }
      const idMethods = ["setSheetActiveById", "setSheetActivateById", "changeSheetById"];
      for (let i = 0; i < idMethods.length; i += 1) {
        if (tryCall(idMethods[i], sheetId)) {
          return true;
        }
      }
      if (targetIndex >= 0) {
        return tryCall("changeSheet", targetIndex);
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
      if (!cell) return "";
      if (cell.v != null && typeof cell.v === "object") {
        return extractLuckysheetCellText(cell.v);
      }
      if (cell.m != null && cell.m !== "") {
        return String(cell.m);
      }
      if (cell.v != null && cell.v !== "") {
        if (typeof cell.v === "object") {
          if (cell.v.m != null && cell.v.m !== "") {
            return String(cell.v.m);
          }
          if (cell.v.v != null && cell.v.v !== "") {
            return String(cell.v.v);
          }
        }
        return String(cell.v);
      }
      if (typeof cell === "string" || typeof cell === "number" || typeof cell === "boolean") {
        return String(cell);
      }
      return "";
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
        if ((pa.name || "") !== (pb.name || "")) return false;
        if ((pa.type || "").toLowerCase() !== (pb.type || "").toLowerCase()) return false;
        const idxA = pa.parameterIndexes || null;
        const idxB = pb.parameterIndexes || null;
        const keyA = idxA ? `${idxA.template || ""}/${idxA.param || ""}/${idxA.indexField || ""}` : "";
        const keyB = idxB ? `${idxB.template || ""}/${idxB.param || ""}/${idxB.indexField || ""}` : "";
        if (keyA !== keyB) return false;
      }
      return true;
    }
    function markSheetTemplateValidation(tpl, isValid, message) {
      if (!tpl) return;
      ensureTemplateUid2(tpl);
      if (isValid) {
        sheetTemplateValidation.delete(tpl.__uid);
      } else {
        sheetTemplateValidation.set(tpl.__uid, { message: message || "" });
      }
    }
    function getLuckysheetUsedRange(sheet) {
      let maxRow = 1;
      let maxColumn = 3;
      const checkCell = (row, column, cell) => {
        const text = extractLuckysheetCellText(cell);
        if (text !== "") {
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
        const list = Array.isArray(row) ? row.map((cell) => String(cell ?? "").trim()) : [];
        let lastIdx = list.length - 1;
        while (lastIdx >= 0 && list[lastIdx] === "") {
          lastIdx -= 1;
        }
        return list.slice(0, lastIdx + 1);
      });
      let lastRow = normalized.length - 1;
      while (lastRow >= 0 && normalized[lastRow].every((cell) => cell === "")) {
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
          if (rowA[c] !== (rowB[c] || "")) return false;
        }
      }
      return true;
    }
    function getTemplateParameterSignature(tpl) {
      if (!tpl) return "";
      const params = (tpl.parameters || []).map((p) => {
        if (!p) return null;
        const indexes = p.parameterIndexes || {};
        return {
          name: p.name || "",
          type: p.type || "",
          template: indexes.template || "",
          param: indexes.param || "",
          indexField: indexes.indexField || ""
        };
      });
      return JSON.stringify({ params, indexField: tpl.indexField || "id" });
    }
    function computeSheetTemplatesFingerprint() {
      const items = templates.map((tpl, idx) => {
        if (!tpl) return null;
        ensureTemplateUid2(tpl);
        const instances = Array.isArray(tpl.instances) ? tpl.instances : [];
        return {
          uid: tpl.__uid,
          index: idx,
          count: instances.length,
          signature: getTemplateParameterSignature(tpl),
          name: tpl.name || ""
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
      if (!window.luckysheet || typeof window.luckysheet.getluckysheetfile !== "function") {
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
        const parsed = buildTemplateFromCsv(mergedRows, `${tpl.name || "template"}.csv`);
        if ((parsed.name || tpl.name) !== tpl.name) {
          throw new Error("表格模式不可修改模板名称");
        }
        const expectedIndexField = tpl.indexField || "id";
        if ((parsed.indexField || "id") !== expectedIndexField) {
          throw new Error("表格模式不可修改索引列定义");
        }
        const nextParameters = Array.isArray(parsed.parameters) ? parsed.parameters : [];
        const nextInstances = Array.isArray(parsed.instances) ? parsed.instances : [];
        tpl.parameters = nextParameters;
        tpl.instances = nextInstances;
        tpl.indexField = parsed.indexField || tpl.indexField || "id";
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
        showMessage(err && err.message ? `表格数据校验失败：${err.message}` : "表格数据校验失败", "warn");
        markSheetTemplateValidation(tpl, false, err && err.message ? err.message : "表格数据校验失败");
        return { ok: false, error: err };
      }
    }
    function updateSheetTemplateNav() {
      if (!sheetTemplateListEl) return;
      normalizeSheetSelection();
      sheetTemplateListEl.innerHTML = "";
      templates.forEach((tpl, idx) => {
        ensureTemplateUid2(tpl);
        const validation = sheetTemplateValidation.get(tpl.__uid);
        const li = document.createElement("li");
        const classes = [];
        if (idx === sheetActiveTemplateIndex) classes.push("active");
        if (validation) classes.push("invalid");
        const duplicateIdInfo = collectDuplicateIdInfo2(tpl);
        const duplicateIdKeys = Array.from(duplicateIdInfo.duplicates.keys());
        if (duplicateIdKeys.length > 0) {
          classes.push("duplicate-id");
        }
        li.className = classes.join(" ");
        const tooltipParts = [];
        if (validation && validation.message) {
          tooltipParts.push(validation.message);
        }
        if (duplicateIdKeys.length > 0) {
          const preview = duplicateIdKeys.map((key) => key === "" ? "（空）" : key).slice(0, 3).join(", ");
          const suffix = duplicateIdKeys.length > 3 ? "…" : "";
          tooltipParts.push(`存在重复 ID：${preview}${suffix}`);
        }
        if (tooltipParts.length > 0) {
          li.title = tooltipParts.join("\n");
        } else {
          li.removeAttribute("title");
        }
        const label = document.createElement("span");
        label.textContent = tpl.name || `模板${idx + 1}`;
        setInvalidNameVisual(label, isTemplateNameInvalid2(tpl.name));
        li.appendChild(label);
        li.addEventListener("click", () => {
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
      sheetInstanceTabsEl.innerHTML = "";
      const tpl = sheetActiveTemplateIndex >= 0 ? templates[sheetActiveTemplateIndex] : null;
      const instList = tpl && Array.isArray(tpl.instances) ? tpl.instances : [];
      const info = document.createElement("div");
      info.className = "sheet-tabs-empty";
      if (!tpl) {
        info.textContent = "暂无模板，无法进入表格编辑。";
      } else if (instList.length === 0) {
        info.textContent = "该模板还没有实例，请在三列模式下创建后再切换。";
      } else {
        info.textContent = `当前模板共有 ${instList.length} 个实例，均已在表格中显示。`;
      }
      sheetInstanceTabsEl.appendChild(info);
    }
    function renderLuckysheetForActiveInstance() {
      if (!luckysheetContainer || !sheetModePanel) return;
      normalizeSheetSelection();
      if (!window.luckysheet) {
        showMessage("Luckysheet 库未加载，无法进入表格模式", "warn");
        return;
      }
      if (sheetActiveTemplateIndex < 0 || sheetActiveTemplateIndex >= templates.length) {
        sheetRenderedTemplateIndex = -1;
        sheetRenderedInstanceIndex = -1;
        sheetRenderedInstanceCount = 0;
        sheetRenderedParameterSignature = "";
        if (sheetEmptyStateEl) {
          sheetEmptyStateEl.style.display = "flex";
          const msg = sheetEmptyStateEl.querySelector("p");
          if (msg) {
            msg.textContent = "请选择一个包含实例的模板以进入表格编辑模式。";
          }
        }
        luckysheetContainer.style.display = "none";
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
          ensureTemplateUid2(template);
          const instances = Array.isArray(template.instances) ? template.instances : [];
          if (instances.length === 0) return;
          const sheetId = template.__uid;
          const rows = buildCsvRowsForTemplate(template, instances);
          const sheetName = template?.name || `模板${idx + 1}`;
          const status = idx === sheetActiveTemplateIndex && instList.length > 0 ? 1 : 0;
          if (status === 1) {
            activeSheetPrepared = true;
          }
          const duplicateIdInfo = collectDuplicateIdInfo2(template);
          const duplicateRowSet = new Set(
            Array.from(duplicateIdInfo.byIndex.keys()).map((instanceIdx) => instanceIdx + 2)
          );
          const sheetData = buildLuckysheetSheetFromRows(rows, sheetName, {
            index: sheetId,
            order: workbookSheets.length,
            status,
            duplicateIdRows: duplicateRowSet
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
                showMessage("模板列由系统维护，无法修改", "warn");
                return false;
              }
              if (column === 1 && row <= 1) {
                showMessage("ID 列标题不可修改", "warn");
                return false;
              }
              if (column === 2) {
                showMessage("索引列由系统维护，无法修改", "warn");
                return false;
              }
              if ((row === 0 || row === 1) && column === 3) {
                showMessage("保留字段不可编辑", "warn");
                return false;
              }
              return true;
            },
            cellUpdate() {
              sheetModeDirty = true;
              setTimeout(refreshActiveLuckysheetDuplicateStyles, 0);
            }
          };
          window.luckysheet?.create({
            container: "luckysheet",
            data: workbookSheets,
            showtoolbar: false,
            showsheetbar: false,
            showinfobar: false,
            lang: "zh",
            hook
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
        sheetRenderedParameterSignature = "";
        if (sheetEmptyStateEl) {
          sheetEmptyStateEl.style.display = "flex";
          const msg = sheetEmptyStateEl.querySelector("p");
          if (msg) {
            if (templates.length === 0) {
              msg.textContent = "暂无模板，无法进入表格编辑模式。";
            } else {
              msg.textContent = "请选择一个包含实例的模板以进入表格编辑模式。";
            }
          }
        }
        luckysheetContainer.style.display = "none";
        return;
      }
      if (instList.length === 0 || !sheetRenderedSheetIds.has(sheetActiveTemplateIndex)) {
        sheetRenderedTemplateIndex = sheetActiveTemplateIndex;
        sheetRenderedInstanceIndex = -1;
        sheetRenderedInstanceCount = 0;
        sheetRenderedParameterSignature = "";
        if (sheetEmptyStateEl) {
          sheetEmptyStateEl.style.display = "flex";
          const msg = sheetEmptyStateEl.querySelector("p");
          if (msg) {
            msg.textContent = "当前模板没有实例，请回到三列模式新增实例。";
          }
        }
        luckysheetContainer.style.display = "none";
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
          sheetRenderedTemplatesFingerprint = "";
          renderLuckysheetForActiveInstance();
          return;
        }
      }
      sheetRenderedTemplateIndex = sheetActiveTemplateIndex;
      sheetRenderedInstanceIndex = -1;
      sheetRenderedInstanceCount = instList.length;
      sheetRenderedParameterSignature = getTemplateParameterSignature(tpl);
      luckysheetContainer.style.display = "block";
      if (sheetEmptyStateEl) sheetEmptyStateEl.style.display = "none";
      refreshActiveLuckysheetDuplicateStyles();
    }
    function enterSheetMode() {
      document.body.classList.add("sheet-mode");
      normalizeSheetSelection();
      updateSheetTemplateNav();
      updateSheetInstanceTabs();
      renderLuckysheetForActiveInstance();
    }
    function exitSheetMode() {
      document.body.classList.remove("sheet-mode");
      if (window.luckysheet?.destroy && luckysheetInitialized) {
        window.luckysheet.destroy();
      }
      luckysheetInitialized = false;
      sheetModeDirty = false;
      sheetRenderedTemplateIndex = -1;
      sheetRenderedInstanceIndex = -1;
      sheetRenderedInstanceCount = 0;
      sheetRenderedParameterSignature = "";
      sheetRenderedTemplatesFingerprint = "";
      sheetRenderedSheetIds.clear();
      sheetDuplicateIdRows.clear();
      if (luckysheetContainer) luckysheetContainer.style.display = "none";
      if (sheetEmptyStateEl) sheetEmptyStateEl.style.display = "none";
    }
    function setEditMode(nextMode) {
      if (nextMode === currentEditMode) return;
      if (nextMode === EDIT_MODES.SHEET && (!window.luckysheet || typeof window.luckysheet.create !== "function")) {
        showMessage("Luckysheet 库未加载，无法切换到表格模式", "warn");
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
        toggleEditModeBtn.textContent = nextMode === EDIT_MODES.SHEET ? "返回三列模式" : "表格模式";
      }
      if (nextMode === EDIT_MODES.SHEET) {
        enterSheetMode();
      } else {
        exitSheetMode();
      }
    }
    const templatePanelEl = document.querySelector(".templates");
    const instancePanelEl = document.querySelector(".instances");
    const paramPanelEl = document.querySelector(".parameters");
    const chooseDirBtn = $("chooseDir");
    const saveBtn = $("saveBtn");
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
    const engineModeToggleBtn = $("engineModeToggle");
    const regenerateCppBtn = $("regenerateCpp");
    const toggleEditModeBtn = $("toggleEditMode");
    const sheetModePanel = $("sheetMode");
    const sheetTemplateListEl = $("sheetTemplateList");
    const luckysheetContainer = $("luckysheet");
    const sheetInstanceTabsEl = $("sheetInstanceTabs");
    const sheetEmptyStateEl = $("sheetEmptyState");
    const rowHeightSlider = $("rowHeight");
    const rowHeightLabel = $("rowHeightLabel");
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
      engineModeToggleBtn
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
      CONFIG_FILE_NAME
    };
    function bindAppStateProperty(name, getter, setter) {
      Object.defineProperty(appState, name, {
        enumerable: true,
        get: getter,
        set: setter
      });
    }
    bindAppStateProperty("lastSavedStructureSnapshot", () => lastSavedStructureSnapshot, (value) => {
      lastSavedStructureSnapshot = value;
    });
    bindAppStateProperty("currentTemplateIndex", () => currentTemplateIndex, (value) => {
      currentTemplateIndex = value;
    });
    bindAppStateProperty("currentInstanceIndex", () => currentInstanceIndex, (value) => {
      currentInstanceIndex = value;
    });
    bindAppStateProperty("directoryHandle", () => directoryHandle, (value) => {
      directoryHandle = value;
    });
    bindAppStateProperty("csharpHandle", () => csharpHandle, (value) => {
      csharpHandle = value;
    });
    bindAppStateProperty("dataEntityHandle", () => dataEntityHandle, (value) => {
      dataEntityHandle = value;
    });
    bindAppStateProperty("modelStructHandle", () => modelStructHandle, (value) => {
      modelStructHandle = value;
    });
    bindAppStateProperty("editorHandle", () => editorHandle, (value) => {
      editorHandle = value;
    });
    bindAppStateProperty("cppModelHandle", () => cppModelHandle, (value) => {
      cppModelHandle = value;
    });
    bindAppStateProperty("cppEnumHandle", () => cppEnumHandle, (value) => {
      cppEnumHandle = value;
    });
    bindAppStateProperty("configDirHandle", () => configDirHandle, (value) => {
      configDirHandle = value;
    });
    bindAppStateProperty("trashHandle", () => trashHandle, (value) => {
      trashHandle = value;
    });
    bindAppStateProperty("trashButtonBaseLabel", () => trashButtonBaseLabel, (value) => {
      trashButtonBaseLabel = value;
    });
    bindAppStateProperty("trashSelectedTemplateName", () => trashSelectedTemplateName, (value) => {
      trashSelectedTemplateName = value;
    });
    bindAppStateProperty("exportSelectionMode", () => exportSelectionMode, (value) => {
      exportSelectionMode = value;
    });
    bindAppStateProperty("exportTemplateAnchorIndex", () => exportTemplateAnchorIndex, (value) => {
      exportTemplateAnchorIndex = value;
    });
    bindAppStateProperty("anchorTemplate", () => anchorTemplate, (value) => {
      anchorTemplate = value;
    });
    bindAppStateProperty("anchorInstance", () => anchorInstance, (value) => {
      anchorInstance = value;
    });
    bindAppStateProperty("anchorParam", () => anchorParam, (value) => {
      anchorParam = value;
    });
    bindAppStateProperty("lastSelectedCategory", () => lastSelectedCategory, (value) => {
      lastSelectedCategory = value;
    });
    bindAppStateProperty("copyBuffer", () => copyBuffer, (value) => {
      copyBuffer = value;
    });
    bindAppStateProperty("editingParamIndex", () => editingParamIndex, (value) => {
      editingParamIndex = value;
    });
    bindAppStateProperty("currentEngineMode", () => currentEngineMode, (value) => {
      currentEngineMode = value;
    });
    bindAppStateProperty("currentEditMode", () => currentEditMode, (value) => {
      currentEditMode = value;
    });
    bindAppStateProperty("sheetActiveTemplateIndex", () => sheetActiveTemplateIndex, (value) => {
      sheetActiveTemplateIndex = value;
    });
    bindAppStateProperty("sheetActiveInstanceIndex", () => sheetActiveInstanceIndex, (value) => {
      sheetActiveInstanceIndex = value;
    });
    bindAppStateProperty("sheetRenderedTemplateIndex", () => sheetRenderedTemplateIndex, (value) => {
      sheetRenderedTemplateIndex = value;
    });
    bindAppStateProperty("sheetRenderedInstanceIndex", () => sheetRenderedInstanceIndex, (value) => {
      sheetRenderedInstanceIndex = value;
    });
    bindAppStateProperty("sheetRenderedInstanceCount", () => sheetRenderedInstanceCount, (value) => {
      sheetRenderedInstanceCount = value;
    });
    bindAppStateProperty("sheetRenderedParameterSignature", () => sheetRenderedParameterSignature, (value) => {
      sheetRenderedParameterSignature = value;
    });
    bindAppStateProperty(
      "sheetRenderedTemplatesFingerprint",
      () => sheetRenderedTemplatesFingerprint,
      (value) => {
        sheetRenderedTemplatesFingerprint = value;
      }
    );
    bindAppStateProperty("sheetModeDirty", () => sheetModeDirty, (value) => {
      sheetModeDirty = value;
    });
    bindAppStateProperty("lastDuplicateIndexInfo", () => lastDuplicateIndexInfo, (value) => {
      lastDuplicateIndexInfo = value;
    });
    bindAppStateProperty("compareValueState", () => compareValueState, (value) => {
      compareValueState = value;
    });
    bindAppStateProperty("luckysheetInitialized", () => luckysheetInitialized, (value) => {
      luckysheetInitialized = value;
    });
    appModeModule = createAppModeModule({
      appState,
      updateEngineModeUIState,
      refreshTemplates
    });
    workspaceStorageModule = createWorkspaceStorageModule({
      appState,
      setCurrentDirectoryLabel: (label) => {
        if (currentDirLabel) {
          currentDirLabel.textContent = label || "";
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
      updateIndexTemplateOptions,
      generateRuntimeLoaderArtifacts,
      ensureModelStruct
    });
    templatePersistenceModule = createTemplatePersistenceModule({
      appState,
      isUnityMode: (...args) => appModeModule.isUnityMode(...args),
      isGodotMode: (...args) => appModeModule.isGodotMode(...args),
      isSheetModeActive: (...args) => appModeModule.isSheetModeActive(...args),
      updateSheetTemplateNav,
      commitActiveSheetEdits,
      ensureEngineGenerationConsent: (...args) => workspaceStorageModule.ensureEngineGenerationConsent(...args),
      cleanConflictingEngineArtifacts: (...args) => workspaceStorageModule.cleanConflictingEngineArtifacts(...args),
      ensureSubFolders: (...args) => workspaceStorageModule.ensureSubFolders(...args),
      ensureModelStruct,
      ensureTrashDirectory,
      saveEnumTemplateCache: (...args) => workspaceStorageModule.saveEnumTemplateCache(...args),
      loadEnumTemplateCache: (...args) => workspaceStorageModule.loadEnumTemplateCache(...args),
      clearEnumTemplateCache: (...args) => workspaceStorageModule.clearEnumTemplateCache(...args),
      readTextFileIfExists: (...args) => workspaceStorageModule.readTextFileIfExists(...args),
      writeTextFile: (...args) => workspaceStorageModule.writeTextFile(...args),
      deleteDataEntityFileIfExists: (...args) => workspaceStorageModule.deleteDataEntityFileIfExists(...args),
      deleteCSharpFileIfExists: (...args) => workspaceStorageModule.deleteCSharpFileIfExists(...args),
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
      collectDuplicateIdInfo: collectDuplicateIdInfo2,
      collectListTypeViolations: collectListTypeViolations2,
      ensureTemplateUid: ensureTemplateUid2,
      normalizeTemplateParameterIndexes: normalizeTemplateParameterIndexes2,
      populateMissingIndexFields: populateMissingIndexFields2,
      captureCurrentStructureSnapshot: captureCurrentStructureSnapshot2,
      hasTemplateStructureChanged: hasTemplateStructureChanged2,
      normalizeContent: normalizeContent2,
      snapshotTemplateStructure: snapshotTemplateStructure2,
      isEnumTemplate: isEnumTemplate2,
      ensureEnumParamNaming: ensureEnumParamNaming2,
      getEnumTemplate: getEnumTemplate2
    });
    systemPanelsModule = createSystemPanelsModule({
      appState,
      domRefs: {
        openTrashBtn,
        trashOverlay,
        trashListEl,
        messageBox,
        logOverlay,
        logListEl
      },
      restoreTemplateFromTrash: (...args) => templatePersistenceModule.restoreTemplateFromTrash(...args)
    });
    csharpRuntimeGeneratorModule = createCSharpRuntimeGeneratorModule({
      appState,
      isUnityMode: (...args) => appModeModule.isUnityMode(...args),
      isGodotMode: (...args) => appModeModule.isGodotMode(...args),
      isCSharpMode: (...args) => appModeModule.isCSharpMode(...args),
      getCurrentEngineLabel: (...args) => appModeModule.getCurrentEngineLabel(...args),
      ensureEngineGenerationConsent: (...args) => workspaceStorageModule.ensureEngineGenerationConsent(...args),
      cleanConflictingEngineArtifacts: (...args) => workspaceStorageModule.cleanConflictingEngineArtifacts(...args),
      ensureSubFolders: (...args) => workspaceStorageModule.ensureSubFolders(...args),
      writeTextFile: (...args) => workspaceStorageModule.writeTextFile(...args),
      ensureTemplateUid: ensureTemplateUid2,
      isEnumTemplate: isEnumTemplate2,
      getEnumTemplate: getEnumTemplate2,
      getEnumDefinitions: getEnumDefinitions2,
      sanitizeCSharpMemberName: sanitizeCSharpMemberName2,
      getEnumCSharpTypeName: getEnumCSharpTypeName2,
      getValidListElementType,
      isEnumType: isEnumType2,
      showMessage
    });
    godotRuntimeGeneratorModule = createGodotRuntimeGeneratorModule({
      appState,
      isGodotMode: (...args) => appModeModule.isGodotMode(...args),
      writeTextFile: (...args) => workspaceStorageModule.writeTextFile(...args)
    });
    ueGeneratorModule = createUEGeneratorModule({
      appState,
      isUEMode: (...args) => appModeModule.isUEMode(...args),
      ensureSubFolders: (...args) => workspaceStorageModule.ensureSubFolders(...args),
      ensureEngineGenerationConsent: (...args) => workspaceStorageModule.ensureEngineGenerationConsent(...args),
      cleanConflictingEngineArtifacts: (...args) => workspaceStorageModule.cleanConflictingEngineArtifacts(...args),
      ensureCppEnumDirectory: (...args) => workspaceStorageModule.ensureCppEnumDirectory(...args),
      shouldIgnoreFileEntry: (...args) => workspaceStorageModule.shouldIgnoreFileEntry(...args),
      writeTextFile: (...args) => workspaceStorageModule.writeTextFile(...args),
      isEnumTemplate: isEnumTemplate2,
      getEnumDefinitions: getEnumDefinitions2,
      isEnumType: isEnumType2,
      getListElementTypeForParam,
      isUENameCompliant,
      showMessage,
      addLogEntry
    });
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
      setEditMode
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
      importFromCsv
    });
    panelsModule = createPanelsModule({
      appState,
      domRefs,
      isTemplateNameInvalid: isTemplateNameInvalid2,
      doesTemplateHaveInvalidIndexReferences: doesTemplateHaveInvalidIndexReferences2,
      collectListTypeViolations: collectListTypeViolations2,
      getTemplateExportState,
      handleTemplateExportCheckbox,
      getTemplateExportCounts,
      setInvalidNameVisual,
      collectDuplicateIdInfo: collectDuplicateIdInfo2,
      collectDuplicateIndexInfo: collectDuplicateIndexInfo2,
      collectInstanceIndexInvalidReasons: collectInstanceIndexInvalidReasons2,
      isInstanceSelectedForExport,
      handleInstanceExportCheckbox,
      ensureTemplateUid: ensureTemplateUid2,
      isEnumTemplate: isEnumTemplate2,
      getEnumParamKeysForInstance: getEnumParamKeysForInstance2,
      getEnumDefinition: getEnumDefinition2,
      isEnumType: isEnumType2,
      getEnumTemplate: getEnumTemplate2,
      getEnumDefinitions: getEnumDefinitions2,
      getEnumValues: getEnumValues2,
      getInstanceFieldValue,
      showMessage,
      createDefaultReferenceValue,
      normalizeReferenceValue,
      normalizeReferenceList,
      unwrapReferencePayload,
      isEnumValueInvalid: isEnumValueInvalid2,
      isPureNumericName,
      getListElementTypeLabel,
      getDefaultValueForElementType: getDefaultValueForElementType2,
      getDefaultValueForType: getDefaultValueForType2,
      convertValueToList: convertValueToList2,
      convertValueForType: convertValueForType2,
      coerceListElementValue: coerceListElementValue2,
      isListElementValueValid: isListElementValueValid2,
      jumpToDuplicateIndexInstance,
      evaluateInstanceIndexValidation: evaluateInstanceIndexValidation2,
      computeExpectedIndexValue: computeExpectedIndexValue2,
      enforceEnumIndexField: enforceEnumIndexField2,
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
      renderLuckysheetForActiveInstance
    });
    interactionModule = createInteractionModule({
      appState,
      domRefs,
      copyInstance,
      pasteInstance,
      deleteInstance,
      ensureTemplateUid: ensureTemplateUid2,
      isEnumTemplate: isEnumTemplate2,
      ensureEnumParamNaming: ensureEnumParamNaming2,
      getEnumParamKeysForInstance: getEnumParamKeysForInstance2,
      refreshTemplates,
      refreshInstances,
      refreshParams,
      showSelectedParamDetails,
      updateIndexTemplateOptions,
      showMessage
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
      addLogEntry("warn", String(message ?? ""));
      originalAlert(message);
    };
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
    function handleCopy() {
      if (lastSelectedCategory === "param") {
        copyParams();
      } else if (lastSelectedCategory === "instance") {
        copyInstance();
      } else if (lastSelectedCategory === "template") {
        copyTemplates();
      }
    }
    function handlePaste() {
      if (!copyBuffer) return;
      if (copyBuffer.type === "param") {
        const tpl = templates[currentTemplateIndex];
        if (tpl && isEnumTemplate2(tpl)) {
          if (currentTemplateIndex < 0 || currentInstanceIndex < 0) return;
          const inst = templates[currentTemplateIndex].instances[currentInstanceIndex];
          if (!inst.payload) inst.payload = {};
          (copyBuffer.items || []).forEach((obj) => {
            const existing = Object.keys(inst.payload).filter((key) => /^\d+$/.test(key)).map((key) => parseInt(key, 10));
            let nextIndex = 0;
            while (existing.includes(nextIndex)) nextIndex += 1;
            inst.payload[String(nextIndex)] = obj && Object.prototype.hasOwnProperty.call(obj, "value") ? obj.value : "";
          });
          refreshParams();
          showMessage(`已粘贴 ${copyBuffer.items.length} 个参数`);
        } else {
          pasteParams();
        }
      } else if (copyBuffer.type === "instance") {
        pasteInstance();
      } else if (copyBuffer.type === "template") {
        pasteTemplates();
      }
    }
    function handleDelete() {
      if (lastSelectedCategory === "param") {
        deleteParams();
      } else if (lastSelectedCategory === "instance") {
        deleteInstance();
      } else if (lastSelectedCategory === "template") {
        deleteTemplates();
      }
    }
    function newTemplate() {
      const rawName = templateNameInput.value.trim();
      if (rawName && isPureNumericName(rawName)) {
        showMessage("模板名称不能为纯数字");
        return;
      }
      const name = rawName || `模板${templates.length + 1}`;
      if (isPureNumericName(name)) {
        showMessage("模板名称不能为纯数字");
        return;
      }
      if (templates.some((t) => t.name === name)) {
        alert("模板名称已存在");
        return;
      }
      const instance = {
        id: 0,
        name: "默认",
        payload: { template: name, id: 0, name: "默认", index: "0" }
      };
      const template = {
        name,
        parameters: [],
        instances: [instance],
        indexField: "id"
      };
      ensureTemplateUid2(template);
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
      const targetName = (newName || "").trim();
      if (!targetName) {
        templateNameInput.value = tpl.name;
        return;
      }
      if (isPureNumericName(targetName)) {
        alert("模板名称不能为纯数字");
        templateNameInput.value = tpl.name;
        updateTemplateNameInputValidity();
        return;
      }
      if (!isEnumTemplate2(tpl) && targetName === "enum") {
        alert("禁止将其它模板重命名为 enum");
        templateNameInput.value = tpl.name;
        return;
      }
      if (isEnumTemplate2(tpl) && targetName !== "enum") {
        alert("enum 模板创建后不可重命名");
        templateNameInput.value = tpl.name;
        return;
      }
      if (templates.some((t, idx) => idx !== currentTemplateIndex && t.name === targetName)) {
        alert("模板名称已存在");
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
        alert("请先选择一个模板");
        return;
      }
      const tpl = templates[currentTemplateIndex];
      const rawName = instanceNameInput.value.trim();
      if (rawName && isPureNumericName(rawName)) {
        showMessage("实例名称不能为纯数字");
        return;
      }
      const name = rawName || `实例${tpl.instances.length}`;
      if (isPureNumericName(name)) {
        showMessage("实例名称不能为纯数字");
        return;
      }
      const usedIds = /* @__PURE__ */ new Set();
      tpl.instances.forEach((inst2) => {
        if (!inst2) return;
        const value = Number(inst2.id);
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
        payload: {}
      };
      tpl.parameters.forEach((p) => {
        inst.payload[p.name] = getDefaultValueForType2(p.type, getListElementTypeForParam(p));
      });
      inst.payload.template = tpl.name;
      inst.payload.id = nextId;
      inst.payload.name = name;
      inst.payload.index = String(getValueByFieldForInstance(tpl, inst, tpl.indexField || "id"));
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
      const trimmed = String(newName || "").trim();
      if (!trimmed) {
        instanceNameInput.value = inst.name;
        return;
      }
      if (isPureNumericName(trimmed)) {
        showMessage("实例名称不能为纯数字");
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
      const trimmed = String(value ?? "").trim();
      if (!trimmed) {
        showMessage("ID 不能为空", "warn");
        instanceIdInput.value = inst.id != null ? inst.id : "";
        updateInstanceIdInputState(collectDuplicateIdInfo2(tpl));
        return;
      }
      if (!/^[-+]?\d+$/.test(trimmed)) {
        showMessage("ID 必须为整数", "warn");
        instanceIdInput.value = inst.id != null ? inst.id : "";
        updateInstanceIdInputState(collectDuplicateIdInfo2(tpl));
        return;
      }
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) {
        showMessage("ID 必须为整数", "warn");
        instanceIdInput.value = inst.id != null ? inst.id : "";
        updateInstanceIdInputState(collectDuplicateIdInfo2(tpl));
        return;
      }
      const normalized = Math.trunc(parsed);
      if (inst.id === normalized) {
        instanceIdInput.value = inst.id != null ? inst.id : "";
        updateInstanceIdInputState(collectDuplicateIdInfo2(tpl));
        return;
      }
      inst.id = normalized;
      if (!inst.payload) inst.payload = {};
      inst.payload.id = normalized;
      inst.payload.template = tpl.name;
      if (inst.name != null) {
        inst.payload.name = inst.name;
      }
      inst.payload.index = String(getValueByFieldForInstance(tpl, inst, tpl.indexField || "id"));
      refreshInstances();
      refreshParams();
      refreshTemplates();
      updateSheetTemplateNav();
      if (isSheetModeActive()) {
        sheetRenderedTemplatesFingerprint = "";
        renderLuckysheetForActiveInstance();
      }
    }
    function copyInstance() {
      if (currentTemplateIndex < 0) return;
      const tpl = templates[currentTemplateIndex];
      let indices = Array.from(selectedInstances);
      if (indices.length === 0 && currentInstanceIndex >= 0) indices = [currentInstanceIndex];
      if (indices.length === 0) {
        alert("请选择要复制的实例");
        return;
      }
      copyBuffer = {
        type: "instance",
        items: indices.map((idx) => JSON.parse(JSON.stringify(tpl.instances[idx])))
      };
      showMessage(`已复制 ${copyBuffer.items.length} 个实例`);
    }
    function pasteInstance() {
      if (currentTemplateIndex < 0) return;
      const tpl = templates[currentTemplateIndex];
      if (!copyBuffer || copyBuffer.type !== "instance" || !copyBuffer.items || copyBuffer.items.length === 0) {
        alert("没有已复制的实例");
        return;
      }
      const offsetInput = prompt("粘贴的实例 ID 偏移量", "1");
      if (offsetInput === null) {
        return;
      }
      const trimmed = String(offsetInput).trim();
      if (!/^[-+]?\d+$/.test(trimmed)) {
        showMessage("偏移量必须为整数", "warn");
        return;
      }
      const offsetValue = Number(trimmed);
      if (!Number.isFinite(offsetValue)) {
        showMessage("偏移量必须为整数", "warn");
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
        newInst.payload.index = String(getValueByFieldForInstance(tpl, newInst, tpl.indexField || "id"));
        tpl.instances.push(newInst);
      });
      refreshInstances();
      refreshParams();
      refreshTemplates();
      updateSheetTemplateNav();
      if (isSheetModeActive()) {
        sheetRenderedTemplatesFingerprint = "";
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
        sheetRenderedTemplatesFingerprint = "";
        renderLuckysheetForActiveInstance();
      }
      showMessage(`已删除 ${indices.length} 个实例`);
    }
    function newParam() {
      if (currentTemplateIndex < 0) {
        alert("请先选择一个模板");
        return;
      }
      const name = paramNameInput.value.trim();
      if (!name && !isEnumTemplate2(templates[currentTemplateIndex])) {
        showMessage("请输入参数名称");
        return;
      }
      const tpl = templates[currentTemplateIndex];
      if (!isEnumTemplate2(tpl) && name && isPureNumericName(name)) {
        showMessage("参数名称不能为纯数字");
        return;
      }
      let type = paramTypeSelect.value;
      if (isEnumTemplate2(tpl)) {
        type = "string";
      }
      const listElementTypeValue = type === "list" ? getSelectedListElementType() : null;
      let indexObj = null;
      const isEnumParamType = isEnumType2(type);
      if (isEnumParamType) {
        indexTemplateSelect.value = "";
        indexParamSelect.value = "";
      }
      if (!indexTemplateSelect.disabled && !isEnumParamType) {
        const idxTpl = indexTemplateSelect.value;
        const idxParam = indexParamSelect.value;
        if (idxTpl && idxParam) {
          const targetTpl = templates.find((t) => t.name === idxTpl);
          if (targetTpl && isEnumTemplate2(targetTpl)) {
            alert("索引目标不能是 enum 模板");
            indexTemplateSelect.value = "";
            updateIndexParamOptions();
          } else if (targetTpl) {
            const isReservedField = RESERVED_INDEX_FIELDS.has(idxParam);
            const targetParam = (targetTpl.parameters || []).find((p) => p && p.name === idxParam);
            const validParam = isReservedField || targetParam && INDEXABLE_PARAM_TYPES.has(targetParam.type);
            if (!validParam) {
              alert("索引字段类型必须是 int/long/float/string");
              indexParamSelect.value = "";
            } else {
              indexObj = {
                template: idxTpl,
                param: idxParam,
                indexField: targetTpl ? targetTpl.indexField || "id" : ""
              };
            }
          }
        }
      } else {
        indexTemplateSelect.value = "";
        indexParamSelect.value = "";
      }
      if (editingParamIndex >= 0) {
        const currentTpl = templates[currentTemplateIndex];
        const effectiveName = isEnumTemplate2(currentTpl) ? String(editingParamIndex) : name;
        if (!isEnumTemplate2(currentTpl) && isPureNumericName(effectiveName)) {
          showMessage("参数名称不能为纯数字");
          return;
        }
        updateParamAtIndex(editingParamIndex, effectiveName, type, indexObj, listElementTypeValue);
        editingParamIndex = -1;
        selectedParams.clear();
        refreshParams();
        showMessage("已更新参数");
        return;
      }
      if (isEnumTemplate2(tpl)) {
        if (currentInstanceIndex < 0) {
          alert("请先选择一个实例");
          return;
        }
        const curInst = tpl.instances[currentInstanceIndex];
        if (!curInst.payload) curInst.payload = {};
        const keys = getEnumParamKeysForInstance2(tpl, curInst).map((k) => parseInt(k, 10));
        let n = 0;
        while (keys.includes(n)) n++;
        curInst.payload[String(n)] = "";
        refreshParams();
        showMessage("已创建新参数");
        return;
      }
      if (tpl.parameters.some((p) => p.name === name)) {
        showMessage("该参数已存在");
        return;
      }
      const indexBinding = !isEnumParamType && indexObj ? {
        template: indexObj.template || "",
        param: indexObj.param || "",
        indexField: indexObj.indexField || ""
      } : null;
      const param = { name, type };
      if (type === "list") {
        param.elementType = listElementTypeValue;
      }
      if (indexBinding) {
        param.parameterIndexes = indexBinding;
      }
      tpl.parameters.push(param);
      tpl.instances.forEach((inst) => {
        if (indexBinding) {
          if (!inst.payload) inst.payload = {};
          if (type === "list") {
            inst.payload[name] = normalizeReferenceList([], indexBinding);
          } else {
            inst.payload[name] = createDefaultReferenceValue(indexBinding);
          }
        } else {
          inst.payload[name] = getDefaultValueForType2(type, getListElementTypeForParam(param));
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
      if (!isEnumTemplate2(tpl) && isPureNumericName(newName)) {
        showMessage("参数名称不能为纯数字");
        return;
      }
      if (!isEnumTemplate2(tpl) && tpl.parameters.some((p, i) => p.name === newName && i !== index)) {
        alert("参数名称已存在");
        return;
      }
      const enumTypeSelected = isEnumType2(newType);
      if (isEnumTemplate2(tpl)) {
        newType = "string";
        newName = String(index);
        newIndexObj = null;
      } else if (enumTypeSelected) {
        newIndexObj = null;
      }
      if (newIndexObj && newIndexObj.template) {
        const targetTpl = templates.find((t) => t.name === newIndexObj.template);
        if (targetTpl && isEnumTemplate2(targetTpl)) {
          alert("索引目标不能是 enum 模板");
          newIndexObj = null;
        } else if (targetTpl) {
          const isReservedField = RESERVED_INDEX_FIELDS.has(newIndexObj.param);
          const targetParam = (targetTpl.parameters || []).find((p) => p && p.name === newIndexObj.param);
          const validParam = isReservedField || targetParam && INDEXABLE_PARAM_TYPES.has(targetParam.type);
          if (!validParam) {
            alert("索引字段类型必须是 int/long/float/string");
            newIndexObj = null;
          } else {
            newIndexObj.indexField = targetTpl.indexField || "id";
          }
        }
      }
      const oldName = param.name;
      const oldType = param.type;
      const oldElementType = oldType === "list" ? getValidListElementType(param.elementType) : null;
      const normalizedElementType = newType === "list" ? getValidListElementType(newElementType) : null;
      param.name = newName;
      param.type = newType;
      const oldIndex = param.parameterIndexes;
      param.parameterIndexes = newIndexObj;
      if (newType === "list") {
        param.elementType = normalizedElementType;
      } else {
        delete param.elementType;
      }
      tpl.instances.forEach((inst) => {
        if (!inst || typeof inst !== "object") return;
        if (!inst.payload) inst.payload = {};
        if (oldName !== newName) {
          inst.payload[newName] = inst.payload[oldName];
          delete inst.payload[oldName];
        }
        let currentValue = inst.payload[newName];
        if (oldIndex && !newIndexObj) {
          currentValue = unwrapReferencePayload(currentValue, oldIndex, oldType === "list");
        }
        if (!newIndexObj) {
          if (newType === "list") {
            currentValue = convertValueToList2(currentValue, normalizedElementType || "string");
          } else if (oldType !== newType || oldIndex) {
            currentValue = convertValueForType2(
              currentValue,
              newType,
              normalizedElementType || "string"
            );
          }
        }
        if (newIndexObj) {
          currentValue = wrapReferencePayload2(
            currentValue,
            newIndexObj,
            newType === "list",
            normalizedElementType || "string"
          );
        } else if (newType === "list" && oldElementType && normalizedElementType && oldElementType !== normalizedElementType) {
          currentValue = convertValueToList2(currentValue, normalizedElementType);
        }
        if (newIndexObj && newType === "list" && oldElementType && normalizedElementType && oldElementType !== normalizedElementType) {
          const refList = Array.isArray(currentValue) ? currentValue : wrapReferencePayload2(currentValue, newIndexObj, true, normalizedElementType);
          refList.forEach((entry) => {
            if (entry && typeof entry === "object") {
              const coerced = coerceListElementValue2(entry.value, normalizedElementType);
              entry.value = coerced == null ? "" : String(coerced);
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
    function copyTemplates() {
      if (templates.length === 0) return;
      let indices = Array.from(selectedTemplates);
      if (indices.length === 0 && currentTemplateIndex >= 0) indices = [currentTemplateIndex];
      if (indices.length === 0) {
        alert("请先选择要复制的模板");
        return;
      }
      const items = indices.map((idx) => JSON.parse(JSON.stringify(templates[idx])));
      items.forEach((tpl) => {
        if (tpl && tpl.__uid) delete tpl.__uid;
      });
      copyBuffer = { type: "template", items };
      showMessage(`已复制 ${items.length} 个模板`);
    }
    function pasteTemplates() {
      if (!copyBuffer || copyBuffer.type !== "template" || !copyBuffer.items) return;
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
        ensureTemplateUid2(newTpl);
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
        alert("请先选择要删除的模板");
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
            (item, currentIdx) => currentIdx !== idx && item && item.name === tpl.name
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
        alert("请先选择要复制的参数");
        return;
      }
      if (isEnumTemplate2(tpl)) {
        if (currentInstanceIndex < 0) {
          alert("请先选择一个实例");
          return;
        }
        const inst = tpl.instances[currentInstanceIndex];
        const keys = getEnumParamKeysForInstance2(tpl, inst);
        const items2 = indices.map((idx) => ({ value: inst.payload[keys[idx]] }));
        copyBuffer = { type: "param", items: items2, enumMode: true };
        showMessage(`已复制 ${items2.length} 个参数`);
        return;
      }
      const items = indices.map((idx) => {
        const param = JSON.parse(JSON.stringify(tpl.parameters[idx]));
        const values = tpl.instances.map((inst) => inst.payload[param.name]);
        return { param, values };
      });
      copyBuffer = { type: "param", items };
      showMessage(`已复制 ${items.length} 个参数`);
    }
    function pasteParams() {
      if (currentTemplateIndex < 0) return;
      if (!copyBuffer || copyBuffer.type !== "param" || !copyBuffer.items) return;
      const tpl = templates[currentTemplateIndex];
      copyBuffer.items.forEach((item) => {
        let newName = item.param.name;
        while (tpl.parameters.some((param) => param.name === newName)) {
          newName = `${newName}_副本`;
        }
        const newParam2 = JSON.parse(JSON.stringify(item.param));
        newParam2.name = newName;
        tpl.parameters.push(newParam2);
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
        alert("请先选择要删除的参数");
        return;
      }
      indices.sort((a, b) => b - a);
      if (isEnumTemplate2(tpl)) {
        if (currentInstanceIndex < 0) return;
        const inst = tpl.instances[currentInstanceIndex];
        const keys = Object.keys(inst.payload || {}).filter((key) => /^\d+$/.test(key)).map((key) => parseInt(key, 10)).sort((a, b) => a - b).map((value) => String(value));
        indices.forEach((idx) => {
          const key = keys[idx];
          if (key !== void 0 && inst.payload) {
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
        if (currentTpl && isEnumTemplate2(currentTpl)) return "enum 模板不支持索引";
        if (paramTypeSelect && isEnumType2(paramTypeSelect.value)) return "枚举类型参数不支持索引";
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
      const opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = "选择目标模板";
      indexTemplateSelect.appendChild(opt0);
      templates.forEach((tpl) => {
        if (currentTpl && (tpl === currentTpl || tpl.name === currentTpl.name)) return;
        if (isEnumTemplate2(tpl)) return;
        const opt = document.createElement("option");
        opt.value = tpl.name;
        opt.textContent = tpl.name;
        indexTemplateSelect.appendChild(opt);
      });
      if (previousValue) {
        indexTemplateSelect.value = previousValue;
        if (indexTemplateSelect.value !== previousValue) {
          indexTemplateSelect.value = "";
        }
      } else {
        indexTemplateSelect.value = "";
      }
      updateIndexParamOptions();
    }
    function updateIndexParamOptions() {
      if (indexTemplateSelect.disabled) {
        indexParamSelect.innerHTML = "";
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = indexTemplateSelect.dataset.disabledReason || "enum 模板不支持索引";
        indexParamSelect.appendChild(opt);
        indexParamSelect.value = "";
        indexParamSelect.disabled = true;
        indexParamSelect.dataset.disabledReason = indexTemplateSelect.dataset.disabledReason || "";
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
      if (isEnumTemplate2(tpl)) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "不能指向 enum 模板";
        indexParamSelect.appendChild(opt);
        indexParamSelect.value = "";
        return;
      }
      const previousValue = indexParamSelect.value;
      const indexableParams = [];
      const seenNames = /* @__PURE__ */ new Set();
      function appendParamOption(name, label) {
        if (!name || seenNames.has(name)) return;
        seenNames.add(name);
        indexableParams.push({ name, label: label || name });
      }
      appendParamOption("id", "id");
      appendParamOption("name", "name");
      appendParamOption("index", "index");
      (tpl.parameters || []).filter((p) => p && INDEXABLE_PARAM_TYPES.has(p.type)).forEach((p) => appendParamOption(p.name, p.name));
      if (indexableParams.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "无可用字段";
        indexParamSelect.appendChild(opt);
        indexParamSelect.value = "";
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
          indexParamSelect.value = "";
        }
      } else {
        indexParamSelect.value = "";
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
      toggleCompareValuesBtn.addEventListener("click", handleToggleCompareValues);
      updateCompareButtonState();
    }
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener("click", beginExportSelection);
    }
    if (confirmExportCsvBtn) {
      confirmExportCsvBtn.addEventListener("click", performExportCsv);
    }
    if (cancelExportCsvBtn) {
      cancelExportCsvBtn.addEventListener("click", () => exitExportSelectionMode(true));
    }
    if (importCsvBtn) {
      importCsvBtn.addEventListener("click", importFromCsv);
    }
    if (toggleEditModeBtn) {
      toggleEditModeBtn.addEventListener("click", () => {
        const next = isSheetModeActive() ? EDIT_MODES.CLASSIC : EDIT_MODES.SHEET;
        setEditMode(next);
      });
    }
    if (engineModeToggleBtn) {
      engineModeToggleBtn.addEventListener("click", () => {
        toggleEngineMode();
      });
    }
    if (viewLogsBtn) {
      viewLogsBtn.addEventListener("click", openLogOverlay);
    }
    if (closeLogBtn) {
      closeLogBtn.addEventListener("click", closeLogOverlay);
    }
    if (clearLogsBtn) {
      clearLogsBtn.addEventListener("click", clearLogEntries);
    }
    if (openTrashBtn) {
      openTrashBtn.addEventListener("click", () => {
        openTrashOverlayPanel();
      });
    }
    if (closeTrashBtn) {
      closeTrashBtn.addEventListener("click", () => {
        closeTrashOverlayPanel();
      });
    }
    if (emptyTrashBtn) {
      emptyTrashBtn.addEventListener("click", () => {
        emptyTrashFolder();
      });
    }
    if (logOverlay) {
      logOverlay.addEventListener("click", (e) => {
        if (e.target === logOverlay) {
          closeLogOverlay();
        }
      });
    }
    if (trashOverlay) {
      trashOverlay.addEventListener("click", (e) => {
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
    if (regenerateCppBtn) {
      regenerateCppBtn.addEventListener("click", regenerateCppStructures);
    }
    if (regenerateCsBtn) {
      regenerateCsBtn.addEventListener("click", regenerateCSharpStructures);
    }
    if (templateNameInput) {
      templateNameInput.addEventListener("input", updateTemplateNameInputValidity);
    }
    if (instanceNameInput) {
      instanceNameInput.addEventListener("input", updateInstanceNameInputValidity);
    }
    if (instanceIdInput) {
      const commitId = () => commitInstanceIdChange();
      instanceIdInput.addEventListener("change", commitId);
      instanceIdInput.addEventListener("blur", commitId);
      instanceIdInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          commitInstanceIdChange();
          instanceIdInput.blur();
        }
      });
    }
    if (paramNameInput) {
      paramNameInput.addEventListener("input", updateParamNameInputValidity);
    }
    if (paramTypeSelect) {
      paramTypeSelect.addEventListener("change", () => {
        updateIndexTemplateOptions();
        updateListElementTypeSelectState();
      });
    }
    if (renameTemplateBtn) {
      renameTemplateBtn.addEventListener("click", () => {
        if (currentTemplateIndex < 0) {
          alert("请先选择一个模板");
          return;
        }
        const oldName = templates[currentTemplateIndex].name;
        const v = prompt("重命名模板", oldName);
        if (v != null) renameTemplate(String(v).trim());
      });
    }
    if (renameInstanceBtn) {
      renameInstanceBtn.addEventListener("click", () => {
        if (currentTemplateIndex < 0 || currentInstanceIndex < 0) {
          alert("请先选择一个实例");
          return;
        }
        const oldName = templates[currentTemplateIndex].instances[currentInstanceIndex].name;
        const v = prompt("重命名实例", oldName);
        if (v != null) renameInstance(String(v).trim());
      });
    }
    indexTemplateSelect.addEventListener("change", updateIndexParamOptions);
    if (helpBtn) {
      helpBtn.addEventListener("click", () => {
        const tips = [
          "选择与多选:",
          "  - 单击：单选；再次单击唯一选中项可取消",
          "  - Ctrl+点击：增/减选中（模板/实例/参数）",
          "  - Shift+点击：基于锚点的区间多选；无锚点时选当前",
          "  - Shift+拖拽：拖出范围多选",
          "",
          "索引与跳转:",
          "  - 右栏索引参数显示“索引值”输入框，可输入/选择目标值",
          "  - Alt+点击索引参数：跳转到目标模板/实例，并尝试选中被索引字段",
          "",
          "其它快捷键:",
          "  - Ctrl+C / Ctrl+V：复制 / 粘贴（按当前栏作用）",
          "  - Delete：删除当前选择",
          "  - F1：返回上一个选中的参数（不会写入历史）"
        ].join("\n");
        alert(tips);
      });
    }
    updateExportButtons();
    refreshParamTypeOptions();
    document.addEventListener("keydown", (evt) => {
      if ((evt.ctrlKey || evt.metaKey) && String(evt.key).toLowerCase() === "s") {
        evt.preventDefault();
        saveAll();
      }
    });
    function ensureTemplateUid2(tpl) {
      return ensureTemplateUid(tpl, templateUidState);
    }
    function snapshotTemplateStructure2(tpl) {
      return snapshotTemplateStructure(tpl, { isEnumTemplate: isEnumTemplate2 });
    }
    function structuresEqual2(a, b) {
      return structuresEqual(a, b);
    }
    function hasTemplateStructureChanged2(tpl) {
      return hasTemplateStructureChanged(tpl, {
        lastSavedStructureSnapshot,
        ensureTemplateUid: ensureTemplateUid2,
        snapshotTemplateStructure: snapshotTemplateStructure2
      });
    }
    function captureCurrentStructureSnapshot2() {
      return captureCurrentStructureSnapshot(templates, {
        ensureTemplateUid: ensureTemplateUid2,
        snapshotTemplateStructure: snapshotTemplateStructure2
      });
    }
    function normalizeContent2(content) {
      return normalizeContent(content);
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
    const paramHistory = [];
    function pushParamHistory() {
      if (currentTemplateIndex < 0 || currentInstanceIndex < 0 || editingParamIndex < 0) return;
      const tpl = templates[currentTemplateIndex];
      const param = tpl.parameters[editingParamIndex];
      if (!param) return;
      const snapshot = {
        templateName: tpl.name,
        paramName: param.name,
        instanceId: templates[currentTemplateIndex].instances[currentInstanceIndex]?.id ?? currentInstanceIndex
      };
      const top = paramHistory[paramHistory.length - 1];
      if (!top || top.templateName !== snapshot.templateName || top.paramName !== snapshot.paramName || top.instanceId !== snapshot.instanceId) {
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
        (inst) => inst.id === snapshot.instanceId
      );
      currentInstanceIndex = targetInstanceIndex >= 0 ? targetInstanceIndex : templates[targetTemplateIndex].instances.length > 0 ? 0 : -1;
      selectedInstances.clear();
      if (currentInstanceIndex >= 0) {
        selectedInstances.add(currentInstanceIndex);
      }
      const targetParamIndex = templates[targetTemplateIndex].parameters.findIndex(
        (param) => param.name === snapshot.paramName
      );
      selectedParams.clear();
      if (targetParamIndex >= 0) {
        selectedParams.add(targetParamIndex);
        editingParamIndex = targetParamIndex;
      } else {
        editingParamIndex = -1;
      }
      templateNameInput.value = templates[currentTemplateIndex].name;
      instanceNameInput.value = currentInstanceIndex >= 0 ? templates[currentTemplateIndex].instances[currentInstanceIndex].name : "";
      showSelectedParamDetails();
      refreshTemplates();
      refreshInstances();
      refreshParams();
      updateIndexTemplateOptions();
      lastSelectedCategory = "param";
      return true;
    }
    toggleDarkBtn.addEventListener("click", () => {
      document.body.classList.toggle("dark");
    });
    paramWidthSlider.addEventListener("input", () => {
      const val = parseFloat(paramWidthSlider.value);
      document.documentElement.style.setProperty("--param-flex", val);
      paramWidthLabel.textContent = `参数栏比例 x${val.toFixed(1)}`;
    });
    rowHeightSlider.addEventListener("input", () => {
      const val = parseFloat(rowHeightSlider.value);
      document.documentElement.style.setProperty("--row-scale", val);
      rowHeightLabel.textContent = `行高比例 x${val.toFixed(1)}`;
    });
    searchTemplatesInput.addEventListener("input", () => {
      filterList(templateListEl, searchTemplatesInput.value);
    });
    searchInstancesInput.addEventListener("input", () => {
      filterList(instanceListEl, searchInstancesInput.value);
    });
    searchParamsInput.addEventListener("input", () => {
      filterList(paramListEl, searchParamsInput.value, true);
    });
    function setupDragSelection(listEl, type) {
      listEl.addEventListener("mousedown", (e) => {
        if (!e.shiftKey) return;
        const selector = type === "param" ? ".param-item" : "li";
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
      listEl.addEventListener("mouseover", (e) => {
        if (dragSelect.type !== type) return;
        if ((e.buttons & 1) !== 1) return;
        const selector = type === "param" ? ".param-item" : "li";
        const items = Array.from(listEl.querySelectorAll(selector));
        const itemEl = e.target.closest(selector);
        if (!itemEl) return;
        const idx = items.indexOf(itemEl);
        if (idx < 0) return;
        if (dragSelect.startIndex === void 0) {
          dragSelect.startIndex = idx;
        }
        if (idx !== dragSelect.startIndex) {
          dragSelect.isDragging = true;
          dragSelect.indices.clear();
          listEl.querySelectorAll(".selecting").forEach((el) => el.classList.remove("selecting"));
          const start = Math.min(dragSelect.startIndex, idx);
          const end = Math.max(dragSelect.startIndex, idx);
          for (let i = start; i <= end; i += 1) {
            dragSelect.indices.add(i);
            const current = items[i];
            if (current) current.classList.add("selecting");
          }
        }
      });
    }
    setupDragSelection(templateListEl, "template");
    setupDragSelection(instanceListEl, "instance");
    setupDragSelection(paramListEl, "param");
    document.addEventListener("mouseup", () => {
      if (!dragSelect.isDragging) return;
      const type = dragSelect.type;
      const indices = Array.from(dragSelect.indices);
      if (type === "template") {
        selectedTemplates.clear();
        indices.forEach((idx) => selectedTemplates.add(idx));
        if (indices.length > 0) {
          currentTemplateIndex = indices[indices.length - 1];
          templateNameInput.value = templates[currentTemplateIndex]?.name || "";
          currentInstanceIndex = templates[currentTemplateIndex].instances.length > 0 ? 0 : -1;
          selectedInstances.clear();
          selectedParams.clear();
        }
        refreshTemplates();
        refreshInstances();
        refreshParams();
        lastSelectedCategory = "template";
      } else if (type === "instance") {
        selectedInstances.clear();
        indices.forEach((idx) => selectedInstances.add(idx));
        if (indices.length > 0) {
          currentInstanceIndex = indices[indices.length - 1];
          instanceNameInput.value = templates[currentTemplateIndex].instances[currentInstanceIndex]?.name || "";
          selectedParams.clear();
        }
        refreshInstances();
        refreshParams();
        lastSelectedCategory = "instance";
      } else if (type === "param") {
        pushParamHistory();
        selectedParams.clear();
        indices.forEach((idx) => selectedParams.add(idx));
        if (indices.length > 0) {
          const idx = indices[indices.length - 1];
          editingParamIndex = idx;
          showSelectedParamDetails();
        }
        refreshParams();
        lastSelectedCategory = "param";
      }
      if (dragSelect.type === "param") {
        paramListEl.querySelectorAll(".selecting").forEach((el) => el.classList.remove("selecting"));
      } else if (dragSelect.type === "instance") {
        instanceListEl.querySelectorAll(".selecting").forEach((el) => el.classList.remove("selecting"));
      } else if (dragSelect.type === "template") {
        templateListEl.querySelectorAll(".selecting").forEach((el) => el.classList.remove("selecting"));
      }
      dragSelect.isDragging = false;
      dragSelect.type = null;
      dragSelect.indices.clear();
      dragSelect.startIndex = void 0;
    });
    function setupClearOnBlank(listEl, type) {
      listEl.addEventListener("click", (e) => {
        const itemSelector = type === "param" ? ".param-item" : "li";
        if (e.target.closest(itemSelector)) return;
        if (type === "template") {
          selectedTemplates.clear();
          currentTemplateIndex = -1;
          currentInstanceIndex = -1;
          templateNameInput.value = "";
          instanceNameInput.value = "";
          selectedInstances.clear();
          selectedParams.clear();
          editingParamIndex = -1;
          anchorTemplate = null;
          anchorInstance = null;
          anchorParam = null;
          refreshTemplates();
          refreshInstances();
          refreshParams();
        } else if (type === "instance") {
          selectedInstances.clear();
          currentInstanceIndex = -1;
          instanceNameInput.value = "";
          selectedParams.clear();
          editingParamIndex = -1;
          anchorInstance = null;
          anchorParam = null;
          refreshInstances();
          refreshParams();
        } else if (type === "param") {
          selectedParams.clear();
          editingParamIndex = -1;
          showSelectedParamDetails();
          refreshParams();
          anchorParam = null;
        }
        lastSelectedCategory = type;
      });
    }
    document.addEventListener("keydown", (e) => {
      if (trashOverlay && trashOverlay.style.display !== "none") {
        if (e.key === "Delete") {
          e.preventDefault();
          deleteSelectedTrashEntry();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          closeTrashOverlayPanel();
          return;
        }
        return;
      }
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (isSheetModeActive()) return;
      if (e.ctrlKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        handleCopy();
      }
      if (e.ctrlKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        handlePaste();
      }
      if (e.key === "Delete") {
        e.preventDefault();
        handleDelete();
      }
      if (e.key === "F1") {
        e.preventDefault();
        const prev = paramHistory.pop();
        if (prev) {
          navigateToParamSnapshot(prev);
        } else {
          showMessage("没有更多历史");
        }
      }
    });
    function showMessage(msg, level = "info") {
      return systemPanelsModule.showMessage(msg, level);
    }
    const DB_NAME2 = "json-editor";
    const DB_STORE2 = "handles";
    const ENUM_CACHE_PREFIX2 = "enumCache:";
    function openDB() {
      if (workspaceStorageModule) {
        return workspaceStorageModule.openDB();
      }
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME2, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(DB_STORE2)) {
            db.createObjectStore(DB_STORE2, { keyPath: "key" });
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
      return `${ENUM_CACHE_PREFIX2}${directoryHandle.name}`;
    }
    async function saveLastDirectoryHandle(handle) {
      if (workspaceStorageModule) {
        return workspaceStorageModule.saveLastDirectoryHandle(handle);
      }
      try {
        const db = await openDB();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(DB_STORE2, "readwrite");
          tx.objectStore(DB_STORE2).put({ key: "workdir", handle });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch (e) {
        console.warn("保存目录句柄失败", e);
      }
    }
    async function getLastDirectoryHandle() {
      if (workspaceStorageModule) {
        return workspaceStorageModule.getLastDirectoryHandle();
      }
      try {
        const db = await openDB();
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(DB_STORE2, "readonly");
          const req = tx.objectStore(DB_STORE2).get("workdir");
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
          indexField: tpl.indexField || "id"
        }));
        await new Promise((resolve, reject) => {
          const tx = db.transaction(DB_STORE2, "readwrite");
          tx.objectStore(DB_STORE2).put({ key, template: payload });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch (e) {
        console.warn("保存枚举模板缓存失败", e);
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
          const tx = db.transaction(DB_STORE2, "readonly");
          const req = tx.objectStore(DB_STORE2).get(key);
          req.onsuccess = () => {
            const value = req.result && req.result.template;
            resolve(value ? JSON.parse(JSON.stringify(value)) : null);
          };
          req.onerror = () => reject(req.error);
        });
      } catch (e) {
        console.warn("读取枚举模板缓存失败", e);
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
          const tx = db.transaction(DB_STORE2, "readwrite");
          tx.objectStore(DB_STORE2).delete(key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch (e) {
        console.warn("清除枚举模板缓存失败", e);
      }
    }
    async function verifyPermission(handle, readWrite = false) {
      if (workspaceStorageModule) {
        return workspaceStorageModule.verifyPermission(handle, readWrite);
      }
      if (!handle) return false;
      const opts = { mode: readWrite ? "readwrite" : "read" };
      try {
        if (handle.queryPermission) {
          const p = await handle.queryPermission(opts);
          if (p === "granted") return true;
          if (p === "prompt" && handle.requestPermission) {
            const r = await handle.requestPermission(opts);
            return r === "granted";
          }
          return false;
        }
      } catch (_err) {
      }
      return true;
    }
    async function autoRestoreLastDirectory() {
      if (workspaceStorageModule) {
        return workspaceStorageModule.autoRestoreLastDirectory();
      }
      try {
        const handle = await getLastDirectoryHandle();
        if (!handle) return;
        if (navigator.storage && navigator.storage.persist) {
          try {
            await navigator.storage.persist();
          } catch (_err) {
          }
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
        showMessage("已自动恢复上次工作目录");
      } catch (err) {
        console.warn("自动恢复目录失败", err);
      }
    }
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
    const IGNORED_FILE_SUFFIXES2 = [".meta"];
    const IGNORED_FILE_NAMES2 = [".ds_store", "thumbs.db"];
    function shouldIgnoreFileEntry(entryName) {
      if (workspaceStorageModule) {
        return workspaceStorageModule.shouldIgnoreFileEntry(entryName);
      }
      if (!entryName) return false;
      const lower = entryName.toLowerCase();
      if (IGNORED_FILE_NAMES2.includes(lower)) return true;
      return IGNORED_FILE_SUFFIXES2.some((suffix) => lower.endsWith(suffix));
    }
    async function removeDirectoryIfExists(parentHandle, name) {
      if (workspaceStorageModule) {
        return workspaceStorageModule.removeDirectoryIfExists(parentHandle, name);
      }
      if (!parentHandle || typeof parentHandle.removeEntry !== "function" || !name) return false;
      try {
        await parentHandle.removeEntry(name, { recursive: true });
        return true;
      } catch (err) {
        if (err && err.name === "NotFoundError") {
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
        removed = await removeDirectoryIfExists(directoryHandle, "cppmodel") || removed;
        cppModelHandle = null;
        cppEnumHandle = null;
      } else {
        removed = await removeDirectoryIfExists(directoryHandle, "csharpDate") || removed;
        removed = await removeDirectoryIfExists(directoryHandle, "Editor") || removed;
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
        console.warn("无法创建或访问垃圾箱目录", err);
        trashHandle = null;
      }
      if (isUnityMode()) {
        cppModelHandle = null;
        cppEnumHandle = null;
        csharpHandle = await directoryHandle.getDirectoryHandle("csharpDate", { create: true });
        try {
          editorHandle = await directoryHandle.getDirectoryHandle("Editor", { create: true });
        } catch (err) {
          console.warn("无法创建或访问 Editor 文件夹", err);
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
          console.warn("无法创建或访问 enum 目录", err);
          cppEnumHandle = null;
        }
        for await (const entry of cppModelHandle.values()) {
          if (entry.kind === "directory") continue;
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
        console.warn("无法创建或访问 enum 目录", err);
        cppEnumHandle = null;
      }
      return cppEnumHandle;
    }
    async function ensureModelStruct() {
      return csharpRuntimeGeneratorModule.ensureModelStruct();
    }
    function normalizeParamIndexStructure2(param) {
      if (!param || typeof param !== "object") return;
      if (param.index && !param.parameterIndexes) {
        const legacy = param.index;
        if (legacy && typeof legacy === "object") {
          param.parameterIndexes = {
            template: legacy.template || "",
            param: legacy.param || "",
            indexField: legacy.indexField || ""
          };
        } else {
          param.parameterIndexes = { template: "", param: "", indexField: "" };
        }
        delete param.index;
      } else if (param.index) {
        delete param.index;
      }
      if (param.parameterIndexes && typeof param.parameterIndexes === "object") {
        if (!Object.prototype.hasOwnProperty.call(param.parameterIndexes, "indexField")) {
          param.parameterIndexes.indexField = "";
        }
        if (!Object.prototype.hasOwnProperty.call(param.parameterIndexes, "template")) {
          param.parameterIndexes.template = "";
        }
        if (!Object.prototype.hasOwnProperty.call(param.parameterIndexes, "param")) {
          param.parameterIndexes.param = "";
        }
      }
    }
    function normalizeTemplateParameterIndexes2(template) {
      return normalizeTemplateParameterIndexes(template, { ensureParamElementType });
    }
    function populateMissingIndexFields2(templatesList) {
      return populateMissingIndexFields(templatesList);
    }
    async function generateRuntimeLoaderArtifacts() {
      if (isUnityMode()) {
        return csharpRuntimeGeneratorModule.generateRuntimeLoaderArtifacts();
      }
      if (isGodotMode()) {
        return godotRuntimeGeneratorModule.generateRuntimeLoaderArtifacts();
      }
      return void 0;
    }
    async function regenerateCSharpStructures() {
      if (!directoryHandle) {
        window.alert("请先选择工作目录");
        return;
      }
      if (!isCSharpMode()) {
        showMessage("请先切换到 Unity 或 Godot C# 模式再生成 C# 脚本", "warn");
        return;
      }
      try {
        const consent = await ensureEngineGenerationConsent(
          isGodotMode() ? "生成 Godot C# 数据结构脚本" : "生成 C# 数据结构脚本"
        );
        if (!consent) return;
        await cleanConflictingEngineArtifacts();
        await ensureSubFolders();
        await ensureModelStruct();
        let updatedAny = false;
        for (const tpl of templates) {
          ensureTemplateUid2(tpl);
          if (isEnumTemplate2(tpl)) continue;
          const content = generateCSContent(tpl);
          await writeTextFile(csharpHandle, `${tpl.name}.cs`, content);
          updatedAny = true;
        }
        const enumTpl = getEnumTemplate2();
        await generateEnumCSFiles(enumTpl);
        if (enumTpl) {
          updatedAny = true;
        }
        await generateRuntimeLoaderArtifacts();
        if (updatedAny) {
          showMessage(
            isGodotMode() ? "已重新生成 Godot C# 数据结构脚本" : "已重新生成 C# 数据结构脚本"
          );
        } else {
          showMessage(
            isGodotMode() ? "没有可生成的 Godot C# 数据结构脚本" : "没有可生成的 C# 数据结构脚本"
          );
        }
      } catch (err) {
        console.error(err);
        showMessage(
          isGodotMode() ? "重新生成 Godot C# 脚本失败，请检查权限" : "重新生成 C# 脚本失败，请检查权限"
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
    function filterList(listEl, term, isParamList = false) {
      const lower = term.trim().toLowerCase();
      const items = listEl.children;
      let visibleCount = 0;
      let lastVisibleIndex = -1;
      for (let i = 0; i < items.length; i += 1) {
        const el = items[i];
        let text;
        if (isParamList) {
          const label = el.querySelector("label");
          text = label ? label.textContent : "";
        } else {
          text = el.textContent;
        }
        if (!lower || text && text.toLowerCase().includes(lower)) {
          el.style.display = "";
          visibleCount += 1;
          lastVisibleIndex = i;
        } else {
          el.style.display = "none";
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
      document.body.classList.add("dark");
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
      isEnumValueInvalidPure: isEnumValueInvalid,
      isPureNumericName,
      isTemplateNameInvalidPure: isTemplateNameInvalid,
      isUENameCompliant,
      normalizeReferenceList,
      normalizeReferenceValue,
      unwrapReferencePayload,
      wrapReferencePayloadPure: wrapReferencePayload,
      captureCurrentStructureSnapshotPure: captureCurrentStructureSnapshot,
      ensureTemplateUidPure: ensureTemplateUid,
      hasTemplateStructureChangedPure: hasTemplateStructureChanged,
      normalizeContentPure: normalizeContent,
      normalizeTemplateParameterIndexesPure: normalizeTemplateParameterIndexes,
      populateMissingIndexFieldsPure: populateMissingIndexFields,
      snapshotTemplateStructurePure: snapshotTemplateStructure,
      structuresEqualPure: structuresEqual,
      buildListElementTypeCollectionsPure: buildListElementTypeCollections,
      chooseDuplicateNavigationTargetPure: chooseDuplicateNavigationTarget,
      collectDuplicateIdInfoPure: collectDuplicateIdInfo,
      collectDuplicateIndexInfoPure: collectDuplicateIndexInfo,
      collectInstanceIndexInvalidReasonsPure: collectInstanceIndexInvalidReasons,
      computeExpectedIndexValuePure: computeExpectedIndexValue,
      doesTemplateContainValue,
      doesTemplateHaveField,
      doesTemplateHaveInvalidIndexReferencesPure: doesTemplateHaveInvalidIndexReferences,
      enforceEnumIndexFieldPure: enforceEnumIndexField,
      ensureEnumParamNamingPure: ensureEnumParamNaming,
      evaluateInstanceIndexValidationPure: evaluateInstanceIndexValidation,
      findTemplateByNamePure: findTemplateByName,
      formatIndexCellPure: formatIndexCell,
      getEnumCSharpTypeNamePure: getEnumCSharpTypeName,
      getEnumDefinitionPure: getEnumDefinition,
      getEnumDefinitionsPure: getEnumDefinitions,
      getEnumParamKeysForInstancePure: getEnumParamKeysForInstance,
      getEnumTemplatePure: getEnumTemplate,
      getEnumValuesPure: getEnumValues,
      getInstanceFieldValue,
      getNumericInstanceIdPure: getNumericInstanceId,
      isEnumTemplatePure: isEnumTemplate,
      isEnumTypePure: isEnumType,
      parseIndexDataCellPure: parseIndexDataCell,
      parseIndexTypeCellPure: parseIndexTypeCell,
      resolveIndexFieldMetaPure: resolveIndexFieldMeta,
      sanitizeCSharpMemberNamePure: sanitizeCSharpMemberName,
      sanitizeCSharpTypeNamePure: sanitizeCSharpTypeName,
      coerceListElementValuePure: coerceListElementValue,
      collectListTypeViolationsPure: collectListTypeViolations,
      convertValueForTypePure: convertValueForType,
      convertValueToListPure: convertValueToList,
      getDefaultValueForElementTypePure: getDefaultValueForElementType,
      getDefaultValueForTypePure: getDefaultValueForType,
      isListElementValueValidPure: isListElementValueValid,
      validateListValueAgainstTypePure: validateListValueAgainstType,
      isTemplateNameInvalid: isTemplateNameInvalid2,
      isEnumValueInvalid: isEnumValueInvalid2,
      wrapReferencePayload: wrapReferencePayload2,
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
      normalizeParamIndexStructure: normalizeParamIndexStructure2,
      normalizeTemplateParameterIndexes: normalizeTemplateParameterIndexes2,
      populateMissingIndexFields: populateMissingIndexFields2,
      captureCurrentStructureSnapshot: captureCurrentStructureSnapshot2,
      hasTemplateStructureChanged: hasTemplateStructureChanged2,
      normalizeContent: normalizeContent2,
      snapshotTemplateStructure: snapshotTemplateStructure2,
      structuresEqual: structuresEqual2,
      findTemplateByName: findTemplateByName2,
      evaluateInstanceIndexValidation: evaluateInstanceIndexValidation2,
      collectInstanceIndexInvalidReasons: collectInstanceIndexInvalidReasons2,
      doesTemplateHaveInvalidIndexReferences: doesTemplateHaveInvalidIndexReferences2,
      resolveIndexFieldMeta: resolveIndexFieldMeta2,
      formatIndexCell: formatIndexCell2,
      parseIndexTypeCell: parseIndexTypeCell2,
      parseIndexDataCell: parseIndexDataCell2,
      computeExpectedIndexValue: computeExpectedIndexValue2,
      enforceEnumIndexField: enforceEnumIndexField2,
      collectDuplicateIdInfo: collectDuplicateIdInfo2,
      getNumericInstanceId: getNumericInstanceId2,
      collectDuplicateIndexInfo: collectDuplicateIndexInfo2,
      chooseDuplicateNavigationTarget: chooseDuplicateNavigationTarget2,
      jumpToDuplicateIndexInstance,
      enforceImportedIndexField,
      isEnumTemplate: isEnumTemplate2,
      ensureEnumParamNaming: ensureEnumParamNaming2,
      getEnumParamKeysForInstance: getEnumParamKeysForInstance2,
      getEnumTemplate: getEnumTemplate2,
      getEnumDefinitions: getEnumDefinitions2,
      getEnumDefinition: getEnumDefinition2,
      isEnumType: isEnumType2,
      getEnumValues: getEnumValues2,
      getEnumCSharpTypeName: getEnumCSharpTypeName2,
      sanitizeCSharpTypeName: sanitizeCSharpTypeName2,
      sanitizeCSharpMemberName: sanitizeCSharpMemberName2,
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
      convertValueForType: convertValueForType2,
      deleteParam,
      getDefaultValueForType: getDefaultValueForType2,
      getDefaultValueForElementType: getDefaultValueForElementType2,
      convertValueToList: convertValueToList2,
      coerceListElementValue: coerceListElementValue2,
      isListElementValueValid: isListElementValueValid2,
      validateListValueAgainstType: validateListValueAgainstType2,
      collectListTypeViolations: collectListTypeViolations2,
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
      filterList
    });
    Object.defineProperties(globalThis.__legacyMainContext, {
      listElementTypeOptions: {
        configurable: true,
        enumerable: true,
        get: () => listElementTypeOptions,
        set: (value) => {
          listElementTypeOptions = value;
        }
      },
      listElementTypeSet: {
        configurable: true,
        enumerable: true,
        get: () => listElementTypeSet,
        set: (value) => {
          listElementTypeSet = value;
        }
      }
    });
    window.LegacyApp = {
      state: appState,
      bootstrap: bootstrapLegacyApp,
      modules: {
        appMode: appModeModule,
        formAndReference: {
          isPureNumericName,
          isUENameCompliant,
          isTemplateNameInvalid: isTemplateNameInvalid2,
          isEnumValueInvalid: isEnumValueInvalid2,
          getValidListElementType,
          ensureParamElementType,
          getListElementTypeForParam,
          getSelectedListElementType,
          getListElementTypeLabel,
          setInvalidNameVisual,
          updateTemplateNameInputValidity,
          updateInstanceNameInputValidity,
          updateListElementTypeSelectState,
          updateInstanceIdInputState,
          updateParamNameInputValidity,
          createDefaultReferenceValue,
          normalizeReferenceValue,
          normalizeReferenceList,
          unwrapReferencePayload,
          wrapReferencePayload: wrapReferencePayload2
        },
        templateNormalizer: { ensureTemplateUid: ensureTemplateUid2, snapshotTemplateStructure: snapshotTemplateStructure2, structuresEqual: structuresEqual2, hasTemplateStructureChanged: hasTemplateStructureChanged2, captureCurrentStructureSnapshot: captureCurrentStructureSnapshot2, normalizeContent: normalizeContent2, normalizeParamIndexStructure: normalizeParamIndexStructure2, normalizeTemplateParameterIndexes: normalizeTemplateParameterIndexes2, populateMissingIndexFields: populateMissingIndexFields2 },
        workspaceStorage: workspaceStorageModule,
        indexEnumValidation: { findTemplateByName: findTemplateByName2, doesTemplateHaveField, getInstanceFieldValue, doesTemplateContainValue, evaluateInstanceIndexValidation: evaluateInstanceIndexValidation2, collectInstanceIndexInvalidReasons: collectInstanceIndexInvalidReasons2, doesTemplateHaveInvalidIndexReferences: doesTemplateHaveInvalidIndexReferences2, resolveIndexFieldMeta: resolveIndexFieldMeta2, formatIndexCell: formatIndexCell2, parseIndexTypeCell: parseIndexTypeCell2, parseIndexDataCell: parseIndexDataCell2, computeExpectedIndexValue: computeExpectedIndexValue2, enforceEnumIndexField: enforceEnumIndexField2, collectDuplicateIdInfo: collectDuplicateIdInfo2, getNumericInstanceId: getNumericInstanceId2, collectDuplicateIndexInfo: collectDuplicateIndexInfo2, chooseDuplicateNavigationTarget: chooseDuplicateNavigationTarget2, jumpToDuplicateIndexInstance, enforceImportedIndexField, isEnumTemplate: isEnumTemplate2, ensureEnumParamNaming: ensureEnumParamNaming2, getEnumParamKeysForInstance: getEnumParamKeysForInstance2, getEnumTemplate: getEnumTemplate2, getEnumDefinitions: getEnumDefinitions2, getEnumDefinition: getEnumDefinition2, isEnumType: isEnumType2, getEnumValues: getEnumValues2, getEnumCSharpTypeName: getEnumCSharpTypeName2, sanitizeCSharpTypeName: sanitizeCSharpTypeName2, sanitizeCSharpMemberName: sanitizeCSharpMemberName2, getBuiltinParamTypeOptionsForCurrentMode, rebuildListElementTypeCollections, refreshListElementTypeSelect, refreshParamTypeOptions, updateParamTypeSelectEnabledState, applyIndexDisabledState },
        sheetMode: sheetModeModule,
        csvService: csvServiceModule,
        systemPanels: systemPanelsModule,
        templatePersistence: templatePersistenceModule,
        csharpRuntimeGenerator: csharpRuntimeGeneratorModule,
        ueGenerator: ueGeneratorModule,
        editorActions: { newTemplate, renameTemplate, newInstance, renameInstance, commitInstanceIdChange, copyInstance, pasteInstance, deleteInstance, newParam, updateParamAtIndex, convertValueForType: convertValueForType2, deleteParam, getDefaultValueForType: getDefaultValueForType2, getDefaultValueForElementType: getDefaultValueForElementType2, convertValueToList: convertValueToList2, coerceListElementValue: coerceListElementValue2, isListElementValueValid: isListElementValueValid2, validateListValueAgainstType: validateListValueAgainstType2, collectListTypeViolations: collectListTypeViolations2 },
        panels: panelsModule,
        interaction: interactionModule
      }
    };
    window.AppModules = window.LegacyApp ? window.LegacyApp.modules : null;
    window.AppState = window.LegacyApp ? window.LegacyApp.state : null;
  })();
})();
