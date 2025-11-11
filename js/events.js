// Event bindings, mode switching, and bootstrap logic.
      if (trimmed === '1') return 'replace';
      if (trimmed === '2') return 'jsonOnly';
      if (trimmed === '3') return 'cancel';
    }
  }

  async function saveAll() {
    if (!directoryHandle) {
      alert("请先选择工作目录");
      return;
    }
    if (currentEditMode === MODE_TABLE && !syncLuckysheetBackToTemplate()) {
      showMessage('表格模式存在格式错误，已取消保存', 'warn');
      return;
    }
    try {
      if (!csharpHandle || !dataEntityHandle) {
        await ensureSubFolders();
      }
      const templateDecisions = new Map();
      const csCache = new Map();
      let enumTemplateSaved = false;
      const pendingStructureDecision = [];

      for (const tpl of templates) {
        ensureTemplateUid(tpl);
        if (isEnumTemplate(tpl)) {
          continue;
        }
        const structureChanged = hasTemplateStructureChanged(tpl);
        if (!structureChanged) {
          templateDecisions.set(tpl.__uid, { decision: 'jsonOnly', structureChanged: false });
          continue;
        }
        const csContent = generateCSContent(tpl);
        const existingCs = await readTextFileIfExists(csharpHandle, `${tpl.name}.cs`);
        csCache.set(tpl.__uid, csContent);
        if (existingCs != null && normalizeContent(existingCs) === normalizeContent(csContent)) {
          templateDecisions.set(tpl.__uid, { decision: 'jsonOnly', structureChanged: true });
          continue;
        }
        pendingStructureDecision.push(tpl);
      }

      if (pendingStructureDecision.length > 0) {
        const answer = askCSharpReplacementBulk(pendingStructureDecision.map((tpl) => tpl.name));
        if (answer === 'cancel') {
          showMessage('已取消保存');
          return;
        }
        for (const tpl of pendingStructureDecision) {
          templateDecisions.set(tpl.__uid, {
            decision: answer === 'replace' ? 'replace' : 'jsonOnly',
            structureChanged: true,
          });
        }
      }

      for (const tpl of templates) {
        ensureTemplateUid(tpl);
        if (isEnumTemplate(tpl)) {
          await saveEnumTemplateCache(tpl);
          enumTemplateSaved = true;
          await deleteDataEntityFileIfExists(`${tpl.name}.json`);
          continue;
        }
        const json = JSON.stringify({ name: tpl.name, indexField: tpl.indexField || 'id', parameters: tpl.parameters, instances: tpl.instances }, null, 2);
        const jsonFileName = `${tpl.name}.json`;
        await writeTextFile(dataEntityHandle, jsonFileName, json);
        if (tpl.__pendingDeleteFileName && tpl.__pendingDeleteFileName !== jsonFileName) {
          await deleteDataEntityFileIfExists(tpl.__pendingDeleteFileName);
        }
        tpl.__persistedName = tpl.name;
        tpl.__pendingDeleteFileName = null;
        const meta = templateDecisions.get(tpl.__uid);
        if (meta && meta.decision === 'replace') {
          const content = csCache.get(tpl.__uid) || generateCSContent(tpl);
          await writeTextFile(csharpHandle, `${tpl.name}.cs`, content);
        }
      }

      await generateEnumCSFiles(getEnumTemplate());

      const activeJson = new Set();
      const activeCs = new Set();
      templates.forEach((tpl) => {
        if (!tpl || isEnumTemplate(tpl)) return;
        activeJson.add(`${tpl.name}.json`);
        activeCs.add(`${tpl.name}.cs`);
      });
      activeJson.forEach((name) => pendingJsonRemovals.delete(name));
      activeCs.forEach((name) => pendingCsRemovals.delete(name));
      for (const fileName of pendingJsonRemovals) {
        await deleteDataEntityFileIfExists(fileName);
      }
      pendingJsonRemovals.clear();
      for (const fileName of pendingCsRemovals) {
        await deleteCSharpFileIfExists(fileName);
      }
      pendingCsRemovals.clear();

      if (!enumTemplateSaved) {
        await clearEnumTemplateCache();
        await deleteDataEntityFileIfExists('enum.json');
      }

      const manifest = templates
        .filter((tpl) => !isEnumTemplate(tpl))
        .map((tpl) => ({ template: tpl.name, path: `${tpl.name}.json` }));
      await writeTextFile(dataEntityHandle, 'manifest.json', JSON.stringify(manifest, null, 2));
      await generateRuntimeLoaderArtifacts();

      lastSavedStructureSnapshot = captureCurrentStructureSnapshot();
      showMessage("已保存所有更改");
    } catch (err) {
      console.error(err);
      showMessage("保存失败，请检查权限");
    }
  }

  async function regenerateCSharpStructures() {
    if (!directoryHandle) {
      alert('请先选择工作目录');
      return;
    }
    try {
      if (!csharpHandle || !dataEntityHandle) {
        await ensureSubFolders();
      }
      let updatedAny = false;
      for (const tpl of templates) {
        ensureTemplateUid(tpl);
        if (isEnumTemplate(tpl)) continue;
        const content = generateCSContent(tpl);
        await writeTextFile(csharpHandle, `${tpl.name}.cs`, content);
        updatedAny = true;
      }
      const enumTpl = getEnumTemplate();
      await generateEnumCSFiles(enumTpl);
      if (enumTpl) {
        updatedAny = true;
      }
      if (updatedAny) {
        showMessage('已重新生成 C# 数据结构脚本');
      } else {
        showMessage('没有可生成的 C# 数据结构脚本');
      }
      await generateRuntimeLoaderArtifacts();
    } catch (err) {
      console.error(err);
      showMessage('重新生成 C# 脚本失败，请检查权限');
    }
  }

  /**
   * 生成 C# 枚举内容
   */
  async function generateEnumCSFiles(enumTpl) {
    if (!csharpHandle) return;
    let enumDir = csharpHandle;
    let useSubDir = true;
    try {
      enumDir = await csharpHandle.getDirectoryHandle('enums', { create: true });
    } catch (err) {
      console.warn('无法访问 enums 目录，枚举将生成到 csharpDate 根目录', err);
      enumDir = csharpHandle;
      useSubDir = false;
    }
    const definitions = enumTpl ? getEnumDefinitions() : [];
    const generatedFiles = new Set();
    for (const def of definitions) {
      if (!def || !def.csharpName) continue;
      const members = [];
      const seenMembers = new Set();
      def.values.forEach((raw, idx) => {
        if (!raw) return;
        const fallback = `Member${idx + 1}`;
        const baseName = sanitizeCSharpMemberName(raw, fallback);
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
      lines.push('using System;');
      lines.push('');
      lines.push('[Serializable]');
      lines.push(`public enum ${def.csharpName}`);
      lines.push('{');
      members.forEach((member, index) => {
        if (member.original && member.original !== member.name) {
          lines.push(`    // ${member.original}`);
        }
        const suffix = index === members.length - 1 ? '' : ',';
        lines.push(`    ${member.name}${suffix}`);
      });
      lines.push('}');
      const fileName = `${def.csharpName}.cs`;
      const fileHandle = await enumDir.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(lines.join('\n') + '\n');
      await writable.close();
      generatedFiles.add(fileName);
    }
    if (useSubDir) {
      for await (const entry of enumDir.values()) {
        if (entry.kind === 'file' && !generatedFiles.has(entry.name)) {
          await enumDir.removeEntry(entry.name);
        }
      }
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
    // 根据模板的索引字段生成 index 成员
    const idxField = tpl.indexField || 'id';
    let idxType = 'string';
    if (idxField === 'id') idxType = 'long';
    else if (idxField === 'name') idxType = 'string';
    else {
      const pp = tpl.parameters.find(p => p.name === idxField);
      if (pp) idxType = mapToCSharpType(pp.type);
    }
    lines.push(`    public ${idxType} index;`);
    // 索引参数使用可复用的全局类型 DataRef（由 modelCsharpe.cs 提供）
    tpl.parameters.forEach((p) => {
      if (!p) return;
      if (p.parameterIndexes) {
        lines.push(`    public DataRef ${p.name};`);
      } else {
        const csType = mapToCSharpType(p.type);
        lines.push(`    public ${csType} ${p.name};`);
      }
    });
    lines.push("}");
    return lines.join("\n");
  }

  /**
   * 类型映射
   */
  function mapToCSharpType(type) {
    if (isEnumType(type)) {
      return getEnumCSharpTypeName(type);
    }
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
    // 仅在存在搜索关键字时，且只有一个匹配项时自动选择
    if (visibleCount === 1 && !isParamList && lower.length > 0) {
      if (listEl === templateListEl) {
        const li = listEl.children[lastVisibleIndex];
        li.click();
      } else if (listEl === instanceListEl) {
        const li = listEl.children[lastVisibleIndex];
        li.click();
      }
    }
  }
  
  // 默认使用暗色主题并自动恢复上次工作目录
  window.addEventListener('DOMContentLoaded', async () => {
    // 默认暗色
    document.body.classList.add('dark');
    // 重新绑定选择目录按钮，选择完成后保存句柄
    const btn = document.getElementById('chooseDir');
    if (btn) {
      try { btn.removeEventListener('click', chooseDirectory); } catch {}
      btn.addEventListener('click', async () => {
        await chooseDirectory();
        try {
          if (navigator.storage && navigator.storage.persist) { try { await navigator.storage.persist(); } catch {} }
          if (directoryHandle) { await saveLastDirectoryHandle(directoryHandle); }
        } catch {}
      });
    }
    // 自动恢复
    await autoRestoreLastDirectory();
  });
})();
