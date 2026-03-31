# agent.md

## 目的

这个文件给 AI 或维护者提供一个“从功能反查代码”的索引，基于当前 `index.html` 与 `script.js` 的实现整理。

项目当前是单页前端应用，核心行为几乎都在 `script.js` 中。

## 入口文件

- `index.html`
  页面结构、按钮、面板、弹层和模式容器。
- `script.js`
  主要状态、文件系统访问、编辑逻辑、CSV、表格模式、生成逻辑、日志和垃圾箱。
- `style.css`
  样式和状态类，不负责核心业务逻辑。

## 核心状态

以下变量是大多数功能的入口：

- `templates`
  内存中的模板列表，核心数据源。
- `currentTemplateIndex`
  当前选中的模板索引。
- `currentInstanceIndex`
  当前选中的实例索引。
- `currentEngineMode`
  当前引擎模式，`unity` 或 `ue`。
- `currentEditMode`
  当前编辑模式，`classic` 或 `sheet`。
- `copyBuffer`
  复制粘贴缓冲区。
- `compareValueState`
  “对比值”功能的状态快照。
- `pendingTemplateDeletions`
  等待落入垃圾箱的模板集合。

## 功能树

```text
数据表编辑器
├─ 启动与工作目录
│  ├─ 目录选择
│  │  ├─ UI: #chooseDir, #currentDir
│  │  ├─ 核心函数: chooseDirectory, ensureSubFolders, verifyPermission
│  │  └─ 搜索词: chooseDirectory / ensureSubFolders / dataEntityHandle
│  ├─ 自动恢复
│  │  ├─ 核心函数: saveLastDirectoryHandle, getLastDirectoryHandle, autoRestoreLastDirectory
│  │  └─ 持久化: IndexedDB, DB_NAME=json-editor
│  ├─ 工作区配置
│  │  ├─ 核心函数: persistEditorConfig, loadEditorConfigState
│  │  └─ 落盘位置: dataEditorConfig/config.json
│  └─ 工作区校验
│     ├─ Unity: csharpDate 只允许 .cs
│     ├─ UE: cppmodel 只允许 .h
│     └─ 搜索词: shouldIgnoreFileEntry / ensureSubFolders
├─ 编辑模式
│  ├─ 三列模式
│  │  ├─ UI: #classicMode
│  │  └─ 核心刷新: refreshTemplates, refreshInstances, refreshParams
│  ├─ 表格模式
│  │  ├─ UI: #sheetMode, #luckysheet, #sheetTemplateList
│  │  ├─ 核心函数: setEditMode, renderLuckysheetForActiveInstance, commitActiveSheetEdits
│  │  └─ 搜索词: EDIT_MODES / luckysheet / sheetModeDirty
│  └─ 模式切换按钮
│     └─ UI: #toggleEditMode
├─ 引擎模式
│  ├─ Unity / UE 切换
│  │  ├─ UI: #engineModeToggle
│  │  ├─ 核心函数: setEngineMode, toggleEngineMode, updateEngineModeUIState
│  │  └─ 搜索词: ENGINE_MODES / currentEngineMode
│  ├─ 冲突产物清理
│  │  ├─ 核心函数: cleanConflictingEngineArtifacts
│  │  └─ 行为: Unity 清 cppmodel, UE 清 csharpDate 和 Editor
│  └─ 首次执行确认
│     └─ 核心函数: ensureEngineGenerationConsent
├─ 模板管理
│  ├─ 新建 / 重命名 / 删除 / 复制 / 粘贴
│  │  ├─ 核心函数: newTemplate, renameTemplate, copyTemplates, pasteTemplates
│  │  └─ 删除链路: pendingTemplateDeletions, moveTemplateJsonToTrash
│  ├─ 搜索与选择
│  │  ├─ UI: #searchTemplates, #templateList
│  │  └─ 核心函数: filterList, refreshTemplates
│  └─ 特殊模板
│     └─ enum 模板: isEnumTemplate, getEnumTemplate
├─ 实例管理
│  ├─ 新建 / 重命名 / 删除 / 复制 / 粘贴
│  │  ├─ UI: #newInstance, #renameInstance, #copyInstance, #pasteInstance, #deleteInstance
│  │  └─ 核心函数: newInstance, renameInstance, deleteInstance, copyInstance, pasteInstance
│  ├─ 拖拽排序
│  │  └─ 核心位置: refreshInstances 内部的 dragstart / drop
│  ├─ 搜索与多选
│  │  ├─ UI: #searchInstances, #instanceList
│  │  └─ 核心函数: refreshInstances, getSelectedInstanceIndices
│  └─ 对比值展示
│     ├─ UI: #toggleCompareValues
│     ├─ 核心函数: buildCompareValueSnapshot, buildInstanceCompareText, handleToggleCompareValues
│     └─ 搜索词: compareValueState
├─ 参数系统
│  ├─ 参数创建与更新
│  │  ├─ UI: #paramName, #paramType, #listElementType, #newParam
│  │  ├─ 核心函数: newParam, updateParamAtIndex, deleteParam
│  │  └─ 搜索词: paramType / listElementType / updateParamAtIndex
│  ├─ 参数渲染
│  │  ├─ 核心函数: refreshParams
│  │  └─ 保留字段: template / id / name / index
│  ├─ 列表参数
│  │  ├─ 核心函数: convertValueToList, getListElementTypeForParam
│  │  └─ 校验: collectListTypeViolations
│  ├─ 索引参数
│  │  ├─ UI: #indexTemplate, #indexParam
│  │  ├─ 核心函数: updateIndexTemplateOptions, updateIndexParamOptions
│  │  └─ 数据结构: parameterIndexes = { template, param, indexField }
│  └─ 索引跳转
│     └─ 搜索词: Alt+点击 / jump / parameterIndexes
├─ enum 体系
│  ├─ enum 模板识别
│  │  └─ 核心函数: isEnumTemplate
│  ├─ enum 值提取
│  │  ├─ 核心函数: getEnumParamKeysForInstance, getEnumDefinitions, getEnumDefinition
│  │  └─ 规则: 从 payload 的数字键 0,1,2... 提取
│  ├─ enum 缓存
│  │  ├─ 核心函数: saveEnumTemplateCache, loadEnumTemplateCache, clearEnumTemplateCache
│  │  └─ 存储位置: IndexedDB
│  └─ enum JSON
│     └─ 核心函数: buildEnumTemplateJson
├─ CSV
│  ├─ 导出
│  │  ├─ UI: #exportCsv, #confirmExportCsv, #cancelExportCsv
│  │  ├─ 核心函数: beginExportSelection, performExportCsv, buildCsvRowsForTemplate
│  │  └─ 落盘目录: dataEntity/csvoutput
│  ├─ 导入
│  │  ├─ UI: #importCsv
│  │  ├─ 核心函数: importFromCsv, parseCsvText, buildTemplateFromCsv, applyImportedTemplate
│  │  └─ 搜索词: CSV 必须包含 template / id / name / index
│  └─ 索引列协议
│     └─ 搜索词: parseIndexDataCell / parseIndexTypeCell / formatIndexCell
├─ 保存与落盘
│  ├─ 总入口
│  │  └─ 核心函数: saveAll
│  ├─ JSON 落盘
│  │  ├─ 核心函数: writeManifestForTemplates
│  │  └─ 输出: dataEntity/*.json + manifest.json
│  ├─ 结构变更判断
│  │  └─ 搜索词: hasTemplateStructureChanged / askCSharpReplacementBulk
│  ├─ 保存期校验
│  │  ├─ 重复 ID: collectDuplicateIdInfo
│  │  ├─ 列表类型错误: collectListTypeViolations
│  │  └─ 行为: 违规实例跳过写入并记日志
│  └─ 垃圾箱联动
│     └─ 搜索词: pendingTemplateDeletions / moveTemplateJsonToTrash
├─ Unity 生成链路
│  ├─ 普通模板 C#
│  │  ├─ 核心函数: generateCSContent
│  │  └─ 输出目录: csharpDate/
│  ├─ 枚举 C#
│  │  ├─ 核心函数: generateEnumCSFiles
│  │  └─ 输出目录: csharpDate/enums/
│  ├─ 运行时加载器
│  │  ├─ 核心函数: generateRuntimeLoaderArtifacts
│  │  └─ 输出: DataEntityRuntimeLoader.cs, DataEntityRuntimeTester.cs, DataEntityRuntimeTesterEditor.cs
│  └─ 手动重生成
│     ├─ UI: #regenerateCs
│     └─ 核心函数: regenerateCSharpStructures
├─ UE 生成链路
│  ├─ 头文件生成
│  │  ├─ 核心函数: generateUECppStructuresForCurrentTemplates
│  │  └─ 输出目录: cppmodel/
│  ├─ 枚举头文件
│  │  ├─ 核心函数: generateUEEnumHeaderFiles, buildUEEnumHeaderContent
│  │  └─ 输出目录: cppmodel/enum/
│  ├─ UE 命名规整
│  │  ├─ 核心函数: resolveUENameParts, registerUENameReplacement
│  │  └─ 搜索词: UE_NAME_PATTERN / invalidMessage
│  └─ 手动重生成
│     ├─ UI: #regenerateCpp
│     └─ 核心函数: regenerateCppStructures
├─ 日志与垃圾箱
│  ├─ 日志
│  │  ├─ UI: #viewLogs, #logOverlay, #logList
│  │  ├─ 核心函数: addLogEntry, renderLogs, clearLogEntries
│  │  └─ 搜索词: operationLogs
│  ├─ 垃圾箱
│  │  ├─ UI: #openTrash, #trashOverlay, #trashList
│  │  ├─ 核心函数: refreshTrashButtonState, openTrashOverlayPanel, restoreTemplateFromTrash
│  │  └─ 实际目录: dataEntity/toilet/
│  └─ 关闭/弹层行为
│     └─ 搜索词: logOverlay / trashOverlay
└─ 交互增强
   ├─ 搜索自动选中
   │  └─ 核心函数: filterList
   ├─ 快捷键
   │  └─ 搜索词: Ctrl+S / Ctrl+C / Ctrl+V / Delete / F1
   ├─ 夜间模式
   │  └─ UI: #toggleDark
   └─ 面板比例
      ├─ UI: #paramWidth, #rowHeight
      └─ 搜索词: paramWidth / rowHeight
```

## 常用检索建议

如果要快速定位某一类逻辑，优先在 `script.js` 里直接搜函数名或关键词：

- 工作区与启动：
  `rg -n "chooseDirectory|autoRestoreLastDirectory|persistEditorConfig" script.js`
- 模式切换：
  `rg -n "ENGINE_MODES|setEngineMode|setEditMode" script.js`
- 保存链路：
  `rg -n "saveAll|writeManifestForTemplates|moveTemplateJsonToTrash" script.js`
- CSV：
  `rg -n "importFromCsv|performExportCsv|buildTemplateFromCsv" script.js`
- enum：
  `rg -n "isEnumTemplate|getEnumDefinitions|saveEnumTemplateCache" script.js`
- Unity 生成：
  `rg -n "generateCSContent|generateEnumCSFiles|generateRuntimeLoaderArtifacts" script.js`
- UE 生成：
  `rg -n "generateUECppStructuresForCurrentTemplates|buildUEHeaderContent|generateUEEnumHeaderFiles" script.js`
- 日志和垃圾箱：
  `rg -n "addLogEntry|renderLogs|refreshTrashButtonState|restoreTemplateFromTrash" script.js`

## AI 阅读建议

- 先读 `index.html`，确认 UI 入口和按钮 id。
- 再读 `script.js` 里对应的事件绑定和核心函数。
- 若目标是“保存或生成”，从 `saveAll` 向下追。
- 若目标是“某个按钮做了什么”，从按钮 id 在事件绑定区反查。
- 若目标是“某个参数类型或 enum 的行为”，从 `refreshParams`、`getEnumDefinitions` 和 `parameterIndexes` 反查。
