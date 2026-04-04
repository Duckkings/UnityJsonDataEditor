# Godot 配置说明

这份文档说明如何在 Godot 4 C# 项目里把这套工具链完整接起来。

## 1. 需要哪些产物

### 来自编辑器生成的内容

- `dataEntity/`
- `godotCsharpDate/`

其中最关键的是：

- `godotCsharpDate/modelstruct/DataEntityRuntimeLoader.cs`
- `dataEntity/manifest.json`

### 来自本仓库运行时目录的内容

- `Runtime/Shared/`
- `Runtime/Godot/`

还需要确保项目已安装 `Newtonsoft.Json`。

## 2. 推荐场景结构

最推荐的挂法：

```text
GameRoot
  Root
    EventBus
    DataTableProvider
    ExampleSystem
```

其中：

- `Root`
  挂 `GodotRootTickRunnerNode`
- `EventBus`
  挂 `GodotEventBusNode`
- `DataTableProvider`
  挂你自己的数据库 Provider

推荐把 `EventBus` 和 `DataTableProvider` 都挂成 `Root` 的子节点。

## 3. 为什么 Godot 需要 Provider

当前 Godot 版 `GodotRootTickRunnerNode` 和 Unity 不同：

- 它不会自动调用 `DataEntityRuntimeLoader.Initialize()`
- 它只会去找一个已经可用的 `IDataTableRuntime`

所以你通常需要额外提供一个数据库桥接节点。

最常见的方式是：

1. `DataTableProvider` 在 `_Ready()` 里初始化 `DataEntityRuntimeLoader`
2. `DataTableProvider` 实现 `IDataTableRuntime`
3. `Root.DataTableProviderPath` 指到这个节点

## 4. Root Inspector 配置

推荐这样填：

- `EventBusNodePath = "EventBus"`
- `DataTableProviderPath = "DataTableProvider"`

`UsePhysicsProcessForLateTick` 按项目需要决定：

- 关闭：`LateUpdate` 也走 `_Process()`
- 打开：`LateUpdate` 改走 `_PhysicsProcess()`

## 5. DataTableProvider 最小示例

如果你想直接复用编辑器生成的 `DataEntityRuntimeLoader.cs`，可以这样写：

```csharp
using System.Collections.Generic;
using GameFramework;
using Godot;

public partial class DataTableProvider : Node, IDataTableRuntime
{
    [Export]
    public string DataDir = "res://dataEntity";

    public override void _Ready()
    {
        DataEntityRuntimeLoader.Initialize(ProjectSettings.GlobalizePath(DataDir));
    }

    public EventBusTableSchema GetSchema(string templateName)
    {
        var sourceSchema = DataEntityRuntimeLoader.GetSchema(templateName);
        if (sourceSchema == null)
        {
            return null;
        }

        return new EventBusTableSchema
        {
            instances = ConvertInstances(sourceSchema.instances)
        };
    }

    private static Dictionary<string, EventBusTableInstance> ConvertInstances(Dictionary<string, object> sourceInstances)
    {
        var result = new Dictionary<string, EventBusTableInstance>();
        if (sourceInstances == null)
        {
            return result;
        }

        foreach (var pair in sourceInstances)
        {
            if (pair.Value is Dictionary<string, object> fields)
            {
                result[pair.Key] = new EventBusTableInstance(fields);
            }
        }

        return result;
    }
}
```

这套写法下，Root 的数据库读取链路就是：

1. `DataTableProvider._Ready()`
2. `DataEntityRuntimeLoader.Initialize(...)`
3. `GodotRootTickRunnerNode._Ready()`
4. Root 通过 `DataTableProviderPath` 拿到 `IDataTableRuntime`
5. `RootTickRunnerCore` 读取 `systemInitOrder`

## 6. 必备数据表

### `systemInitOrder`

默认表名就是 `systemInitOrder`，至少包含：

- `id`
- `name`
- `ticktype`

语义和 Unity 相同：

- `id`
  初始化顺序
- `name`
  必须和 `ISystemModule.Name` 完全一致
- `ticktype`
  `0 = Update`，`1 = LateUpdate`

### 事件表

由 `GodotEventBusNode.EventTableTemplateName` 指定。

### 标签表

由 `GodotEventBusNode.TagTableTemplateName` 指定。

## 7. 模块怎么写

模块仍然实现 `ISystemModule`：

```csharp
using GameFramework;
using GameFramework.Adapters.Godot;
using Godot;

public partial class ExampleSystem : Node, ISystemModule
{
    public string Name => "examplesystem";

    private IEventBus eventBus;

    public override void _Ready()
    {
        GodotRootTickRunnerNode.Instance.RegisterModule(this);
    }

    public void Init(IRootRuntime root, IEventBus eventBus)
    {
        this.eventBus = eventBus;
    }

    public void Tick()
    {
    }

    public override void _ExitTree()
    {
        eventBus?.UnsubscribeAll(this);
    }
}
```

## 8. 推荐接入顺序

1. 先用编辑器导出 `dataEntity/` 和 `godotCsharpDate/`
2. 把 `Runtime/Shared + Runtime/Godot` 拷进 Godot 工程
3. 配场景里的 `Root + EventBus + DataTableProvider`
4. 让 `DataTableProvider` 能读到 `systemInitOrder`
5. 再配置事件表和标签表
6. 最后写业务模块并在 `_Ready()` 中注册

## 9. 常见问题

### Root `_Ready()` 后没有初始化成功

优先检查：

- `DataTableProviderPath` 是否真的指到正确节点
- `DataTableProvider` 是否已经先执行并完成 `DataEntityRuntimeLoader.Initialize(...)`
- `systemInitOrder` 是否真的能被 `GetSchema("systemInitOrder")` 读取到
- `systemInitOrder.name` 是否和模块 `Name` 完全一致

### EventBus 没找到

优先检查：

- `EventBusNodePath` 是否正确
- 场景里是否真的有这个子节点

### 模块没进入 `Init()`

优先检查：

- 是否写进了 `systemInitOrder`
- 是否在 `_Ready()` 里调用了 `RegisterModule(this)`
- 是否还有别的声明模块没注册完成
