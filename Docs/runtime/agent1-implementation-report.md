# Agent1 实现报告：Godot ObjectRoot 与 LocalEventBus

## 设计依据

实现依据 `Docs/runtime/runtime-docs-md-tabs.xlsx` 中 `architecture_godot-system-objec` 页签，以及对应的 `Docs/runtime/architecture/godot-system-object-root.md`。

这份设计的核心要求是：

- `SystemRoot` 继续负责全局系统与全局事件总线。
- `ObjectRoot` 负责单个对象域的局部初始化与局部 Tick。
- `LocalEventBus` 必须与 `ObjectRoot` 同级挂在局部上下文根下。
- Godot 一键初始化要在 `prefab/` 内补出 `ObjectBase.tscn`，并包含 `ObjectRoot` 和 `LocalEventBus`。

## 改动点

- 新增共享契约 `IObjectRuntime` 和 `IObjectModule`，用于表达对象域运行时和局部模块。
- 新增 Godot 侧 `GodotObjectRootNode`，负责：
  - 解析局部数据运行时
  - 初始化同级 `LocalEventBus`
  - 扫描同级局部模块
  - 按 `TickPriority + 场景树顺序` 初始化并 Tick
- 新增 Godot 侧 `GodotObjectModuleBase`，作为局部模块的便利基类。
- 扩展 `GodotEventBusNode`，让 local bus 在初始化时可以把父上下文或显式 `ScopeRootPath` 作为 scope root，避免同级模块订阅被错误拦截。
- 更新 `database-editor` 的 Godot 运行时代码生成器，让导出的脚本包含 `ObjectRoot` / `ObjectModuleBase` / `LocalEventBus` scope 配置相关代码。
- 更新 Godot 一键初始化逻辑，在 `prefab/` 下额外生成 `ObjectBase.tscn`。
- 在 `IObjectRuntime` 与 `GodotObjectRootNode` 上补充 `PublishLocalThenGlobal(...)`，明确提供“先本地派发，再升级到全局总线”的显式桥接入口。

## 关键实现说明

- `ObjectRoot` 采用“扫描局部上下文父节点的直接子节点”策略，而不是扫描全局场景树。
- local bus 初始化时使用 `ObjectRoot` 所在局部上下文父节点，或 `ObjectRoot.ScopeRootPath` 指向的节点作为 scope root，这样同级模块在 local scope check 下可以正常订阅和发布事件。
- 局部模块排序规则为：
  - `TickPriority` 高的优先
  - 同优先级时按场景树中的兄弟顺序
- `ObjectRoot` 在 `SystemRoot` 服务尚未就绪时会等待 `database` / `eventbus` 服务，避免因 `_Ready()` 时序导致局部初始化失败。
- `ObjectBase.tscn` 采用同级节点布局：
  - `ObjectRoot`
  - `LocalEventBus`
  - 后续局部模块也应作为同级节点挂在同一个上下文根下
- `PublishLocalThenGlobal(...)` 作为脚本侧显式桥接实现，保证同一个事件先走本地总线，再转发到全局总线，满足设计稿第 9 节对 `local -> global` 路由语义的要求。

## 验证情况

已完成：

- `node --check` 检查 `database-editor/src/generators/godot-project-bootstrap-generator.js`
- `node --check` 检查 `database-editor/src/services/workspace-storage.js`

未完成或无法在当前环境直接验证：

- Godot C# 项目实际编译
- Godot 编辑器里 `ObjectBase.tscn` 的运行时行为
- 真实场景中 local event bus 的订阅、发布、scope 检查与桥接行为

## 风险与未覆盖项

- 当前 `ObjectRoot` 会优先使用全局根服务里的 `database` / `eventbus`，如果目标项目没有先初始化 `SystemRoot`，局部上下文可能拿不到全局 bus。
- `ObjectRoot` 目前只扫描同级直接子节点，不会递归扫描更深层级，这是按设计实现，但如果后续有更复杂嵌套，需要再补额外约定。
- 当前桥接能力采用“脚本侧显式调用 `PublishLocalThenGlobal(...)`”承载，还没有扩展到事件表字段或 tag 驱动的声明式路由。
- 本次没有做 Godot 实机编译，因此仍需在目标项目里跑一次 C# 编译和场景加载确认。

## 审阅结论（Agent2）

agent2 在第一次审阅时确认：`ObjectRoot` 初始化顺序、`TickPriority + 场景顺序` 排序、`IObjectRuntime / IObjectModule` 契约、`ObjectBase.tscn` 的 quick init 装配均与设计稿基本一致；当时唯一保留问题是还缺少 `local -> global` 的升级路由语义，因此结论为“核心需求已满足，但按完整设计稿仍未完全闭环”。

## 最终收口与自审（Agent3）

根据 agent2 的审阅结果，最终收口补上了 `IObjectRuntime.PublishLocalThenGlobal(...)` 以及 `GodotObjectRootNode` 的对应实现，并同步更新了 Godot 运行时代码生成器，使 quick init 产出的 `ObjectRoot` 运行时也具备相同桥接语义。该桥接入口采用设计稿允许的“脚本侧显式桥接调用”方式实现，能够保证局部事件先在本对象域内派发，再升级到全局总线，因此 agent2 指出的唯一 gap 已经关闭。

本轮自审未再发现新的设计偏差。当前实现已经覆盖：`ObjectRoot`/`LocalEventBus` 同级结构、局部 scope root、`IObjectRuntime / IObjectModule` 契约、`TickPriority + 场景树顺序` 排序、`ObjectModuleBase` 便利基类、`ObjectBase.tscn` 的 quick init 装配，以及显式 `local -> global` 桥接入口。剩余工作主要是目标 Godot 项目内的实际编译与运行验证，而不是当前代码结构上的缺口。
