# agent.md

## 目的

这个文件给 AI 或维护者一份“按当前工具能力反查实现”的索引。

当前仓库不再是单一的 Unity 小工具，而是一套本地数据表编辑与运行时代码生成工具链，包含：

- 浏览器中的数据表编辑器
- Unity / Godot C# / UE 三种引擎模式
- CSV 导入导出
- 三列编辑模式 + Luckysheet 表格模式
- 运行时代码生成
- Godot 项目一键初始化
- `Runtime/` 下的 EventBus / TickRunner 运行时框架
- `Docs/` 下的编辑器、运行时与参考文档

如果要改功能，优先查看 `database-editor/src/`；`database-editor/script.js` 只是打包产物，不应该作为主维护入口。

## 运行入口

- 浏览器运行入口：`index.html -> database-editor/script.js`
- 源码维护入口：`database-editor/src/main.js`
- 运行 bundle 重建脚本：`database-editor/build-runtime.ps1`

如果修改了 `database-editor/src/`，需要重新执行：

```powershell
.\database-editor\build-runtime.ps1
```

## 仓库结构

- `database-editor/src/`
  编辑器源码
- `database-editor/vendor/`
  Luckysheet 等前端依赖
- `Runtime/`
  EventBus / TickRunner 运行时框架
- `Docs/`
  编辑器说明、运行时文档、历史资料
- `index.html`
  浏览器 UI 容器与按钮入口
- `agent.md`
  当前这份维护索引

## 当前核心能力

### 编辑器能力

- 工作目录选择与自动恢复上次目录
- 维护 `dataEntity/` 下的模板 JSON
- 模板 / 实例 / 参数的新增、重命名、复制、粘贴、删除、多选
- 参数类型支持：
  - `string`
  - `int`
  - `float`
  - `long`
  - `bool`
  - `list`
  - `object`
  - 来自 `enum` 模板的枚举类型
- 索引参数配置与引用跳转
- 对比值展示
- 操作日志
- 垃圾箱恢复
- 暗色模式
- 参数栏宽度 / 行高调整

### 编辑视图

- 三列模式
  - 左列：模板
  - 中列：实例
  - 右列：参数
- 表格模式
  - 基于 Luckysheet
  - 支持按模板批量查看和编辑实例
  - 切换回三列模式或保存时会尝试提交表格改动
  - 能标记重复 ID 行

### 数据导入导出

- 导出 CSV
  - 支持按模板导出
  - 支持仅导出选中实例
- 导入 CSV
  - 支持一次导入多个 CSV
  - 通过 CSV 重建模板结构和实例数据

### 引擎模式

- `Unity`
- `Godot C#`
- `UE`

引擎模式会影响：

- 输出目录
- 生成脚本类型
- 按钮文案
- 保存后的生成行为
- 工作目录的校验规则
- 冲突产物的清理策略

## 当前工作目录约定

选择工作目录后，编辑器会维护这些目录或文件：

- `dataEntity/`
  模板 JSON
- `dataEntity/manifest.json`
  模板到 JSON 文件的映射
- `dataEntity/enum.json`
  `enum` 模板的聚合产物
- `dataEntity/toilet/`
  垃圾箱目录
- `dataEntity/csvoutput/`
  CSV 导出目录
- `dataEditorConfig/config.json`
  编辑器配置，当前主要记录引擎模式

### C# 输出目录

脚本输出根目录优先使用：

- `scripts/`
- 如果不存在则兼容 `Script/`

在 C# 模式下，具体输出为：

- Unity：`scripts/csharpDate/`
- Godot：`scripts/godotCsharpDate/`

Unity 模式还会创建：

- `scripts/csharpDate/Editor/`
- `scripts/csharpDate/modelstruct/`

Godot 模式还会创建：

- `scripts/godotCsharpDate/modelstruct/`

### UE 输出目录

- `cppmodel/`
- `cppmodel/enum/`

## 模块分层

### `database-editor/src/core`

- `app-mode.js`
  维护引擎模式与编辑模式状态
- `form-and-reference.js`
  参数基础规则、引用值包装/解包、列表元素类型规则

### `database-editor/src/domain`

- `template-normalizer.js`
  模板结构归一化、结构快照、结构变更判断、`indexField` 补齐
- `index-enum-validation.js`
  索引字段解析、重复 ID / 重复索引检测、`enum` 模板规则、枚举定义提取
- `editor-actions.js`
  参数值层面的纯逻辑，如默认值生成、类型转换、列表校验

### `database-editor/src/services`

- `workspace-storage.js`
  工作目录访问、目录校验、配置存取、IndexedDB 句柄缓存、冲突产物清理、Godot 快速初始化
- `template-persistence.js`
  模板加载、保存、`manifest.json` / `enum.json` 写入、运行时代码生成触发、垃圾箱恢复
- `csv-service.js`
  CSV 导入导出、CSV 与模板结构互转

### `database-editor/src/generators`

- `csharp-runtime-generator.js`
  Unity / 通用 C# 数据结构、运行时加载器、测试器、说明文件生成
- `godot-runtime-generator.js`
  Godot C# 版本的运行时加载器与测试器生成
- `godot-project-bootstrap-generator.js`
  Godot 项目快速初始化需要的运行时脚本、场景模板、默认模板内容
- `ue-generator.js`
  UE `.h`、枚举头、`DataRefTypes.h` 生成与命名规整

### `database-editor/src/ui`

- `panels.js`
  三列模式的主渲染与局部刷新
- `interaction.js`
  复制、粘贴、删除、多选、拖选、搜索、快捷键、参数历史
- `sheet-mode.js`
  Luckysheet 表格模式、工作簿构建、表格回写、重复 ID 高亮
- `system-panels.js`
  消息提示、日志面板、垃圾箱面板

## 保存与生成行为

保存主入口是 `template-persistence.js -> saveAll()`。

保存时会做这些事：

- 提交表格模式下尚未落盘的内容
- 校验模板与实例数据
- 将普通模板写入 `dataEntity/<模板名>.json`
- 维护 `manifest.json`
- 维护 `enum.json`
- 处理垃圾箱与已删除模板
- 在当前引擎模式下生成对应代码产物

### Unity 模式

会生成或更新：

- `scripts/csharpDate/*.cs`
- `scripts/csharpDate/modelstruct/DataEntityRuntimeLoader.cs`
- `scripts/csharpDate/modelstruct/DataEntityRuntimeLoaderGuide.txt`
- `scripts/csharpDate/DataEntityRuntimeTester.cs`
- `scripts/csharpDate/modelstruct/DataEntityRuntimeTesterGuide.txt`
- `scripts/csharpDate/Editor/DataEntityRuntimeTesterEditor.cs`

### Godot C# 模式

会生成或更新：

- `scripts/godotCsharpDate/*.cs`
- `scripts/godotCsharpDate/modelstruct/DataEntityRuntimeLoader.cs`
- `scripts/godotCsharpDate/modelstruct/DataEntityRuntimeLoaderGuide.txt`
- `scripts/godotCsharpDate/DataEntityRuntimeTester.cs`
- `scripts/godotCsharpDate/modelstruct/DataEntityRuntimeTesterGuide.txt`

### UE 模式

会生成或更新：

- `cppmodel/*.h`
- `cppmodel/enum/*.h`
- `cppmodel/DataRefTypes.h`

### 冲突产物清理

切换模式后执行保存或重新生成时，会清理其他模式的产物：

- Unity 模式会清理 Godot 和 UE 产物
- Godot 模式会清理 Unity 和 UE 产物
- UE 模式会清理 Unity 和 Godot 产物

相关逻辑在 `workspace-storage.js -> cleanConflictingEngineArtifacts()`。

## Godot 快速初始化

这是当前工具新增的重要能力，入口按钮是：

- `index.html` 中的 `godotQuickInit`

仅在 `Godot C#` 模式下显示并可用。

主要逻辑在：

- `database-editor/src/services/workspace-storage.js -> initializeGodotProjectConfiguration()`
- `database-editor/src/generators/godot-project-bootstrap-generator.js`

它会做这些事：

- 确保 Godot C# 输出目录存在
- 生成运行时加载器与测试器
- 向脚本输出目录注入 Godot 运行时文件
- 准备默认模板：
  - `systemInitOrder`
  - `systemEvent`
- 创建或复用 `prefab/`
- 生成场景：
  - `prefab/GameRoot.tscn`
  - `prefab/ObjectBase.tscn`

运行时文件会落到类似目录：

- `scripts/EventBusTickRunner/Shared/...`
- `scripts/EventBusTickRunner/Godot/...`

如果目标文件已存在：

- 内容相同则复用
- 内容不同则跳过覆盖，保留用户自定义文件

## enum 模板机制

`enum` 模板是特殊模板，相关规则主要在 `index-enum-validation.js`：

- `enum` 模板具有特殊语义
- 会参与枚举类型下拉选项构建
- 会生成 `enum.json`
- 会参与 Unity / Godot / UE 的枚举代码生成
- IndexedDB 中还有 `enum` 模板缓存逻辑，避免缺失时完全丢失

## CSV / 表格模式重点入口

### CSV

优先查看：

1. `database-editor/src/services/csv-service.js`
2. `database-editor/src/services/template-persistence.js`

重点关键词：

- `buildCsvRowsForTemplate`
- `buildTemplateFromCsv`
- `performExportCsv`
- `importFromCsv`

### 表格模式

优先查看：

1. `database-editor/src/ui/sheet-mode.js`
2. `database-editor/src/main.js`

重点关键词：

- `commitActiveSheetEdits`
- `renderLuckysheetForActiveInstance`
- `updateSheetTemplateNav`
- `sheetModeDirty`

## 快速排查指引

### 想看“编辑器是怎么启动的”

1. `database-editor/src/main.js`
2. `database-editor/src/core/app-mode.js`
3. `database-editor/src/services/workspace-storage.js`

重点关键词：

- `bootstrapLegacyApp`
- `chooseDirectory`
- `autoRestoreLastDirectory`
- `setEditMode`
- `setEngineMode`

### 想看“保存时到底写了什么”

1. `database-editor/src/services/template-persistence.js`
2. `database-editor/src/generators/csharp-runtime-generator.js`
3. `database-editor/src/generators/godot-runtime-generator.js`
4. `database-editor/src/generators/ue-generator.js`

重点关键词：

- `saveAll`
- `writeManifestForTemplates`
- `generateRuntimeLoaderArtifacts`
- `generateUECppStructuresForCurrentTemplates`

### 想看“Godot 一键初始化做了什么”

1. `database-editor/src/services/workspace-storage.js`
2. `database-editor/src/generators/godot-project-bootstrap-generator.js`

重点关键词：

- `initializeGodotProjectConfiguration`
- `injectGodotRuntimeFiles`
- `ensureSystemInitOrderTemplate`
- `ensureSystemEventTemplate`
- `injectGameRootScene`
- `injectObjectBaseScene`

### 想看“索引参数 / enum / list 为什么这样表现”

1. `database-editor/src/domain/index-enum-validation.js`
2. `database-editor/src/domain/editor-actions.js`
3. `database-editor/src/core/form-and-reference.js`
4. `database-editor/src/ui/panels.js`

重点关键词：

- `parameterIndexes`
- `isEnumTemplate`
- `getEnumDefinitions`
- `collectDuplicateIdInfo`
- `collectListTypeViolations`
- `wrapReferencePayload`

## 维护建议

- 改业务规则，优先看 `domain` / `core`
- 改目录、文件、保存、生成流程，优先看 `services`
- 改按钮、面板、交互、快捷键，优先看 `ui`
- 改 Unity / Godot / UE 代码生成，优先看 `generators`
- 改完源码后别忘了重建 `database-editor/script.js`

## 备注

- `window.LegacyApp.modules` 仍然保留，方便旧调用路径兼容
- 真正活跃的维护入口仍然是 `database-editor/src/main.js`
- 旧版 README 或历史文档里若与当前实现冲突，以 `database-editor/src/` 和 `index.html` 为准

## 2026-04 Godot 对象快照更新

- Godot 一键初始化现在会默认注入 `ObjectSnapshotSystem + ObjectRoot + LocalEventBus`。
- 运行时新增对象快照接口：`IObjectSnapshotSystem`、`IObjectSnapshotRegion`、`IRequireObjectSnapshotRegion`、`IObjectSnapshotSync`。
- `IObjectRuntime` 新增 `GetObjectSnapshotSystem()`。
- `ObjectRoot` 会在模块 `Init(...)` 前执行快照区域注入，并在 `Tick()` 后自动同步实现了 `IObjectSnapshotSync` 的对象。
- 玩家控制器相关术语统一为：`PlayerAttributeSystem` 负责属性链路，`ObjectSnapshotSystem` 负责对象快照，二者不是同一个东西。
- Godot 快速初始化的源码入口仍然是 `database-editor/src/generators/godot-project-bootstrap-generator.js`，运行时镜像目录是 `Runtime/Shared/Contracts` 和 `Runtime/Godot/Nodes`。