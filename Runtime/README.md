# Runtime

这个目录承载当前工具链中的 EventBus / TickRunner 运行时框架。

## 目录结构

- `Shared/`
  跨引擎共享的接口、数据结构和核心逻辑
- `Unity/`
  Unity 外壳与桥接层
- `Godot/`
  Godot 外壳与桥接层

## 和编辑器的关系

这个目录本身不负责编辑数据表。

它依赖两类输入：

- 编辑器生成的 `dataEntity/`
- 一个可用的 `IDataTableRuntime` 实现

最常见的接法：

- Unity：
  用编辑器生成的 `DataEntityRuntimeLoader.cs`，再通过 `DataEntityRuntimeAdapter` 桥接
- Godot：
  额外挂一个 `DataTableProvider`，在其中初始化 `DataEntityRuntimeLoader.cs` 并实现 `IDataTableRuntime`

## 推荐阅读

- `../Docs/runtime/architecture/tool-suite-overview.md`
- `../Docs/runtime/architecture/eventbus-tickrunner-runtime.md`
- `../Docs/runtime/setup/unity.md`
- `../Docs/runtime/setup/godot.md`
