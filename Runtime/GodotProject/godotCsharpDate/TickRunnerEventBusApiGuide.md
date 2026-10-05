# Godot TickRunner / EventBus / ObjectSnapshot 使用说明

## 一键初始化会注入什么

- `scripts/EventBusTickRunner/Shared/GameFrameworkRuntime.cs`
- `scripts/EventBusTickRunner/Godot/*.cs`
- `scripts/godotCsharpDate/TickRunnerEventBusApiGuide.md`
- `prefab/GameRoot.tscn`
- `prefab/ObjectBase.tscn`
- `dataEntity/systemInitOrder.json`
- `dataEntity/systemEvent.json`

再次执行 Godot C# 一键初始化时，只会更新工具注入的脚本和文档，不会覆盖你已经配置好的模板和场景内容。

## TickRunner 自带能力

`GodotRootTickRunnerNode` / `RootTickRunnerCore` 自带这些能力：

- 通过 `RegisterService` / `GetService<T>` 提供基础服务注册与查询
- 读取 `systemInitOrder`
- 按顺序初始化系统模块
- 分发 `Update` / `LateUpdate` Tick
- 在所有系统模块初始化完成后触发内置生命周期事件 `tickrunner.all_modules_initialized`

## EventBus 自带能力

`GodotEventBusNode` / `EventBusCore` 自带这些能力：

- 从 `systemEvent` 读取并声明事件
- 可选的标签声明与标签校验
- 支持全局总线 / 本地总线模式
- 支持事件订阅
- 支持标签订阅
- 支持运行时注册自定义事件
- 支持测试用标签触发

## 对象域默认结构

`ObjectBase.tscn` 现在默认包含：

- 一个 `ObjectSnapshotSystem`
- 一个 `ObjectRoot`
- 一个 `LocalEventBus`

推荐对象域结构：

```text
ObjectBase
├─ ObjectSnapshotSystem
├─ ObjectRoot
├─ LocalEventBus
└─ 你的模块或对象
```

## 模块优先级

- `systemInitOrder.priority`：全局系统模块 priority 越大越先；priority 相同按 `id` 越小越先。旧表缺省 priority 为 `0`。
- `moduleDeclare.priority`：本地对象模块表项优先于 `IObjectModule.TickPriority`。
- 本地模块同 priority 且都有 `moduleDeclare` 表项时，按 `moduleDeclare.id` 越小越先；缺少表项时回退 sibling 顺序。
- 读取接口：`IModuleDeclareRuntime.TryGetModuleDeclare(moduleKey, out record)`。

## 对象快照接口

新增四个对象快照接口：

- `IObjectSnapshotSystem`
  - 注册区域、查找区域、枚举区域
- `IObjectSnapshotRegion`
  - 持有区域名、Owner、Version、IsDirty 和键值读写
- `IRequireObjectSnapshotRegion`
  - 让对象在初始化前拿到自己的快照区域句柄
- `IObjectSnapshotSync`
  - 让对象在 `ObjectRoot` 主动 Tick 时把当前状态同步进快照区域

`IObjectRuntime` 现在还提供：

- `GetObjectSnapshotSystem()`

## ObjectRoot 的快照注入时机

`ObjectRoot` 会扫描 `contextRoot` 的直接子节点，并排除：

- `ObjectRoot` 自身
- `LocalEventBus`
- `ObjectSnapshotSystem`

如果对象实现了 `IRequireObjectSnapshotRegion` 或 `IObjectSnapshotSync`：

1. `ObjectRoot` 会先为它注册一个以节点名为键的区域
2. 若对象实现了 `IRequireObjectSnapshotRegion`，会先调用 `BindObjectSnapshot(...)`
3. 如果它同时还是 `IObjectModule`，之后才调用 `Init(...)`

也就是说：**Bind 先于 Init**。

如果对象只实现了 `IObjectSnapshotSync`，它也会被 `ObjectRoot` 注册为快照参与者，只是不会收到 `BindObjectSnapshot(...)` 回调；同步时会直接使用已经注册好的区域。

如果对象域里存在快照参与者，但没有找到 `ObjectSnapshotSystem`，`ObjectRoot` 会报错并中止初始化。

`GodotObjectSnapshotSystemNode` 的区域注册语义是：

- 区域名在同一个对象域里必须唯一
- 同名区域重复注册会直接报错
- `ObjectRoot` 在重新初始化前会调用 `ClearRegions()` 清理 `ObjectSnapshotSystem` 内部旧区域
- `ObjectRoot` 的 `_ExitTree()` 只清理自己的本地缓存，不替代快照中心的显式重建

## ObjectRoot 的快照同步时机

- 对实现了 `IObjectModule` 的模块，`ObjectRoot` 在每次 `Tick()` 后立刻调用 `SyncObjectSnapshot(...)`
- 对不是 `IObjectModule`、但实现了 `IObjectSnapshotSync` 的直接子节点，`ObjectRoot` 会在所有模块 Tick 结束后按同级顺序执行同步

快照自动扫描范围只限对象域直接子节点，不递归整棵子树。

## IEventBus 常用 API

- `RegisterCustomEvent(string eventName, string tagExpression)`
- `SubscribeEvent(object owner, string eventName, Action<object> onEvent)`
- `SubscribeTag(object owner, string tagName, Action<EventEnvelope> onEnvelope)`
- `PublishEvent(object sender, string eventName, object payload)`
- `TriggerTagForTest(object sender, string tagName, ...)`
- `Unsubscribe(SubscriptionToken token)`
- `UnsubscribeAll(object owner)`

## 系统模块怎么写

实现 `ISystemModule`：

```csharp
using GameFramework;
using GameFramework.Adapters.Godot;
using Godot;

public partial class ExampleSystem : Node, ISystemModule
{
	public string Name => "examplesystem";

	public override void _Ready()
	{
		GodotRootTickRunnerNode.Instance?.RegisterModule(this);
	}

	public void Init(IRootRuntime root, IEventBus eventBus)
	{
	}

	public void Tick()
	{
	}
}
```

规则：

- `Name` 必须和 `systemInitOrder` 中的一行匹配
- `Init(...)` 只会在所有声明模块都注册完成后统一执行
- `ticktype = 0` 是 Update，`ticktype = 1` 是 LateUpdate

## 对象模块最小示例

下面这个模块既参与 `ObjectRoot` 生命周期，也参与对象快照同步：

```csharp
using GameFramework;
using GameFramework.Adapters.Godot;
using Godot;

public partial class ExampleMovementModule : GodotObjectModuleBase, IRequireObjectSnapshotRegion, IObjectSnapshotSync
{
	private IObjectSnapshotRegion _snapshotRegion;
	private Vector3 _velocity;

	public void BindObjectSnapshot(IObjectSnapshotSystem snapshotSystem, IObjectSnapshotRegion region)
	{
		_snapshotRegion = region;
	}

	public override void Init(IObjectRuntime root, IEventBus localEventBus, IEventBus globalEventBus)
	{
		GD.Print(_snapshotRegion != null ? "snapshot bound before init" : "snapshot missing");
	}

	public override void Tick()
	{
		_velocity += Vector3.Forward * 0.1f;
	}

	public void SyncObjectSnapshot(IObjectSnapshotRegion region)
	{
		region.Set("velocity", _velocity);
	}
}
```

## 非模块对象最小示例

下面这个对象不是 `IObjectModule`，但只实现同步接口也能被自动注册并参与同步：

```csharp
using GameFramework;
using Godot;

public partial class ExampleHudBridge : Node, IObjectSnapshotSync
{
	private int _frame;

	public void SyncObjectSnapshot(IObjectSnapshotRegion region)
	{
		_frame++;
		region.Set("frame", _frame);
	}
}
```

## 常见调用示例

发布一个自定义事件：

```csharp
eventBus.RegisterCustomEvent("battle.started", "battle");
eventBus.PublishEvent(this, "battle.started", new { stage = 1 });
```

订阅一个事件：

```csharp
eventBus.SubscribeEvent(this, "battle.started", payload =>
{
	GD.Print($"battle.started => {payload}");
});
```

按标签订阅：

```csharp
eventBus.SubscribeTag(this, "battle", envelope =>
{
	GD.Print(envelope.EventName);
});
```
## systemModuleDeclare / eventBusInitFilter

- `RootTickRunnerCore` 默认读取 `systemModuleDeclare`。该表用于全局 `ISystemModule` 声明，字段包含 `moduleKey`/`name`、`priority`、`ticktype`、`tags`。
- 旧 `systemInitOrder` 仍可作为显式配置或缺表回退兼容，但新项目与生成器应使用 `systemModuleDeclare`。
- `GameRoot/EventBus` 使用 `eventBusInitFilter/global_world_bus` 作为世界总线初始化 profile。
- `global_world_bus.filters = ""` 表示加载全部 `systemEvent`；非空 filter 只裁剪 EventBus 初始化事件，不等同于模块声明 tags。
