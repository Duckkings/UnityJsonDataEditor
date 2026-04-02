function ensureContext(context) {
  if (!context || typeof context !== 'object') {
    throw new Error('createSystemPanelsModule requires a context object');
  }
  if (!context.appState || typeof context.appState !== 'object') {
    throw new Error('createSystemPanelsModule requires appState');
  }
}

export function createSystemPanelsModule(context) {
  ensureContext(context);

  const {
    appState,
    domRefs = {},
    restoreTemplateFromTrash: restoreTemplateFromTrashHandler = async () => {},
  } = context;

  const {
    openTrashBtn = null,
    trashOverlay = null,
    trashListEl = null,
    messageBox = null,
    logOverlay = null,
    logListEl = null,
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
      level: level || 'info',
      message: String(message ?? ''),
      time: new Date(),
      extra: extra || null,
    };
    operationLogs.push(entry);
    if (operationLogs.length > 500) {
      operationLogs.splice(0, operationLogs.length - 500);
    }
    if (logOverlay && logOverlay.style.display !== 'none') {
      renderLogs();
    }
  }

  function renderLogs() {
    if (!logListEl) return;
    const operationLogs = ensureOperationLogs();
    logListEl.innerHTML = '';
    if (operationLogs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'log-empty';
      empty.textContent = '暂无日志';
      logListEl.appendChild(empty);
      return;
    }
    operationLogs.forEach((entry) => {
      const div = document.createElement('div');
      div.className = `log-entry ${entry.level}`;
      const timeSpan = document.createElement('span');
      timeSpan.className = 'time';
      timeSpan.textContent = formatLogTimestamp(entry.time);
      div.appendChild(timeSpan);
      const msgSpan = document.createElement('span');
      msgSpan.textContent = entry.message;
      div.appendChild(msgSpan);
      if (entry.extra && entry.extra.detail) {
        const detail = document.createElement('div');
        detail.textContent = entry.extra.detail;
        detail.style.marginTop = '4px';
        detail.style.whiteSpace = 'pre-wrap';
        div.appendChild(detail);
      }
      logListEl.appendChild(div);
    });
  }

  function formatLogTimestamp(date) {
    if (!(date instanceof Date)) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function openLogOverlay() {
    if (!logOverlay) return;
    renderLogs();
    logOverlay.style.display = 'flex';
  }

  function closeLogOverlay() {
    if (!logOverlay) return;
    logOverlay.style.display = 'none';
  }

  function clearLogEntries() {
    const operationLogs = ensureOperationLogs();
    operationLogs.length = 0;
    renderLogs();
  }

  function showMessage(msg, level = 'info') {
    if (!messageBox) return;
    messageBox.textContent = msg;
    messageBox.style.display = 'block';
    addLogEntry(level, msg);
    if (messageTimeoutId) {
      clearTimeout(messageTimeoutId);
    }
    messageTimeoutId = window.setTimeout(() => {
      messageBox.style.display = 'none';
      messageTimeoutId = null;
    }, 2000);
  }

  function updateTrashButtonLabel(count) {
    if (!openTrashBtn) return;
    const base = appState.trashButtonBaseLabel || '垃圾箱';
    const total = Number.isFinite(count) && count > 0 ? count : 0;
    openTrashBtn.textContent = total > 0 ? `${base} (${total})` : base;
    if (total > 0) {
      openTrashBtn.classList.add('has-items');
    } else {
      openTrashBtn.classList.remove('has-items');
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
        { create: true },
      );
    } catch (err) {
      console.warn('无法访问垃圾箱目录', err);
      appState.trashHandle = null;
    }
    return appState.trashHandle;
  }

  function formatTrashTimestampText(ms) {
    if (!ms) return '未知时间';
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return '未知时间';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
      date.getHours(),
    )}:${pad(date.getMinutes())}`;
  }

  function formatFileSize(bytes) {
    if (typeof bytes !== 'number' || Number.isNaN(bytes) || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
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
        if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.json')) {
          try {
            const file = await entry.getFile();
            items.push({
              templateName: entry.name.replace(/\.json$/i, ''),
              fileName: entry.name,
              lastModified: file.lastModified,
              size: file.size,
            });
          } catch (err) {
            console.warn('读取垃圾箱文件失败', err);
          }
        }
      }
    } catch (err) {
      console.warn('遍历垃圾箱目录失败', err);
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
    const items = trashListEl.querySelectorAll('.trash-item');
    items.forEach((item) => {
      const name = item.dataset.name || '';
      item.classList.toggle(
        'selected',
        Boolean(appState.trashSelectedTemplateName) && name === appState.trashSelectedTemplateName,
      );
    });
  }

  function setTrashSelection(name) {
    appState.trashSelectedTemplateName = name || null;
    updateTrashSelectionUI();
  }

  function renderTrashEntries(entries) {
    if (!trashListEl) return;
    trashListEl.innerHTML = '';
    if (!Array.isArray(entries) || entries.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'trash-empty';
      emptyEl.textContent = '垃圾箱为空';
      trashListEl.appendChild(emptyEl);
      appState.trashSelectedTemplateName = null;
      return;
    }
    if (!entries.some((entry) => entry.templateName === appState.trashSelectedTemplateName)) {
      appState.trashSelectedTemplateName = entries[0].templateName;
    }
    const list = document.createElement('ul');
    list.className = 'trash-list';
    entries.forEach((entry) => {
      const li = document.createElement('li');
      li.className = 'trash-item';
      li.dataset.name = entry.templateName;
      if (entry.templateName === appState.trashSelectedTemplateName) {
        li.classList.add('selected');
      }
      li.addEventListener('click', () => {
        setTrashSelection(entry.templateName);
      });

      const info = document.createElement('div');
      info.className = 'trash-info';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'trash-name';
      nameSpan.textContent = entry.templateName;
      info.appendChild(nameSpan);
      const metaSpan = document.createElement('span');
      metaSpan.className = 'trash-meta';
      metaSpan.textContent = `${formatTrashTimestampText(entry.lastModified)} · ${formatFileSize(
        entry.size,
      )}`;
      info.appendChild(metaSpan);

      const actions = document.createElement('div');
      actions.className = 'trash-item-actions';
      const restoreBtn = document.createElement('button');
      restoreBtn.textContent = '恢复';
      restoreBtn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        void restoreTemplateFromTrash(entry.templateName);
      });
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '删除';
      deleteBtn.addEventListener('click', (evt) => {
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
    if (!trashOverlay || trashOverlay.style.display === 'none') return;
    const entries = await refreshTrashButtonState();
    renderTrashEntries(entries);
    updateTrashSelectionUI();
  }

  async function openTrashOverlayPanel() {
    if (!trashOverlay) return;
    if (!appState.directoryHandle || !appState.dataEntityHandle) {
      showMessage('请先选择工作目录', 'warn');
      return;
    }
    const entries = await refreshTrashButtonState();
    renderTrashEntries(entries);
    trashOverlay.style.display = 'flex';
    trashOverlay.setAttribute('aria-hidden', 'false');
    try {
      trashOverlay.focus({ preventScroll: true });
    } catch (_err) {}
  }

  function closeTrashOverlayPanel() {
    if (!trashOverlay) return;
    trashOverlay.style.display = 'none';
    trashOverlay.setAttribute('aria-hidden', 'true');
    appState.trashSelectedTemplateName = null;
  }

  async function deleteTrashEntry(templateName) {
    if (!templateName) return;
    const handle = await ensureTrashDirectory();
    if (!handle || typeof handle.removeEntry !== 'function') {
      showMessage('垃圾箱目录不可用', 'warn');
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
      if (err && err.name === 'NotFoundError') {
        showMessage('垃圾箱中未找到该模板', 'warn');
      } else {
        console.warn('删除垃圾箱文件失败', err);
        showMessage('删除失败，请检查权限', 'warn');
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
    if (!handle || typeof handle.removeEntry !== 'function') {
      showMessage('垃圾箱目录不可用', 'warn');
      return;
    }
    const targets = [];
    try {
      for await (const entry of handle.values()) {
        if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.json')) {
          targets.push(entry.name);
        }
      }
    } catch (err) {
      console.warn('遍历垃圾箱目录失败', err);
      showMessage('清空垃圾箱失败', 'warn');
      return;
    }
    try {
      for (const name of targets) {
        await handle.removeEntry(name);
      }
      appState.trashSelectedTemplateName = null;
      showMessage('垃圾箱已清空');
    } catch (err) {
      console.warn('清空垃圾箱失败', err);
      showMessage('清空垃圾箱失败，请检查权限', 'warn');
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
    restoreTemplateFromTrash,
  };
}

export function getSystemPanelsModule(context) {
  return createSystemPanelsModule(context);
}

export default createSystemPanelsModule;
