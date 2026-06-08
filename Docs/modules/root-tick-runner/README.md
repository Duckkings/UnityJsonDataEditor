# RootTickRunner

`RootTickRunner` 是全局系统模块的初始化和 Tick 调度器。核心逻辑在 `RootTickRunnerCore`，Unity 使用 `RootTickRunner` MonoBehaviour，Godot 使用 `GodotRootTickRunnerNode`。

## 完成度

- Shared：已完成系统模块声明表读取、模块注册、等待全部声明模块注册、统一初始化、Update/LateUpdate Tick、初始化完成事件。
- Unity：已完成 `RootTickRunner` MonoBehaviour，启动时初始化数据读取器和 EventBus。
- Godot：已完成 `GodotRootTickRunnerNode`，Godot 一键初始化会把它放入 `GameRoot.tscn`。
- UE：当前没有 RootTickRunner 运行时外壳。

## 导入产物

Unity：

- `Runtime/Shared/Core/RootTickRunnerCore.cs`
- `Runtime/Shared/Contracts/ISystemModule.cs`
- `Runtime/Unity/Components/RootTickRunner.cs`

Godot 一键初始化：

- `scripts/EventBusTickRunner/Shared/GameFrameworkRuntime.cs`
- `scripts/EventBusTickRunner/Godot/GodotRootTickRunnerNode.cs`
- `prefab/GameRoot.tscn`
- `dataEntity/systemModuleDeclare.json`

## `systemModuleDeclare`

当前默认表名是 `systemModuleDeclare`。缺失时，运行时会尝试回退旧表 `systemInitOrder`。

字段：

- `moduleKey` 或旧字段 `name`：匹配 `ISystemModule.Name`。
- `priority`：优先级，越大越先。
- `ticktype`：`0 = Update`，`1 = LateUpdate`。
- `tags`：模块标签，目前会解析保存。

排序：

1. `priority` 降序。
2. `id` 升序。

## 生命周期

1. 注册基础服务：`eventbus`、`database`。
2. 读取 `systemModuleDeclare`。
3. 业务模块调用 `RegisterModule(...)`。
4. 直到声明表里的模块全部注册后，才统一执行 `Init(...)`。
5. 初始化全部成功后发布 `tickrunner.all_modules_initialized`。
6. 每帧按 `ticktype` 调用模块 `Tick()`。

## 最小模块

```csharp
public sealed class ExampleSystem : ISystemModule
{
    public string Name => "examplesystem";

    public void Init(IRootRuntime root, IEventBus eventBus)
    {
    }

    public void Tick()
    {
    }
}
```

## 来源

- 默认读取 `systemModuleDeclare`：`Runtime/Shared/Core/RootTickRunnerCore.cs:44`
- 回退旧表：`Runtime/Shared/Core/RootTickRunnerCore.cs:111`
- 注册模块：`Runtime/Shared/Core/RootTickRunnerCore.cs:66`
- 统一初始化与完成事件：`Runtime/Shared/Core/RootTickRunnerCore.cs:197`
- 排序规则：`Runtime/Shared/Core/RootTickRunnerCore.cs:239`
- Unity 外壳：`Runtime/Unity/Components/RootTickRunner.cs:55`
- Godot 外壳：`Runtime/Godot/Nodes/GodotRootTickRunnerNode.cs:88`
