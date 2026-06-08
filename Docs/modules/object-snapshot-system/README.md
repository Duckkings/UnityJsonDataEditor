# ObjectSnapshotSystem

`ObjectSnapshotSystem` 是 Godot 对象域的快照中心，用来给对象模块或普通节点提供稳定的键值快照区域。

## 完成度

- 已完成 `IObjectSnapshotSystem`、`IObjectSnapshotRegion`、`IRequireObjectSnapshotRegion`、`IObjectSnapshotSync` 契约。
- 已完成 Godot 节点实现 `GodotObjectSnapshotSystemNode`。
- 已完成 `ObjectRoot` 在模块 `Init(...)` 前绑定快照区域。
- 已完成模块 Tick 后同步，以及非模块快照对象的被动同步。
- 目前是 Godot 专属外壳，Unity/UE 没有对应节点实现。

## 一键导入产物

Godot 一键初始化会写入：

- `scripts/EventBusTickRunner/Godot/GodotObjectSnapshotSystemNode.cs`
- `scripts/EventBusTickRunner/Godot/GodotObjectRootNode.cs`
- `prefab/ObjectBase.tscn` 中的 `ObjectSnapshotSystem`

## 快照区域

每个快照参与者会被注册为一个区域：

- 区域名默认来自节点名。
- 区域持有 `Owner`。
- 每次 `Set(key, value)` 会递增 `Version` 并标记 `IsDirty`。
- 可通过 `TryGet(...)` 或 `GetValues()` 读取。

## 参与者判定

只要对象实现以下任一接口，都会被 `ObjectRoot` 视为快照参与者：

- `IRequireObjectSnapshotRegion`
- `IObjectSnapshotSync`

差异：

- `IRequireObjectSnapshotRegion` 会在模块 `Init(...)` 前收到 `BindObjectSnapshot(...)`。
- `IObjectSnapshotSync` 会在 Tick 后或被动同步阶段写入快照。

## 同步规则

- 模块对象：执行 `Tick()` 后立即调用 `SyncObjectSnapshot(...)`。
- 非模块对象：所有模块 Tick 完成后，按 sibling 顺序同步。
- 如果存在快照参与者但没有 `ObjectSnapshotSystem`，`ObjectRoot` 会中止初始化。
- 如果区域名重复，`ObjectRoot` 会中止初始化。

## 来源

- 快照接口：`Runtime/Shared/Contracts/IObjectSnapshotSystem.cs:5`
- 区域接口：`Runtime/Shared/Contracts/IObjectSnapshotRegion.cs:5`
- 绑定接口：`Runtime/Shared/Contracts/IRequireObjectSnapshotRegion.cs:5`
- 同步接口：`Runtime/Shared/Contracts/IObjectSnapshotSync.cs:3`
- Godot 节点实现：`Runtime/Godot/Nodes/GodotObjectSnapshotSystemNode.cs:8`
- 区域注册：`Runtime/Godot/Nodes/GodotObjectSnapshotSystemNode.cs:60`
- `ObjectRoot` 绑定参与者：`Runtime/Godot/Nodes/GodotObjectRootNode.cs:441`
- `ObjectRoot` 同步：`Runtime/Godot/Nodes/GodotObjectRootNode.cs:553`
