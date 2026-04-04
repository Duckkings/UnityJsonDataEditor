# Godot SystemRoot / ObjectRoot 设计稿

这份文档定义 Godot 运行时里推荐的两层根结构：

- `SystemRoot`
  负责全局系统、全局事件总线、数据源和跨场景服务。
- `ObjectRoot`
  负责单个对象域或局部上下文，例如一台机体、一个敌人组、一个 UI 面板域。

目标是把“全局初始化”和“局部初始化”拆开，让 `EventBus`、`TickRunner`、模块注册、Tick 顺序和局部事件订阅都保持清晰。

## 1. 现有运行时基线

当前 `Runtime/` 已经有一套可复用核心：

- `RootTickRunnerCore`
  负责读取 `systemInitOrder`、注册模块、统一调用模块 `Init(...)` 和 `Tick()`。
- `EventBusCore`
  负责事件声明、订阅、发布、Tag 分发和局部作用域检查。
- `ISystemModule`
  负责定义全局系统模块的最小契约。

现有 `TickRunner` 已经有系统模块接口，但还没有单独的抽象基类：

```csharp
public interface ISystemModule
{
    string Name { get; }
    void Init(IRootRuntime root, IEventBus eventBus);
    void Tick();
}
```

结论：

- 当前已经有“全局系统模块接口”。
- 当前还没有“全局系统模块抽象基类”。
- `ObjectRoot` 不应直接复用 `ISystemModule`，因为它描述的是表驱动的全局系统，不是对象域里的局部模块。

## 2. 角色划分

### SystemRoot

`SystemRoot` 是全局根，职责只覆盖全局级别的事情：

- 初始化全局 `DataTableProvider` 或全局数据适配器。
- 初始化全局 `GlobalEventBus`。
- 读取 `systemInitOrder`。
- 按表驱动注册并初始化全局系统模块。
- 统一驱动全局 Tick。

`SystemRoot` 对应当前 `GodotRootTickRunnerNode` 的语义。

### ObjectRoot

`ObjectRoot` 是局部上下文根里的引导节点，职责是对象域内部的初始化和 Tick：

- 找到同级 `LocalEventBus`。
- 先初始化同级 `LocalEventBus`。
- 再扫描所属上下文节点的子节点，找到局部模块并调用 `Init(...)`。
- 维护局部模块顺序列表。
- 统一驱动本对象域内部的局部 Tick。

这里的关键点是：`ObjectRoot` 不是把模块挂在自己下面的树容器，而是挂在局部上下文顶部的引导节点。

适合使用 `ObjectRoot` 的上下文包括：

- 玩家机体根节点
- 敌人根节点
- UI 面板根节点
- 独立的战斗上下文根节点

## 3. 节点摆放规则

本设计要求 `LocalEventBus` 和 `ObjectRoot` 挂在同一个局部上下文父对象下，而不是把 `EventBus` 挂成 `ObjectRoot` 的子对象。

推荐结构如下：

```text
GameContext
  SystemRoot
  GlobalEventBus
  DataTableProvider
  PlayerContext
    ObjectRoot
    LocalEventBus
    MoveSystem
    WeaponSystem
    LockSystem
  EnemyContext
    ObjectRoot
    LocalEventBus
    MoveSystem
    AiSystem
```

关键点：

- `ObjectRoot` 和 `LocalEventBus` 是同级节点。
- 局部模块与它们同属一个上下文父节点，而不是挂到 `LocalEventBus` 节点下面。
- `ObjectRoot` 负责发现并初始化局部模块，`LocalEventBus` 负责提供局部事件服务。

这样可以避免把事件总线当成树形容器，也避免把模块生命周期绑死在总线节点上。

## 4. 初始化顺序

### SystemRoot 初始化顺序

全局根保持现有顺序即可：

1. 解析数据源。
2. 初始化全局 `GlobalEventBus`。
3. 初始化全局运行时核心。
4. 读取 `systemInitOrder`。
5. 等待全局模块注册完成。
6. 按顺序调用所有全局系统模块的 `Init(...)`。

### ObjectRoot 初始化顺序

局部根应当是另一条明确链路：

1. `ObjectRoot` 先找到同级 `LocalEventBus`。
2. 调用 `LocalEventBus.Init(...)`。
3. 再遍历所属上下文节点的子节点，而不是遍历 `LocalEventBus` 节点。
4. 过滤掉 `ObjectRoot`、`LocalEventBus` 和其他基础设施节点。
5. 找到实现了局部模块契约的节点。
6. 收集并排序局部模块。
7. 按排序结果统一调用这些模块的 `Init(...)`。
8. 之后再进入局部 Tick。

如果 `LocalEventBus` 晚于模块初始化，就会出现“模块已经准备好，但局部消息还没法接入”的问题。

这种“由 `ObjectRoot` 主动扫描并初始化”的方式，也能避开 Godot 子节点 `_Ready()` 早于父节点时带来的注册时序风险。

## 5. 模块契约建议

现有 `ISystemModule` 适合全局系统模块，但它有两个限制：

- 它依赖 `IRootRuntime`，语义偏向全局根。
- 它只有 `Init(...) + Tick()`，没有体现对象域模块和全局系统模块的区别。

因此建议给 `ObjectRoot` 单独定义一套契约。

### 方案 A：新增接口

```csharp
public interface IObjectRuntime
{
    IEventBus GetLocalEventBus();
    IEventBus GetGlobalEventBus();
}

public interface IObjectModule
{
    string Name { get; }
    int TickPriority { get; }
    void Init(IObjectRuntime root, IEventBus localEventBus, IEventBus globalEventBus);
    void Tick();
}
```

优点是语义清晰，局部模块和全局模块不会混用。

同时建议明确两条运行时访问约定：

- `GetLocalEventBus()` 返回当前对象域的局部事件总线。
- `GetGlobalEventBus()` 返回 `SystemRoot` 持有的全局事件总线。

### 方案 B：新增抽象类

```csharp
public abstract class ObjectModuleBase : Node, IObjectModule
{
    [Export]
    public virtual int TickPriority => 0;

    public abstract string Name { get; }
    public abstract void Init(IObjectRuntime root, IEventBus localEventBus, IEventBus globalEventBus);
    public virtual void Tick() {}
}
```

优点是 Godot 里用起来更顺手，子节点直接继承即可。

### 本设计建议

建议优先新增接口，再根据需要补抽象基类。原因：

- 接口更容易和现有 `ISystemModule` 对齐。
- 抽象基类可以作为便利层，但不应限制节点继承结构。

## 6. 局部模块优先级与 Tick 顺序

`ObjectRoot` 不应一边遍历一边初始化模块，而应先收集、排序，再统一初始化并保存 Tick 列表。

推荐规则：

1. 扫描所属上下文子节点，找到所有 `IObjectModule`。
2. 按 `TickPriority` 排序，优先级高的先。
3. 如果 `TickPriority` 相同，则按模块在对象上下文父节点下的节点顺序排序。
4. 将排序结果保存为 `orderedModules`。
5. 按 `orderedModules` 执行 `Init(...)`。
6. 之后每帧也按 `orderedModules` 执行 `Tick()`。

这意味着：

- 初始化顺序和 Tick 顺序使用同一套排序规则。
- 同优先级时，场景树摆放顺序就是稳定的次排序键。
- `ObjectRoot` 应维护一份内部 Tick 顺序列表，而不是每帧重新扫描场景树。

建议把 `TickPriority` 默认值设为 `0`：

- 更高的值，更早 `Init` / 更早 `Tick`
- 更低的值，更晚 `Init` / 更晚 `Tick`

## 7. TickRunner 和 ObjectRoot 的关系

现有 `RootTickRunnerCore` 已经说明了全局系统模块的规则：

- 通过 `systemInitOrder` 声明模块。
- 模块注册完成后才统一 `Init(...)`。
- `Tick()` 按 `ticktype` 分派到 `Update / LateUpdate`。

这说明 `TickRunner` 的职责是“驱动已声明的系统模块”，不是“扫描场景树找所有模块”。

因此 `ObjectRoot` 不应复用 `systemInitOrder`，而应采用自己的局部扫描策略。

建议分工：

- `SystemRoot`
  继续走表驱动。
- `ObjectRoot`
  走上下文子节点扫描驱动。

## 8. LocalEventBus 配置建议

当前 `GodotEventBusNode` 已经支持同一个脚本切换 `Global / Local`：

- `Mode = Global`
- `Mode = Local`
- `EnableScopeCheckForLocal`
- `AllowTriggerTagAtRuntime`
- `EventTableTemplateName`
- `TagTableTemplateName`

所以实现上不需要再做一套专用脚本，`LocalEventBus` 可以直接复用同一个节点脚本，改成 `Local` 即可。

但本设计建议在 Godot 侧补一个更明确的局部作用域语义：

- `LocalEventBus` 应与 `ObjectRoot` 同级挂在局部上下文顶部。
- 局部订阅判断最好以“局部上下文根”或 `ObjectRoot` 指定的 `ScopeRoot` 作为作用域根，而不是以 `EventBus` 节点本身作为作用域根。

否则节点树会很别扭，局部模块也不容易在直觉上理解“自己到底属于哪一个域”。

## 9. Local / Global 事件使用规则

推荐把事件使用规则明确成下面几条：

- 局部模块监听局部事件时，使用 `GetLocalEventBus()`。
- 局部模块监听全局事件时，使用 `GetGlobalEventBus()`。
- 局部模块发布局部事件时，默认只在当前对象域内派发。
- 如果一个局部事件需要升级为全局消息，则在局部总线完成本地派发后，再路由到全局总线。

这条 `local -> global` 路由只建议单向存在：

- 先在本对象域内完成局部派发。
- 再把需要升级为全局消息的事件转发到 `GlobalEventBus`。
- 不建议默认把所有全局事件反向广播回所有 `LocalEventBus`，避免对象域之间互相污染。

是否需要升级为全局消息，可以在后续实现里通过任一方式承载：

- 事件表中的路由字段，例如 `scope = local/global/escalate`
- 事件 tag，例如 `route_global`
- 或脚本侧显式桥接调用

无论采用哪种承载方式，语义都应保持一致：局部域先处理，本地总线再按规则向全局总线路由。

## 10. 动态实例化约束

`ObjectRoot` 必须支持运行时动态实例化对象域。为此需要遵守两条规则：

1. 新实例进入场景后，`ObjectRoot` 应该能独立完成一次完整的局部初始化，不依赖 `SystemRoot` 重新跑 `systemInitOrder`。
2. 局部模块的发现应以当前局部上下文为边界，不能扫描全局场景树。

这样后续无论是生成敌人、召唤物、子弹宿主，还是动态打开 UI 面板，都能复用同一套生命周期。

## 11. SystemRoot 排序说明

当前 `RootTickRunnerCore` 的现状是：

- `systemInitOrder` 里只有 `id / name / ticktype`
- 运行时按 `id` 排序初始化
- Tick 也按同一个顺序执行，只是再按 `ticktype` 分派到 `Update / LateUpdate`

也就是说，现阶段全局系统已经有稳定顺序，直接由 `systemInitOrder.id` 决定。

推荐把全局系统规则保持为：

1. 初始化时按 `id` 排序。
2. Tick 时也按同一顺序执行。
3. `ticktype` 只决定模块进入 `Update` 还是 `LateUpdate` 桶，不额外参与同桶内排序。

这样 `SystemRoot` 和 `ObjectRoot` 的顺序模型虽然来源不同，但都足够稳定：

- `SystemRoot` 用表里的 `id`
- `ObjectRoot` 用 `TickPriority + 场景树节点顺序`

## 12. 推荐落地路径

建议后续按下面顺序实现：

1. 先补文档里的 `SystemRoot / ObjectRoot` 结构约定。
2. 新增 `IObjectRuntime`，至少提供 `GetLocalEventBus()` / `GetGlobalEventBus()`。
3. 再新增 `IObjectModule`，如有必要再补 `ObjectModuleBase`。
4. 在 Godot 侧补 `ObjectRoot` 节点。
5. 让 `ObjectRoot` 先初始化同级 `LocalEventBus`。
6. 收集局部模块，按 `TickPriority + 场景树顺序` 排序，保存内部 Tick 列表。
7. 用同一套顺序初始化局部模块，并在后续按同一套顺序执行 Tick。
8. 最后再补 `local -> global` 的事件桥接规则，并在实现时明确全局系统继续使用 `systemInitOrder.id` 排序。
