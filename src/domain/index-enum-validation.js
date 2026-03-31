const DEFAULT_RESERVED_INDEX_FIELDS = new Set(['template', 'id', 'name', 'index']);
const DEFAULT_INDEXABLE_PARAM_TYPES = new Set(['int', 'long', 'float', 'string']);

export function findTemplateByName(templates, name) {
  if (!name) return null;
  const templateList = Array.isArray(templates) ? templates : [];
  return templateList.find((tpl) => tpl && tpl.name === name) || null;
}

export function doesTemplateHaveField(tpl, fieldName, reservedIndexFields = DEFAULT_RESERVED_INDEX_FIELDS) {
  if (!tpl || !fieldName) return false;
  if (reservedIndexFields.has(fieldName)) return true;
  const params = Array.isArray(tpl.parameters) ? tpl.parameters : [];
  return params.some((param) => param && param.name === fieldName);
}

export function getInstanceFieldValue(inst, fieldName, fallbackTemplateName = '') {
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

export function doesTemplateContainValue(
  tpl,
  fieldName,
  value,
  { getInstanceFieldValue: getInstanceFieldValueFn = getInstanceFieldValue } = {},
) {
  if (!tpl || !fieldName) return false;
  const normalized = value == null ? '' : String(value).trim();
  if (normalized === '') return false;
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

export function isEnumTemplate(tpl) {
  return tpl && tpl.name === 'enum';
}

export function evaluateInstanceIndexValidation(
  tpl,
  inst,
  {
    templates = [],
    reservedIndexFields = DEFAULT_RESERVED_INDEX_FIELDS,
    indexableParamTypes = DEFAULT_INDEXABLE_PARAM_TYPES,
    isEnumTemplate: isEnumTemplateFn = isEnumTemplate,
  } = {},
) {
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
    const targetTpl = findTemplateByName(templates, targetTplName);
    let reason = '';

    if (!targetTplName) {
      reason = '索引模板未设置';
    } else if (!targetTpl) {
      reason = `索引模板“${targetTplName}”不存在`;
    } else if (isEnumTemplateFn(targetTpl)) {
      reason = '索引目标不能是 enum 模板';
    } else if (!targetParamName) {
      reason = '索引字段未设置';
    } else if (!doesTemplateHaveField(targetTpl, targetParamName, reservedIndexFields)) {
      reason = `模板“${targetTplName}”不存在字段“${targetParamName}”`;
    } else if (!reservedIndexFields.has(targetParamName)) {
      const targetParamDef = Array.isArray(targetTpl.parameters)
        ? targetTpl.parameters.find((item) => item && item.name === targetParamName)
        : null;
      if (targetParamDef && !indexableParamTypes.has(targetParamDef.type)) {
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

export function collectInstanceIndexInvalidReasons(tpl, options = {}) {
  const invalidMap = new Map();
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

export function doesTemplateHaveInvalidIndexReferences(tpl, options = {}) {
  if (!tpl || !Array.isArray(tpl.instances)) {
    return false;
  }
  return tpl.instances.some((inst) => evaluateInstanceIndexValidation(tpl, inst, options).hasInvalid);
}

export function resolveIndexFieldMeta(tpl, indexableParamTypes = DEFAULT_INDEXABLE_PARAM_TYPES) {
  let field = tpl && tpl.indexField ? tpl.indexField : 'id';
  if (field === 'id') {
    return { field: 'id', type: 'int' };
  }
  if (field === 'name') {
    return { field: 'name', type: 'string' };
  }
  const param = (tpl.parameters || []).find((item) => item && item.name === field);
  if (param && indexableParamTypes.has(param.type)) {
    return { field, type: param.type };
  }
  return { field: 'id', type: 'int' };
}

export function formatIndexCell(field, type, value) {
  const safeField = field || 'id';
  const safeType = type || (safeField === 'name' ? 'string' : 'int');
  const safeValue = value == null ? '' : String(value);
  return `${safeField}/${safeType}/${safeValue}`;
}

export function parseIndexTypeCell(cell) {
  const raw = String(cell ?? '').trim();
  if (!raw) {
    return { field: 'id', type: 'int' };
  }
  const parts = raw.split('/');
  const field = (parts[0] || '').trim() || 'id';
  const type = (parts[1] || '').trim() || (field === 'name' ? 'string' : 'int');
  return { field, type };
}

export function parseIndexDataCell(cell, fallbackField, fallbackType) {
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

export function computeExpectedIndexValue(tpl, inst, fieldName) {
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

export function enforceEnumIndexField(tpl, { isEnumTemplate: isEnumTemplateFn = isEnumTemplate } = {}) {
  if (!tpl || !isEnumTemplateFn(tpl)) return false;
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

export function collectDuplicateIdInfo(tpl) {
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

export function getNumericInstanceId(inst) {
  if (!inst) return Number.NaN;
  const raw = inst.id;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.NaN;
}

export function collectDuplicateIndexInfo(tpl) {
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

export function chooseDuplicateNavigationTarget(group, currentInst) {
  if (!Array.isArray(group) || group.length <= 1) return null;
  const currentEntry = group.find((entry) => entry.inst === currentInst);
  const others = group.filter((entry) => entry.inst !== currentInst);
  if (others.length === 0) return null;
  if (!currentEntry) {
    return others.slice().sort((left, right) => left.idx - right.idx)[0];
  }
  const currentId = currentEntry.id;
  const greater = others
    .filter((entry) => Number.isFinite(entry.id) && Number.isFinite(currentId) && entry.id > currentId)
    .sort((left, right) => left.id - right.id);
  if (greater.length > 0) {
    return greater[0];
  }
  const smaller = others
    .filter((entry) => Number.isFinite(entry.id) && Number.isFinite(currentId) && entry.id < currentId)
    .sort((left, right) => left.id - right.id);
  if (smaller.length > 0) {
    return smaller[0];
  }
  return others.slice().sort((left, right) => left.idx - right.idx)[0];
}

export function ensureEnumParamNaming() {
  return;
}

export function getEnumParamKeysForInstance(tpl, inst) {
  if (!tpl || !inst || !inst.payload) return [];
  const reserved = new Set(['template', 'id', 'name', 'index']);
  return Object.keys(inst.payload)
    .filter((key) => !reserved.has(key) && /^\d+$/.test(key))
    .map((key) => parseInt(key, 10))
    .sort((left, right) => left - right)
    .map((value) => String(value));
}

export function getEnumTemplate(templates) {
  return findTemplateByName(templates, 'enum');
}

export function sanitizeCSharpTypeName(name, fallback) {
  const base = (name || '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  let result = base || fallback || 'EnumType';
  result = result.replace(/[^A-Za-z0-9_]/g, '_');
  if (/^[0-9]/.test(result)) {
    result = `_${result}`;
  }
  return result || 'EnumType';
}

export function sanitizeCSharpMemberName(name, fallback) {
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

export function getEnumDefinitions(templates) {
  const enumTpl = getEnumTemplate(templates);
  if (!enumTpl || !Array.isArray(enumTpl.instances)) return [];
  const definitions = [];
  const usedTypeNames = new Set();
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
    const seen = new Set();
    const values = [];
    Object.keys(payload)
      .filter((key) => /^\d+$/.test(key))
      .map((key) => parseInt(key, 10))
      .sort((left, right) => left - right)
      .map((value) => String(value))
      .forEach((key) => {
        const raw = payload[key];
        if (raw === undefined || raw === null) return;
        const value = String(raw).trim();
        if (!value || seen.has(value)) return;
        seen.add(value);
        values.push(value);
      });
    definitions.push({
      name: displayName,
      csharpName,
      values,
    });
  });
  return definitions;
}

export function getEnumDefinition(templates, type) {
  if (!type) return null;
  const definitions = getEnumDefinitions(templates);
  return definitions.find((definition) => definition.name === type) || null;
}

export function isEnumType(templates, type) {
  return Boolean(getEnumDefinition(templates, type));
}

export function getEnumValues(templates, type) {
  const definition = getEnumDefinition(templates, type);
  return definition ? definition.values.slice() : null;
}

export function getEnumCSharpTypeName(templates, type) {
  const definition = getEnumDefinition(templates, type);
  return definition ? definition.csharpName : type;
}

export function buildListElementTypeCollections({
  builtinOptions = [],
  enumDefs = [],
  missingTypes = new Set(),
  usedElementTypes = new Set(),
} = {}) {
  const nextOptions = [];
  const valueSet = new Set();
  const appendOption = (value, label) => {
    if (!value && value !== 0) return;
    const normalized = String(value).trim();
    if (!normalized || normalized === 'list' || valueSet.has(normalized)) return;
    valueSet.add(normalized);
    nextOptions.push({ value: normalized, label });
  };

  builtinOptions.forEach((option) => {
    if (option.value === 'list') return;
    appendOption(option.value, option.label);
  });
  if (Array.isArray(enumDefs)) {
    enumDefs.forEach((definition) => appendOption(definition.name, definition.name));
  }
  if (missingTypes instanceof Set && missingTypes.size > 0) {
    Array.from(missingTypes)
      .sort()
      .forEach((typeName) => appendOption(typeName, `${typeName} (缺失)`));
  }
  if (usedElementTypes instanceof Set && usedElementTypes.size > 0) {
    Array.from(usedElementTypes)
      .sort()
      .forEach((typeName) => {
        if (!valueSet.has(typeName)) {
          appendOption(typeName, `${typeName} (存在数据)`);
        }
      });
  }
  if (nextOptions.length === 0) {
    nextOptions.push({ value: 'string', label: '字符串' });
    valueSet.add('string');
  }

  return { options: nextOptions, valueSet };
}
