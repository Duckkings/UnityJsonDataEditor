# Godot SystemRoot / ObjectRoot Design

This document defines the recommended two-root runtime structure for Godot:

- `SystemRoot`
  Owns global systems, the global event bus, data sources, and cross-scene services.
- `ObjectRoot`
  Owns a single object domain or local context, such as one mech, one enemy group, or one UI panel domain.

The goal is to separate global initialization from local initialization so that `EventBus`, `TickRunner`, module registration, tick order, and local event subscriptions stay explicit.

## 1. Current Runtime Baseline

The current `Runtime/` already provides reusable core pieces:

- `RootTickRunnerCore`
  Reads `systemInitOrder`, registers modules, initializes modules, and dispatches `Tick()`.
- `EventBusCore`
  Handles event declaration, subscription, publishing, tag dispatching, and local-scope checks.
- `ISystemModule`
  Defines the minimal contract for global system modules.

`TickRunner` already has a system-module interface, but it does not yet have a dedicated abstract base class:

```csharp
public interface ISystemModule
{
    string Name { get; }
    void Init(IRootRuntime root, IEventBus eventBus);
    void Tick();
}
```

Conclusion:

- There is already a global system-module interface.
- There is not yet a global system-module base class.
- `ObjectRoot` should not directly reuse `ISystemModule`, because `ISystemModule` describes table-driven global systems, not object-domain local modules.

## 2. Role Split

### SystemRoot

`SystemRoot` is the global root. Its responsibilities should stay global-only:

- Initialize the global `DataTableProvider` or global data adapter.
- Initialize the global `GlobalEventBus`.
- Read `systemInitOrder`.
- Register and initialize global system modules from table data.
- Drive the global tick loop.

`SystemRoot` maps to the current meaning of `GodotRootTickRunnerNode`.

### ObjectRoot

`ObjectRoot` is the bootstrap node inside a local context root. Its responsibilities are local initialization and local ticking:

- Find the sibling `LocalEventBus`.
- Initialize the sibling `LocalEventBus` first.
- Scan child nodes under the owning context node and find local modules.
- Maintain a stable ordered module list.
- Drive local ticks for the current object domain.

The key point is that `ObjectRoot` is not a tree container that owns all gameplay nodes below itself. It is a bootstrap node placed at the top of a local context.

Good fits for `ObjectRoot` include:

- player mech root
- enemy root
- UI panel root
- isolated battle context root

## 3. Node Layout Rules

This design requires `LocalEventBus` and `ObjectRoot` to live under the same local-context parent, instead of making `EventBus` a child of `ObjectRoot`.

Recommended structure:

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

Key points:

- `ObjectRoot` and `LocalEventBus` are sibling nodes.
- Local modules belong to the same context parent, not under `LocalEventBus`.
- `ObjectRoot` discovers and initializes local modules, while `LocalEventBus` provides local event service.

This avoids turning the event bus into a scene-tree container and avoids binding module lifetime to the event-bus node itself.

## 4. Initialization Order

### SystemRoot Initialization Order

The global root can keep the existing order:

1. Resolve the data source.
2. Initialize `GlobalEventBus`.
3. Initialize the global runtime core.
4. Read `systemInitOrder`.
5. Wait until all global modules are registered.
6. Initialize all global modules in order.

### ObjectRoot Initialization Order

The local root should use a separate explicit chain:

1. `ObjectRoot` finds the sibling `LocalEventBus`.
2. `ObjectRoot` calls `LocalEventBus.Init(...)`.
3. `ObjectRoot` scans the child nodes of the owning context node, not the child nodes of `LocalEventBus`.
4. `ObjectRoot` filters out `ObjectRoot`, `LocalEventBus`, and other infrastructure nodes.
5. `ObjectRoot` finds nodes that implement the local-module contract.
6. `ObjectRoot` collects and sorts local modules.
7. `ObjectRoot` initializes the sorted modules.
8. Local ticking starts after that.

If `LocalEventBus` is initialized after modules, modules will already be alive but local subscriptions will still not be available.

This active scan-and-init model also avoids Godot ordering problems where child `_Ready()` can run before the parent is finished preparing the local runtime.

## 5. Module Contract

`ISystemModule` works for global systems, but it has two limits:

- it depends on `IRootRuntime`, which is semantically global
- it only expresses `Init(...) + Tick()`, without separating object-domain modules from global systems

Because of that, `ObjectRoot` should use a dedicated module contract.

### Option A: New Interface

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

This keeps local modules and global modules semantically separate.

Recommended runtime access rules:

- `GetLocalEventBus()` returns the local event bus of the current object domain.
- `GetGlobalEventBus()` returns the global event bus owned by `SystemRoot`.

### Option B: New Abstract Base Class

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

This is more convenient in Godot because modules can inherit directly.

### Recommended Choice

Prefer the interface first, then add a base class only as a convenience layer.

Reasons:

- it aligns more easily with the existing `ISystemModule`
- a base class should help usage, not restrict inheritance structure

## 6. Local Module Priority and Tick Order

`ObjectRoot` should not initialize modules while it is still scanning. It should collect modules, sort them, then initialize them and keep a stable ordered tick list.

Recommended rules:

1. Scan child nodes under the owning local context and collect all `IObjectModule` instances.
2. Sort by `TickPriority`, with higher priority first.
3. If `TickPriority` is the same, use the module order under the local context parent as the tie-breaker.
4. Save the result as `orderedModules`.
5. Use `orderedModules` for `Init(...)`.
6. Use the same `orderedModules` every frame for `Tick()`.

This means:

- initialization order and tick order use the same sorting rule
- scene-tree order becomes the stable tie-breaker for equal priority
- `ObjectRoot` keeps an internal tick-order list instead of scanning every frame

Recommended default:

- `TickPriority = 0`
- larger value means earlier init and earlier tick
- smaller value means later init and later tick

## 7. TickRunner vs ObjectRoot

`RootTickRunnerCore` already defines the rule set for global systems:

- modules are declared by `systemInitOrder`
- modules are initialized only after registration is complete
- `Tick()` is dispatched into `Update` / `LateUpdate` by `ticktype`

That means `TickRunner` is responsible for driving declared system modules, not for scanning the whole scene tree for all modules.

Because of that, `ObjectRoot` should not reuse `systemInitOrder`. It should use its own local scan strategy.

Recommended split:

- `SystemRoot`
  keeps table-driven initialization
- `ObjectRoot`
  uses local-context node scanning

## 8. LocalEventBus Configuration

The current `GodotEventBusNode` already supports the same script in both `Global` and `Local` modes:

- `Mode = Global`
- `Mode = Local`
- `EnableScopeCheckForLocal`
- `AllowTriggerTagAtRuntime`
- `EventTableTemplateName`
- `TagTableTemplateName`

So there is no need to create a second dedicated bus script. `LocalEventBus` can reuse the same node script and switch it to `Local` mode.

However, this design requires a clearer local-scope meaning on the Godot side:

- `LocalEventBus` should be a sibling of `ObjectRoot` at the top of a local context
- local-scope checks should use the local context root, or a scope root explicitly designated by `ObjectRoot`, instead of using the event-bus node itself as the scope root

Otherwise the node tree becomes awkward and local modules do not clearly map to the context they belong to.

## 9. Local / Global Event Rules

Recommended event-usage rules:

- local modules listen to local events through `GetLocalEventBus()`
- local modules listen to global events through `GetGlobalEventBus()`
- local modules publish local events locally by default
- if a local event must be escalated to a global message, local dispatch happens first and then the event is routed to the global bus

This `local -> global` route should stay one-way:

- dispatch locally first
- then escalate to `GlobalEventBus` when needed
- do not automatically rebroadcast all global events back into every local bus

How escalation is described can be decided later, for example by:

- a route field in the event table, such as `scope = local/global/escalate`
- an event tag such as `route_global`
- an explicit script-side bridge

No matter which carrier is chosen, the semantics should stay the same: local domain first, then route to global when the rule says so.

## 10. Dynamic Instantiation Constraints

`ObjectRoot` must support runtime-instantiated object domains. To keep that stable, two rules are required:

1. a newly spawned context must be able to complete one full local initialization pass without asking `SystemRoot` to rerun `systemInitOrder`
2. local module discovery must stay bounded inside the current local context and must not scan the whole scene tree

That keeps the same lifecycle model reusable for spawned enemies, summons, projectile hosts, and dynamically opened UI panels.

## 11. SystemRoot Ordering

The current `RootTickRunnerCore` uses:

- `id / name / ticktype` in `systemInitOrder`
- initialization ordered by `id`
- ticking ordered by the same `id`, while `ticktype` only decides `Update` vs `LateUpdate`

So global systems already have a stable ordering rule, and that rule is `systemInitOrder.id`.

Recommended rule for global systems:

1. initialize in `id` order
2. tick in the same order
3. use `ticktype` only to choose the update bucket, not to reorder modules inside the bucket

That keeps both roots stable even though the source of ordering is different:

- `SystemRoot` uses table `id`
- `ObjectRoot` uses `TickPriority + scene-tree order`

## 12. Recommended Rollout Path

Recommended implementation order:

1. lock down the `SystemRoot / ObjectRoot` document rules
2. add `IObjectRuntime`, at least with `GetLocalEventBus()` / `GetGlobalEventBus()`
3. add `IObjectModule`, and add `ObjectModuleBase` only if needed
4. add the `ObjectRoot` node on the Godot side
5. make `ObjectRoot` initialize the sibling `LocalEventBus` first
6. collect local modules, sort by `TickPriority + scene-tree order`, and save the internal tick list
7. use the same order for local init and local tick
8. finally add the `local -> global` routing rule, while keeping global systems ordered by `systemInitOrder.id`
