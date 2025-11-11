// File system operations, manifest handling, and runtime artefact generation.
  /**
   * 从 dataEntity 读取所有模板文件
   */
  async function loadAllTemplates() {
    templates.length = 0;
    currentTemplateIndex = -1;
    currentInstanceIndex = -1;
    templateUidCounter = 0;
    lastSavedStructureSnapshot = new Map();
    tableModeInvalidTemplates.clear();
    tableModeValidationErrors.clear();
    pendingJsonRemovals.clear();
    pendingCsRemovals.clear();
    tableModeTemplateIndex = -1;
    let enumLoadedFromJson = false;
    for await (const entry of dataEntityHandle.values()) {
      if (entry.kind === "file" && entry.name.toLowerCase().endsWith(".json")) {
        if (entry.name.toLowerCase() === 'manifest.json') continue;
        try {
          const file = await entry.getFile();
          const text = await file.text();
          const obj = JSON.parse(text);
          if (obj && obj.name && Array.isArray(obj.parameters) && Array.isArray(obj.instances)) {
            const template = {
              name: obj.name,
              parameters: obj.parameters,
              instances: obj.instances,
              indexField: obj.indexField || 'id',
            };
            const persistedBaseName = (entry.name || '').replace(/\.json$/i, '');
            template.__persistedName = persistedBaseName || template.name;
            template.__pendingDeleteFileName = null;
            normalizeTemplateParameterIndexes(template);
            if (isEnumTemplate(template) && Array.isArray(template.parameters)) {
              template.parameters = template.parameters.map((param) => {
                if (!param) return param;
                return { ...param, type: 'string' };
              });
              // 确保参数名使用顺位，并同步实例
              ensureEnumParamNaming(template);
              enumLoadedFromJson = true;
            }
            ensureTemplateUid(template);
            templates.push(template);
          }
        } catch (err) {
          showMessage(`无法解析 ${entry.name}，已跳过`);
        }
      }
    }
    if (!enumLoadedFromJson) {
      const cachedEnum = await loadEnumTemplateCache();
      if (cachedEnum && isEnumTemplate(cachedEnum)) {
        ensureEnumParamNaming(cachedEnum);
        if (!Array.isArray(cachedEnum.parameters)) cachedEnum.parameters = [];
        if (!Array.isArray(cachedEnum.instances)) cachedEnum.instances = [];
        cachedEnum.__persistedName = null;
        cachedEnum.__pendingDeleteFileName = null;
        ensureTemplateUid(cachedEnum);
        templates.push(cachedEnum);
      }
    }
    // 按名称排序
    templates.sort((a, b) => a.name.localeCompare(b.name));
    populateMissingIndexFields(templates);
    if (templates.length > 0) {
      currentTemplateIndex = 0;
      currentInstanceIndex = templates[0].instances.length > 0 ? 0 : -1;
    }
    lastSavedStructureSnapshot = captureCurrentStructureSnapshot();
    if (currentEditMode === MODE_TABLE) {
      tableModeTemplateIndex = currentTemplateIndex;
      renderTableModeView();
    }
  }

  /**
   * 新建模板
   */
  function newTemplate() {
    if (currentEditMode === MODE_TABLE && !syncLuckysheetBackToTemplate()) {
      showMessage('请先修正表格格式错误后再新建模板');
      return;
    }
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
      alert("模板名称已存在");
      return;
    }
    const instance = {
      id: 0,
      name: "默认",
      payload: { template: name, id: 0, name: "默认", index: '0' },
    };
    const template = {
      name,
      parameters: [],
      instances: [instance],
      indexField: 'id',
    };
    template.__persistedName = null;
    template.__pendingDeleteFileName = null;
    ensureTemplateUid(template);
    templates.push(template);
    currentTemplateIndex = templates.length - 1;
    currentInstanceIndex = 0;
    refreshTemplates();
    updateIndexTemplateOptions();
    updateTemplateNameInputValidity();
    updateInstanceNameInputValidity();
    if (currentEditMode === MODE_TABLE) {
      tableModeTemplateIndex = currentTemplateIndex;
      loadTemplateIntoLuckysheet(template);
    }
    showMessage(`已创建新模板：${name}`);
  }

  /**
   * 重命名模板
   */
  function renameTemplate(newName) {
    if (currentTemplateIndex < 0) return;
    if (currentEditMode === MODE_TABLE && !syncLuckysheetBackToTemplate()) {
      showMessage('请先修正表格格式错误后再重命名模板');
      templateNameInput.value = templates[currentTemplateIndex].name;
      return;
    }
    const tpl = templates[currentTemplateIndex];
    if (!tpl) return;
    const targetName = (newName || "").trim();
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
    const persistedName = tpl.__persistedName || null;
    tpl.name = targetName;
    tpl.instances.forEach((inst) => {
      if (inst && inst.payload) {
        inst.payload.template = targetName;
      }
    });
    if (persistedName && persistedName !== targetName) {
      tpl.__pendingDeleteFileName = `${persistedName}.json`;
      pendingCsRemovals.add(`${persistedName}.cs`);
    } else if (persistedName && persistedName === targetName) {
      tpl.__pendingDeleteFileName = null;
    }
    templateNameInput.value = targetName;
    refreshTemplates();
    updateIndexTemplateOptions();
    updateTemplateNameInputValidity();
    showMessage(`已重命名模板：${targetName}`);
  }

  /**
   * 新建实例
   */
  function newInstance() {
    if (currentTemplateIndex < 0) {
      alert("请先选择一个模板");
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
    const nextId = tpl.instances.length > 0 ? Math.max(...tpl.instances.map((i) => i.id)) + 1 : 0;
    const inst = {
      id: nextId,
      name,
      payload: {},
    };
    // 默认值
    tpl.parameters.forEach((p) => {
      inst.payload[p.name] = getDefaultValueForType(p.type);
    });
    inst.payload.template = tpl.name;
    inst.payload.id = nextId;
    inst.payload.name = name;
    inst.payload.index = String(getValueByFieldForInstance(tpl, inst, tpl.indexField || 'id'));
    inst.payload.name = name;
    tpl.instances.push(inst);
    currentInstanceIndex = tpl.instances.length - 1;
    refreshInstances();
    refreshParams();
    updateInstanceNameInputValidity();
    showMessage(`已创建新实例：${name}`);
  }

  /**
   * 重命名实例
   */
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

  /**
   * 复制实例
   */
  function copyInstance() {
    // 使用新的选中集合，实现复制实例
    if (currentTemplateIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    let indices = Array.from(selectedInstances);
    if (indices.length === 0 && currentInstanceIndex >= 0) indices = [currentInstanceIndex];
    if (indices.length === 0) {
      alert("请选择要复制的实例");
      return;
    }
    copyBuffer = { type: 'instance', items: indices.map((idx) => JSON.parse(JSON.stringify(tpl.instances[idx]))) };
    showMessage(`已复制 ${copyBuffer.items.length} 个实例`);
  }

  /**
   * 粘贴实例
   */
  function pasteInstance() {
    if (currentTemplateIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    if (!copyBuffer || copyBuffer.type !== 'instance' || !copyBuffer.items || copyBuffer.items.length === 0) {
      alert("没有已复制的实例");
      return;
    }
    copyBuffer.items.forEach((srcInst) => {
      const nextId = tpl.instances.length > 0 ? Math.max(...tpl.instances.map((i) => i.id)) + 1 : 0;
      const newInst = JSON.parse(JSON.stringify(srcInst));
      newInst.id = nextId;
      newInst.name = `${srcInst.name}_复制`;
      newInst.payload = { ...srcInst.payload };
      newInst.payload.id = nextId;
      newInst.payload.name = newInst.name;
      newInst.payload.template = tpl.name;
      tpl.instances.push(newInst);
    });
    refreshInstances();
    refreshParams();
    showMessage(`已粘贴 ${copyBuffer.items.length} 个实例`);
  }

  /**
   * 删除实例
   */
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
    indices.forEach((idx) => {
      tpl.instances.splice(idx, 1);
    });
    // 重新赋予 id
    tpl.instances.forEach((inst, index) => {
      inst.id = index;
      inst.payload.id = index;
    });
    // 更新当前实例索引
    currentInstanceIndex = tpl.instances.length > 0 ? 0 : -1;
    selectedInstances.clear();
    refreshInstances();
    refreshParams();
    showMessage(`已删除 ${indices.length} 个实例`);
  }

  /**
   * 新建参数
   */
  function newParam() {
    if (currentTemplateIndex < 0) {
      alert("请先选择一个模板");
      return;
    }
    const name = paramNameInput.value.trim();
    if (!name && !isEnumTemplate(templates[currentTemplateIndex])) {
      showMessage("请输入参数名称");
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
    let indexObj = null;
    if (!indexTemplateSelect.disabled) {
      const idxTpl = indexTemplateSelect.value;
      const idxParam = indexParamSelect.value;
      if (idxTpl && idxParam) {
        const targetTpl = templates.find(t=>t.name===idxTpl);
        if (targetTpl && isEnumTemplate(targetTpl)) {
          alert('索引目标不能是 enum 模板');
          indexTemplateSelect.value = '';
          updateIndexParamOptions();
        } else if (targetTpl) {
          const targetParam = (targetTpl.parameters || []).find(p => p && p.name === idxParam);
          if (!targetParam || !INDEXABLE_PARAM_TYPES.has(targetParam.type)) {
            alert('索引字段类型必须是 int/long/float/string');
            indexParamSelect.value = '';
          } else {
            indexObj = {
              template: idxTpl,
              param: idxParam,
              indexField: targetTpl ? (targetTpl.indexField || 'id') : '',
            };
          }
        }
      }
    } else {
      indexTemplateSelect.value = '';
      indexParamSelect.value = '';
    }
    // 如果正在编辑参数
    if (editingParamIndex >= 0) {
      const currentTpl = templates[currentTemplateIndex];
      const effectiveName = isEnumTemplate(currentTpl) ? String(editingParamIndex) : name;
      if (!isEnumTemplate(currentTpl) && isPureNumericName(effectiveName)) {
        showMessage('参数名称不能为纯数字');
        return;
      }
      updateParamAtIndex(editingParamIndex, effectiveName, type, indexObj);
      editingParamIndex = -1;
      selectedParams.clear();
      refreshParams();
      showMessage(`已更新参数`);
      return;
    }
    // enum 模板：根据当前实例已有的参数键计算插入序号，并强制按顺位命名
    if (isEnumTemplate(tpl)) {
      if (currentInstanceIndex < 0) { alert('请先选择一个实例'); return; }
      const curInst = tpl.instances[currentInstanceIndex];
      if (!curInst.payload) curInst.payload = {};
      const keys = getEnumParamKeysForInstance(tpl, curInst).map(k=>parseInt(k,10));
      let n = 0; while (keys.includes(n)) n++;
      curInst.payload[String(n)] = '';
      refreshParams();
      showMessage(`已创建新参数`);
      return;
    }
    // 新建参数
    if (tpl.parameters.some((p) => p.name === name)) {
      showMessage("该参数已存在");
      return;
    }
    const param = { name, type, index: indexObj };
    tpl.parameters.push(param);
    tpl.instances.forEach((inst) => {
      if (indexObj) {
        inst.payload[name] = { template: indexObj.template, by: indexObj.param, value: '' };
      } else {
        inst.payload[name] = getDefaultValueForType(type);
      }
    });
    refreshParams();
    showMessage(`已创建新参数：${name}`);
  }

  /**
   * 更新参数
   */
  function updateParamAtIndex(index, newName, newType, newIndexObj) {
    if (currentTemplateIndex < 0 || index < 0) return;
    const tpl = templates[currentTemplateIndex];
    const param = tpl.parameters[index];
    if (!param) return;
    if (!isEnumTemplate(tpl) && isPureNumericName(newName)) {
      showMessage('参数名称不能为纯数字');
      return;
    }
    // 检查重名
    if (!isEnumTemplate(tpl) && tpl.parameters.some((p, i) => p.name === newName && i !== index)) {
      alert("参数名称已存在");
      return;
    }
    if (isEnumTemplate(tpl)) {
      newType = 'string';
      newName = String(index);
      newIndexObj = null;
    }
    // 索引目标不允许 enum
    if (newIndexObj && newIndexObj.template) {
      const targetTpl = templates.find(t=>t.name===newIndexObj.template);
      if (targetTpl && isEnumTemplate(targetTpl)) {
        alert('索引目标不能是 enum 模板');
        newIndexObj = null;
      } else if (targetTpl) {
        const targetParam = (targetTpl.parameters || []).find(p => p && p.name === newIndexObj.param);
        if (!targetParam || !INDEXABLE_PARAM_TYPES.has(targetParam.type)) {
          alert('索引字段类型必须是 int/long/float/string');
          newIndexObj = null;
        } else {
          newIndexObj.indexField = targetTpl.indexField || 'id';
        }
      }
    }
    const oldName = param.name;
    const oldType = param.type;
    // 更新定义
    param.name = newName;
    param.type = newType;
    const oldIndex = param.parameterIndexes;
    param.parameterIndexes = newIndexObj;
    // 对所有实例调整 payload
    tpl.instances.forEach((inst) => {
      // 如果重命名
      if (oldName !== newName) {
        inst.payload[newName] = inst.payload[oldName];
        delete inst.payload[oldName];
      }
      // 如果类型变化，尝试转换
      if (oldType !== newType) {
        const val = inst.payload[newName];
        inst.payload[newName] = convertValueForType(val, newType);
      }
      // 如果索引配置变化，规范化/还原值
      if (!oldIndex && newIndexObj) {
        // 变为索引：把原值包进引用对象
        const prev = inst.payload[newName];
        inst.payload[newName] = { template: newIndexObj.template, by: newIndexObj.param, value: prev == null ? '' : String(prev) };
      } else if (oldIndex && !newIndexObj) {
        // 取消索引：取引用对象中的 value 作为当前类型的值
        const ref = inst.payload[newName];
        const raw = ref && typeof ref === 'object' ? ref.value : ref;
        inst.payload[newName] = convertValueForType(raw, newType);
      } else if (oldIndex && newIndexObj) {
        // 索引存在但定义变化：同步 template/by 保留 value
        const ref = inst.payload[newName];
        if (!ref || typeof ref !== 'object') {
          inst.payload[newName] = { template: newIndexObj.template, by: newIndexObj.param, value: ref == null ? '' : String(ref) };
        } else {
          ref.template = newIndexObj.template;
          ref.by = newIndexObj.param;
        }
      }
    });
  }

  /**
   * 根据新类型转换现有值，简单处理
   */
  function convertValueForType(val, type) {
    if (isEnumType(type)) {
      const enums = getEnumValues(type);
      const str = val == null ? '' : String(val);
      if (enums && enums.includes(str)) return str;
      return (enums && enums.length > 0) ? enums[0] : '';
    }
    if (val === undefined || val === null) return getDefaultValueForType(type);
    switch (type) {
      case 'string':
        return String(val);
      case 'int':
        return parseInt(val) || 0;
      case 'long':
        return parseInt(val) || 0;
      case 'float':
        return parseFloat(val) || 0;
      case 'bool':
        return Boolean(val);
      case 'list':
        if (Array.isArray(val)) return val.map(v => (v == null ? '' : String(v)));
        return val ? String(val).split(/\s*,\s*/) : [];
      case 'object':
        try {
          return typeof val === 'object' ? val : JSON.parse(val);
        } catch {
          return {};
        }
      default:
        return val;
    }
  }

  /**
   * 删除参数
   */
  function deleteParam(index) {
    // 包装为多选删除，以保持一致
    if (currentTemplateIndex < 0) return;
    selectedParams.clear();
    selectedParams.add(index);
    deleteParams();
  }

  /**
   * 根据类型获取默认值
   */
  function getDefaultValueForType(type) {
    if (isEnumType(type)) {
      const enums = getEnumValues(type);
      return (enums && enums.length > 0) ? enums[0] : '';
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
        return [""];
      case "object":
        return {};
      default:
        return null;
    }
  }

  function isEnumTemplate(tpl) {
    return tpl && tpl.name === 'enum';
  }

  // enum 新规则：参数与实例对应，因此该函数改为空实现（兼容旧调用）
  function ensureEnumParamNaming(tpl) { return; }

  function getEnumParamKeysForInstance(tpl, inst) {
    if (!tpl || !inst || !inst.payload) return [];
    const reserved = new Set(['template','id','name','index']);
    return Object.keys(inst.payload)
      .filter(k => !reserved.has(k) && /^\d+$/.test(k))
      .map(k => parseInt(k, 10))
      .sort((a,b)=>a-b)
      .map(n => String(n));
  }

  function getEnumTemplate() {
    return templates.find((tpl) => isEnumTemplate(tpl));
  }

  function getEnumDefinitions() {
    const enumTpl = getEnumTemplate();
    if (!enumTpl || !Array.isArray(enumTpl.instances)) return [];
    const paramNames = Array.isArray(enumTpl.parameters)
      ? enumTpl.parameters.map((p) => p && p.name).filter((name) => typeof name === 'string' && name.length > 0)
      : [];
    const definitions = [];
    const usedTypeNames = new Set();
    enumTpl.instances.forEach((inst, idx) => {
      if (!inst) return;
      const displayName = (inst.name && inst.name.trim()) ? inst.name.trim() : `Enum${inst.id ?? idx}`;
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
      // 新规则：从该实例自身的数字键顺序提取枚举值
      Object.keys(payload)
        .filter(k => /^\d+$/.test(k))
        .map(k => parseInt(k,10))
        .sort((a,b)=>a-b)
        .map(n=>String(n))
        .forEach((k) => {
          const raw = payload[k];
          if (raw === undefined || raw === null) return;
          const str = String(raw).trim();
          if (!str || seen.has(str)) return;
          seen.add(str);
          values.push(str);
        });
      definitions.push({
        name: displayName,
        csharpName,
        values,
      });
    });
    return definitions;
  }

  function getEnumDefinition(type) {
    if (!type) return null;
    const defs = getEnumDefinitions();
    return defs.find((def) => def.name === type) || null;
  }

  function isEnumType(type) {
    return Boolean(getEnumDefinition(type));
  }

  function getEnumValues(type) {
    const def = getEnumDefinition(type);
    return def ? def.values.slice() : null;
  }

  function getEnumCSharpTypeName(type) {
    const def = getEnumDefinition(type);
    return def ? def.csharpName : type;
  }

  function sanitizeCSharpIdentifier(name, fallback, defaultName, toPascalCase) {
    const raw = name == null ? '' : String(name).trim();
    let candidate = '';
    if (toPascalCase) {
      candidate = raw
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
    }
    if (!candidate) {
      candidate = raw;
    }
    candidate = candidate || (fallback != null ? String(fallback) : '') || defaultName;
    candidate = candidate
      .normalize('NFKC')
      .replace(/[^\p{Letter}\p{Number}_]/gu, '_');
    if (!candidate) candidate = defaultName;
    if (/^[\p{Number}]/u.test(candidate)) {
      candidate = `_${candidate}`;
    }
    candidate = candidate.replace(/_+/g, '_');
    return candidate || defaultName;
  }

  function sanitizeCSharpTypeName(name, fallback) {
    return sanitizeCSharpIdentifier(name, fallback, 'EnumType', true);
  }

  function sanitizeCSharpMemberName(name, fallback) {
    return sanitizeCSharpIdentifier(name, fallback, 'Member', true);
  }

  function refreshParamTypeOptions() {
    if (!paramTypeSelect) return;
    const previousValue = paramTypeSelect.value;
    const enumDefs = getEnumDefinitions();
    const missingTypes = new Set();
    templates.forEach((tpl) => {
      if (!tpl || !Array.isArray(tpl.parameters)) return;
      tpl.parameters.forEach((p) => {
        if (!p || !p.type) return;
        if (builtinParamTypeSet.has(p.type)) return;
        if (enumDefs.some((def) => def.name === p.type)) return;
        missingTypes.add(p.type);
      });
    });
    paramTypeSelect.innerHTML = '';
    builtinParamTypeOptions.forEach((opt) => {
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
      Array.from(missingTypes).sort().forEach((typeName) => {
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
  }

  function updateParamTypeSelectEnabledState() {
    const tpl = templates[currentTemplateIndex];
    const shouldDisable = Boolean(tpl && isEnumTemplate(tpl));
    paramTypeSelect.disabled = shouldDisable;
    if (shouldDisable) {
      paramTypeSelect.value = 'string';
    }
  }

  // enum 模板下禁用参数名输入框（参数名由顺位自动生成）
  function updateParamNameInputEnabledState() {
    if (!paramNameInput) return;
    const tpl = templates[currentTemplateIndex];
    const shouldDisable = Boolean(tpl && isEnumTemplate(tpl));
    paramNameInput.disabled = shouldDisable;
    if (shouldDisable) {
      paramNameInput.placeholder = 'enum 自动命名（0,1,2,...)';
    } else {
      paramNameInput.placeholder = '';
    }
  }

  // 读取实例指定字段的值（支持保留字段和自定义字段）
  function getValueByFieldForInstance(tpl, inst, fieldName) {
    if (!inst || !inst.payload) return '';
    if (fieldName === 'template' || fieldName === 'id' || fieldName === 'name') return inst.payload[fieldName];
    return inst.payload[fieldName];
  }

  /**
   * 刷新模板列表
   */
  function refreshTemplates() {
    templateListEl.innerHTML = "";
    templates.forEach((tpl, idx) => {
      ensureTemplateUid(tpl);
      const li = document.createElement("li");
      li.setAttribute('draggable','true');
      li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(idx)); });
      li.addEventListener('dragover', (e) => { e.preventDefault(); });
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = parseInt(e.dataTransfer.getData('text/plain'));
        const to = idx;
        if (isNaN(from) || from === to) return;
        const it = templates.splice(from,1)[0];
        templates.splice(to,0,it);
        if (currentTemplateIndex === from) currentTemplateIndex = to;
        else if (from < currentTemplateIndex && to >= currentTemplateIndex) currentTemplateIndex--;
        else if (from > currentTemplateIndex && to <= currentTemplateIndex) currentTemplateIndex++;
        refreshTemplates();
      });
      // 设置选中状态
      if (selectedTemplates.has(idx)) li.classList.add('active');
      let exportState = 'none';
      if (exportSelectionMode) {
        exportState = getTemplateExportState(tpl);
        if (exportState === 'all') li.classList.add('export-all');
        if (exportState === 'partial') li.classList.add('export-partial');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = exportState === 'all';
        checkbox.indeterminate = exportState === 'partial';
        checkbox.addEventListener('click', (e) => {
          e.stopPropagation();
          handleTemplateExportCheckbox(idx, exportState, e);
        });
        li.appendChild(checkbox);
      }
      const nameSpan = document.createElement('span');
      nameSpan.textContent = tpl.name;
      const invalidTemplateName = isPureNumericName(tpl.name);
      const enumNumericIssue = hasEnumNumericIssues(tpl);
      setInvalidNameVisual(nameSpan, invalidTemplateName || enumNumericIssue);
      const tooltipParts = [];
      if (invalidTemplateName) {
        tooltipParts.push('模板名称不能为纯数字');
      }
      if (enumNumericIssue) {
        tooltipParts.push('枚举名称或成员不能为纯数字');
      }
      const structureError = tableModeInvalidTemplates.has(tpl.__uid);
      setElementClassState(nameSpan, 'invalid-structure', structureError);
      if (structureError) {
        const msg = tableModeValidationErrors.get(tpl.__uid) || '表格格式校验失败';
        tooltipParts.push(msg);
      }
      if (tooltipParts.length > 0) {
        nameSpan.title = tooltipParts.join('；');
      } else {
        nameSpan.removeAttribute('title');
      }
      li.appendChild(nameSpan);
      if (exportSelectionMode) {
        const counts = getTemplateExportCounts(tpl);
        const countSpan = document.createElement('span');
        countSpan.className = 'export-count';
        countSpan.textContent = `${counts.selected}/${counts.total}`;
        li.appendChild(countSpan);
      }
      if (currentEditMode === MODE_TABLE) {
        li.addEventListener('click', (e) => {
          e.stopPropagation();
          if (idx === currentTemplateIndex) {
            lastSelectedCategory = 'template';
            return;
          }
          if (!syncLuckysheetBackToTemplate()) {
            return;
          }
          selectedTemplates.clear();
          selectedTemplates.add(idx);
          currentTemplateIndex = idx;
          tableModeTemplateIndex = idx;
          templateNameInput.value = tpl.name;
          anchorTemplate = idx;
          currentInstanceIndex = tpl.instances.length > 0 ? 0 : -1;
          selectedInstances.clear();
          selectedParams.clear();
          editingParamIndex = -1;
          anchorInstance = null;
          anchorParam = null;
          renderTableModeView();
          refreshTemplates();
          refreshInstances();
          refreshParams();
          updateIndexTemplateOptions();
          lastSelectedCategory = 'template';
        });
      } else {
        li.addEventListener('click', (e) => {
          // Ctrl+点击：切换该项选中状态（不丢失已有选择）
          if (e.ctrlKey) {
            if (selectedTemplates.has(idx)) {
              selectedTemplates.delete(idx);
            } else {
              selectedTemplates.add(idx);
            }
            const arr = Array.from(selectedTemplates).sort((a,b)=>a-b);
            if (arr.length > 0) {
              currentTemplateIndex = arr[arr.length - 1];
              templateNameInput.value = templates[currentTemplateIndex].name;
              anchorTemplate = currentTemplateIndex;
            } else {
              currentTemplateIndex = -1;
              templateNameInput.value = '';
              instanceNameInput.value = '';
              anchorTemplate = null;
            }
          // Shift+点击范围选择
          } else if (e.shiftKey) {
            // 如果未设置锚点，则以当前选中模板或自身为锚点
            if (anchorTemplate === null) {
              anchorTemplate = currentTemplateIndex >= 0 ? currentTemplateIndex : idx;
            }
            const start = Math.min(anchorTemplate, idx);
            const end = Math.max(anchorTemplate, idx);
            selectedTemplates.clear();
            for (let i = start; i <= end; i++) {
              selectedTemplates.add(i);
            }
            currentTemplateIndex = idx;
            templateNameInput.value = tpl.name;
            // 更新锚点为当前
            anchorTemplate = idx;
          } else {
            // 单击已选中的唯一模板 => 取消选中
            if (selectedTemplates.has(idx) && selectedTemplates.size === 1) {
              selectedTemplates.clear();
              currentTemplateIndex = -1;
              currentInstanceIndex = -1;
              templateNameInput.value = '';
              instanceNameInput.value = '';
              selectedInstances.clear();
              selectedParams.clear();
              editingParamIndex = -1;
              // 清除锚点
              anchorTemplate = null;
              anchorInstance = null;
              anchorParam = null;
              refreshTemplates();
              refreshInstances();
              refreshParams();
              updateIndexTemplateOptions();
              lastSelectedCategory = 'template';
              e.stopPropagation();
              return;
            }
            // 单选
            selectedTemplates.clear();
            selectedTemplates.add(idx);
            currentTemplateIndex = idx;
            templateNameInput.value = tpl.name;
            // 更新锚点
            anchorTemplate = idx;
          }
          // 切换模板时，重置实例和参数选择
          currentInstanceIndex = currentTemplateIndex >= 0 && templates[currentTemplateIndex].instances.length > 0 ? 0 : -1;
          selectedInstances.clear();
          selectedParams.clear();
          editingParamIndex = -1;
          // 清除实例和参数锚点
          anchorInstance = null;
          anchorParam = null;
          refreshTemplates();
          refreshInstances();
          refreshParams();
          updateIndexTemplateOptions();
          lastSelectedCategory = 'template';
          e.stopPropagation();
        });
      }
      templateListEl.appendChild(li);
    });
    if (currentTemplateIndex >= 0) {
      templateNameInput.value = templates[currentTemplateIndex].name;
    } else {
      templateNameInput.value = "";
    }
    if (currentEditMode === MODE_TABLE) {
      tableModeTemplateIndex = currentTemplateIndex;
      renderTableModeView();
    }
    updateTemplateNameInputValidity();
    updateInstanceNameInputValidity();
    refreshInstances();
    refreshParams();
    // 应用模板搜索过滤
    filterList(templateListEl, searchTemplatesInput.value);
    if (tableModeActive) {
      renderTableModeTemplateList();
      if (!templates.length) {
        renderTableFromState({ templateIndex: -1, columns: [], rows: [] });
      }
    }
  }

  /**
   * 获取选中的实例索引
   */
  function getSelectedInstanceIndices() {
    return Array.from(selectedInstances).sort((a, b) => a - b);
  }

  /**
   * 刷新实例列表
   */
  function refreshInstances() {
    instanceListEl.innerHTML = "";
    if (currentTemplateIndex < 0) {
      lastDuplicateIndexInfo = null;
      return;
    }
    const tpl = templates[currentTemplateIndex];
    ensureTemplateUid(tpl);
    const duplicateInfo = collectDuplicateIndexInfo(tpl);
    lastDuplicateIndexInfo = { uid: tpl.__uid, info: duplicateInfo };
    const duplicatesByIndex = duplicateInfo.byIndex;
    const templateIdxForExport = currentTemplateIndex;
    tpl.instances.forEach((inst, idx) => {
      const li = document.createElement("li");
      li.setAttribute('draggable','true');
      li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(idx)); });
      li.addEventListener('dragover', (e) => { e.preventDefault(); });
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = parseInt(e.dataTransfer.getData('text/plain'));
        const to = idx;
        if (isNaN(from) || from === to) return;
        const it = tpl.instances.splice(from,1)[0];
        tpl.instances.splice(to,0,it);
        if (currentInstanceIndex === from) currentInstanceIndex = to;
        else if (from < currentInstanceIndex && to >= currentInstanceIndex) currentInstanceIndex--;
        else if (from > currentInstanceIndex && to <= currentInstanceIndex) currentInstanceIndex++;
        refreshInstances();
      });
      li.setAttribute('draggable','true');
      li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(idx)); });
      li.addEventListener('dragover', (e) => { e.preventDefault(); });
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = parseInt(e.dataTransfer.getData('text/plain'));
        const to = idx;
        if (isNaN(from) || from === to) return;
        const it = tpl.instances.splice(from,1)[0];
        tpl.instances.splice(to,0,it);
        if (currentInstanceIndex === from) currentInstanceIndex = to;
        else if (from < currentInstanceIndex && to >= currentInstanceIndex) currentInstanceIndex--;
        else if (from > currentInstanceIndex && to <= currentInstanceIndex) currentInstanceIndex++;
        refreshInstances();
      });
      // 设置索引重复状态与选中状态
      const duplicateEntry = duplicatesByIndex.get(idx);
      if (duplicateEntry) {
        li.classList.add('duplicate-index');
        const displayValue = duplicateEntry.value !== '' ? duplicateEntry.value : '（空）';
        li.title = `索引值重复：${displayValue}`;
      }
      if (selectedInstances.has(idx)) li.classList.add('active');
      let instanceExportSelected = false;
      if (exportSelectionMode) {
        instanceExportSelected = isInstanceSelectedForExport(tpl, inst);
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = instanceExportSelected;
        checkbox.addEventListener('click', (e) => {
          e.stopPropagation();
          handleInstanceExportCheckbox(templateIdxForExport, idx, instanceExportSelected, e);
        });
        li.appendChild(checkbox);
      }
      const nameSpan = document.createElement('span');
      nameSpan.textContent = `${inst.id}: ${inst.name}`;
      setInvalidNameVisual(nameSpan, isPureNumericName(inst.name));
      if (isPureNumericName(inst.name)) {
        nameSpan.title = '实例名称不能为纯数字';
      } else {
        nameSpan.removeAttribute('title');
      }
      li.appendChild(nameSpan);
      li.addEventListener('click', (e) => {
        if (e.ctrlKey) {
          // Ctrl+点击：切换该实例选中状态
          if (selectedInstances.has(idx)) {
            selectedInstances.delete(idx);
          } else {
            selectedInstances.add(idx);
          }
          const arr = Array.from(selectedInstances).sort((a,b)=>a-b);
          if (arr.length > 0) {
            currentInstanceIndex = arr[arr.length - 1];
          } else {
            currentInstanceIndex = -1;
          }
          // 更新实例锚点
          anchorInstance = currentInstanceIndex >= 0 ? currentInstanceIndex : null;
        } else if (e.shiftKey) {
          // 如果未设置实例锚点，则以当前实例索引为锚点
          if (anchorInstance === null) {
            anchorInstance = currentInstanceIndex >= 0 ? currentInstanceIndex : idx;
          }
          const start = Math.min(anchorInstance, idx);
          const end = Math.max(anchorInstance, idx);
          selectedInstances.clear();
          for (let i = start; i <= end; i++) {
            selectedInstances.add(i);
          }
          currentInstanceIndex = idx;
          // 更新实例锚点
          anchorInstance = idx;
        } else {
          // 单击已选中的唯一实例 => 取消选中
          if (selectedInstances.has(idx) && selectedInstances.size === 1) {
            selectedInstances.clear();
            currentInstanceIndex = -1;
            instanceNameInput.value = '';
            // 清除参数选择与锚点
            selectedParams.clear();
            editingParamIndex = -1;
            anchorParam = null;
            refreshInstances();
            refreshParams();
            lastSelectedCategory = 'instance';
            e.stopPropagation();
            return;
          }
          selectedInstances.clear();
          selectedInstances.add(idx);
          currentInstanceIndex = idx;
          // 更新实例锚点
          anchorInstance = idx;
        }
        instanceNameInput.value = (currentTemplateIndex >= 0 && currentInstanceIndex >= 0)
          ? templates[currentTemplateIndex].instances[currentInstanceIndex].name
          : '';
        updateInstanceNameInputValidity();
        // 切换实例时清除参数选择
        selectedParams.clear();
        editingParamIndex = -1;
        // 清除参数锚点
        anchorParam = null;
        refreshInstances();
        refreshParams();
