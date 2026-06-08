# ModuleDeclareRuntime

`ModuleDeclareRuntime` 是模块声明表读取器。它把 DataEntity 中的模块声明表转换为运行时可查询的 `ModuleDeclareRecord`。

## 完成度

- `systemModuleDeclare`：由 `RootTickRunnerCore` 直接读取，用于全局 `ISystemModule`。
- `moduleDeclare`：由 `ModuleDeclareRuntime` 读取，当前主要被 Godot `ObjectRoot` 使用，用于对象域 `IObjectModule` 的优先级覆盖。
- Unity：全局系统模块已经使用 `systemModuleDeclare`；对象域 `moduleDeclare` 暂无 Unity 外壳。
- Godot：全局和对象域都已接入。
- UE：当前没有运行时接入。

## 两张表的区别

`systemModuleDeclare`：

- 面向全局系统模块。
- 匹配 `ISystemModule.Name`。
- 字段包含 `moduleKey`、`priority`、`ticktype`、`tags`。
- 控制 `RootTickRunner` 初始化和 Tick。

`moduleDeclare`：

- 面向 Godot 对象域模块。
- 匹配 `IObjectModule.Name`。
- 字段包含 `moduleKey`、`tags`、`priority`。
- 控制 `ObjectRoot` 下对象模块的排序。

## 查询 API

```csharp
var runtime = new ModuleDeclareRuntime(dataRuntime, "moduleDeclare");

if (runtime.TryGetModuleDeclare("MovementModule", out var record))
{
    var priority = record.Priority;
}
```

## Godot 对象域排序

当 `GodotObjectRootNode.ModuleDeclareTableTemplateName` 指向 `moduleDeclare` 时：

1. 若表中存在该模块，使用 `moduleDeclare.priority`。
2. 优先级相同时，双方都有声明表记录则按 `moduleDeclare.id` 升序。
3. 没有声明表记录时，回退 sibling 顺序。

## 来源

- `ModuleDeclareRecord` 与接口：`Runtime/Shared/Contracts/ModuleDeclareRuntime.cs:6`
- 表读取逻辑：`Runtime/Shared/Contracts/ModuleDeclareRuntime.cs:27`
- `systemModuleDeclare` 模板：`database-editor/src/generators/godot-project-bootstrap-generator.js:3319`
- `moduleDeclare` 模板：`database-editor/src/generators/godot-project-bootstrap-generator.js:3430`
- Godot ObjectRoot 读取表：`Runtime/Godot/Nodes/GodotObjectRootNode.cs:597`
- Godot ObjectRoot 排序：`Runtime/Godot/Nodes/GodotObjectRootNode.cs:615`
