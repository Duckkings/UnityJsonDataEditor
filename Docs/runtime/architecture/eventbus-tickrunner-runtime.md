# EventBus / TickRunner Runtime

## Structure

`Runtime/` is split into three layers:

- `Runtime/Shared/Contracts`
  Cross-engine interfaces and data structures.
- `Runtime/Shared/Core`
  Pure C# runtime logic.
- `Runtime/Unity`
  Unity-facing wrappers and adapters.
- `Runtime/Godot`
  Godot-facing wrappers and adapters.

## Core responsibilities

### `EventBusCore`

Responsible for:

- declaring events
- declaring and validating tags
- subscribing by event or tag
- publishing events
- filtering events by tag rules
- resolving optional init filters from `eventBusInitFilter` profiles such as `global_world_bus`

### `RootTickRunnerCore`

Responsible for:

- loading `systemModuleDeclare`
- receiving `RegisterModule(...)` calls
- waiting until all declared system modules are registered
- initializing modules by `priority` descending, then lower `id`
- dispatching `Tick()` by `ticktype`

## TickRunner initialization flow

`RootTickRunnerCore` follows this sequence:

1. Register base services such as `eventbus` and `database`.
2. Load `systemModuleDeclare` by default. If the new table is missing, the runtime can fall back to legacy `systemInitOrder`.
3. Wait until every declared module has called `RegisterModule(...)`.
4. Call each module's `Init(...)` in order.
5. Start dispatching `Update` / `LateUpdate` ticks according to `ticktype`.

This means:

- modules are not initialized immediately when they register
- only modules declared in the resolved system module declaration table can register successfully
- initialization starts only after all declared modules are present

## Built-in TickRunner event

`RootTickRunnerCore` provides a built-in lifecycle event:

- Event name: `tickrunner.all_modules_initialized`
- Constant: `RootTickRunnerCore.AllModulesInitializedEventName`
- Registered on the event bus during `RootTickRunnerCore.Initialize(...)`
- Published after all modules finish `Init(...)`

If any module throws during `Init(...)`, the event is not published.

## Priority Rules

`systemModuleDeclare` is the global system-module declaration table. It supports
`moduleKey`/`name`, `priority:int`, `ticktype:int`, and `tags:string`.
`RootTickRunnerCore`
orders system module `Init(...)` and `Tick()` by:

1. higher `priority` first
2. when `priority` is equal, lower `id` first

For backward compatibility, explicit or fallback `systemInitOrder` still reads
legacy `name`/`id`/`priority`/`ticktype`; missing `priority` is read as `0`.

`moduleDeclare` supports local object-module metadata:

- `moduleKey`: matches `IObjectModule.Name`
- `tags`: default module event tags
- `priority`: local object module priority

`ModuleDeclareRuntime` / `IModuleDeclareRuntime` reads this table and exposes
`TryGetModuleDeclare(...)`. `GodotObjectRootNode` can opt in through
`ModuleDeclareTableTemplateName`; when a table entry exists, `moduleDeclare.priority`
overrides `IObjectModule.TickPriority`. Local module order is:

1. higher resolved priority first
2. when both modules have `moduleDeclare` entries and priority is equal, lower
   `moduleDeclare.id` first
3. otherwise, sibling order is preserved as the compatibility fallback

### Payload

Payload type:

```csharp
RootTickRunnerCore.ModulesInitializedEventPayload
```

Payload fields:

- `RootName`
- `ModuleCount`
- `ModuleNames`

### Example

```csharp
public void Init(IRootRuntime root, IEventBus eventBus)
{
    eventBus.SubscribeEvent(this, RootTickRunnerCore.AllModulesInitializedEventName, payload =>
    {
        var data = payload as RootTickRunnerCore.ModulesInitializedEventPayload;
        if (data == null)
        {
            return;
        }

        // All declared system modules have completed Init(...)
    });
}
```
