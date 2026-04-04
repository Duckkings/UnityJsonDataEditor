export function getDefaultValueForElementType(
  elementType,
  { isEnumType = () => false, getEnumValues = () => null } = {},
) {
  if (isEnumType(elementType)) {
    const enums = getEnumValues(elementType);
    return enums && enums.length > 0 ? enums[0] : '';
  }
  switch (elementType) {
    case 'int':
    case 'long':
      return 0;
    case 'float':
      return 0;
    case 'bool':
      return false;
    case 'object':
      return {};
    case 'string':
    default:
      return '';
  }
}

export function getDefaultValueForType(
  type,
  elementType = 'string',
  {
    isEnumType = () => false,
    getEnumValues = () => null,
    getDefaultValueForElementType: getDefaultValueForElementTypeFn = getDefaultValueForElementType,
  } = {},
) {
  if (isEnumType(type)) {
    const enums = getEnumValues(type);
    return enums && enums.length > 0 ? enums[0] : '';
  }
  switch (type) {
    case 'string':
      return '';
    case 'int':
    case 'long':
    case 'float':
      return 0;
    case 'bool':
      return false;
    case 'list':
      return [getDefaultValueForElementTypeFn(elementType)];
    case 'object':
      return {};
    default:
      return null;
  }
}

export function coerceListElementValue(
  value,
  elementType,
  { isEnumType = () => false, getEnumValues = () => null } = {},
) {
  if (value === null || value === undefined) {
    return '';
  }
  if (elementType === 'string') {
    return String(value);
  }
  if (elementType === 'bool') {
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return value;
  }
  if (elementType === 'float') {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  if (elementType === 'int' || elementType === 'long') {
    if (typeof value === 'number' && Number.isInteger(value)) return value;
    const normalized = String(value).trim();
    if (/^-?\d+$/.test(normalized)) {
      const parsed = parseInt(normalized, 10);
      if (Number.isFinite(parsed)) return parsed;
    }
    return value;
  }
  if (elementType === 'object') {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch (_error) {
      return value;
    }
    return value;
  }
  if (isEnumType(elementType)) {
    const enums = getEnumValues(elementType) || [];
    const normalized = String(value);
    if (enums.includes(normalized)) return normalized;
    return enums.length > 0 ? enums[0] : normalized;
  }
  return value;
}

export function convertValueToList(
  value,
  elementType,
  { coerceListElementValue: coerceListElementValueFn = coerceListElementValue } = {},
) {
  let listValue;
  if (Array.isArray(value)) {
    listValue = value.slice();
  } else if (value == null || value === '') {
    listValue = [];
  } else if (typeof value === 'string') {
    listValue = value.split(/\s*,\s*/);
  } else {
    listValue = [value];
  }
  return listValue.map((item) => coerceListElementValueFn(item, elementType));
}

export function convertValueForType(
  value,
  type,
  elementType = 'string',
  {
    isEnumType = () => false,
    getEnumValues = () => null,
    getDefaultValueForType: getDefaultValueForTypeFn = getDefaultValueForType,
    convertValueToList: convertValueToListFn = convertValueToList,
  } = {},
) {
  if (isEnumType(type)) {
    const enums = getEnumValues(type);
    const normalized = value == null ? '' : String(value);
    if (enums && enums.includes(normalized)) return normalized;
    return enums && enums.length > 0 ? enums[0] : '';
  }
  if (value === undefined || value === null) return getDefaultValueForTypeFn(type, elementType);
  switch (type) {
    case 'string':
      return String(value);
    case 'int':
      return parseInt(value, 10) || 0;
    case 'long':
      return parseInt(value, 10) || 0;
    case 'float':
      return parseFloat(value) || 0;
    case 'bool':
      return Boolean(value);
    case 'list':
      return convertValueToListFn(value, elementType);
    case 'object':
      try {
        return typeof value === 'object' ? value : JSON.parse(value);
      } catch (_error) {
        return {};
      }
    default:
      return value;
  }
}

export function isListElementValueValid(
  value,
  elementType,
  { isEnumType = () => false, getEnumValues = () => null } = {},
) {
  if (value === null || value === undefined) return { valid: false, reason: '值为空' };
  if (isEnumType(elementType)) {
    const enums = getEnumValues(elementType) || [];
    const normalized = String(value);
    return { valid: enums.includes(normalized), reason: '必须为枚举' };
  }
  if (elementType === 'string') {
    return { valid: typeof value === 'string', reason: '必须为字符串' };
  }
  if (elementType === 'bool') {
    return { valid: typeof value === 'boolean', reason: '必须为布尔值' };
  }
  if (elementType === 'float') {
    return { valid: typeof value === 'number' && Number.isFinite(value), reason: '必须为数字' };
  }
  if (elementType === 'int' || elementType === 'long') {
    return { valid: typeof value === 'number' && Number.isInteger(value), reason: '必须为整数' };
  }
  if (elementType === 'object') {
    const ok = value && typeof value === 'object' && !Array.isArray(value);
    return { valid: ok, reason: '必须为对象' };
  }
  return { valid: true, reason: '' };
}

export function validateListValueAgainstType(
  value,
  elementType,
  param,
  {
    normalizeReferenceList = (currentValue) => currentValue,
    coerceListElementValue: coerceListElementValueFn = coerceListElementValue,
    isListElementValueValid: isListElementValueValidFn = isListElementValueValid,
  } = {},
) {
  if (!Array.isArray(value)) {
    return { valid: false, errors: [{ index: -1, reason: '值不是列表' }] };
  }
  const errors = [];
  if (param && param.parameterIndexes) {
    const normalized = normalizeReferenceList(value, param.parameterIndexes);
    normalized.forEach((entry, idx) => {
      const raw = entry && typeof entry === 'object' ? entry.value : entry;
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

export function collectListTypeViolations(
  tpl,
  {
    getListElementTypeForParam = () => 'string',
    validateListValueAgainstType: validateListValueAgainstTypeFn = validateListValueAgainstType,
  } = {},
) {
  const invalidInstances = new Map();
  const invalidParams = new Map();
  if (!tpl || !Array.isArray(tpl.parameters) || !Array.isArray(tpl.instances)) {
    return { invalidInstances, invalidParams };
  }
  tpl.parameters.forEach((param) => {
    if (!param || param.type !== 'list') return;
    const elementType = getListElementTypeForParam(param);
    const invalidForParam = new Map();
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
