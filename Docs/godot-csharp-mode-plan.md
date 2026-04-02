# Godot C# 模式方案与实施记录

## 目标

以现有 `Unity` 模式为参考，新增一个独立的 `Godot C#` 模式，让工具在不影响原有编辑功能的前提下，能够输出 Godot 可用的运行时脚本与调试脚本。

本次方案刻意把改动限制在以下范围：

- 模式枚举、切换与 UI 文案
- 工作目录子目录规则
- 保存时的 C# 生成链路
- Godot 运行时脚本生成
- 方案文档

不涉及 CSV、三列编辑、表格模式、垃圾箱、模板/实例/参数编辑等无关功能逻辑。

## 1 号分析结果：当前 Unity 模式的运行时链路

### Unity 运行时相关文件

- `csharpDate/modelstruct/modelCsharpe.cs`
  - 共享数据结构：`TableSchema`、`ParamDef`、`ParameterIndexBinding`、`DataRef` 等。
  - 这一层本质上与引擎无关，可以被 Unity / Godot 共同复用。

- `csharpDate/modelstruct/DataEntityRuntimeLoader.cs`
  - 运行时 JSON 加载器。
  - 负责读取 `manifest.json`、各模板 JSON、建立 `SchemaCache`、解析 `DataRef` 引用。
  - Unity 依赖点主要在：
    - `Application.dataPath`
    - `Debug.Log / LogError`
    - `EditorApplication.isPaused`

- `csharpDate/DataEntityRuntimeTester.cs`
  - Unity 侧调试脚本。
  - 继承 `MonoBehaviour`，用 `[SerializeField]` 暴露字段，允许初始化、重载和单次取值验证。

- `Editor/DataEntityRuntimeTesterEditor.cs`
  - Unity 自定义 Inspector。
  - 这个脚本完全是 Unity Editor 侧能力，Godot 不应复用。

### Unity 模式在工具内的生成链路

- `src/core/app-mode.js`
  - 维护当前引擎模式与模式切换行为。

- `src/services/workspace-storage.js`
  - 根据当前模式创建/校验工作目录。
  - Unity 下会维护 `csharpDate/` 与 `Editor/`。

- `src/services/template-persistence.js`
  - 保存 JSON、枚举、C# 结构脚本，并在保存后触发运行时脚本生成。
  - C# 保存计划原本只面向 Unity，需要扩展成“所有 C# 模式”共用。

- `src/generators/csharp-runtime-generator.js`
  - 生成普通模板类、枚举、`modelCsharpe.cs`，以及 Unity 运行时脚本。

- `src/generators/godot-runtime-generator.js`
  - 本次新增/接入的 Godot 运行时脚本生成器。

## 2 号审阅结果：阻断问题与注意事项

### 阻断问题

- 如果 Godot 产物继续写进 `csharpDate/`，会和 Unity 模式互相覆盖。
  - 结论：Godot 使用独立目录 `godotCsharpDate/`。

- 如果把 `DataEntityRuntimeTesterGuide.txt` 写到 `godotCsharpDate/` 根目录，会被工作目录校验拦住。
  - 根因：C# 产物根目录只允许 `.cs` 文件。
  - 结论：说明文件写入 `modelstruct/` 子目录。

- Godot 运行时代码如果直接照抄 Unity 版本，会卡在以下 API：
  - `Application.dataPath`
  - `Debug.Log*`
  - `MonoBehaviour`
  - `[SerializeField]`
  - `UnityEditor` / `EditorApplication`

### 注意事项

- Godot 模式应被视为“第三种引擎模式”，不是 UE 分支的变体。
- C# 数据结构生成仍可复用 Unity 的模板类/枚举生成逻辑。
- Godot 运行时说明里必须明确：项目需要引入 `Newtonsoft.Json`。
- 不应因为新增 Godot 模式而改写现有工具编辑体验。

### 允许改动

- `ENGINE_MODES`、模式切换顺序、按钮文案
- `workspace-storage` 中与目录创建/清理/校验有关的代码
- `template-persistence` 中与 C# 保存计划和运行时生成有关的代码
- `csharp-runtime-generator` / `godot-runtime-generator`

### 不应波及

- CSV 导入导出
- 垃圾箱交互与数据恢复逻辑本身
- Luckysheet / 表格模式编辑
- 模板、实例、参数的增删改核心行为

## 3 号修订方案：最终技术方案

### 模式与目录策略

- 新增引擎模式：`godot`
- 模式循环顺序：`Unity -> Godot C# -> UE -> Unity`
- 工作目录产物：
  - Unity：`csharpDate/`、`Editor/`
  - Godot：`godotCsharpDate/`
  - UE：`cppmodel/`

### 保存与生成策略

- 将“C# 保存计划”从 Unity 专属扩展为 C# 模式共用：
  - Unity 与 Godot 都参与 `.cs` 结构变化判断
  - UE 仍走原有 C++ 链路

- 普通模板类与枚举：
  - 继续由现有 C# 生成逻辑生成
  - Unity / Godot 共用结构定义

- Godot 运行时脚本：
  - 独立由 `src/generators/godot-runtime-generator.js` 生成
  - 但内部复用 `csharp-runtime-generator.js` 暴露的 Godot 版本构建函数

### Unity 到 Godot 的 API 替换表

- `Application.dataPath` -> 默认读取 `res://dataEntity`
- `Debug.Log` -> `GD.Print`
- `Debug.LogWarning` -> `GD.PushWarning`
- `Debug.LogError` -> `GD.PushError` 或 `GD.PrintErr`
- `MonoBehaviour` -> `Node`
- `[SerializeField]` -> `[Export]`
- Unity 自定义 Inspector -> 不生成；改为导出字段 + `ExecuteSelectedOperation()`
- `EditorApplication.isPaused` -> 删除，不在 Godot 中模拟

### Godot 运行时脚本布局

- `godotCsharpDate/modelstruct/modelCsharpe.cs`
- `godotCsharpDate/modelstruct/DataEntityRuntimeLoader.cs`
- `godotCsharpDate/modelstruct/DataEntityRuntimeLoaderGuide.txt`
- `godotCsharpDate/DataEntityRuntimeTester.cs`
- `godotCsharpDate/modelstruct/DataEntityRuntimeTesterGuide.txt`

## 4 号实施结果

已按上述方案落地以下方向：

- 新增 `Godot C#` 模式枚举与模式切换
- 让“重新生成 C# 数据结构脚本”按钮同时服务 Unity / Godot
- 将工作目录规则扩展为 `godotCsharpDate/`
- 将保存链路扩展为“C# 模式共用”
- 接入 Godot 运行时脚本生成器
- 修正 Godot 说明文件输出位置，避免破坏目录校验

## 5 号范围审查

本次实现允许触达的代码集中在：

- `src/core/app-mode.js`
- `src/main.js`
- `src/services/workspace-storage.js`
- `src/services/template-persistence.js`
- `src/generators/csharp-runtime-generator.js`
- `src/generators/godot-runtime-generator.js`
- `Docs/`

未主动修改：

- `src/services/csv-service.js`
- `src/ui/*`
- 业务数据结构校验逻辑
- 非模式相关的编辑器功能

## 6 号复审清单

提交前需要再次确认：

- `Unity` 模式仍写入 `csharpDate/` + `Editor/`
- `Godot C#` 模式只写入 `godotCsharpDate/`
- `UE` 模式仍只写入 `cppmodel/`
- Godot 生成的说明文件不落在 `godotCsharpDate/` 根目录
- 保存流程在 Unity / Godot / UE 三种模式下都不会误删当前模式产物
- `build-runtime.ps1` 能正常重新打包 `script.js`

## 残余风险

- Godot 运行时当前仍依赖 `Newtonsoft.Json`，目标项目需要自行安装该依赖。
- `res://` 路径与绝对路径的运行行为需要在真实 Godot 项目里再做一次集成验证。
- 仓库当前已有部分 Godot 草稿代码，本次实现以“收口并接通主链路”为主，后续仍建议清理未使用的草稿函数。
