export function ensureTemplateUid(tpl, uidState, prefix = 'tpl_') {
  if (!tpl) return null;
  if (!uidState || typeof uidState !== 'object') {
    throw new Error('uidState is required');
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

export function snapshotTemplateStructure(tpl, { isEnumTemplate = () => false } = {}) {
  return {
    name: tpl.name,
    indexField: tpl.indexField || 'id',
    parameters: (tpl.parameters || []).map((param) => {
      if (!param) return null;
      return {
        name: param.name,
        type: param.type,
        parameterIndexes: param.parameterIndexes
          ? {
              template: param.parameterIndexes.template || '',
              param: param.parameterIndexes.param || '',
              indexField: param.parameterIndexes.indexField || '',
            }
          : null,
      };
    }),
    isEnum: Boolean(isEnumTemplate(tpl)),
  };
}

export function structuresEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function hasTemplateStructureChanged(
  tpl,
  {
    lastSavedStructureSnapshot = new Map(),
    ensureTemplateUid: ensureTemplateUidFn = ensureTemplateUid,
    snapshotTemplateStructure: snapshotTemplateStructureFn = snapshotTemplateStructure,
  } = {},
) {
  ensureTemplateUidFn(tpl);
  const prev = lastSavedStructureSnapshot.get(tpl.__uid);
  if (!prev) return true;
  const current = snapshotTemplateStructureFn(tpl);
  return !structuresEqual(prev, current);
}

export function captureCurrentStructureSnapshot(
  templates,
  {
    ensureTemplateUid: ensureTemplateUidFn = ensureTemplateUid,
    snapshotTemplateStructure: snapshotTemplateStructureFn = snapshotTemplateStructure,
  } = {},
) {
  const snapshot = new Map();
  const templateList = Array.isArray(templates) ? templates : [];
  templateList.forEach((tpl) => {
    ensureTemplateUidFn(tpl);
    snapshot.set(tpl.__uid, snapshotTemplateStructureFn(tpl));
  });
  return snapshot;
}

export function normalizeContent(content) {
  return (content || '').replace(/\r\n/g, '\n').trimEnd();
}

export function normalizeParamIndexStructure(param) {
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

export function normalizeTemplateParameterIndexes(
  template,
  { ensureParamElementType: ensureParamElementTypeFn = null } = {},
) {
  if (!template || !Array.isArray(template.parameters)) return;
  template.parameters.forEach((param) => {
    normalizeParamIndexStructure(param);
    if (typeof ensureParamElementTypeFn === 'function') {
      ensureParamElementTypeFn(param);
    }
  });
}

export function populateMissingIndexFields(templatesList) {
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
