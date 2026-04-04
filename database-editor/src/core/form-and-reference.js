const NUMERIC_NAME_PATTERN = /^\d+$/;
const UE_NAME_PATTERN = /^[A-Za-z0-9_]+$/;

export function isPureNumericName(name) {
  return NUMERIC_NAME_PATTERN.test(String(name || '').trim());
}

export function isUENameCompliant(name) {
  if (name == null) return false;
  return UE_NAME_PATTERN.test(String(name).trim());
}

export function isTemplateNameInvalid(name, { isUEMode = false } = {}) {
  if (isPureNumericName(name)) return true;
  if (isUEMode && !isUENameCompliant(name)) return true;
  return false;
}

export function isEnumValueInvalid(value, { isUEMode = false } = {}) {
  if (isPureNumericName(value)) return true;
  if (isUEMode && !isUENameCompliant(value)) return true;
  return false;
}

export function getValidListElementType(value, allowedTypes = null) {
  if (!value && value !== 0) return 'string';
  const normalized = String(value).trim();
  if (!normalized) return 'string';
  if (allowedTypes instanceof Set && allowedTypes.size > 0 && allowedTypes.has(normalized)) {
    return normalized;
  }
  return normalized;
}

export function ensureParamElementType(param, allowedTypes = null) {
  if (!param) return;
  if (param.type === 'list') {
    param.elementType = getValidListElementType(param.elementType, allowedTypes);
  } else if (param.elementType) {
    delete param.elementType;
  }
}

export function getListElementTypeForParam(param, allowedTypes = null) {
  if (!param || param.type !== 'list') return 'string';
  return getValidListElementType(param.elementType, allowedTypes);
}

export function createDefaultReferenceValue(binding) {
  if (!binding) {
    return { template: '', by: '', value: '' };
  }
  return {
    template: binding.template || '',
    by: binding.param || '',
    value: '',
  };
}

export function normalizeReferenceValue(raw, binding) {
  if (!binding) return raw;
  const template = binding.template || '';
  const by = binding.param || '';
  const source = Array.isArray(raw) ? (raw.length > 0 ? raw[0] : null) : raw;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return {
      template,
      by,
      value: source == null ? '' : String(source),
    };
  }
  return {
    template,
    by,
    value: source.value == null ? '' : String(source.value),
  };
}

export function normalizeReferenceList(raw, binding) {
  const arrayValue = Array.isArray(raw) ? raw : (raw == null ? [] : [raw]);
  const normalized = arrayValue.map((item) => normalizeReferenceValue(item, binding));
  return normalized.length > 0 ? normalized : [createDefaultReferenceValue(binding)];
}

export function unwrapReferencePayload(value, binding, asList) {
  if (!binding) return value;
  if (asList) {
    const normalized = normalizeReferenceList(value, binding);
    return normalized.map((entry) => (entry && typeof entry === 'object' ? entry.value : ''));
  }
  const normalized = normalizeReferenceValue(value, binding);
  if (normalized && typeof normalized === 'object') {
    return normalized.value;
  }
  return normalized;
}

export function wrapReferencePayload(
  value,
  binding,
  asList,
  elementType = 'string',
  { convertValueToList = null } = {},
) {
  if (!binding) return value;
  const template = binding.template || '';
  const by = binding.param || '';
  if (asList) {
    let list = [];
    if (Array.isArray(value) && value.every((item) => item && typeof item === 'object' && !Array.isArray(item))) {
      list = value.map((item) => normalizeReferenceValue(item, binding));
    } else {
      const base = typeof convertValueToList === 'function'
        ? convertValueToList(value, elementType)
        : Array.isArray(value)
          ? value.slice()
          : value == null || value === ''
            ? []
            : [value];
      list = base.map((item) => ({
        template,
        by,
        value: item == null ? '' : String(item),
      }));
    }
    if (list.length === 0) {
      list = [createDefaultReferenceValue(binding)];
    }
    return list;
  }
  const normalized = normalizeReferenceValue(value, binding);
  if (normalized && typeof normalized === 'object' && !Array.isArray(normalized)) {
    return normalized;
  }
  const wrapped = createDefaultReferenceValue(binding);
  wrapped.value = normalized == null ? '' : String(normalized);
  return wrapped;
}
