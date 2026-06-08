# UE C++ Output

UE 模式当前负责把编辑器中的模板结构生成 Unreal Engine C++ 头文件。它是结构生成器，不是完整运行时。

## 完成度

- 已完成普通模板到 `.h` 的生成。
- 已完成 `enum` 模板到 `UENUM` 头文件的生成。
- 已完成索引参数引用结构 `FDataRef`。
- 已完成不合规 UE 名称的替换与日志提示。
- 未完成 JSON 运行时加载器。
- 未完成自动生成 `.uasset` 或 DataAsset 导入流程。
- 未完成 UE 侧 EventBus / TickRunner 运行时外壳。

## 导入产物

- `cppmodel/DataRefTypes.h`
- `cppmodel/<Template>.h`
- `cppmodel/enum/*.h`

`cppmodel/<Template>.h` 会包含：

- `USTRUCT(BlueprintType)`：单行数据结构。
- `UCLASS(BlueprintType)`：继承 `UDataAsset` 的容器类。
- `TMap<FName, F<Template>Row> Rows`：按名称索引的行集合。

`DataRefTypes.h` 会包含：

- `FString Template`
- `FString By`
- `FString Value`

## 类型映射

当前基础类型映射：

- `int` -> `int32`
- `long` -> `int64`
- `float` -> `float`
- `bool` -> `bool`
- `string` / `object` -> `FString`
- 索引参数 -> `FDataRef`
- 索引参数列表 -> `TArray<FDataRef>`
- 普通列表 -> `TArray<元素类型>`
- 枚举 -> 对应生成的 `E<EnumName>`

## 命名限制

UE 模式下，模板名和枚举值建议只使用：

```text
A-Z a-z 0-9 _
```

不合规名称会被替换成 `filter0`、`filter1` 一类名称，并在日志中提示。

## 来源

- UE 名称校验：`database-editor/src/core/form-and-reference.js:1`
- UE 生成入口：`database-editor/src/generators/ue-generator.js:400`
- `DataRefTypes.h` 生成：`database-editor/src/generators/ue-generator.js:413`
- 普通模板头文件生成：`database-editor/src/generators/ue-generator.js:439`
- 枚举头文件生成：`database-editor/src/generators/ue-generator.js:331`
- 保存后触发 UE 生成：`database-editor/src/services/template-persistence.js:548`
