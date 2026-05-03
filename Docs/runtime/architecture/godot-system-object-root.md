# Godot SystemRoot / ObjectRoot 结构说明

这份文档定义 Godot 运行时里推荐的两层根结构，以及对象快照中心在对象域中的职责。

## 两层根

### SystemRoot

`SystemRoot` 对应全局层，负责：

- 全局 `EventBus`
- 全局 `DataTableProvider`
- `systemInitOrder` 驱动的系统模块初始化与 Tick

### ObjectRoot

`ObjectRoot` 对应单个对象域，负责：

- 找到同域的 `LocalEventBus`
- 找到同域的 `ObjectSnapshotSystem`
- 扫描 `contextRoot` 的直接子节点
- 统一初始化 `IObjectModule`
- 在每帧结束对象模块 Tick 后做快照同步

## 推荐对象域结构

```text
ObjectBase
  ObjectSnapshotSystem
  ObjectRoot
  LocalEventBus
  ModuleA
  ModuleB
  ModuleC
```

关键约束：

- `ObjectSnapshotSystem`、`ObjectRoot`、`LocalEventBus` 是同级兄弟节点。
- 业务模块也和它们同级。
- 自动扫描只处理直接子节点，不递归整棵子树。

## 对象快照中心

`ObjectSnapshotSystem` 是通用对象域基础设施，不和属性系统混用。

它负责：

- 为对象注册唯一的快照区域
- 保存区域键值、版本和脏标记
- 给对象模块和普通对象提供统一的读取入口

它不负责：

- 属性计算
- 网络协议发送
- 代替 `LocalEventBus`

## 注入顺序

`ObjectRoot` 初始化顺序固定为：

1. 解析上下文根
2. 解析 `LocalEventBus`
3. 解析数据服务和全局总线
4. 初始化本地总线
5. 解析 `ObjectSnapshotSystem`
6. 扫描直接子节点
7. 收集模块、快照参与者、被动同步对象
8. 若存在快照参与者但缺少 `ObjectSnapshotSystem`，直接失败
9. 绑定前先清掉 `GodotObjectSnapshotSystemNode` 的旧区域
10. 所有快照参与者按节点名注册区域
11. 仅对实现了 `IRequireObjectSnapshotRegion` 的对象执行 `BindObjectSnapshot(...)`
12. 最后初始化 `IObjectModule`

这保证模块在 `Init(...)` 里就能直接使用自己的快照区域。

## 同步顺序

每帧对象域运行顺序固定为：

1. 按 `TickPriority` 倒序执行模块 Tick
2. 同优先级按 sibling 顺序执行
3. 每个实现了 `IObjectSnapshotSync` 的模块在 `Tick()` 后立即同步
4. 非模块但实现了 `IObjectSnapshotSync` 的直接子节点，在模块循环结束后按 sibling 顺序同步

## 接口契约

- `IObjectSnapshotSystem`
- `IObjectSnapshotRegion`
- `IRequireObjectSnapshotRegion`
- `IObjectSnapshotSync`
- `IObjectRuntime.GetObjectSnapshotSystem()`

这套契约适用于对象模块，也适用于普通对象节点；是否参与模块生命周期，只由是否实现 `IObjectModule` 决定。

## 失败场景

以下情况会被视为初始化失败：

- 对象域存在快照参与者，但找不到 `ObjectSnapshotSystem`
- 同域直接子节点名称冲突，导致区域注册冲突
- 绑定快照区域过程中抛出异常

注意：只实现 `IObjectSnapshotSync` 不是失败场景，它仍然会被注册区域并参与同步。

## 与玩家控制器设计的关系

在玩家控制器设计里：

- `PlayerAttributeSystem` 只负责属性链路
- `ObjectSnapshotSystem` 负责稳定结果快照

两者是独立节点，职责分离，不应互相替代。
