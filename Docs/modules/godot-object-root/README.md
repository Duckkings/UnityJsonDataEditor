# Godot ObjectRoot

`GodotObjectRootNode` 是 Godot 专属的对象域根节点。它负责把同一个对象上下文下的本地事件总线、对象模块和快照系统组织起来。

## 完成度

- 已完成本地 `LocalEventBus` 解析和初始化。
- 已完成从全局 `GodotRootTickRunnerNode` 获取 `database` 与全局 `eventbus` 服务。
- 已完成直接子节点扫描。
- 已完成 `IObjectModule` 初始化与 Tick。
- 已完成对象模块优先级排序。
- 已完成 `IRequireObjectSnapshotRegion` / `IObjectSnapshotSync` 的快照参与者绑定。
- 已完成 `PublishLocalThenGlobal(...)`。
- 目前是 Godot 专属模块，Unity/UE 没有对应外壳。

## 一键导入产物

Godot 一键初始化会写入：

- `scripts/EventBusTickRunner/Godot/GodotObjectRootNode.cs`
- `scripts/EventBusTickRunner/Godot/GodotObjectModuleBase.cs`
- `prefab/ObjectBase.tscn`
- `dataEntity/moduleDeclare.json`

默认对象域结构：

```text
ObjectBase
  ObjectSnapshotSystem
  ObjectRoot
  LocalEventBus
  你的对象模块
```

`ObjectRoot` 默认配置：

- `ContextRootPath = ".."`
- `LocalEventBusPath = "../LocalEventBus"`
- `ObjectSnapshotSystemPath = "../ObjectSnapshotSystem"`
- `ModuleDeclareTableTemplateName = "moduleDeclare"`

## 初始化流程

1. 解析 `ContextRoot`。
2. 解析同域 `LocalEventBus`。
3. 解析数据服务和全局 EventBus。
4. 初始化本地总线。
5. 解析 `ObjectSnapshotSystem`。
6. 扫描 `ContextRoot` 的直接子节点。
7. 收集对象模块、快照参与者、被动同步对象。
8. 绑定快照区域。
9. 初始化 `IObjectModule`。
10. 每帧执行模块 Tick。

## 排序规则

对象模块排序：

1. `moduleDeclare.priority` 或模块自身 `TickPriority`，数值越大越先。
2. 如果双方都有 `moduleDeclare` 记录且优先级相同，`moduleDeclare.id` 越小越先。
3. 其他情况回退 Godot sibling 顺序。

## 使用建议

- 只扫描直接子节点，业务模块不要藏在更深层级。
- `ObjectRoot`、`LocalEventBus`、`ObjectSnapshotSystem` 建议保持同级。
- 需要快照的模块实现 `IRequireObjectSnapshotRegion` 或 `IObjectSnapshotSync`。
- 对象模块名需要能匹配 `moduleDeclare.moduleKey`。

## 来源

- `ObjectRoot` 类与导出字段：`Runtime/Godot/Nodes/GodotObjectRootNode.cs:74`
- 初始化流程：`Runtime/Godot/Nodes/GodotObjectRootNode.cs:177`
- 直接子节点扫描：`Runtime/Godot/Nodes/GodotObjectRootNode.cs:391`
- 快照绑定：`Runtime/Godot/Nodes/GodotObjectRootNode.cs:441`
- 模块 Tick 与同步：`Runtime/Godot/Nodes/GodotObjectRootNode.cs:526`
- 模块声明表读取：`Runtime/Godot/Nodes/GodotObjectRootNode.cs:597`
- 默认 `ObjectBase.tscn`：`database-editor/src/generators/godot-project-bootstrap-generator.js:3290`
