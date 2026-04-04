# Godot C# 方案

## 目标

以现有 `Unity` 模式为参考，在不破坏当前工具主体功能的前提下，新增 `Godot C#` 生成模式，并让运行时相关脚本切换为 Godot 可用版本。

本方案只覆盖和 `Godot C#` 新增直接相关的内容，不重做三列编辑、表格编辑、CSV、垃圾箱等主体功能。

## 现有 Unity 基线

当前 Unity 模式的 C# 链路可以拆成两层。

第一层是通用 C# 结构生成：

- 模板 `.cs`
- 枚举 `.cs`
- `modelstruct/modelCsharpe.cs`

第二层是 Unity 专属运行时产物：

- `DataEntityRuntimeLoader.cs`
- `DataEntityRuntimeLoaderGuide.txt`
- `DataEntityRuntimeTester.cs`
- `Editor/DataEntityRuntimeTesterEditor.cs`
- `Editor/DataEntityRuntimeTesterGuide.txt`

Godot C# 模式应复用第一层，只替换第二层的运行时实现与输出目录规则。

## 目录约定

建议把 Godot C# 的运行时输出和 Unity 运行时输出分开，避免互相污染。

- Unity 输出保留在 `csharpDate/`
- Godot C# 输出放到 `godotCsharpDate/`
- UE 输出继续保留在 `cppmodel/`

Godot C# 模式下不应再生成 Unity 的 `Editor/` 目录产物。

## 运行时脚本替换原则

Godot 运行时脚本不是简单改几个类型名，而是要把 Unity 依赖剥离出去，再按 Godot 的运行时模型重写。

### Loader 侧

需要从 Unity 版本替换为 Godot 可用实现：

- `using UnityEngine;` 改为 `using Godot;`
- `Application.dataPath` 改为 Godot 可解析的数据目录
- `Debug.Log / Debug.LogWarning / Debug.LogError` 改为 `GD.Print / GD.PushWarning / GD.PushError`
- 删除 `UnityEditor` 相关逻辑
- 删除 `EditorApplication.isPaused` 相关逻辑
- 保留 `manifest.json` 和模板 JSON 的读取语义

### Tester 侧

需要把 Unity 的 `MonoBehaviour` 测试脚本改为 Godot 的 `Node` 脚本：

- `MonoBehaviour` 改为 `Node`
- `[SerializeField] private` 改为 Godot 的导出字段
- Unity 自定义 Inspector 按钮改成 Godot 可用的导出字段 + `_Ready()` / 自定义调试入口
- 调试输出统一改为 Godot 的打印接口

### 共享接口

以下数据访问接口应尽量保持一致，方便业务代码迁移：

- `DataEntityRuntimeLoader.Initialize`
- `DataEntityRuntimeLoader.Reload`
- `DataEntityRuntimeLoader.GetValue`
- `DataEntityRuntimeLoader.GetIndexReference`
- `DataEntityRuntimeLoader.GetIndexValue`

## 允许改动范围

允许改动的区域只有这些：

- `src/core/app-mode.js`
- `src/main.js`
- `src/services/workspace-storage.js`
- `src/services/template-persistence.js`
- `src/generators/csharp-runtime-generator.js`
- `src/generators/godot-runtime-generator.js`
- `Docs/` 下的方案文档
- 打包后的 `script.js`

允许做的事情：

- 新增 `ENGINE_MODES.GODOT`
- 新增 `isGodotMode` 和 `isCSharpMode`
- 让 C# 生成链路同时支持 Unity 和 Godot
- 新增 Godot 运行时生成器
- 新增 Godot 方案文档

## 不允许改动范围

不要因为新增 Godot 模式去动这些主体功能：

- 三列编辑核心逻辑
- 表格编辑核心逻辑
- CSV 导入导出
- 垃圾箱恢复逻辑
- 模板、实例、参数的基础编辑规则
- UE 命名校验和 UE 头文件生成逻辑
- `dataEntity/manifest.json` 格式
- 非 Godot 场景下的现有保存行为

## 阻断项

下面这些问题如果不先确认，会直接影响 Godot C# 落地：

1. Godot C# 项目是否已经准备好 `Newtonsoft.Json` 依赖。
2. Godot 侧是否接受单独的运行时调试脚本，还是只需要生成可复用的 Loader。
3. Godot 输出目录是否固定为 `godotCsharpDate/`，还是要改成别的项目约定。
4. Godot 是否需要 Unity 那种 Editor 按钮式调试体验。

## 实施建议

推荐把 Unity 和 Godot 的差异收敛成三层：

1. 模式层决定当前是 Unity、Godot C# 还是 UE。
2. 保存层决定走哪条 C# 生成计划。
3. 运行时生成层分别输出 Unity 版和 Godot 版脚本。

这样可以保证模板数据结构、CSV、垃圾箱和其他编辑功能都保持原样，只扩展 C# 运行时的分支。

## 验收点

完成后至少应满足这些结果：

- Unity 模式仍然生成原有 C# 产物。
- Godot C# 模式生成 Godot 可用的运行时脚本。
- Godot C# 模式不生成 Unity 专属 `Editor/` 文件。
- `script.js` 能正常加载页面，不引入语法错误。
- `Docs/` 中能明确看出哪些地方允许改，哪些地方不应该碰。
