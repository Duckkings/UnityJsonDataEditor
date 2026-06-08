function ensureContext(context) {
  if (!context || typeof context !== 'object') {
    throw new Error('InteractionModule requires a context object');
  }
  if (!context.appState || typeof context.appState !== 'object') {
    throw new Error('InteractionModule requires appState');
  }
}

function resolveDomRefs(domRefs, domMap) {
  const resolved = { ...(domRefs || {}) };
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
    document,
  };

  return new Proxy(Object.create(null), {
    has() {
      return true;
    },
    get(_target, prop) {
      if (prop === Symbol.unscopables) return undefined;
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
    },
  });
}

const DOM_ID_MAP = {
  templateListEl: 'templateList',
  instanceListEl: 'instanceList',
  paramListEl: 'paramList',
  templateNameInput: 'templateName',
  instanceNameInput: 'instanceName',
};
const FACTORY_SOURCE = "with (scope) {\n  function handleCopy() {\n    if (lastSelectedCategory === 'param') {\n      copyParams();\n    } else if (lastSelectedCategory === 'instance') {\n      copyInstance();\n    } else if (lastSelectedCategory === 'template') {\n      copyTemplates();\n    }\n  }\n  function handlePaste() {\n    if (!copyBuffer) return;\n    if (copyBuffer.type === 'param') {\n      const tpl = templates[currentTemplateIndex];\n      if (tpl && isEnumTemplate(tpl)) {\n        // enum ʹ��ʵ���ֲ�ճ��\n        if (currentTemplateIndex < 0 || currentInstanceIndex < 0) return;\n        const inst = templates[currentTemplateIndex].instances[currentInstanceIndex];\n        if (!inst.payload) inst.payload = {};\n        (copyBuffer.items || []).forEach((obj) => {\n          const exist = Object.keys(inst.payload).filter(k=>/^\\d+$/.test(k)).map(k=>parseInt(k,10));\n          let n = 0; while (exist.includes(n)) n++;\n          inst.payload[String(n)] = obj && Object.prototype.hasOwnProperty.call(obj,'value') ? obj.value : '';\n        });\n        refreshParams();\n        showMessage(`��ճ�� ${copyBuffer.items.length} ������`);\n      } else {\n        pasteParams();\n      }\n    } else if (copyBuffer.type === 'instance') {\n      pasteInstance();\n    } else if (copyBuffer.type === 'template') {\n      pasteTemplates();\n    }\n  }\n  function handleDelete() {\n    if (lastSelectedCategory === 'param') {\n      deleteParams();\n    } else if (lastSelectedCategory === 'instance') {\n      deleteInstance();\n    } else if (lastSelectedCategory === 'template') {\n      deleteTemplates();\n    }\n  }\n\n  function copyTemplates() {\n    if (templates.length === 0) return;\n    let indices = Array.from(selectedTemplates);\n    if (indices.length === 0 && currentTemplateIndex >= 0) indices = [currentTemplateIndex];\n    if (indices.length === 0) {\n      alert('��ѡ��Ҫ���Ƶ�ģ��');\n      return;\n    }\n    const items = indices.map((idx) => JSON.parse(JSON.stringify(templates[idx])));\n    items.forEach((tpl) => {\n      if (tpl && tpl.__uid) delete tpl.__uid;\n    });\n    copyBuffer = { type: 'template', items };\n    showMessage(`�Ѹ��� ${items.length} ��ģ��`);\n  }\n\n  /**\n   * ճ��ģ��\n   */\n  function pasteTemplates() {\n    if (!copyBuffer || copyBuffer.type !== 'template' || !copyBuffer.items) return;\n    copyBuffer.items.forEach((srcTpl) => {\n      let newName = srcTpl.name;\n      // ��������\n      while (templates.some((t) => t.name === newName)) {\n        newName = `${newName}_����`;\n      }\n      const newTpl = JSON.parse(JSON.stringify(srcTpl));\n      newTpl.name = newName;\n      delete newTpl.__uid;\n      // ����ʵ���е� template �ֶκ� id\n      newTpl.instances.forEach((inst, idx) => {\n        inst.id = idx;\n        inst.name = `${inst.name}`;\n        inst.payload.template = newName;\n        inst.payload.id = idx;\n        inst.payload.name = inst.name;\n      });\n      ensureTemplateUid(newTpl);\n      newTpl.__fromDisk = false;\n      templates.push(newTpl);\n    });\n    refreshTemplates();\n    showMessage(`��ճ�� ${copyBuffer.items.length} ��ģ��`);\n  }\n\n  /**\n   * ɾ��ģ��\n   */\n  function deleteTemplates() {\n    if (templates.length === 0) return;\n    let indices = Array.from(selectedTemplates);\n    if (indices.length === 0 && currentTemplateIndex >= 0) indices = [currentTemplateIndex];\n    if (indices.length === 0) {\n      alert('��ѡ��Ҫɾ����ģ��');\n      return;\n    }\n    indices.sort((a, b) => b - a);\n    indices.forEach((idx) => {\n      const tpl = templates[idx];\n      if (tpl && tpl.__uid) {\n        lastSavedStructureSnapshot.delete(tpl.__uid);\n      }\n      if (tpl && tpl.__fromDisk) {\n        if (!templates.some((t, currentIdx) => currentIdx !== idx && t && t.name === tpl.name)) {\n          pendingTemplateDeletions.set(tpl.name, { name: tpl.name, deletedAt: Date.now() });\n        }\n      }\n      templates.splice(idx, 1);\n    });\n    // ���µ�ǰģ������\n    if (templates.length === 0) {\n      currentTemplateIndex = -1;\n      currentInstanceIndex = -1;\n    } else {\n      currentTemplateIndex = 0;\n      currentInstanceIndex = templates[0].instances.length > 0 ? 0 : -1;\n    }\n    selectedTemplates.clear();\n    selectedInstances.clear();\n    selectedParams.clear();\n    editingParamIndex = -1;\n    refreshTemplates();\n    refreshInstances();\n    refreshParams();\n    showMessage(`��ɾ�� ${indices.length} ��ģ��`);\n  }\n\n  /**\n   * ���Ʋ���\n   */\n  function copyParams() {\n    if (currentTemplateIndex < 0) return;\n    const tpl = templates[currentTemplateIndex];\n    let indices = Array.from(selectedParams);\n    if (indices.length === 0) {\n      alert('��ѡ��Ҫ���ƵĲ���');\n      return;\n    }\n    if (isEnumTemplate(tpl)) {\n      if (currentInstanceIndex < 0) { alert('����ѡ��һ��ʵ��'); return; }\n      const inst = tpl.instances[currentInstanceIndex];\n      const keys = getEnumParamKeysForInstance(tpl, inst);\n      const items = indices.map((idx) => ({ value: inst.payload[keys[idx]] }));\n      copyBuffer = { type: 'param', items, enumMode: true };\n    } else {\n      // ����������壬������ÿ������������ʵ���е�ֵ\n      const items = indices.map((idx) => {\n        const param = JSON.parse(JSON.stringify(tpl.parameters[idx]));\n        const values = tpl.instances.map((inst) => inst.payload[param.name]);\n        return { param, values };\n      });\n      copyBuffer = { type: 'param', items };\n    }\n    showMessage(`�Ѹ��� ${items.length} ������`);\n  }\n\n  /**\n   * ճ������\n   */\n  function pasteParams() {\n    if (currentTemplateIndex < 0) return;\n    if (!copyBuffer || copyBuffer.type !== 'param' || !copyBuffer.items) return;\n    const tpl = templates[currentTemplateIndex];\n    copyBuffer.items.forEach((obj) => {\n      let newName = isEnumTemplate(tpl) ? String(tpl.parameters.length) : obj.param.name;\n      while (tpl.parameters.some((p) => p.name === newName)) {\n        newName = `${newName}_����`;\n      }\n      const newParam = JSON.parse(JSON.stringify(obj.param));\n      newParam.name = newName;\n      if (isEnumTemplate(tpl)) {\n        newParam.type = 'string';\n        delete newParam.parameterIndexes;\n      }\n      tpl.parameters.push(newParam);\n      // Ϊÿ��ʵ������ֵ\n      tpl.instances.forEach((inst, idx) => {\n        inst.payload[newName] = obj.values[idx];\n      });\n    });\n    if (isEnumTemplate(tpl)) {\n      ensureEnumParamNaming(tpl);\n    }\n    refreshParams();\n    showMessage(`��ճ�� ${copyBuffer.items.length} ������`);\n  }\n\n  /**\n   * ɾ������\n   */\n  function deleteParams() {\n    if (currentTemplateIndex < 0) return;\n    const tpl = templates[currentTemplateIndex];\n    let indices = Array.from(selectedParams);\n    if (indices.length === 0) {\n      alert('��ѡ��Ҫɾ���Ĳ���');\n      return;\n    }\n    indices.sort((a, b) => b - a);\n    if (isEnumTemplate(tpl)) {\n      if (currentInstanceIndex < 0) return;\n      const inst = tpl.instances[currentInstanceIndex];\n      const keys = Object.keys(inst.payload || {}).filter(k=>/^\\d+$/.test(k)).map(k=>parseInt(k,10)).sort((a,b)=>a-b).map(n=>String(n));\n      indices.forEach((idx) => {\n        const key = keys[idx];\n        if (key !== undefined && inst.payload) delete inst.payload[key];\n      });\n    } else {\n      indices.forEach((idx) => {\n        const param = tpl.parameters[idx];\n        tpl.parameters.splice(idx, 1);\n        tpl.instances.forEach((inst) => {\n          delete inst.payload[param.name];\n        });\n      });\n    }\n    selectedParams.clear();\n    editingParamIndex = -1;\n    refreshParams();\n\n  const paramHistory = [];\n  function pushParamHistory() {\n    if (currentTemplateIndex < 0 || currentInstanceIndex < 0 || editingParamIndex < 0) return;\n    const tpl = templates[currentTemplateIndex];\n    const param = tpl.parameters[editingParamIndex];\n    if (!param) return;\n    const snapshot = {\n      templateName: tpl.name,\n      paramName: param.name,\n      instanceId: templates[currentTemplateIndex].instances[currentInstanceIndex]?.id ?? currentInstanceIndex,\n    };\n    // 若与栈顶相同则不重复压栈\n    const top = paramHistory[paramHistory.length - 1];\n    if (!top || top.templateName !== snapshot.templateName || top.paramName !== snapshot.paramName || top.instanceId !== snapshot.instanceId) {\n      paramHistory.push(snapshot);\n    }\n  }\n  function navigateToParamSnapshot(snap) {\n    if (!snap) return false;\n    const tIdx = templates.findIndex(t => t.name === snap.templateName);\n    if (tIdx < 0) return false;\n    currentTemplateIndex = tIdx;\n    selectedTemplates.clear();\n    selectedTemplates.add(tIdx);\n    const instIdx = templates[tIdx].instances.findIndex(i => (i.id === snap.instanceId));\n    currentInstanceIndex = instIdx >= 0 ? instIdx : (templates[tIdx].instances.length > 0 ? 0 : -1);\n    selectedInstances.clear();\n    if (currentInstanceIndex >= 0) selectedInstances.add(currentInstanceIndex);\n    const pIdx = templates[tIdx].parameters.findIndex(p => p.name === snap.paramName);\n    selectedParams.clear();\n    if (pIdx >= 0) {\n      selectedParams.add(pIdx);\n      editingParamIndex = pIdx;\n    } else {\n      editingParamIndex = -1;\n    }\n    templateNameInput.value = templates[currentTemplateIndex].name;\n    instanceNameInput.value = currentInstanceIndex >= 0 ? templates[currentTemplateIndex].instances[currentInstanceIndex].name : '';\n    // 确保编辑区域与所选参数同步（或清空）\n    showSelectedParamDetails();\n    refreshTemplates();\n    refreshInstances();\n    refreshParams();\n    updateIndexTemplateOptions();\n    lastSelectedCategory = 'param';\n    return true;\n  }\n\n  // 实例列表拖拽选择\n  // 通用拖拽多选逻辑，支持模板、实例、参数\n  function setupDragSelection(listEl, type) {\n    listEl.addEventListener('mousedown', (e) => {\n      if (!e.shiftKey) return;\n      const selector = type === 'param' ? '.param-item' : 'li';\n      const itemEl = e.target.closest(selector);\n      if (!itemEl) return;\n      const items = Array.from(listEl.querySelectorAll(selector));\n      const idx = items.indexOf(itemEl);\n      if (idx < 0) return;\n      dragSelect.isDragging = false; // 初始为非拖拽，仅当移动到其他项时才置为 true\n      dragSelect.type = type;\n      dragSelect.indices.clear();\n      dragSelect.startIndex = idx;\n    });\n    listEl.addEventListener('mouseover', (e) => {\n      if (dragSelect.type !== type) return;\n      // 仅在按住鼠标左键进行移动时才认为是拖拽\n      if ((e.buttons & 1) !== 1) return;\n      const selector = type === 'param' ? '.param-item' : 'li';\n      const items = Array.from(listEl.querySelectorAll(selector));\n      const itemEl = e.target.closest(selector);\n      if (!itemEl) return;\n      const idx = items.indexOf(itemEl);\n      if (idx < 0) return;\n      if (dragSelect.startIndex === undefined) dragSelect.startIndex = idx;\n      if (idx !== dragSelect.startIndex) {\n        dragSelect.isDragging = true;\n        dragSelect.indices.clear();\n        // 清除旧的 selecting 临时样式\n        listEl.querySelectorAll('.selecting').forEach((el) => el.classList.remove('selecting'));\n        const start = Math.min(dragSelect.startIndex, idx);\n        const end = Math.max(dragSelect.startIndex, idx);\n        for (let i = start; i <= end; i++) {\n          dragSelect.indices.add(i);\n          const el = items[i];\n          if (el) el.classList.add('selecting');\n        }\n      }\n    });\n  }\n\n\n  // 点击空白区域取消选中\n  function setupClearOnBlank(listEl, type) {\n    listEl.addEventListener('click', (e) => {\n      const itemSelector = type === 'param' ? '.param-item' : 'li';\n      if (!e.target.closest(itemSelector)) {\n        if (type === 'template') {\n          selectedTemplates.clear();\n          currentTemplateIndex = -1;\n          currentInstanceIndex = -1;\n          templateNameInput.value = '';\n          instanceNameInput.value = '';\n          selectedInstances.clear();\n          selectedParams.clear();\n          editingParamIndex = -1;\n          // 清除锚点\n          anchorTemplate = null;\n          anchorInstance = null;\n          anchorParam = null;\n          refreshTemplates();\n          refreshInstances();\n          refreshParams();\n        } else if (type === 'instance') {\n          selectedInstances.clear();\n          currentInstanceIndex = -1;\n          instanceNameInput.value = '';\n          selectedParams.clear();\n          editingParamIndex = -1;\n          // 清除实例和参数锚点\n          anchorInstance = null;\n          anchorParam = null;\n          refreshInstances();\n          refreshParams();\n        } else if (type === 'param') {\n          selectedParams.clear();\n          editingParamIndex = -1;\n          showSelectedParamDetails();\n          refreshParams();\n          // 清除参数锚点\n          anchorParam = null;\n        }\n        lastSelectedCategory = type;\n      }\n    });\n  }\n\n  }\n\n  function filterList(listEl, term, isParamList = false) {\n    const lower = term.trim().toLowerCase();\n    const items = listEl.children;\n    let visibleCount = 0;\n    let lastVisibleIndex = -1;\n    for (let i = 0; i < items.length; i++) {\n      const el = items[i];\n      let text;\n      if (isParamList) {\n        // 参数列表，标签在第一个 label 或 span\n        const label = el.querySelector('label');\n        text = label ? label.textContent : '';\n      } else {\n        text = el.textContent;\n      }\n      if (!lower || (text && text.toLowerCase().includes(lower))) {\n        el.style.display = '';\n        visibleCount++;\n        lastVisibleIndex = i;\n      } else {\n        el.style.display = 'none';\n      }\n    }\n    // 仅在存在搜索关键字时，且只有一个匹配项时自动选择\n    if (visibleCount === 1 && !isParamList && lower.length > 0) {\n      if (listEl === templateListEl) {\n        const li = listEl.children[lastVisibleIndex];\n        li.click();\n      } else if (listEl === instanceListEl) {\n        const li = listEl.children[lastVisibleIndex];\n        li.click();\n      }\n    }\n  }\n\nreturn { pushParamHistory, navigateToParamSnapshot, setupDragSelection, setupClearOnBlank, handleCopy, handlePaste, handleDelete, copyTemplates, pasteTemplates, deleteTemplates, copyParams, pasteParams, deleteParams, filterList };\n}";

export function createInteractionModule(context) {
  ensureContext(context);
  const extraLocals = (() => ({
    $: (id) => document.getElementById(id),
    dragSelect: context.appState.dragSelect || { isDragging: false, type: null, indices: new Set(), startIndex: undefined },
  }))();
  const scope = createLegacyScope(context, DOM_ID_MAP, extraLocals);
  const factory = new Function('scope', FACTORY_SOURCE);
  return factory(scope);
}

export function getInteractionModule(context) {
  return createInteractionModule(context);
}

export default createInteractionModule;
