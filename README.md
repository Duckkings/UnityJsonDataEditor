# Unity Json Data Editor

这是一个面向游戏数据表的本地浏览器编辑器。它以 `dataEntity/*.json` 为核心数据源，支持三种生成模式：

- `Unity`：生成 C# 数据结构、枚举、运行时读取器和 Unity 调试脚本。
- `Godot C#`：生成 C# 数据结构、运行时读取器，并提供当前最完整的一键初始化流程。
- `UE`：生成 Unreal Engine 可用的 C++ 头文件、枚举头文件和 `FDataRef` 引用结构。

仓库内还带有跨引擎运行时：`Runtime/Shared` 提供 `EventBus`、`RootTickRunner`、服务注册、数据表适配接口等核心逻辑，`Runtime/Unity` 和 `Runtime/Godot` 分别提供引擎外壳。

## 当前完成度

| 模式 | 当前状态 | 已完成内容 | 仍需手工处理/未完成 |
| --- | --- | --- | --- |
| Godot C# | 完成度最高 | 数据结构生成、`DataEntityRuntimeLoader`、`DataTableProvider`、`EventBus`、`RootTickRunner`、`ObjectRoot`、`ObjectSnapshotSystem`、`GameRoot.tscn`、`ObjectBase.tscn`、基础数据表一键注入 | 业务模块仍需你自己编写；Godot 项目需可用的 C# 与 `Newtonsoft.Json` |
| Unity | 基础运行时可用 | C# 数据结构、枚举、`DataEntityRuntimeLoader`、`DataEntityRuntimeTester`、Unity 自定义 Inspector、`Runtime/Shared + Runtime/Unity` 可接入 | 没有 Godot 那种场景/Prefab 一键初始化；`RootTickRunner` 与 `EventBus` 需要手动挂到场景 |
| UE | 代码生成阶段可用 | `cppmodel/*.h`、`cppmodel/enum/*.h`、`DataRefTypes.h`、名称不合规替换日志 | 当前没有 UE 侧 JSON 运行时加载器、TickRunner/EventBus 运行时外壳，也没有自动创建 DataAsset |

说明：当前源码里，严格意义的“Godot 项目一键初始化”按钮只在 Godot C# 模式显示；Unity/UE 当前是按模式生成代码产物，不是完整项目初始化。

## 快速开始

1. 用支持 File System Access API 的浏览器打开 `index.html`，建议 Chrome 或 Edge。
2. 点击“选择工作目录”，让编辑器绑定你的数据工作区。
3. 点击“切换模式”，在 `Unity / Godot C# / UE` 中选择目标引擎。
4. 在三列模式或表格模式编辑模板、实例、参数。
5. 选择保存方式后点击保存（`Ctrl+S` 使用同一选项）：默认“只保存数据”，需要同步代码时选择“保存并刷新脚本”。
6. Godot C# 模式下可额外点击 Godot 一键初始化，自动写入运行时脚本、场景和基础表。

### 保存方式与冲突检查

- **只保存数据（默认）**：保存模板 JSON、`enum.json`、`manifest.json`、编辑器配置，并处理模板垃圾箱；不生成、覆盖或删除 C# / C++ 脚本，也不清理其他引擎的输出目录。删除模板后，对应旧脚本仍保留。
- **保存并刷新脚本**：执行当前引擎的代码生成及冲突目录清理。C# 替换提示中选择“只保存 JSON”也会跳过全部脚本生成和清理。
- 修改字段、类型、枚举或新增模板后，只保存数据可能使代码与数据结构不同步；需要时再生成脚本。
- 保存前校验所有模板。重复 ID、无效列表、重名/非法文件名或加载异常会阻止保存，不再剔除错误实例后写盘。
- 编辑器加载后，外部工具或 AI 对 `dataEntity` JSON 的新增、修改、删除会阻止旧内容覆盖磁盘。先备份尚未保存的编辑内容，再点击“刷新”重新加载核对。一键初始化等直接写盘操作后也应刷新。
- 保存不是跨文件事务：权限、磁盘空间等错误可能造成部分文件已写入。失败时会保留未保存状态并显示原因，请检查文件后重试。

回归验证：`node --test database-editor/tests/save.test.mjs`。可设置 `PAS_DATA_DIR` 读取真实项目表并在内存中验证保存，测试不会写入目标项目。

### 当前 PAS 运行时注入源

Godot C# 保存刷新与一键初始化的通用脚本已同步为 PAS 当前版本。正式注入源位于 `Runtime/GodotProject/`，包含完整 EventBus / TickRunner / ObjectRoot / ObjectSnapshot、UI 接口与通用 UI 系统，以及数据模型、加载器、测试器和说明文件；`manifest.json` 记录逐文件来源与 SHA-256。旧 `Runtime/Shared`、`Runtime/Godot` 分文件示例不作为当前一键注入源，不应与整包注入同时加入项目，以免类型重复。

新项目选择 Godot C# 模式后，点击“一键初始化配置”：注入框架和 UI 脚本，创建基础表及 `GameRoot.tscn` / `ObjectBase.tscn`。新 GameRoot 默认挂载 `UiSystemModule`，声明表与场景一致，不再留下阻塞初始化的 `examplesystem` 占位记录。模块声明支持 `uiPrefabPath`、`uiPriority`。

初始化会检查工作目录的 `.csproj`，补齐缺失的 `Newtonsoft.Json` 与 `EnableDynamicLoading=true`，保留原 SDK、目标框架和已有包版本；无 `.csproj` 时按项目程序集名称创建 Godot 4.6.1 / .NET 8 的配置。仍需安装对应 Godot .NET 版本和 .NET SDK；工具不会安装引擎、复制 PAS 业务模块或修改既有场景与表实例。已有框架脚本和说明文件会由“一键初始化”更新。

以后 PAS 的通用框架更新后，可在工具根目录执行 `./database-editor/sync-pas-runtime.ps1 -ProjectRoot C:/Project/PASgodot`，同步这组明确列出的源文件并重建浏览器运行文件。普通重建会校验快照哈希，避免忘记同步或手动修改快照后混入旧代码。

验证命令：`node --test database-editor/tests/*.test.mjs`；`node database-editor/tests/emit-bootstrap-fixture.mjs` 会在工具仓库的 `.validation/godot-bootstrap/` 生成最小验收工程，可执行 `dotnet build` 并用 Godot .NET 无头运行。该验收覆盖数据加载、UI 服务、快照绑定与同步、动态模块替换、对象与根框架释放，不使用 PAS 的业务脚本。

## 一键生成/导入产物

### 公共数据目录

三种模式都会维护：

- `dataEntity/`：模板 JSON 数据目录。
- `dataEntity/manifest.json`：非 `enum` 模板到 JSON 文件的清单。
- `dataEntity/toilet/`：删除模板后的回收目录。
- `dataEntity/csvoutput/`：CSV 导出目录。
- `dataEditorConfig/config.json`：编辑器配置，包含当前引擎模式等状态。

### Unity 模式

Unity 模式生成：

- `csharpDate/*.cs`：每个普通模板对应一个 C# 数据类。
- `csharpDate/enums/*.cs`：由 `enum` 模板生成的 C# 枚举。
- `csharpDate/modelstruct/modelCsharpe.cs`：表结构、参数定义、`DataRef` 等共享模型。
- `csharpDate/modelstruct/DataEntityRuntimeLoader.cs`：运行时读取 `dataEntity` 的统一入口。
- `csharpDate/modelstruct/DataEntityRuntimeLoaderGuide.txt`：读取器说明。
- `csharpDate/DataEntityRuntimeTester.cs`：运行时调试脚本。
- `csharpDate/Editor/DataEntityRuntimeTesterEditor.cs`：Unity Inspector 调试面板。

Unity 运行时接入还需要把仓库里的这些目录放入 Unity 工程：

- `Runtime/Shared/`
- `Runtime/Unity/`

最小场景结构：

```text
GameRoot
  RootTickRunner
  EventBus
```

`RootTickRunner` 会初始化 `DataEntityRuntimeLoader`、创建 `DataEntityRuntimeAdapter`、初始化 `EventBus`，再通过 `systemModuleDeclare` 驱动系统模块注册、初始化和 Tick。

### Godot C# 模式

Godot C# 模式普通生成会写入：

- `godotCsharpDate/*.cs`
- `godotCsharpDate/enums/*.cs`
- `godotCsharpDate/modelstruct/modelCsharpe.cs`
- `godotCsharpDate/modelstruct/DataEntityRuntimeLoader.cs`
- `godotCsharpDate/DataEntityRuntimeTester.cs`

Godot 一键初始化额外写入：

- `scripts/EventBusTickRunner/Shared/GameFrameworkRuntime.cs`
- `scripts/EventBusTickRunner/Godot/GodotRuntimeSupport.cs`
- `scripts/EventBusTickRunner/Godot/GodotEventBusNode.cs`
- `scripts/EventBusTickRunner/Godot/GodotObjectModuleBase.cs`
- `scripts/EventBusTickRunner/Godot/GodotObjectSnapshotSystemNode.cs`
- `scripts/EventBusTickRunner/Godot/GodotObjectRootNode.cs`
- `scripts/EventBusTickRunner/Godot/GodotRootTickRunnerNode.cs`
- `scripts/EventBusTickRunner/Godot/DataTableProvider.cs`
- `scripts/godotCsharpDate/TickRunnerEventBusApiGuide.md`
- `prefab/GameRoot.tscn`
- `prefab/ObjectBase.tscn`
- `dataEntity/systemModuleDeclare.json`
- `dataEntity/systemEvent.json`
- `dataEntity/systemEventTag.json`
- `dataEntity/eventBusInitFilter.json`
- `dataEntity/moduleDeclare.json`

`GameRoot.tscn` 默认包含：

```text
GameRoot
  EventBus
  DataTableProvider
```

`ObjectBase.tscn` 默认包含：

```text
ObjectBase
  ObjectSnapshotSystem
  ObjectRoot
  LocalEventBus
```

再次执行 Godot 一键初始化时，工具会更新自己管理的运行时脚本和说明；对已存在且内容不同的模板/场景，会尽量保留用户已有配置。

### UE 模式

UE 模式生成：

- `cppmodel/DataRefTypes.h`：`FDataRef` 引用结构。
- `cppmodel/<Template>.h`：普通模板对应的 `USTRUCT` 行结构和 `UDataAsset` 容器类。
- `cppmodel/enum/*.h`：由 `enum` 模板生成的 `UENUM`。

当前 UE 模式不会生成运行时 JSON 加载器，也不会自动生成 `.uasset`。它适合先把数据结构同步到 UE 工程，再由项目侧继续接入导入、转换或运行时读取流程。

## 模块 README

主运行时模块说明在这里，可以点进去看更细的接入方式：

- [DataEntityRuntimeLoader](Docs/modules/data-entity-runtime/README.md)
- [EventBus](Docs/modules/eventbus/README.md)
- [RootTickRunner](Docs/modules/root-tick-runner/README.md)
- [ModuleDeclareRuntime](Docs/modules/module-declare-runtime/README.md)
- [Godot ObjectRoot](Docs/modules/godot-object-root/README.md)
- [ObjectSnapshotSystem](Docs/modules/object-snapshot-system/README.md)
- [UE C++ Output](Docs/modules/ue-cpp-output/README.md)

## 基础数据表

### `systemModuleDeclare`

全局系统模块声明表。当前 `RootTickRunnerCore` 默认读取它，缺失时可回退旧表 `systemInitOrder`。

字段：

- `moduleKey`：模块名，需匹配 `ISystemModule.Name`。
- `priority`：优先级，数值越大越先初始化和 Tick。
- `ticktype`：`0 = Update`，`1 = LateUpdate`。
- `tags`：模块标签，当前运行时会解析保存，主要作为后续模块筛选/扩展入口。

排序规则：

1. `priority` 降序。
2. `priority` 相同时，`id` 升序。

### `moduleDeclare`

Godot 对象域模块声明表。`ObjectBase.tscn` 默认把 `ObjectRoot.ModuleDeclareTableTemplateName` 指向 `moduleDeclare`。

字段：

- `moduleKey`：模块名，需匹配 `IObjectModule.Name`。
- `tags`：对象模块标签。
- `priority`：对象模块优先级，会覆盖模块脚本自身的 `TickPriority`。

### `systemEvent`

事件声明表。字段：

- `name`：事件名。
- `tags`：事件标签表达式。

### `systemEventTag`

事件标签表。字段：

- `name`：标签名。
- `description`：标签说明。

### `eventBusInitFilter`

EventBus 初始化过滤表。字段：

- `name`：过滤配置名，例如默认的 `global_world_bus`。
- `filters`：过滤表达式。

过滤语义：

- `filters` 为空：加载 `systemEvent` 中所有事件。
- 使用 `;` 分隔多个过滤条件，条件之间是 OR。
- 单个条件内用 `|` 或 `,` 分隔标签，标签之间是 AND。

例如 `combat|ui;network` 表示：加载同时带 `combat` 与 `ui` 的事件，或加载带 `network` 的事件。

## 推荐接入顺序

Godot C#：

1. 切到 Godot C# 模式。
2. 点击 Godot 一键初始化。
3. 确认 Godot 项目能编译 C#，并已准备 `Newtonsoft.Json`。
4. 在 `systemModuleDeclare` 声明全局系统模块。
5. 在 `ObjectBase` 下添加业务对象模块，并在 `moduleDeclare` 声明对象模块优先级。

Unity：

1. 切到 Unity 模式并生成 C# 代码。
2. 把 `dataEntity/`、`csharpDate/`、`Runtime/Shared/`、`Runtime/Unity/` 放入 Unity 工程。
3. 场景中挂 `RootTickRunner` 和 `EventBus`。
4. 填写 `systemModuleDeclare`、`systemEvent`、`systemEventTag`。
5. 业务模块实现 `ISystemModule` 并调用 `RootTickRunner.Instance.RegisterModule(this)`。

UE：

1. 切到 UE 模式。
2. 保存或重新生成 C++ 结构。
3. 把 `cppmodel/` 合并到 UE 工程的合适模块中。
4. 项目侧继续处理 JSON 导入、DataAsset 生成或运行时读取。

## 已知边界

- Godot 一键初始化最完整；Unity/UE 当前不提供同级别项目初始化。
- Unity 目前只有全局 `RootTickRunner/EventBus` 外壳，Godot 专属的 `ObjectRoot/ObjectSnapshotSystem` 没有 Unity 外壳。
- UE 目前只有头文件生成，没有运行时加载器和 Tick/EventBus 运行时。
- 旧表 `systemInitOrder` 仍可回退读取，但新项目建议使用 `systemModuleDeclare`。
- 当前根 README 以源码实现为准，不以旧版文档为准。

## 来源

本文根据当前仓库源码整理：

- 三种模式与 UI：`database-editor/src/main.js:120`、`database-editor/src/main.js:705`
- 工作区目录与模式产物：`database-editor/src/services/workspace-storage.js:797`、`database-editor/src/services/workspace-storage.js:1320`
- C# 生成器：`database-editor/src/generators/csharp-runtime-generator.js:1805`
- Godot 一键初始化文件：`database-editor/src/generators/godot-project-bootstrap-generator.js:3130`、`database-editor/src/generators/godot-project-bootstrap-generator.js:3263`
- Godot 基础表模板：`database-editor/src/generators/godot-project-bootstrap-generator.js:3319`
- UE 头文件生成器：`database-editor/src/generators/ue-generator.js:400`
- RootTickRunner：`Runtime/Shared/Core/RootTickRunnerCore.cs:44`
- EventBus：`Runtime/Shared/Core/EventBusCore.cs:52`
- Godot ObjectRoot：`Runtime/Godot/Nodes/GodotObjectRootNode.cs:177`
- ObjectSnapshotSystem：`Runtime/Godot/Nodes/GodotObjectSnapshotSystemNode.cs:60`
