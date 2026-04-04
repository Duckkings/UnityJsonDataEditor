# 工具体系总览

这份文档说明当前仓库里几个核心部分分别负责什么，以及它们之间如何配合。

- `UnityJsonDataEditor`
  数据编辑器本体，负责维护模板、实例、参数、索引和导出产物。
- `EventBus / TickRunner`
  面向 Unity / Godot 运行时的轻量框架，负责事件派发、模块初始化和 Tick 调度。

把这几部分放在一起看的原因是：编辑器负责产出数据和代码，运行时负责消费这些产物并驱动游戏逻辑。

## 目录职责

- `database-editor/src/`
  编辑器源码。
- `Runtime/`
  EventBus / TickRunner 运行时框架。
- `Docs/`
  文档目录。
- 根目录 `README.md`
  仓库总说明。

## 典型工作流

### 1. 编辑器侧

编辑器负责：

- 维护模板结构
- 编辑实例数据
- 生成 `dataEntity/`
- 生成 Unity / Godot / UE 对应的代码产物

其中和运行时关系最密切的是：

- `dataEntity/`
- `DataEntityRuntimeLoader.cs`
- 事件表
- 标签表
- `systemInitOrder`

### 2. 运行时侧

运行时只关心两件事：

1. 能不能按模板名拿到一张表
2. 能不能按顺序驱动模块初始化和 Tick

当前约定的数据访问入口是：

```csharp
EventBusTableSchema GetSchema(string templateName);
```

只要某个项目侧 Provider 能实现这件事，运行时就能工作，不强依赖编辑器内部实现细节。

## 推荐接入流程

### Unity

1. 用编辑器生成 `dataEntity/`、`csharpDate/`、`Editor/`
2. 把仓库里的 `Runtime/Shared + Runtime/Unity` 拷进项目
3. 配置 `RootTickRunner + EventBus`
4. 填 `systemInitOrder`、事件表、标签表

### Godot

1. 用编辑器生成 `dataEntity/`、`godotCsharpDate/`
2. 把仓库里的 `Runtime/Shared + Runtime/Godot` 拷进项目
3. 配置 `GodotRootTickRunnerNode + GodotEventBusNode + DataTableProvider`
4. 让 Provider 把 `DataEntityRuntimeLoader` 桥接成 `IDataTableRuntime`
5. 填 `systemInitOrder`、事件表、标签表
6. 如果要做局部上下文，再看 `godot-system-object-root.md`

## 什么时候看哪份文档

- 想知道运行时目录怎么分：看 `eventbus-tickrunner-runtime.md`
- 想知道 Godot 的 `SystemRoot / ObjectRoot` 结构：看 `godot-system-object-root.md`
- 想看 Godot 具体接法：看 `../setup/godot.md`
- 想看 Unity 具体接法：看 `../setup/unity.md`
