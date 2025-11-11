// CSV import/export routines, save orchestration, and auxiliary UI refresh helpers.
        lastSelectedCategory = 'instance';
        e.stopPropagation();
      });
      instanceListEl.appendChild(li);
    });
    // 应用实例搜索过滤
    filterList(instanceListEl, searchInstancesInput.value);
    updateInstanceNameInputValidity();
  }

  /**
   * 刷新参数列表
   */
  function refreshParams() {
    paramListEl.innerHTML = "";
    updateParamTypeSelectEnabledState();
    updateParamNameInputEnabledState();
    refreshParamTypeOptions();
    updateIndexTemplateOptions();
    if (currentTemplateIndex < 0 || currentInstanceIndex < 0) {
      updateParamNameInputValidity();
      return;
    }
    const tpl = templates[currentTemplateIndex];
    const inst = tpl.instances[currentInstanceIndex];
    const isEnumTpl = isEnumTemplate(tpl);
    if (isEnumTpl) {
      enforceEnumIndexField(tpl);
    }
    // 保留字段
    const reserved = [
      { name: "template", type: "string" },
      { name: "id", type: "int" },
      { name: "name", type: "string" },
      { name: "index", type: "string" },
    ];
    reserved.forEach((f) => {
      const item = document.createElement("div");
      item.classList.add("param-item", "reserved");
      const label = document.createElement("label");
      label.textContent = f.name;
      item.appendChild(label);
      if (f.name === 'index') {
        const select = document.createElement('select');
        const candidates = isEnumTpl
          ? ['id']
          : ['id', 'name', ...tpl.parameters.map((p) => p.name).filter((n) => n !== 'index')];
        candidates.forEach((n) => {
          const opt = document.createElement('option');
          opt.value = n;
          opt.textContent = n;
          select.appendChild(opt);
        });
        select.value = tpl.indexField || 'id';
        if (isEnumTpl) {
          select.disabled = true;
          select.title = 'enum 模板的索引固定为 id';
        } else {
          select.addEventListener('change', () => {
            tpl.indexField = select.value || 'id';
            tpl.instances.forEach((one) => {
              const vv = getValueByFieldForInstance(tpl, one, tpl.indexField);
              if (!one.payload) one.payload = {};
              one.payload.index = vv == null ? '' : String(vv);
            });
            refreshInstances();
            refreshParams();
          });
        }
        const valueSpan = document.createElement('span');
        valueSpan.style.flex = '1';
        const vNow = getValueByFieldForInstance(tpl, inst, tpl.indexField || 'id');
        valueSpan.textContent = vNow == null ? '' : String(vNow);
        if (!inst.payload) inst.payload = {};
        inst.payload.index = valueSpan.textContent;
        item.appendChild(select);
        item.appendChild(valueSpan);
        item.addEventListener('mousedown', (evt) => {
          if (evt.button !== 0 || !evt.altKey) return;
          evt.preventDefault();
          evt.stopPropagation();
          jumpToDuplicateIndexInstance(tpl, inst);
        });
      } else {
        const span = document.createElement("span");
        span.textContent = inst.payload[f.name];
        span.style.flex = '1';
        item.appendChild(span);
      }
      paramListEl.appendChild(item);
    });
    // enum：参数与实例对应，使用实例自身的数字键渲染并返回
    if (isEnumTpl) {
      const keys = getEnumParamKeysForInstance(tpl, inst);
      keys.forEach((key, idx) => {
        const item = document.createElement('div');
        item.classList.add('param-item');
        const label = document.createElement('label');
        label.textContent = key;
        setInvalidNameVisual(label, false);
        item.appendChild(label);
        if (selectedParams.has(idx)) item.classList.add('active');
        const inputEl = document.createElement('input');
        inputEl.type = 'text';
        inputEl.style.flex = '1';
        inputEl.value = inst.payload && inst.payload[key] != null ? String(inst.payload[key]) : '';
        const refreshValueValidity = () => {
          const raw = String(inputEl.value ?? '').trim();
          const numeric = isPureNumericName(raw);
          setInvalidNameVisual(inputEl, numeric);
          if (numeric) {
            inputEl.title = '枚举值不能为纯数字';
          } else {
            inputEl.removeAttribute('title');
          }
        };
        // 防止点击输入框触发父级选择逻辑，打断编辑
        inputEl.addEventListener('mousedown', (e) => e.stopPropagation());
        inputEl.addEventListener('click', (e) => e.stopPropagation());
        inputEl.addEventListener('keydown', (e) => e.stopPropagation());
        inputEl.addEventListener('change', () => {
          if (!inst.payload) inst.payload = {};
          inst.payload[key] = inputEl.value;
          refreshValueValidity();
        });
        inputEl.addEventListener('input', refreshValueValidity);
        refreshValueValidity();
        item.appendChild(inputEl);
        const del = document.createElement('button');
        del.className = 'delete-param';
        del.textContent = '删除';
        del.addEventListener('click', (e) => { e.stopPropagation(); deleteParam(idx); });
        item.appendChild(del);
        item.addEventListener('click', (e) => {
          if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON')) return;
          if (e.ctrlKey) {
            if (selectedParams.has(idx)) selectedParams.delete(idx); else selectedParams.add(idx);
            const arr = Array.from(selectedParams).sort((a, b) => a - b);
            editingParamIndex = arr.length > 0 ? arr[arr.length - 1] : -1;
          } else if (e.shiftKey) {
            if (anchorParam === null) anchorParam = editingParamIndex >= 0 ? editingParamIndex : idx;
            const start = Math.min(anchorParam, idx);
            const end = Math.max(anchorParam, idx);
            selectedParams.clear();
            for (let i = start; i <= end; i++) selectedParams.add(i);
            editingParamIndex = idx;
            anchorParam = idx;
          } else {
            if (selectedParams.has(idx) && selectedParams.size === 1) {
              selectedParams.clear();
              editingParamIndex = -1;
              anchorParam = null;
            } else {
              selectedParams.clear();
              selectedParams.add(idx);
              editingParamIndex = idx;
              anchorParam = idx;
            }
          }
          refreshParams();
          lastSelectedCategory = 'param';
        });
        paramListEl.appendChild(item);
      });
      // 过滤（仅文本值可被过滤）
      filterList(paramListEl, searchParamsInput.value, true);
      updateParamNameInputValidity();
      return;
    }
    // 自定义参数
    tpl.parameters.forEach((p, idx) => {
      const item = document.createElement("div");
      item.classList.add("param-item");
      const label = document.createElement('label');
      label.textContent = p.name;
      setInvalidNameVisual(label, isPureNumericName(p.name));
      item.appendChild(label);
      if (selectedParams.has(idx)) item.classList.add('active');
      if (p.parameterIndexes) {
        const info = document.createElement('span');
        const idxField = p.parameterIndexes.indexField ? ` (${p.parameterIndexes.indexField})` : '';
        info.textContent = `索引：${p.parameterIndexes.template} → ${p.parameterIndexes.param}${idxField}`;
        info.style.marginRight = '8px';
        item.appendChild(info);

        // 为索引参数提供可编辑的 value 输入框（并规范化存储结构）
        let refObj = inst.payload[p.name];
        if (refObj == null) {
          refObj = { template: p.parameterIndexes.template, by: p.parameterIndexes.param, value: '' };
          inst.payload[p.name] = refObj;
        } else if (typeof refObj !== 'object') {
          refObj = { template: p.parameterIndexes.template, by: p.parameterIndexes.param, value: String(refObj) };
          inst.payload[p.name] = refObj;
        } else {
          refObj.template = p.parameterIndexes.template;
          refObj.by = p.parameterIndexes.param;
          if (refObj.value == null) refObj.value = '';
        }

        // datalist 建议（来自目标模板对应字段的值）
        const suggestId = `idx-suggest-${p.name}`;
        const dataList = document.createElement('datalist');
        dataList.id = suggestId;
        const targetTpl = templates.find(t => t.name === p.parameterIndexes.template);
        if (targetTpl && !isEnumTemplate(targetTpl)) {
          const seen = new Set();
          targetTpl.instances.forEach(it => {
            const v = it.payload ? it.payload[p.parameterIndexes.param] : undefined;
            const sv = v == null ? '' : String(v);
            if (sv && !seen.has(sv)) {
              seen.add(sv);
              const opt = document.createElement('option');
              opt.value = sv;
              dataList.appendChild(opt);
            }
          });
        }
        item.appendChild(dataList);

        const inputElIdx = document.createElement('input');
        inputElIdx.type = 'text';
        inputElIdx.style.flex = '1';
        inputElIdx.placeholder = '索引值';
        inputElIdx.setAttribute('list', suggestId);
        inputElIdx.value = refObj.value ?? '';
        inputElIdx.addEventListener('change', () => {
          let obj = inst.payload[p.name];
          if (!obj || typeof obj !== 'object') {
            obj = { template: p.parameterIndexes.template, by: p.parameterIndexes.param, value: '' };
            inst.payload[p.name] = obj;
          }
          // 若索引目标是 enum，阻止写入
          const tt = templates.find(t => t.name === p.parameterIndexes.template);
          if (tt && isEnumTemplate(tt)) {
            showMessage('索引目标不能是 enum 模板');
            indexTemplateSelect.value = '';
            updateIndexParamOptions();
            obj.template = '';
            obj.by = '';
          } else {
            obj.template = p.parameterIndexes.template;
            obj.by = p.parameterIndexes.param;
          }
          obj.value = inputElIdx.value;
        });
        item.appendChild(inputElIdx);
      } else {
        let inputEl;
        let value = inst.payload[p.name];
        if (isEnumType(p.type)) {
          const def = getEnumDefinition(p.type);
          const select = document.createElement('select');
          select.style.flex = '1';
          // 防止选择下拉时触发父级点击，导致取消选择或刷新
          select.addEventListener('mousedown', (e) => e.stopPropagation());
          select.addEventListener('click', (e) => e.stopPropagation());
          const enumValues = def ? def.values : [];
          value = convertValueForType(value, p.type);
          if (inst.payload[p.name] !== value) {
            inst.payload[p.name] = value;
          }
          if (enumValues && enumValues.length > 0) {
            enumValues.forEach((val) => {
              const opt = document.createElement('option');
              opt.value = val;
              opt.textContent = val;
              select.appendChild(opt);
            });
          }
          if (value && (!enumValues || !enumValues.includes(value))) {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = value;
            select.appendChild(opt);
          }
          select.value = value ?? '';
          if (!enumValues || enumValues.length === 0) {
            select.disabled = true;
          }
          inputEl = select;
        } else {
          switch (p.type) {
            case 'string':
              inputEl = document.createElement('input');
              inputEl.type = 'text';
              inputEl.value = value ?? '';
              break;
            case 'int':
            case 'long':
            case 'float':
              inputEl = document.createElement('input');
              inputEl.type = 'number';
              inputEl.value = value ?? 0;
              break;
            case 'bool':
              inputEl = document.createElement('input');
              inputEl.type = 'checkbox';
              inputEl.checked = !!value;
              break;
            case 'list':
            // 列表类型：渲染为多个子输入 + 操作按钮
            let arr = Array.isArray(value) ? value.slice() : [];
            if (arr.length === 0) arr = [""];
            inst.payload[p.name] = arr;
            const listWrap = document.createElement('div');
            listWrap.style.display = 'flex';
            listWrap.style.flexDirection = 'column';
            listWrap.style.flex = '1';
            const renderList = () => {
              listWrap.innerHTML = '';
              arr.forEach((val, i) => {
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.gap = 'calc(4px * var(--row-scale))';
                row.style.marginBottom = 'calc(4px * var(--row-scale))';
                const inp = document.createElement('input');
                inp.type = 'text';
                inp.value = val ?? '';
                inp.style.flex = '1';
                inp.addEventListener('change', () => {
                  inst.payload[p.name][i] = inp.value;
                });
                row.appendChild(inp);
                listWrap.appendChild(row);
              });
            };
            renderList();
            item.appendChild(listWrap);
            const addBtn = document.createElement('button');
            addBtn.textContent = '增加元素';
            addBtn.classList.add('list-control-btn');
            addBtn.addEventListener('click', (e2) => {
              e2.stopPropagation();
              inst.payload[p.name].push('');
              arr = inst.payload[p.name];
              renderList();
            });
            const removeBtn = document.createElement('button');
            removeBtn.textContent = '删除元素';
            removeBtn.classList.add('list-control-btn');
            removeBtn.addEventListener('click', (e2) => {
              e2.stopPropagation();
              if (inst.payload[p.name].length > 1) {
                inst.payload[p.name].pop();
                arr = inst.payload[p.name];
                renderList();
              }
            });
            item.appendChild(addBtn);
            item.appendChild(removeBtn);
            // 跳过通用 inputEl 追加
            inputEl = null;
            break;
          case 'object':
            inputEl = document.createElement('input');
            inputEl.type = 'text';
            inputEl.value = value && typeof value === 'object' ? JSON.stringify(value) : '';
              break;
            default:
              inputEl = document.createElement('input');
              inputEl.type = 'text';
              inputEl.value = value ?? '';
          }
        }
        if (inputEl) {
          if (inputEl.tagName !== 'SELECT') {
            inputEl.style.flex = '1';
          }
          inputEl.addEventListener('change', () => updateParamValue(idx, inputEl));
          item.appendChild(inputEl);
        }
      }
      const del = document.createElement('button');
      del.className = 'delete-param';
      del.textContent = '删除';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteParam(idx);
      });
      item.appendChild(del);
      // 单击参数项选择/取消选择，或执行 Alt 跳转
        item.addEventListener('click', (e) => {
          // 点击输入/选择/删除不触发选择逻辑
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return;
        // Alt+点击：若为索引参数则跳转
        if (e.altKey && p.parameterIndexes) {
          // 将当前参数选择压栈
          pushParamHistory();
          const ref = inst.payload[p.name];
          const targetTplName = ref && typeof ref === 'object' ? (ref.template || p.parameterIndexes.template) : p.parameterIndexes.template;
          const byField = ref && typeof ref === 'object' ? (ref.by || p.parameterIndexes.param) : p.parameterIndexes.param;
          const byValue = ref && typeof ref === 'object' ? (ref.value ?? '') : '';
          // 禁止跳转到 enum 模板
          if (isEnumTemplate({ name: targetTplName })) {
            showMessage('索引目标不能是 enum 模板');
            return;
          }
          const tIdx = templates.findIndex(t => t.name === targetTplName);
          if (tIdx < 0) {
            showMessage('未找到目标模板');
            return;
          }
          currentTemplateIndex = tIdx;
          selectedTemplates.clear();
          selectedTemplates.add(tIdx);
          const t = templates[tIdx];
          let iIdx = -1;
          for (let i = 0; i < t.instances.length; i++) {
            const v = t.instances[i].payload ? t.instances[i].payload[byField] : undefined;
            if ((v !== undefined && v !== null) && String(v) === String(byValue)) { iIdx = i; break; }
          }
        if (iIdx < 0) {
          showMessage('未找到符合索引值的实例');
          // 仍然跳到模板，清空实例与参数
          currentInstanceIndex = -1;
          selectedInstances.clear();
          selectedParams.clear();
          editingParamIndex = -1;
        } else {
          currentInstanceIndex = iIdx;
          selectedInstances.clear();
          selectedInstances.add(iIdx);
          // 选中目标字段对应的参数（若存在）
          const pIdx = t.parameters.findIndex(pp => pp.name === byField);
          selectedParams.clear();
          if (pIdx >= 0) {
            selectedParams.add(pIdx);
            editingParamIndex = pIdx;
          } else {
            editingParamIndex = -1;
            showMessage('目标字段为系统字段或不存在，未选中参数');
          }
        }
        templateNameInput.value = templates[currentTemplateIndex]?.name || '';
        instanceNameInput.value = (currentTemplateIndex >= 0 && currentInstanceIndex >= 0) ? templates[currentTemplateIndex].instances[currentInstanceIndex].name : '';
        // 同步编辑区域，避免残留上一次的参数信息
        showSelectedParamDetails();
        refreshTemplates();
        refreshInstances();
        refreshParams();
        updateIndexTemplateOptions();
        lastSelectedCategory = 'param';
        e.stopPropagation();
        return;
      }
        if (e.ctrlKey) {
          // Ctrl+点击：切换该参数选中状态
          pushParamHistory();
          if (selectedParams.has(idx)) {
            selectedParams.delete(idx);
          } else {
            selectedParams.add(idx);
          }
          const arr = Array.from(selectedParams).sort((a,b)=>a-b);
          editingParamIndex = arr.length > 0 ? arr[arr.length - 1] : -1;
          anchorParam = editingParamIndex >= 0 ? editingParamIndex : null;
        } else if (e.shiftKey) {
          // 如果未设置锚点，则以当前正在编辑的参数或本次索引为锚点
          pushParamHistory();
          if (anchorParam === null) {
            if (editingParamIndex >= 0) {
              anchorParam = editingParamIndex;
            } else {
              anchorParam = idx;
            }
          }
          const start = Math.min(anchorParam, idx);
          const end = Math.max(anchorParam, idx);
          selectedParams.clear();
          for (let i = start; i <= end; i++) {
            selectedParams.add(i);
          }
          editingParamIndex = idx;
          anchorParam = idx;
        } else {
          // 普通点击前，记录当前参数到历史
          if (editingParamIndex !== idx) pushParamHistory();
          // 单击已选中的唯一参数 => 取消选中
          if (selectedParams.has(idx) && selectedParams.size === 1) {
            selectedParams.clear();
            editingParamIndex = -1;
            anchorParam = null;
          } else {
            selectedParams.clear();
            selectedParams.add(idx);
            editingParamIndex = idx;
            anchorParam = idx;
          }
        }
        showSelectedParamDetails();
        refreshParams();
        lastSelectedCategory = 'param';
        e.stopPropagation();
      });
      paramListEl.appendChild(item);
    });
    // 应用参数搜索过滤
    filterList(paramListEl, searchParamsInput.value, true);
    updateParamNameInputValidity();
  }

  /**
   * 更新参数值
   */
  function updateParamValue(paramIndex, inputEl) {
    if (currentTemplateIndex < 0 || currentInstanceIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    const inst = tpl.instances[currentInstanceIndex];
    const param = tpl.parameters[paramIndex];
    if (!inst.payload) inst.payload = {};
    switch (param.type) {
      case "string":
        inst.payload[param.name] = inputEl.value;
        break;
      case "int":
        inst.payload[param.name] = parseInt(inputEl.value) || 0;
        break;
      case "long":
        inst.payload[param.name] = parseInt(inputEl.value) || 0;
        break;
      case "float":
        inst.payload[param.name] = parseFloat(inputEl.value) || 0;
        break;
      case "bool":
        inst.payload[param.name] = inputEl.checked;
        break;
      case "list":
        // 不使用通用处理（列表已在专用 UI 内处理），这里保底支持逗号分隔
        inst.payload[param.name] = inputEl.value ? inputEl.value.split(/\s*,\s*/) : [""];
        break;
      case "object":
        try {
          inst.payload[param.name] = inputEl.value ? JSON.parse(inputEl.value) : {};
        } catch (err) {
          alert("对象格式需为合法 JSON");
        }
        break;
      default:
        inst.payload[param.name] = inputEl.value;
    }
    if (tpl.indexField === param.name) {
      const newIndexValue = computeExpectedIndexValue(tpl, inst, tpl.indexField);
      inst.payload.index = newIndexValue == null ? '' : String(newIndexValue);
      refreshInstances();
    }
  }

  /**
   * 根据当前选择的参数显示其信息到表单
   */
  function showSelectedParamDetails() {
    if (currentTemplateIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    updateParamTypeSelectEnabledState();
    updateIndexTemplateOptions();
    if (selectedParams.size === 0) {
      // 没有选中，重置输入
      paramNameInput.value = '';
      paramTypeSelect.value = 'string';
      updateParamNameInputValidity();
      if (!indexTemplateSelect.disabled) {
        indexTemplateSelect.value = '';
        updateIndexParamOptions();
      } else {
        indexParamSelect.value = '';
      }
      editingParamIndex = -1;
      $('newParam').textContent = '新建参数';
      return;
    }
    const idxs = Array.from(selectedParams);
    const idx = idxs[idxs.length - 1];
    const p = tpl.parameters[idx];
    if (!p) return;
    editingParamIndex = idx;
    paramNameInput.value = p.name;
    updateParamNameInputValidity();
    paramTypeSelect.value = p.type;
    if (isEnumTemplate(tpl)) {
      paramTypeSelect.value = 'string';
    }
    // 设置索引下拉
    if (!indexTemplateSelect.disabled) {
      if (p.parameterIndexes) {
        indexTemplateSelect.value = p.parameterIndexes.template;
        updateIndexParamOptions();
        indexParamSelect.value = p.parameterIndexes.param;
      } else {
        indexTemplateSelect.value = '';
        updateIndexParamOptions();
      }
    }
    $('newParam').textContent = '更新参数';
  }

  /**
   * 快捷键处理
   */
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
        // enum 使用实例局部粘贴
        if (currentTemplateIndex < 0 || currentInstanceIndex < 0) return;
        const inst = templates[currentTemplateIndex].instances[currentInstanceIndex];
        if (!inst.payload) inst.payload = {};
        (copyBuffer.items || []).forEach((obj) => {
          const exist = Object.keys(inst.payload).filter(k=>/^\d+$/.test(k)).map(k=>parseInt(k,10));
          let n = 0; while (exist.includes(n)) n++;
          inst.payload[String(n)] = obj && Object.prototype.hasOwnProperty.call(obj,'value') ? obj.value : '';
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

  /**
   * 复制模板
   */
  function copyTemplates() {
    if (templates.length === 0) return;
    let indices = Array.from(selectedTemplates);
    if (indices.length === 0 && currentTemplateIndex >= 0) indices = [currentTemplateIndex];
    if (indices.length === 0) {
      alert('请选择要复制的模板');
      return;
    }
    const items = indices.map((idx) => JSON.parse(JSON.stringify(templates[idx])));
    items.forEach((tpl) => {
      if (tpl && tpl.__uid) delete tpl.__uid;
    });
    copyBuffer = { type: 'template', items };
    showMessage(`已复制 ${items.length} 个模板`);
  }

  /**
   * 粘贴模板
   */
  function pasteTemplates() {
    if (!copyBuffer || copyBuffer.type !== 'template' || !copyBuffer.items) return;
    copyBuffer.items.forEach((srcTpl) => {
      let newName = srcTpl.name;
      // 处理重名
      while (templates.some((t) => t.name === newName)) {
        newName = `${newName}_复制`;
      }
      const newTpl = JSON.parse(JSON.stringify(srcTpl));
      newTpl.name = newName;
      delete newTpl.__uid;
      newTpl.__persistedName = null;
      newTpl.__pendingDeleteFileName = null;
      // 更新实例中的 template 字段和 id
      newTpl.instances.forEach((inst, idx) => {
        inst.id = idx;
        inst.name = `${inst.name}`;
        inst.payload.template = newName;
        inst.payload.id = idx;
        inst.payload.name = inst.name;
      });
      ensureTemplateUid(newTpl);
      templates.push(newTpl);
    });
    refreshTemplates();
    showMessage(`已粘贴 ${copyBuffer.items.length} 个模板`);
  }

  /**
   * 删除模板
   */
  function deleteTemplates() {
    if (templates.length === 0) return;
    if (currentEditMode === MODE_TABLE && !syncLuckysheetBackToTemplate()) {
      showMessage('请先修正表格格式错误后再删除模板');
      return;
    }
    let indices = Array.from(selectedTemplates);
    if (indices.length === 0 && currentTemplateIndex >= 0) indices = [currentTemplateIndex];
    if (indices.length === 0) {
      alert('请选择要删除的模板');
      return;
    }
    indices.sort((a, b) => b - a);
    indices.forEach((idx) => {
      const tpl = templates[idx];
      if (tpl) {
        ensureTemplateUid(tpl);
        tableModeInvalidTemplates.delete(tpl.__uid);
        tableModeValidationErrors.delete(tpl.__uid);
        const persisted = tpl.__persistedName || tpl.name;
        if (persisted) {
          pendingJsonRemovals.add(`${persisted}.json`);
          if (!isEnumTemplate(tpl)) {
            pendingCsRemovals.add(`${persisted}.cs`);
          }
        }
        if (tpl.__pendingDeleteFileName) {
          pendingJsonRemovals.add(tpl.__pendingDeleteFileName);
        }
      }
      templates.splice(idx, 1);
    });
    // 更新当前模板索引
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
    if (currentEditMode === MODE_TABLE) {
      if (templates.length === 0) {
        tableModeTemplateIndex = -1;
      } else {
        currentTemplateIndex = Math.max(0, Math.min(currentTemplateIndex, templates.length - 1));
        tableModeTemplateIndex = currentTemplateIndex;
      }
      renderTableModeView();
    }
    showMessage(`已删除 ${indices.length} 个模板`);
  }

  /**
   * 复制参数
   */
  function copyParams() {
    if (currentTemplateIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    let indices = Array.from(selectedParams);
    if (indices.length === 0) {
      alert('请选择要复制的参数');
      return;
    }
    if (isEnumTemplate(tpl)) {
      if (currentInstanceIndex < 0) { alert('请先选择一个实例'); return; }
      const inst = tpl.instances[currentInstanceIndex];
      const keys = getEnumParamKeysForInstance(tpl, inst);
      const items = indices.map((idx) => ({ value: inst.payload[keys[idx]] }));
      copyBuffer = { type: 'param', items, enumMode: true };
    } else {
      // 深拷贝参数定义，并保存每个参数在所有实例中的值
      const items = indices.map((idx) => {
        const param = JSON.parse(JSON.stringify(tpl.parameters[idx]));
        const values = tpl.instances.map((inst) => inst.payload[param.name]);
        return { param, values };
      });
      copyBuffer = { type: 'param', items };
    }
    showMessage(`已复制 ${items.length} 个参数`);
  }

  /**
   * 粘贴参数
   */
  function pasteParams() {
    if (currentTemplateIndex < 0) return;
    if (!copyBuffer || copyBuffer.type !== 'param' || !copyBuffer.items) return;
    const tpl = templates[currentTemplateIndex];
    copyBuffer.items.forEach((obj) => {
      let newName = isEnumTemplate(tpl) ? String(tpl.parameters.length) : obj.param.name;
      while (tpl.parameters.some((p) => p.name === newName)) {
        newName = `${newName}_复制`;
      }
      const newParam = JSON.parse(JSON.stringify(obj.param));
      newParam.name = newName;
      if (isEnumTemplate(tpl)) {
        newParam.type = 'string';
        delete newParam.parameterIndexes;
      }
      tpl.parameters.push(newParam);
      // 为每个实例复制值
      tpl.instances.forEach((inst, idx) => {
        inst.payload[newName] = obj.values[idx];
      });
    });
    if (isEnumTemplate(tpl)) {
      ensureEnumParamNaming(tpl);
    }
    refreshParams();
    showMessage(`已粘贴 ${copyBuffer.items.length} 个参数`);
  }

  /**
   * 删除参数
   */
  function deleteParams() {
    if (currentTemplateIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    let indices = Array.from(selectedParams);
    if (indices.length === 0) {
      alert('请选择要删除的参数');
      return;
    }
    indices.sort((a, b) => b - a);
    if (isEnumTemplate(tpl)) {
      if (currentInstanceIndex < 0) return;
      const inst = tpl.instances[currentInstanceIndex];
      const keys = Object.keys(inst.payload || {}).filter(k=>/^\d+$/.test(k)).map(k=>parseInt(k,10)).sort((a,b)=>a-b).map(n=>String(n));
      indices.forEach((idx) => {
        const key = keys[idx];
        if (key !== undefined && inst.payload) delete inst.payload[key];
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

  /**
   * 更新索引模板列表
   */
  function updateIndexTemplateOptions() {
    const currentTpl = currentTemplateIndex >= 0 ? templates[currentTemplateIndex] : null;
    const previousValue = indexTemplateSelect.value;
    indexTemplateSelect.innerHTML = "";
    if (currentTpl && isEnumTemplate(currentTpl)) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '枚举不支持索引';
      indexTemplateSelect.appendChild(opt);
      indexTemplateSelect.value = '';
      indexTemplateSelect.disabled = true;
      indexParamSelect.innerHTML = '';
      const optParam = document.createElement('option');
      optParam.value = '';
      optParam.textContent = '枚举不支持索引';
      indexParamSelect.appendChild(optParam);
      indexParamSelect.value = '';
      indexParamSelect.disabled = true;
      return;
    }

    indexTemplateSelect.disabled = false;
    indexParamSelect.disabled = false;

    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '无索引';
    indexTemplateSelect.appendChild(opt0);
    // 不允许选择 enum 模板作为索引目标
    templates.forEach((tpl) => {
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
   * 根据选中的索引模板更新参数列表
   */
  function updateIndexParamOptions() {
    if (indexTemplateSelect.disabled) {
      indexParamSelect.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '枚举不支持索引';
      indexParamSelect.appendChild(opt);
      indexParamSelect.value = '';
      indexParamSelect.disabled = true;
      return;
    }

    indexParamSelect.disabled = false;
    const tplName = indexTemplateSelect.value;
    indexParamSelect.innerHTML = "";
    if (!tplName) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "无索引";
      indexParamSelect.appendChild(opt);
      indexParamSelect.value = "";
      return;
    }
    const tpl = templates.find((t) => t.name === tplName);
    if (!tpl) return;
    if (isEnumTemplate(tpl)) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "不允许指向 enum";
      indexParamSelect.appendChild(opt);
      indexParamSelect.value = "";
      return;
    }
    const indexableParams = (tpl.parameters || []).filter((p) => p && INDEXABLE_PARAM_TYPES.has(p.type));
    if (indexableParams.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "无可用参数";
      indexParamSelect.appendChild(opt);
      indexParamSelect.value = "";
      indexParamSelect.disabled = true;
      return;
    }
    const optDef = document.createElement("option");
    optDef.value = "";
    optDef.textContent = "选择参数";
    indexParamSelect.appendChild(optDef);
    indexableParams.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.name;
      opt.textContent = p.name;
      indexParamSelect.appendChild(opt);
    });
  }

  async function deleteDataEntityFileIfExists(fileName) {
    if (!dataEntityHandle || typeof dataEntityHandle.removeEntry !== 'function') return;
    try {
      await dataEntityHandle.removeEntry(fileName);
    } catch (err) {
      if (err && err.name === 'NotFoundError') {
        return;
      }
      console.warn(`删除 ${fileName} 失败`, err);
    }
  }

  async function deleteCSharpFileIfExists(fileName) {
    if (!csharpHandle || typeof csharpHandle.removeEntry !== 'function') return;
    try {
      await csharpHandle.removeEntry(fileName);
    } catch (err) {
      if (err && err.name === 'NotFoundError') {
        return;
      }
      console.warn(`删除 ${fileName} 失败`, err);
    }
  }

  /**
   * 保存所有模板到文件
   */
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
