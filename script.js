(() => {
  // 数据结构：模板列表
  const templates = [];
  let currentTemplateIndex = -1;
  let currentInstanceIndex = -1;
  let directoryHandle = null;
  let csharpHandle = null;
  let dataEntityHandle = null;
  // 剪贴板，用于复制粘贴不同类型的条目
  // { type: 'template' | 'instance' | 'param', items: Array<any>, extra?: any }
  let copyBuffer = null;

  // 选择集：模板、实例、参数
  const selectedTemplates = new Set();
  const selectedInstances = new Set();
  const selectedParams = new Set();
  // Shift-点击范围选择锚点
  let anchorTemplate = null;
  let anchorInstance = null;
  let anchorParam = null;
  // 最近操作的栏目类型，用于快捷键判断
  let lastSelectedCategory = null;
  // 当前正在编辑的参数索引，-1 表示新建
  let editingParamIndex = -1;

  // DOM 元素获取
  const $ = (id) => document.getElementById(id);
  const templateNameInput = $("templateName");
  const instanceNameInput = $("instanceName");
  const paramNameInput = $("paramName");
  const paramTypeSelect = $("paramType");
  const indexTemplateSelect = $("indexTemplate");
  const indexParamSelect = $("indexParam");
  const templateListEl = $("templateList");
  const instanceListEl = $("instanceList");
  const paramListEl = $("paramList");
  const currentDirLabel = $("currentDir");

  // 面板元素，用于点击空白处取消选中
  const templatePanelEl = document.querySelector('.templates');
  const instancePanelEl = document.querySelector('.instances');
  const paramPanelEl = document.querySelector('.parameters');

  const toggleDarkBtn = $("toggleDark");
  const paramWidthSlider = $("paramWidth");
  const paramWidthLabel = $("paramWidthLabel");
  const messageBox = $("message");

  // 行高调整滑块
  const rowHeightSlider = $("rowHeight");
  const rowHeightLabel = $("rowHeightLabel");

  // 列表搜索输入
  const searchTemplatesInput = $("searchTemplates");
  const searchInstancesInput = $("searchInstances");
  const searchParamsInput = $("searchParams");

  // 拖拽选择状态
  const dragSelect = {
    isDragging: false,
    type: null,
    indices: new Set(),
  };

  // 事件绑定
  $("chooseDir").addEventListener("click", chooseDirectory);
  $("saveBtn").addEventListener("click", saveAll);
  $("newTemplate").addEventListener("click", newTemplate);
  $("newInstance").addEventListener("click", newInstance);
  $("copyInstance").addEventListener("click", copyInstance);
  $("pasteInstance").addEventListener("click", pasteInstance);
  $("deleteInstance").addEventListener("click", deleteInstance);
  $("newParam").addEventListener("click", newParam);
  indexTemplateSelect.addEventListener("change", updateIndexParamOptions);

  // 夜间模式切换
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
  function setupDragSelection(listEl, type) {
    listEl.addEventListener('mousedown', (e) => {
      if (!e.shiftKey) return;
      const itemEl = e.target.closest(type === 'param' ? '.param-item' : 'li');
      if (itemEl) {
        dragSelect.isDragging = true;
        dragSelect.type = type;
        dragSelect.indices.clear();
        e.preventDefault();
      }
    });
    listEl.addEventListener('mouseover', (e) => {
      if (!dragSelect.isDragging || dragSelect.type !== type) return;
      const items = Array.from(listEl.querySelectorAll(type === 'param' ? '.param-item' : 'li'));
      const itemEl = e.target.closest(type === 'param' ? '.param-item' : 'li');
      if (itemEl) {
        const idx = items.indexOf(itemEl);
        if (idx >= 0 && !dragSelect.indices.has(idx)) {
          dragSelect.indices.add(idx);
          itemEl.classList.add('selecting');
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
      indices.forEach((idx) => {
        if (selectedTemplates.has(idx)) selectedTemplates.delete(idx);
        else selectedTemplates.add(idx);
      });
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
      indices.forEach((idx) => {
        if (selectedInstances.has(idx)) selectedInstances.delete(idx);
        else selectedInstances.add(idx);
      });
      if (indices.length > 0) {
        currentInstanceIndex = indices[indices.length - 1];
        instanceNameInput.value = templates[currentTemplateIndex].instances[currentInstanceIndex]?.name || '';
        selectedParams.clear();
      }
      refreshInstances();
      refreshParams();
      lastSelectedCategory = 'instance';
    } else if (type === 'param') {
      indices.forEach((idx) => {
        if (selectedParams.has(idx)) selectedParams.delete(idx);
        else selectedParams.add(idx);
      });
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
    dragSelect.indices.clear();
  });

  // 监听名称输入框，回车或者失焦时更新名称
  templateNameInput.addEventListener("blur", () => {
    renameTemplate(templateNameInput.value.trim());
  });
  instanceNameInput.addEventListener("blur", () => {
    renameInstance(instanceNameInput.value.trim());
  });

  // 初始化
  window.addEventListener("DOMContentLoaded", () => {
    refreshTemplates();
    updateIndexTemplateOptions();
  });

  // 点击空白区域取消选中
  function setupClearOnBlank(listEl, type) {
    listEl.addEventListener('click', (e) => {
      const itemSelector = type === 'param' ? '.param-item' : 'li';
      if (!e.target.closest(itemSelector)) {
        if (type === 'template') {
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
        } else if (type === 'instance') {
          selectedInstances.clear();
          currentInstanceIndex = -1;
          instanceNameInput.value = '';
          selectedParams.clear();
          editingParamIndex = -1;
          // 清除实例和参数锚点
          anchorInstance = null;
          anchorParam = null;
          refreshInstances();
          refreshParams();
        } else if (type === 'param') {
          selectedParams.clear();
          editingParamIndex = -1;
          showSelectedParamDetails();
          refreshParams();
          // 清除参数锚点
          anchorParam = null;
        }
        lastSelectedCategory = type;
      }
    });
  }
  setupClearOnBlank(templateListEl, 'template');
  setupClearOnBlank(instanceListEl, 'instance');
  setupClearOnBlank(paramListEl, 'param');

  // 监听整个面板的空白点击，支持取消选中
  setupClearOnBlank(templatePanelEl, 'template');
  setupClearOnBlank(instancePanelEl, 'instance');
  setupClearOnBlank(paramPanelEl, 'param');

  // 全局快捷键：复制、粘贴、删除
  document.addEventListener('keydown', (e) => {
    // 避免在输入框中触发
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
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
  });

  /**
   * 显示消息提示
   */
  function showMessage(msg) {
    messageBox.textContent = msg;
    messageBox.style.display = 'block';
    setTimeout(() => {
      messageBox.style.display = 'none';
    }, 2000);
  }

  /**
   * 选择工作目录
   */
  async function chooseDirectory() {
    try {
      directoryHandle = await window.showDirectoryPicker();
      currentDirLabel.textContent = directoryHandle.name;
      await ensureSubFolders();
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
  async function ensureSubFolders() {
    csharpHandle = await directoryHandle.getDirectoryHandle("csharpDate", { create: true });
    dataEntityHandle = await directoryHandle.getDirectoryHandle("dataEntity", { create: true });
    // 检查文件类型
    for await (const entry of csharpHandle.values()) {
      if (entry.kind === "file" && !entry.name.toLowerCase().endsWith(".cs")) {
        showMessage(`csharpDate 文件夹内仅允许 .cs 文件：${entry.name}`);
        throw new Error("Invalid file in csharpDate");
      }
      if (entry.kind === "file") {
        const file = await entry.getFile();
        const text = await file.text();
        // 简单检测是否包含方法定义
        const hasMethod = /\bvoid\b|\bpublic\b|\bprivate\b/.test(text);
        if (hasMethod) {
          showMessage(`检测到已有 cs 文件包含方法，跳过读取：${entry.name}`);
        }
      }
    }
    for await (const entry of dataEntityHandle.values()) {
      if (entry.kind === "file" && !entry.name.toLowerCase().endsWith(".json")) {
        showMessage(`dataEntity 文件夹内仅允许 .json 文件：${entry.name}`);
        throw new Error("Invalid file in dataEntity");
      }
    }
  }

  /**
   * 从 dataEntity 读取所有模板文件
   */
  async function loadAllTemplates() {
    templates.length = 0;
    currentTemplateIndex = -1;
    currentInstanceIndex = -1;
    for await (const entry of dataEntityHandle.values()) {
      if (entry.kind === "file" && entry.name.toLowerCase().endsWith(".json")) {
        try {
          const file = await entry.getFile();
          const text = await file.text();
          const obj = JSON.parse(text);
          if (obj && obj.name && Array.isArray(obj.parameters) && Array.isArray(obj.instances)) {
            templates.push({
              name: obj.name,
              parameters: obj.parameters,
              instances: obj.instances,
            });
          }
        } catch (err) {
          showMessage(`无法解析 ${entry.name}，已跳过`);
        }
      }
    }
    // 按名称排序
    templates.sort((a, b) => a.name.localeCompare(b.name));
    if (templates.length > 0) {
      currentTemplateIndex = 0;
      currentInstanceIndex = templates[0].instances.length > 0 ? 0 : -1;
    }
  }

  /**
   * 新建模板
   */
  function newTemplate() {
    const name = templateNameInput.value.trim() || `模板${templates.length + 1}`;
    if (templates.some((t) => t.name === name)) {
      alert("模板名称已存在");
      return;
    }
    const instance = {
      id: 0,
      name: "默认",
      payload: { template: name, id: 0, name: "默认" },
    };
    const template = {
      name,
      parameters: [],
      instances: [instance],
    };
    templates.push(template);
    currentTemplateIndex = templates.length - 1;
    currentInstanceIndex = 0;
    refreshTemplates();
    updateIndexTemplateOptions();
    showMessage(`已创建新模板：${name}`);
  }

  /**
   * 重命名模板
   */
  function renameTemplate(newName) {
    if (currentTemplateIndex < 0) return;
    if (!newName) return;
    if (templates.some((t, idx) => t.name === newName && idx !== currentTemplateIndex)) {
      alert("模板名称已存在");
      templateNameInput.value = templates[currentTemplateIndex].name;
      return;
    }
    const tpl = templates[currentTemplateIndex];
    tpl.name = newName;
    // 更新实例中的模板字段
    tpl.instances.forEach((inst) => {
      inst.payload.template = newName;
    });
    refreshTemplates();
    updateIndexTemplateOptions();
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
    const name = instanceNameInput.value.trim() || `实例${tpl.instances.length}`;
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
    tpl.instances.push(inst);
    currentInstanceIndex = tpl.instances.length - 1;
    refreshInstances();
    refreshParams();
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
    inst.name = newName;
    inst.payload.name = newName;
    refreshInstances();
    refreshParams();
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
    if (!name) {
      showMessage("请输入参数名称");
      return;
    }
    const type = paramTypeSelect.value;
    const idxTpl = indexTemplateSelect.value;
    const idxParam = indexParamSelect.value;
    let indexObj = null;
    if (idxTpl && idxParam) {
      indexObj = { template: idxTpl, param: idxParam };
    }
    const tpl = templates[currentTemplateIndex];
    // 如果正在编辑参数
    if (editingParamIndex >= 0) {
      updateParamAtIndex(editingParamIndex, name, type, indexObj);
      editingParamIndex = -1;
      selectedParams.clear();
      refreshParams();
      showMessage(`已更新参数：${name}`);
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
      inst.payload[name] = getDefaultValueForType(type);
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
    // 检查重名
    if (tpl.parameters.some((p, i) => p.name === newName && i !== index)) {
      alert("参数名称已存在");
      return;
    }
    const oldName = param.name;
    const oldType = param.type;
    // 更新定义
    param.name = newName;
    param.type = newType;
    param.index = newIndexObj;
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
    });
  }

  /**
   * 根据新类型转换现有值，简单处理
   */
  function convertValueForType(val, type) {
    if (val === undefined || val === null) return getDefaultValueForType(type);
    switch (type) {
      case 'string':
        return String(val);
      case 'int':
        return parseInt(val) || 0;
      case 'float':
        return parseFloat(val) || 0;
      case 'bool':
        return Boolean(val);
      case 'list':
        return Array.isArray(val) ? val : (val ? String(val).split(/\s*,\s*/) : []);
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
    switch (type) {
      case "string":
        return "";
      case "int":
      case "float":
        return 0;
      case "bool":
        return false;
      case "list":
        return [];
      case "object":
        return {};
      default:
        return null;
    }
  }

  /**
   * 刷新模板列表
   */
  function refreshTemplates() {
    templateListEl.innerHTML = "";
    templates.forEach((tpl, idx) => {
      const li = document.createElement("li");
      // 设置选中状态
      if (selectedTemplates.has(idx)) li.classList.add('active');
      li.textContent = tpl.name;
      li.addEventListener('click', (e) => {
        // Shift+点击范围选择
        if (e.shiftKey) {
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
          // 单选
          selectedTemplates.clear();
          selectedTemplates.add(idx);
          currentTemplateIndex = idx;
          templateNameInput.value = tpl.name;
          // 更新锚点
          anchorTemplate = idx;
        }
        // 切换模板时，重置实例和参数选择
        currentInstanceIndex = templates[currentTemplateIndex].instances.length > 0 ? 0 : -1;
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
      templateListEl.appendChild(li);
    });
    if (currentTemplateIndex >= 0) {
      templateNameInput.value = templates[currentTemplateIndex].name;
    } else {
      templateNameInput.value = "";
    }
    refreshInstances();
    refreshParams();
    // 应用模板搜索过滤
    filterList(templateListEl, searchTemplatesInput.value);
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
    if (currentTemplateIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    tpl.instances.forEach((inst, idx) => {
      const li = document.createElement("li");
      // 设置选中状态
      if (selectedInstances.has(idx)) li.classList.add('active');
      li.textContent = `${inst.id}: ${inst.name}`;
      li.addEventListener('click', (e) => {
        if (e.shiftKey) {
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
          selectedInstances.clear();
          selectedInstances.add(idx);
          currentInstanceIndex = idx;
          // 更新实例锚点
          anchorInstance = idx;
        }
        instanceNameInput.value = inst.name;
        // 切换实例时清除参数选择
        selectedParams.clear();
        editingParamIndex = -1;
        // 清除参数锚点
        anchorParam = null;
        refreshInstances();
        refreshParams();
        lastSelectedCategory = 'instance';
        e.stopPropagation();
      });
      instanceListEl.appendChild(li);
    });
    // 应用实例搜索过滤
    filterList(instanceListEl, searchInstancesInput.value);
  }

  /**
   * 刷新参数列表
   */
  function refreshParams() {
    paramListEl.innerHTML = "";
    if (currentTemplateIndex < 0 || currentInstanceIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    const inst = tpl.instances[currentInstanceIndex];
    // 保留字段
    const reserved = [
      { name: "template", type: "string" },
      { name: "id", type: "int" },
      { name: "name", type: "string" },
    ];
    reserved.forEach((f) => {
      const item = document.createElement("div");
      item.classList.add("param-item", "reserved");
      const label = document.createElement("label");
      label.textContent = f.name;
      const span = document.createElement("span");
      span.textContent = inst.payload[f.name];
      span.style.flex = "1";
      item.appendChild(label);
      item.appendChild(span);
      paramListEl.appendChild(item);
    });
    // 自定义参数
    tpl.parameters.forEach((p, idx) => {
      const item = document.createElement("div");
      item.classList.add("param-item");
      const label = document.createElement('label');
      label.textContent = p.name;
      item.appendChild(label);
      if (selectedParams.has(idx)) item.classList.add('active');
      if (p.index) {
        const info = document.createElement('span');
        info.textContent = `索引：${p.index.template} → ${p.index.param}`;
        info.style.flex = '1';
        item.appendChild(info);
      } else {
        let inputEl;
        const value = inst.payload[p.name];
        switch (p.type) {
          case 'string':
            inputEl = document.createElement('input');
            inputEl.type = 'text';
            inputEl.value = value ?? '';
            break;
          case 'int':
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
            inputEl = document.createElement('input');
            inputEl.type = 'text';
            inputEl.value = Array.isArray(value) ? value.join(', ') : '';
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
        inputEl.style.flex = '1';
        inputEl.addEventListener('change', () => updateParamValue(idx, inputEl));
        item.appendChild(inputEl);
      }
      const del = document.createElement('button');
      del.className = 'delete-param';
      del.textContent = '删除';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteParam(idx);
      });
      item.appendChild(del);
      // 单击参数项选择/取消选择
      item.addEventListener('click', (e) => {
        // 点击输入或删除按钮不触发选择逻辑
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
        if (e.shiftKey) {
          // 如果未设置锚点，则以当前正在编辑的参数或本次索引为锚点
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
          selectedParams.clear();
          selectedParams.add(idx);
          editingParamIndex = idx;
          anchorParam = idx;
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
  }

  /**
   * 更新参数值
   */
  function updateParamValue(paramIndex, inputEl) {
    if (currentTemplateIndex < 0 || currentInstanceIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    const inst = tpl.instances[currentInstanceIndex];
    const param = tpl.parameters[paramIndex];
    switch (param.type) {
      case "string":
        inst.payload[param.name] = inputEl.value;
        break;
      case "int":
        inst.payload[param.name] = parseInt(inputEl.value) || 0;
        break;
      case "float":
        inst.payload[param.name] = parseFloat(inputEl.value) || 0;
        break;
      case "bool":
        inst.payload[param.name] = inputEl.checked;
        break;
      case "list":
        inst.payload[param.name] = inputEl.value ? inputEl.value.split(/\s*,\s*/) : [];
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
  }

  /**
   * 根据当前选择的参数显示其信息到表单
   */
  function showSelectedParamDetails() {
    if (currentTemplateIndex < 0) return;
    const tpl = templates[currentTemplateIndex];
    if (selectedParams.size === 0) {
      // 没有选中，重置输入
      paramNameInput.value = '';
      paramTypeSelect.value = 'string';
      indexTemplateSelect.value = '';
      updateIndexParamOptions();
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
    paramTypeSelect.value = p.type;
    // 设置索引下拉
    updateIndexTemplateOptions();
    if (p.index) {
      indexTemplateSelect.value = p.index.template;
      updateIndexParamOptions();
      indexParamSelect.value = p.index.param;
    } else {
      indexTemplateSelect.value = '';
      updateIndexParamOptions();
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
      pasteParams();
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
      // 更新实例中的 template 字段和 id
      newTpl.instances.forEach((inst, idx) => {
        inst.id = idx;
        inst.name = `${inst.name}`;
        inst.payload.template = newName;
        inst.payload.id = idx;
        inst.payload.name = inst.name;
      });
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
    let indices = Array.from(selectedTemplates);
    if (indices.length === 0 && currentTemplateIndex >= 0) indices = [currentTemplateIndex];
    if (indices.length === 0) {
      alert('请选择要删除的模板');
      return;
    }
    indices.sort((a, b) => b - a);
    indices.forEach((idx) => {
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
    // 深拷贝参数定义，并保存每个参数在所有实例中的值
    const items = indices.map((idx) => {
      const param = JSON.parse(JSON.stringify(tpl.parameters[idx]));
      const values = tpl.instances.map((inst) => inst.payload[param.name]);
      return { param, values };
    });
    copyBuffer = { type: 'param', items };
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
      let newName = obj.param.name;
      while (tpl.parameters.some((p) => p.name === newName)) {
        newName = `${newName}_复制`;
      }
      const newParam = JSON.parse(JSON.stringify(obj.param));
      newParam.name = newName;
      tpl.parameters.push(newParam);
      // 为每个实例复制值
      tpl.instances.forEach((inst, idx) => {
        inst.payload[newName] = obj.values[idx];
      });
    });
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
    indices.forEach((idx) => {
      const param = tpl.parameters[idx];
      tpl.parameters.splice(idx, 1);
      tpl.instances.forEach((inst) => {
        delete inst.payload[param.name];
      });
    });
    selectedParams.clear();
    editingParamIndex = -1;
    refreshParams();
    showMessage(`已删除 ${indices.length} 个参数`);
  }

  /**
   * 更新索引模板列表
   */
  function updateIndexTemplateOptions() {
    indexTemplateSelect.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "无索引";
    indexTemplateSelect.appendChild(opt0);
    templates.forEach((tpl) => {
      const opt = document.createElement("option");
      opt.value = tpl.name;
      opt.textContent = tpl.name;
      indexTemplateSelect.appendChild(opt);
    });
    updateIndexParamOptions();
  }

  /**
   * 根据选中的索引模板更新参数列表
   */
  function updateIndexParamOptions() {
    const tplName = indexTemplateSelect.value;
    indexParamSelect.innerHTML = "";
    if (!tplName) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "无索引";
      indexParamSelect.appendChild(opt);
      return;
    }
    const tpl = templates.find((t) => t.name === tplName);
    if (!tpl) return;
    const optDef = document.createElement("option");
    optDef.value = "";
    optDef.textContent = "选择参数";
    indexParamSelect.appendChild(optDef);
    tpl.parameters.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.name;
      opt.textContent = p.name;
      indexParamSelect.appendChild(opt);
    });
  }

  /**
   * 保存所有模板到文件
   */
  async function saveAll() {
    if (!directoryHandle) {
      alert("请先选择工作目录");
      return;
    }
    try {
      for (const tpl of templates) {
        const json = JSON.stringify({ name: tpl.name, parameters: tpl.parameters, instances: tpl.instances }, null, 2);
        const jsonFile = await dataEntityHandle.getFileHandle(`${tpl.name}.json`, { create: true });
        const jsonWritable = await jsonFile.createWritable();
        await jsonWritable.write(json);
        await jsonWritable.close();
        const csContent = generateCSContent(tpl);
        const csFile = await csharpHandle.getFileHandle(`${tpl.name}.cs`, { create: true });
        const csWritable = await csFile.createWritable();
        await csWritable.write(csContent);
        await csWritable.close();
      }
      const manifest = templates.map((tpl) => ({ template: tpl.name, path: `dataEntity/${tpl.name}.json` }));
      const manifestHandle = await directoryHandle.getFileHandle("manifest.json", { create: true });
      const manifestWritable = await manifestHandle.createWritable();
      await manifestWritable.write(JSON.stringify(manifest, null, 2));
      await manifestWritable.close();
      showMessage("已保存所有更改");
    } catch (err) {
      console.error(err);
      showMessage("保存失败，请检查权限");
    }
  }

  /**
   * 生成 C# 内容
   */
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
    tpl.parameters.forEach((p) => {
      const csType = mapToCSharpType(p.type);
      lines.push(`    public ${csType} ${p.name};`);
    });
    lines.push("}");
    return lines.join("\n");
  }

  /**
   * 类型映射
   */
  function mapToCSharpType(type) {
    switch (type) {
      case "string":
        return "string";
      case "int":
        return "int";
      case "float":
        return "float";
      case "bool":
        return "bool";
      case "list":
        return "List<object>";
      case "object":
        return "object";
      default:
        return "object";
    }
  }

  /**
   * 根据搜索内容过滤列表显示
   * @param {HTMLElement} listEl 列表容器
   * @param {string} term 搜索关键词
   * @param {boolean} isParamList 是否为参数列表
   */
  function filterList(listEl, term, isParamList = false) {
    const lower = term.trim().toLowerCase();
    const items = listEl.children;
    let visibleCount = 0;
    let lastVisibleIndex = -1;
    for (let i = 0; i < items.length; i++) {
      const el = items[i];
      let text;
      if (isParamList) {
        // 参数列表，标签在第一个 label 或 span
        const label = el.querySelector('label');
        text = label ? label.textContent : '';
      } else {
        text = el.textContent;
      }
      if (!lower || (text && text.toLowerCase().includes(lower))) {
        el.style.display = '';
        visibleCount++;
        lastVisibleIndex = i;
      } else {
        el.style.display = 'none';
      }
    }
    // 如果只有一个匹配项，则自动选择
    if (visibleCount === 1 && !isParamList) {
      if (listEl === templateListEl) {
        const li = listEl.children[lastVisibleIndex];
        li.click();
      } else if (listEl === instanceListEl) {
        const li = listEl.children[lastVisibleIndex];
        li.click();
      }
    }
  }
})();