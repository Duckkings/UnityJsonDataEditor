function ensureContext(context) {
  if (!context || typeof context !== 'object') {
    throw new Error('createUEGeneratorModule requires a context object');
  }
  if (!context.appState || typeof context.appState !== 'object') {
    throw new Error('createUEGeneratorModule requires appState');
  }
}

export function createUEGeneratorModule(context) {
  ensureContext(context);

  const {
    appState,
    isUEMode = () => false,
    ensureSubFolders = async () => {},
    ensureEngineGenerationConsent = async () => true,
    cleanConflictingEngineArtifacts = async () => {},
    ensureCppEnumDirectory = async () => appState.cppEnumHandle,
    shouldIgnoreFileEntry = () => false,
    writeTextFile = async () => {},
    isEnumTemplate = () => false,
    getEnumDefinitions = () => [],
    isEnumType = () => false,
    getListElementTypeForParam = () => 'string',
    isUENameCompliant = () => true,
    showMessage = () => {},
    addLogEntry = () => {},
  } = context;

  function createUEGenerationContext() {
    return {
      counters: {
        template: 0,
        enumType: 0,
        enumValue: 0,
      },
      replacements: [],
      enumTypeNames: new Map(),
      enumHeaderIncludes: new Map(),
    };
  }

  function getUECounterKey(category) {
    if (category === 'enumType') return 'enumType';
    if (category === 'enumValue') return 'enumValue';
    return 'template';
  }

  function registerUENameReplacement(targetContext, category, originalName) {
    if (!targetContext) return 'filter0';
    if (!targetContext.counters) {
      targetContext.counters = { template: 0, enumType: 0, enumValue: 0 };
    }
    const key = getUECounterKey(category);
    if (typeof targetContext.counters[key] !== 'number') {
      targetContext.counters[key] = 0;
    }
    const replacement = `filter${targetContext.counters[key]++}`;
    targetContext.replacements.push({
      category: category || 'template',
      original: originalName || '',
      replacement,
    });
    return replacement;
  }

  function toPascalCaseFromIdentifier(value) {
    const parts = String(value || '')
      .split(/_+/)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
    if (parts.length === 0) {
      return '';
    }
    return parts
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('');
  }

  function resolveUENameParts(name, targetContext, category) {
    const raw = String(name ?? '').trim();
    let fileBase = raw;
    let baseForPascal = raw;
    let usedReplacement = false;
    if (!raw || !isUENameCompliant(raw)) {
      const replacement = registerUENameReplacement(targetContext, category, raw);
      fileBase = replacement;
      baseForPascal = replacement;
      usedReplacement = true;
    }
    let pascalBase = toPascalCaseFromIdentifier(baseForPascal);
    if (!pascalBase) {
      const fallback = usedReplacement
        ? baseForPascal
        : registerUENameReplacement(targetContext, category, raw);
      fileBase = fallback;
      pascalBase = toPascalCaseFromIdentifier(fallback) || 'Data';
    }
    if (/^\d/.test(pascalBase)) {
      pascalBase = `N${pascalBase}`;
    }
    if (!fileBase) {
      fileBase = pascalBase;
    }
    if (fileBase.toLowerCase() === 'datareftypes') {
      fileBase = `${fileBase}_Data`;
    }
    return { fileBase, pascalBase };
  }

  function formatUEInvalidNameMessage(records) {
    if (!Array.isArray(records) || records.length === 0) return '';
    const parts = records.map((item) => {
      const categoryLabel =
        item.category === 'enumValue' ? '枚举项' : item.category === 'enumType' ? '枚举' : '模板';
      const original = item.original != null && item.original !== '' ? item.original : '（空）';
      return `${categoryLabel}「${original}」→ ${item.replacement}`;
    });
    return `生成完成，但以下名称不合规：${parts.join('；')}`;
  }

  function mapPrimitiveToUEType(type) {
    switch (type) {
      case 'int':
        return { type: 'int32', defaultValue: '0' };
      case 'long':
        return { type: 'int64', defaultValue: '0' };
      case 'float':
        return { type: 'float', defaultValue: '0.0f' };
      case 'bool':
        return { type: 'bool', defaultValue: 'false' };
      case 'string':
      case 'object':
      default:
        return { type: 'FString', defaultValue: 'TEXT(\"\")' };
    }
  }

  function mapParamToUETypeInfo(param, targetContext) {
    if (!param) {
      return mapPrimitiveToUEType('string');
    }
    if (param.parameterIndexes) {
      if (param.type === 'list') {
        return { type: 'TArray<FDataRef>', defaultValue: null };
      }
      return { type: 'FDataRef', defaultValue: null };
    }
    if (param.type === 'list') {
      const elementType = getListElementTypeForParam(param);
      if (isEnumType(elementType)) {
        const enumName = targetContext?.enumTypeNames?.get(elementType);
        if (enumName) {
          return { type: `TArray<${enumName}>`, defaultValue: null };
        }
      }
      const elementInfo = mapPrimitiveToUEType(elementType);
      return { type: `TArray<${elementInfo.type}>`, defaultValue: null };
    }
    if (isEnumType(param.type)) {
      const enumName = targetContext?.enumTypeNames?.get(param.type);
      if (enumName) {
        return { type: enumName, defaultValue: null };
      }
    }
    return mapPrimitiveToUEType(param.type);
  }

  function collectUEEnumIncludePaths(tpl, targetContext) {
    if (!tpl || !targetContext || !targetContext.enumHeaderIncludes) return [];
    const includeSet = new Set();
    const includeMap = targetContext.enumHeaderIncludes;
    if (!(includeMap instanceof Map) || includeMap.size === 0) {
      return [];
    }
    const addInclude = (enumType) => {
      if (!enumType) return;
      const path = includeMap.get(enumType);
      if (path) {
        includeSet.add(path);
      }
    };
    const params = Array.isArray(tpl.parameters) ? tpl.parameters : [];
    params.forEach((param) => {
      if (!param || param.parameterIndexes) return;
      if (param.type === 'list') {
        const elementType = getListElementTypeForParam(param);
        if (isEnumType(elementType)) {
          addInclude(elementType);
        }
      } else if (isEnumType(param.type)) {
        addInclude(param.type);
      }
    });
    return Array.from(includeSet);
  }

  function getUECategoryLabel(nameParts) {
    return nameParts?.pascalBase || 'DataTable';
  }

  function buildUEHeaderContent(tpl, options, targetContext) {
    const { fileBase, structName, className, categoryLabel, indexFieldInfo } = options;
    const includeName = `${fileBase}.generated.h`;
    const lines = [];
    lines.push('#pragma once');
    lines.push('');
    lines.push('#include "CoreMinimal.h"');
    lines.push('#include "Engine/DataAsset.h"');
    lines.push('#include "DataRefTypes.h"');
    const enumIncludes = collectUEEnumIncludePaths(tpl, targetContext);
    enumIncludes.forEach((includePath) => {
      lines.push(`#include "${includePath}"`);
    });
    lines.push(`#include "${includeName}"`);
    lines.push('');
    lines.push('USTRUCT(BlueprintType)');
    lines.push(`struct ${structName}`);
    lines.push('{');
    lines.push('    GENERATED_BODY()');
    lines.push('');
    const commonCategory = categoryLabel;
    lines.push(`    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="${commonCategory}")`);
    lines.push('    FString Template = TEXT(\"\");');
    lines.push('');
    lines.push(`    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="${commonCategory}")`);
    lines.push('    int32 Id = 0;');
    lines.push('');
    lines.push(`    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="${commonCategory}")`);
    lines.push('    FString Name = TEXT(\"\");');
    lines.push('');
    lines.push(`    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="${commonCategory}")`);
    if (indexFieldInfo.defaultValue != null) {
      lines.push(`    ${indexFieldInfo.type} Index = ${indexFieldInfo.defaultValue};`);
    } else {
      lines.push(`    ${indexFieldInfo.type} Index;`);
    }
    lines.push('');
    const params = Array.isArray(tpl.parameters) ? tpl.parameters : [];
    params.forEach((param, idx) => {
      if (!param) return;
      const typeInfo = mapParamToUETypeInfo(param, targetContext);
      lines.push(`    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="${commonCategory}")`);
      if (typeInfo.defaultValue != null) {
        lines.push(`    ${typeInfo.type} ${param.name} = ${typeInfo.defaultValue};`);
      } else {
        lines.push(`    ${typeInfo.type} ${param.name};`);
      }
      if (idx < params.length - 1) {
        lines.push('');
      }
    });
    lines.push('};');
    lines.push('');
    lines.push('UCLASS(BlueprintType)');
    lines.push(`class ${className} : public UDataAsset`);
    lines.push('{');
    lines.push('    GENERATED_BODY()');
    lines.push('');
    lines.push('public:');
    lines.push('');
    lines.push(`    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category="${commonCategory}")`);
    lines.push(`    TMap<FName, ${structName}> Rows;`);
    lines.push('};');
    return lines.join('\n');
  }

  function buildUEEnumHeaderContent(enumName, fileBase, def, targetContext) {
    const lines = [];
    lines.push('#pragma once');
    lines.push('');
    lines.push('#include "CoreMinimal.h"');
    lines.push(`#include "${fileBase}.generated.h"`);
    lines.push('');
    lines.push('UENUM(BlueprintType)');
    lines.push(`enum class ${enumName} : uint8`);
    lines.push('{');
    lines.push('    None UMETA(DisplayName="None"),');
    const seen = new Set(['None']);
    const members = def?.values || [];
    members.forEach((raw, idx) => {
      if (!raw) return;
      let candidate = String(raw).trim();
      if (!candidate) return;
      let baseName = candidate;
      let usedReplacement = false;
      if (!isUENameCompliant(candidate)) {
        baseName = registerUENameReplacement(targetContext, 'enumValue', candidate);
        usedReplacement = true;
      }
      let finalName = usedReplacement ? baseName : toPascalCaseFromIdentifier(baseName);
      if (!finalName) {
        const fallback = registerUENameReplacement(targetContext, 'enumValue', candidate);
        finalName = fallback || `Member${idx + 1}`;
        usedReplacement = true;
      }
      if (!usedReplacement && /^\d/.test(finalName)) {
        finalName = `N${finalName}`;
      }
      const baseFinalName = finalName;
      let suffix = 1;
      while (seen.has(finalName)) {
        finalName = `${baseFinalName}_${suffix++}`;
      }
      seen.add(finalName);
      const displayName = candidate.replace(/"/g, '\\"');
      lines.push(`    ${finalName} UMETA(DisplayName="${displayName}"),`);
    });
    lines.push('};');
    return lines.join('\n');
  }

  function computeIndexFieldInfo(tpl, targetContext) {
    const idxField = tpl.indexField || 'id';
    if (idxField === 'id') {
      return mapPrimitiveToUEType('int');
    }
    if (idxField === 'name') {
      return mapPrimitiveToUEType('string');
    }
    const targetParam = Array.isArray(tpl.parameters)
      ? tpl.parameters.find((param) => param && param.name === idxField)
      : null;
    if (targetParam) {
      return mapParamToUETypeInfo(targetParam, targetContext);
    }
    return mapPrimitiveToUEType('string');
  }

  async function generateUEEnumHeaderFiles(targetContext, enumFiles) {
    if (!targetContext) return { updatedAny: false };
    const enumDir = await ensureCppEnumDirectory();
    if (!enumDir) return { updatedAny: false };
    const definitions = getEnumDefinitions();
    targetContext.enumTypeNames.clear();
    if (targetContext.enumHeaderIncludes instanceof Map) {
      targetContext.enumHeaderIncludes.clear();
    }
    if (definitions.length === 0) {
      return { updatedAny: false };
    }
    let updatedAny = false;
    for (const def of definitions) {
      const nameInfo = resolveUENameParts(def.name, targetContext, 'enumType');
      const enumName = `E${nameInfo.pascalBase}`;
      targetContext.enumTypeNames.set(def.name, enumName);
      let fileName = `${nameInfo.fileBase}.h`;
      let attempt = 1;
      while (enumFiles && enumFiles.has(fileName)) {
        fileName = `${nameInfo.fileBase}_${attempt++}.h`;
      }
      const baseName = fileName.replace(/\.h$/, '');
      const useEnumSubDir = Boolean(enumDir === appState.cppEnumHandle && appState.cppEnumHandle);
      const prefix = useEnumSubDir ? 'enum/' : '';
      const headerIncludePath = `${prefix}${fileName}`;
      const content = buildUEEnumHeaderContent(enumName, baseName, def, targetContext);
      await writeTextFile(enumDir, fileName, content);
      if (targetContext.enumHeaderIncludes instanceof Map) {
        targetContext.enumHeaderIncludes.set(def.name, headerIncludePath);
      }
      if (enumFiles) {
        enumFiles.add(fileName);
      }
      updatedAny = true;
    }
    return { updatedAny };
  }

  async function cleanupCppModelDirectory(validFiles) {
    if (!appState.cppModelHandle) return;
    for await (const entry of appState.cppModelHandle.values()) {
      if (entry.kind !== 'file') continue;
      if (shouldIgnoreFileEntry(entry.name)) continue;
      if (!validFiles.has(entry.name)) {
        try {
          await appState.cppModelHandle.removeEntry(entry.name);
        } catch (err) {
          console.warn(`删除无效的 C++ 文件失败：${entry.name}`, err);
        }
      }
    }
  }

  async function cleanupCppEnumDirectory(validFiles) {
    if (!appState.cppEnumHandle) return;
    for await (const entry of appState.cppEnumHandle.values()) {
      if (entry.kind !== 'file') continue;
      if (shouldIgnoreFileEntry(entry.name)) continue;
      if (!validFiles.has(entry.name)) {
        try {
          await appState.cppEnumHandle.removeEntry(entry.name);
        } catch (err) {
          console.warn(`删除无效的枚举 C++ 文件失败：${entry.name}`, err);
        }
      }
    }
  }

  async function generateUECppStructuresForCurrentTemplates() {
    if (!isUEMode()) {
      return { updatedAny: false, invalidMessage: '', invalidNames: [] };
    }
    if (!appState.cppModelHandle) {
      await ensureSubFolders();
    }
    if (!appState.cppModelHandle) {
      throw new Error('无法访问 cppmodel 目录');
    }
    const targetContext = createUEGenerationContext();
    const generatedFiles = new Set();
    const generatedEnumFiles = new Set();
    const dataRefContent = [
      '#pragma once',
      '',
      '#include "CoreMinimal.h"',
      '#include "DataRefTypes.generated.h"',
      '',
      'USTRUCT(BlueprintType)',
      'struct FDataRef',
      '{',
      '    GENERATED_BODY()',
      '',
      '    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="DataRef")',
      '    FString Template;',
      '',
      '    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="DataRef")',
      '    FString By;',
      '',
      '    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="DataRef")',
      '    FString Value;',
      '};',
      '',
    ].join('\n');
    await writeTextFile(appState.cppModelHandle, 'DataRefTypes.h', dataRefContent);
    generatedFiles.add('DataRefTypes.h');
    const enumResult = await generateUEEnumHeaderFiles(targetContext, generatedEnumFiles);
    let updatedAny = enumResult.updatedAny;
    for (const tpl of appState.templates) {
      if (!tpl || isEnumTemplate(tpl)) continue;
      const nameInfo = resolveUENameParts(tpl.name, targetContext, 'template');
      let fileName = `${nameInfo.fileBase}.h`;
      let suffix = 1;
      while (generatedFiles.has(fileName)) {
        fileName = `${nameInfo.fileBase}_${suffix++}.h`;
      }
      const structBaseName = nameInfo.pascalBase.endsWith('Row')
        ? nameInfo.pascalBase
        : `${nameInfo.pascalBase}Row`;
      const structName = `F${structBaseName}`;
      const className = `U${nameInfo.pascalBase}`;
      const categoryLabel = getUECategoryLabel(nameInfo);
      const indexFieldInfo = computeIndexFieldInfo(tpl, targetContext);
      const content = buildUEHeaderContent(
        tpl,
        {
          fileBase: fileName.replace(/\.h$/, ''),
          structName,
          className,
          categoryLabel,
          indexFieldInfo,
        },
        targetContext,
      );
      await writeTextFile(appState.cppModelHandle, fileName, content);
      generatedFiles.add(fileName);
      updatedAny = true;
    }
    await cleanupCppModelDirectory(generatedFiles);
    await cleanupCppEnumDirectory(generatedEnumFiles);
    return {
      updatedAny,
      invalidNames: targetContext.replacements.slice(),
      invalidMessage: formatUEInvalidNameMessage(targetContext.replacements),
    };
  }

  async function regenerateCppStructures() {
    if (!appState.directoryHandle) {
      window.alert('请先选择工作目录');
      return;
    }
    if (!isUEMode()) {
      showMessage('请先切换到 UE 模式再生成 C++ 脚本', 'warn');
      return;
    }
    try {
      const consent = await ensureEngineGenerationConsent('生成 C++ 数据结构脚本');
      if (!consent) return;
      await cleanConflictingEngineArtifacts();
      await ensureSubFolders();
      const result = await generateUECppStructuresForCurrentTemplates();
      if (result.updatedAny) {
        if (result.invalidMessage) {
          addLogEntry('warn', result.invalidMessage);
          showMessage(result.invalidMessage, 'warn');
        } else {
          showMessage('已重新生成 C++ 数据结构脚本');
        }
      } else {
        showMessage('没有可生成的 C++ 数据结构脚本');
      }
    } catch (err) {
      console.error(err);
      showMessage('重新生成 C++ 脚本失败，请检查权限');
    }
  }

  return {
    regenerateCppStructures,
    createUEGenerationContext,
    getUECounterKey,
    registerUENameReplacement,
    toPascalCaseFromIdentifier,
    resolveUENameParts,
    formatUEInvalidNameMessage,
    mapPrimitiveToUEType,
    mapParamToUETypeInfo,
    collectUEEnumIncludePaths,
    getUECategoryLabel,
    buildUEHeaderContent,
    buildUEEnumHeaderContent,
    computeIndexFieldInfo,
    generateUEEnumHeaderFiles,
    cleanupCppModelDirectory,
    cleanupCppEnumDirectory,
    generateUECppStructuresForCurrentTemplates,
  };
}

export function getUEGeneratorModule(context) {
  return createUEGeneratorModule(context);
}

export default createUEGeneratorModule;
