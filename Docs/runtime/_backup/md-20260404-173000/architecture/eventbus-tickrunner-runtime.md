# EventBus / TickRunner 运行时结构

## 目录划分

`Runtime/` 当前按跨引擎复用边界拆成三层：

- `Runtime/Shared/Contracts`
  跨引擎接口和数据结构
- `Runtime/Shared/Core`
  纯 C# 核心逻辑
- `Runtime/Unity`
  Unity 外壳与适配层
- `Runtime/Godot`
  Godot 外壳与适配层

## Shared 层负责什么

### Contracts

最关键的接口有：

- `IDataTableRuntime`
- `IEventBus`
- `IRootRuntime`
- `ISystemModule`

最关键的数据结构有：

- `EventBusTableSchema`
- `EventBusTableInstance`
- `EventEnvelope`
- `TickPhase`

### Core

核心规则主要在两个类里：

- `EventBusCore`
  负责事件声明、标签声明、订阅、发布、过滤
- `RootTickRunnerCore`
  负责读取 `systemInitOrder`、注册模块、统一初始化、分派 Tick

## 数据库接口边界

当前框架只要求数据库实现这一件事：

```csharp
EventBusTableSchema GetSchema(string templateName);
```

也就是说，框架并不直接依赖：

- 浏览器编辑器
- JSON 文件结构细节
- `DataEntityRuntimeLoader` 的具体实现

它只关心“能不能按模板名拿到一张表”。

## Unity 接法

Unity 侧桥接比较直接：

- `RootTickRunner`
  启动时调用 `DataEntityRuntimeLoader.Initialize()`
- `DataEntityRuntimeAdapter`
  把 `DataEntityRuntimeLoader.GetSchema(...)` 转成 `EventBusTableSchema`
- `EventBus`
  通过同一个 `IDataTableRuntime` 读取事件表和标签表

所以 Unity 侧一般不需要单独再挂数据库 Provider。

## Godot 接法

Godot 侧和 Unity 不同：

- `GodotRootTickRunnerNode` 不会自动调用 `DataEntityRuntimeLoader.Initialize()`
- 它只会去找一个现成的 `IDataTableRuntime`

来源可以是：

1. `SetDataRuntime(IDataTableRuntime)`
2. `DataTableProviderPath`
3. Root 自己实现 `IDataTableRuntime` / `IGodotDataTableProvider`

所以 Godot 项目里最常见的接法是：

- `GodotRootTickRunnerNode`
- `GodotEventBusNode`
- 一个额外的 `DataTableProvider`

## 模块初始化时机

`RootTickRunnerCore` 的规则是：

1. 初始化基础服务
2. 读取 `systemInitOrder`
3. 等待所有已声明模块执行 `RegisterModule(this)`
4. 按 `id` 顺序统一调用每个模块的 `Init(...)`
5. 后续按 `ticktype` 分派到 `Update` 或 `LateUpdate`

这意味着：

- 模块不是注册一个就立刻初始化一个
- 只有 `systemInitOrder` 表里声明过的模块，注册才会成功
- 表里声明的模块没全部注册完，Root 就会继续等待

## 和编辑器生成物的关系

编辑器生成的 `DataEntityRuntimeLoader.cs` 不是框架必须的，但它是当前最方便的数据库实现来源。

推荐理解方式：

- `Runtime/` 提供“框架”
- `DataEntityRuntimeLoader.cs` 提供“数据库读取实现”
- `dataEntity/` 提供“实际数据”

三者组合后，才是完整可运行的工具链。
