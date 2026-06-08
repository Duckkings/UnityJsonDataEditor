# DataEntityRuntimeLoader

`DataEntityRuntimeLoader` 是 Unity 和 Godot C# 模式下生成的运行时数据读取入口。它负责从 `dataEntity/manifest.json` 找到模板 JSON，加载为运行时缓存，并提供按模板、实例、索引和参数读取值的 API。

## 完成度

- Unity：已完成生成 `DataEntityRuntimeLoader.cs`、`modelCsharpe.cs`、读取器说明、`DataEntityRuntimeTester.cs` 和 Unity 自定义 Inspector。
- Godot C#：已完成生成 Godot 版 `DataEntityRuntimeLoader.cs`、`modelCsharpe.cs`、读取器说明和 Godot 节点版 `DataEntityRuntimeTester.cs`。
- UE：当前不生成该读取器，UE 只生成 C++ 头文件。

## 导入产物

Unity 模式：

- `csharpDate/modelstruct/modelCsharpe.cs`
- `csharpDate/modelstruct/DataEntityRuntimeLoader.cs`
- `csharpDate/modelstruct/DataEntityRuntimeLoaderGuide.txt`
- `csharpDate/DataEntityRuntimeTester.cs`
- `csharpDate/Editor/DataEntityRuntimeTesterEditor.cs`

Godot C# 模式：

- `godotCsharpDate/modelstruct/modelCsharpe.cs`
- `godotCsharpDate/modelstruct/DataEntityRuntimeLoader.cs`
- `godotCsharpDate/modelstruct/DataEntityRuntimeLoaderGuide.txt`
- `godotCsharpDate/DataEntityRuntimeTester.cs`
- `godotCsharpDate/modelstruct/DataEntityRuntimeTesterGuide.txt`

## 主要 API

```csharp
DataEntityRuntimeLoader.Initialize();
DataEntityRuntimeLoader.Initialize(customDataEntityPath);

var schema = DataEntityRuntimeLoader.GetSchema("Monster");
var hp = DataEntityRuntimeLoader.GetValue<int>("Monster", "Slime", null, "hp");
var refValue = DataEntityRuntimeLoader.GetIndexValue("Monster", "Slime", null, "dropReward");
DataEntityRuntimeLoader.Reload();
```

Unity 默认读取 `Application.dataPath/dataEntity`。Godot 默认读取 `res://dataEntity`。

## 索引参数

当一个参数绑定到另一个模板的索引字段时，生成器会把该字段映射为 `DataRef`。读取索引参数时有两种方式：

- `GetIndexReference(...)`：拿到完整 `DataRef`。
- `GetValue<T>(..., getParameter)`：追到被引用实例，再读取目标字段。

## 来源

- 生成 `modelCsharpe.cs`：`database-editor/src/generators/csharp-runtime-generator.js:1789`
- 生成读取器与测试器：`database-editor/src/generators/csharp-runtime-generator.js:1805`
- 生成普通 C# 数据类：`database-editor/src/generators/csharp-runtime-generator.js:1924`
- 运行时读取器说明文本：`database-editor/src/generators/csharp-runtime-generator.js:806`、`database-editor/src/generators/csharp-runtime-generator.js:883`
