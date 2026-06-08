# EventBus

`EventBus` 是运行时事件总线模块。核心逻辑在 `Runtime/Shared/Core/EventBusCore.cs`，Unity 和 Godot 通过各自的外壳组件/节点接入。

## 完成度

- Shared：已完成事件声明、标签声明、按事件订阅、按标签订阅、发布、取消订阅、本地作用域检查、初始化过滤。
- Unity：已完成 `EventBus` MonoBehaviour 外壳。
- Godot：已完成 `GodotEventBusNode` 节点外壳，并在一键初始化的 `GameRoot.tscn` 和 `ObjectBase.tscn` 中默认挂入。
- UE：当前没有 EventBus 运行时外壳。

## 导入产物

Unity：

- `Runtime/Shared/Core/EventBusCore.cs`
- `Runtime/Shared/Contracts/IEventBus.cs`
- `Runtime/Shared/Contracts/EventBusConfig.cs`
- `Runtime/Unity/Components/EventBus.cs`
- `Runtime/Unity/Integration/UnityScopeResolver.cs`
- `Runtime/Unity/Integration/UnityTimeProvider.cs`

Godot 一键初始化：

- `scripts/EventBusTickRunner/Shared/GameFrameworkRuntime.cs`
- `scripts/EventBusTickRunner/Godot/GodotEventBusNode.cs`
- `prefab/GameRoot.tscn` 中的全局 `EventBus`
- `prefab/ObjectBase.tscn` 中的本地 `LocalEventBus`

## 数据表

EventBus 主要读取：

- `systemEvent`：事件声明表，字段 `name` 与 `tags`。
- `systemEventTag`：合法标签表，字段 `name` 与 `description`。
- `eventBusInitFilter`：初始化过滤配置表，字段 `name` 与 `filters`。

`filters` 规则：

- 空字符串：加载全部事件。
- `;`：分隔多个过滤条件，条件之间为 OR。
- `|` 或 `,`：分隔同一个条件内的标签，标签之间为 AND。

## 常用 API

```csharp
eventBus.RegisterCustomEvent("player.dead", "combat|player");

var token = eventBus.SubscribeEvent(this, "player.dead", payload =>
{
    // handle event
});

eventBus.SubscribeTag(this, "combat", envelope =>
{
    // handle tag envelope
});

eventBus.PublishEvent(this, "player.dead", payload);
eventBus.Unsubscribe(token);
eventBus.UnsubscribeAll(this);
```

## 本地总线

当总线模式是 `Local` 且启用作用域检查时，订阅者必须处在该总线配置的作用域下。Godot 的 `ObjectBase.tscn` 默认给对象域挂 `LocalEventBus`，用于对象内部模块通信。

## 来源

- 核心初始化：`Runtime/Shared/Core/EventBusCore.cs:52`
- 标签表读取：`Runtime/Shared/Core/EventBusCore.cs:408`
- 初始化过滤：`Runtime/Shared/Core/EventBusCore.cs:462`
- 事件过滤规则：`Runtime/Shared/Core/EventBusCore.cs:633`
- Unity 外壳配置：`Runtime/Unity/Components/EventBus.cs:39`
- Godot 外壳配置：`Runtime/Godot/Nodes/GodotEventBusNode.cs:47`
- Godot 场景注入：`database-editor/src/generators/godot-project-bootstrap-generator.js:3263`
