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

### `RootTickRunnerCore`

Responsible for:

- loading `systemInitOrder`
- receiving `RegisterModule(...)` calls
- waiting until all declared system modules are registered
- initializing modules in `id` order
- dispatching `Tick()` by `ticktype`

## TickRunner initialization flow

`RootTickRunnerCore` follows this sequence:

1. Register base services such as `eventbus` and `database`.
2. Load `systemInitOrder`.
3. Wait until every declared module has called `RegisterModule(...)`.
4. Call each module's `Init(...)` in order.
5. Start dispatching `Update` / `LateUpdate` ticks according to `ticktype`.

This means:

- modules are not initialized immediately when they register
- only modules declared in `systemInitOrder` can register successfully
- initialization starts only after all declared modules are present

## Built-in TickRunner event

`RootTickRunnerCore` provides a built-in lifecycle event:

- Event name: `tickrunner.all_modules_initialized`
- Constant: `RootTickRunnerCore.AllModulesInitializedEventName`
- Registered on the event bus during `RootTickRunnerCore.Initialize(...)`
- Published after all modules finish `Init(...)`

If any module throws during `Init(...)`, the event is not published.

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
