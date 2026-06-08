# Godot 接入说明

这份文档说明如何把工具仓的 Godot 运行时、对象域结构和一键初始化产物接进 Godot 4 C# 项目。

## 一键初始化会生成什么

- `scripts/EventBusTickRunner/Shared/GameFrameworkRuntime.cs`
- `scripts/EventBusTickRunner/Godot/*.cs`
- `scripts/godotCsharpDate/TickRunnerEventBusApiGuide.md`
- `prefab/GameRoot.tscn`
- `prefab/ObjectBase.tscn`
- `dataEntity/systemModuleDeclare.json`
- `dataEntity/systemEvent.json`
- `dataEntity/systemEventTag.json`
- `dataEntity/eventBusInitFilter.json`

其中 `ObjectBase.tscn` 默认包含：

```text
ObjectBase
  ObjectSnapshotSystem
  ObjectRoot
  LocalEventBus
```

## 模块优先级

- `systemInitOrder.priority` 控制全局系统模块顺序：priority 越大越先；priority 相同按 `id` 越小越先。旧表缺少 priority 时按 `0` 读取，因此全 0 时仍保持旧的 `id` 升序。
- `moduleDeclare.priority` 控制本地 `IObjectModule` 顺序。`ObjectRoot.ModuleDeclareTableTemplateName` 指向 `moduleDeclare` 后，表里的 priority 优先于模块自身的 `TickPriority`。
- 本地模块 priority 相同且双方都有 `moduleDeclare` 表项时，按 `moduleDeclare.id` 越小越先；缺少表项时回退 sibling 顺序。
- 运行时代码可通过 `IModuleDeclareRuntime.TryGetModuleDeclare(moduleKey, out record)` 读取 `moduleKey/tags/priority`。

## 推荐层级

全局根建议保持：

```text
GameRoot
  EventBus
  DataTableProvider
```

对象域建议保持：

```text
PlayerContext
  ObjectSnapshotSystem
  ObjectRoot
  LocalEventBus
  InputModule
  MovementModule
  WeaponModule
```

说明：

- `ObjectSnapshotSystem` 负责对象快照区域注册与读取。
- `ObjectRoot` 负责扫描直接子节点、模块排序、快照绑定和 Tick 后同步。
- `LocalEventBus` 负责对象域内的本地事件广播。

## 对象快照接口

运行时新增四个接口：

- `IObjectSnapshotSystem`
- `IObjectSnapshotRegion`
- `IRequireObjectSnapshotRegion`
- `IObjectSnapshotSync`

`IObjectRuntime` 同时新增：

- `GetObjectSnapshotSystem()`

## ObjectRoot 行为

`ObjectRoot` 的快照流程固定为：

1. 解析 `contextRoot`
2. 解析 `LocalEventBus`
3. 解析 `DataTableProvider / GlobalEventBus`
4. 初始化本地总线
5. 解析 `ObjectSnapshotSystem`
6. 扫描 `contextRoot` 的直接子节点
7. 收集模块、快照参与者、被动同步对象
8. 若存在快照参与者但缺少 `ObjectSnapshotSystem`，直接报错并中止初始化
9. 若快照中心是 `GodotObjectSnapshotSystemNode`，绑定前先 `ClearRegions()`
10. 所有快照参与者按节点名注册区域；若重名则报错并中止初始化
11. 对实现 `IRequireObjectSnapshotRegion` 的对象执行 `BindObjectSnapshot(...)`
12. 对实现 `IObjectModule` 的对象再执行 `Init(...)`

判定规则：

- 实现 `IRequireObjectSnapshotRegion` 的对象是快照参与者。
- 实现 `IObjectSnapshotSync` 的对象也是快照参与者。
- 只实现 `IObjectSnapshotSync` 也允许，会自动注册区域；只是不会收到 `BindObjectSnapshot(...)` 回调。

同步规则：

- 模块对象：`Tick()` 后立即同步。
- 非模块但实现 `IObjectSnapshotSync` 的直接子节点：在模块循环结束后按 sibling 顺序同步。
- 如果某个同步对象当前没有绑定区域，会记警告并跳过同步。

## 示例

```csharp
using GameFramework;
using GameFramework.Adapters.Godot;
using Godot;

public partial class MovementModule : GodotObjectModuleBase, IRequireObjectSnapshotRegion, IObjectSnapshotSync
{
    private IObjectSnapshotRegion _region;

    public void BindObjectSnapshot(IObjectSnapshotSystem snapshotSystem, IObjectSnapshotRegion region)
    {
        _region = region;
    }

    public override void Init(IObjectRuntime root, IEventBus localEventBus, IEventBus globalEventBus)
    {
        GD.Print(_region != null ? "snapshot bound before init" : "snapshot missing");
    }

    public void SyncObjectSnapshot(IObjectSnapshotRegion region)
    {
        region.Set("speed", 6.0f);
    }
}
```

```csharp
using GameFramework;
using Godot;

public partial class HudSnapshotProxy : Node, IObjectSnapshotSync
{
    public void SyncObjectSnapshot(IObjectSnapshotRegion region)
    {
        region.Set("visible", Visible);
    }
}
```

## 数据职责建议

- `PlayerAttributeSystem`
  - 负责属性、装备加成、派生值和状态读写。
- `ObjectSnapshotSystem`
  - 负责稳定结果快照，给同步、插值、回放和跨模块读取使用。

也就是说：属性系统不再兼任快照中心，快照中心是对象域基础设施。
## systemModuleDeclare / eventBusInitFilter

- New Godot bootstrap output writes `dataEntity/systemModuleDeclare.json` instead of `systemInitOrder.json`.
- `systemModuleDeclare` declares global `ISystemModule` entries with `moduleKey`/`name`, `priority`, `ticktype`, and `tags`.
- `RootTickRunnerCore` still reads legacy `systemInitOrder` when explicitly configured or when the new default table is missing.
- The generated world EventBus uses `InitTagFilterTableTemplateName = "eventBusInitFilter"` and `InitTagFilterProfileName = "global_world_bus"`.
- `global_world_bus.filters = ""` means the world bus loads all events from `systemEvent`; non-empty filter profiles are for per-bus event loading, not module declaration.
