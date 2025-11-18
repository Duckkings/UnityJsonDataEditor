# UnityJsonDataEditor

面向 Unity 的数据表编辑器，直接在浏览器里维护 JSON 数据表，自动生成运行时可用的 C# 访问脚本。

## 工作目录结构
- `csharpDate/`：生成的 C# 数据结构、`modelstruct/modelCsharpe.cs` 以及 `DataEntityRuntimeLoader.cs`、`DataEntityRuntimeTester.cs` 等运行时脚本。
- `dataEntity/`：每个模板一个同名的 `.json` 文件，`manifest.json` 维护模板到路径的映射，自动带有 `trash/` 垃圾箱目录。
- `Editor/`：生成的编辑器脚本（如 `DataEntityRuntimeTesterEditor.cs`）。
- 目录检查规则：`csharpDate` 仅允许 `.cs`，`dataEntity` 仅允许 `.json`，其他文件会阻塞加载。

## 快速开始
1. 用支持 File System Access API 的浏览器（Chrome/Edge）打开 `index.html`（建议通过本地服务器以获得安全上下文）。
2. 点击「选择工作目录」，挑选或初始化包含 `csharpDate` 与 `dataEntity` 的目录。
3. 在「模板 / 实例 / 参数」三列界面中编辑数据，或切换「表格模式」使用 Luckysheet 风格的表格批量修改。
4. 需要时点击「保存」同步 JSON 与 manifest，并更新 C# 结构；「重新生成C#数据结构脚本」可强制刷新脚本；导入/导出 CSV 可批量搬运数据。
5. 点击「操作指南」随时查看快捷操作提示，夜间模式、行高/列宽滑条可调整显示。

## 操作说明（内置指南要点）
- 选择与多选：单击单选（再次单击唯一项可取消）；`Ctrl+单击` 增/减选；`Shift+单击` 按锚点成段选择；`Shift+拖拽` 框选。
- 索引与跳转：右栏索引参数有「索引值」输入框；`Alt+单击` 索引参数可跳转到被引用的模板/实例并尝试选中字段。
- 快捷键：`Ctrl+C / Ctrl+V` 复制/粘贴（作用于当前列）；`Delete` 删除选择；`F1` 回到上一个参数；`Ctrl+S` 保存。
- 运行提示：未选择实例时部分操作会警告；日志面板记录操作，垃圾箱可找回删除的 JSON。

## 现有规则与约束
- 保留字段：每个模板实例都有 `template`、`id`、`name`、`index`，`index` 下拉只能在保留字段或参数中选择。
- Enum 模板规则：枚举值从实例自身的数字键顺序提取；参数与实例一一对应（兼容旧调用但不再重命名参数）。
- Manifest：`dataEntity/manifest.json` 记录模板与 JSON 文件名；重复的实例索引会在控制台提示并为后续实例追加 `_1/_2`。
- 目录：`trash/` 存放删除的模板 JSON；导出 CSV 位于 `dataEntity/csvoutput/`；非 `.json/.cs` 文件会阻止加载。
- 运行时调用前必须先 `DataEntityRuntimeLoader.Initialize`，否则读取会抛异常；索引参数读取时 `getParameter` 需要填写要读取的字段。

## 运行时代码使用
### DataEntityRuntimeLoader（生成于 `csharpDate/modelstruct/`）
```csharp
// 初始化（dataEntity 在 Assets 下可直接调用）
DataEntityRuntimeLoader.Initialize();
// 或显式指定目录
DataEntityRuntimeLoader.Initialize(Path.Combine(Application.dataPath, "dataEntity"));

// 读取参数：可用实例名或索引键
var damage = DataEntityRuntimeLoader.GetValue<int>("TemplateName", null, "indexKey", "damage");
// 索引参数：通过 getParameter 指定引用实例中的字段
var hp = DataEntityRuntimeLoader.GetValue<int>("TemplateName", "实例名称", null, "refParam", "hp");
// 直接访问 DataRef
var dataRef = DataEntityRuntimeLoader.GetIndexReference("TemplateName", "实例名称", null, "refParam");
var refKey = DataEntityRuntimeLoader.GetIndexValue("TemplateName", "实例名称", null, "refParam");

// 获取完整模板
var schema = DataEntityRuntimeLoader.GetSchema("TemplateName"); // schema.instances 是 Dictionary<string, object>

// 热重载（自动暂停/恢复 EditorApplication.isPaused）
DataEntityRuntimeLoader.Reload();
```
注意：`manifest.json` 位于 `dataEntity/`，字段 `path` 存储 JSON 文件名。

### DataEntityRuntimeTester（生成于 `csharpDate/`，辅助调试）
1. 在 `csharpDate` 中找到 `DataEntityRuntimeTester.cs` 并挂到需要测试的 GameObject。
2. 确保 `DataEntityRuntimeTesterEditor.cs` 位于 `Editor/` 以启用自定义 Inspector。
3. 在 Inspector 的自定义面板选择操作：
   - `Initialize`：可选数据目录，空则使用 `dataEntity`。
   - `Reload`：调用 `DataEntityRuntimeLoader.Reload` 并自动暂停/恢复。
   - `GetValue`：填写模板名、实例名/索引字符、参数名、参数类型（索引参数时在 `getParameter` 写明读取字段）。
4. 填写完参数点「执行」，Console 会输出结果或错误。

## 设计概览
- 前端纯 HTML/CSS/JS，依赖 Luckysheet 提供表格模式；经典模式使用三列面板管理模板/实例/参数。
- 通过 File System Access API 直接读写本地目录，无需服务器即可生成/更新 JSON 与 C# 脚本。
- 自动生成运行时脚手架 (`DataEntityRuntimeLoader`, `DataEntityRuntimeTester` + Editor) 与模型结构文件，保持数据与代码同步。
- 提供操作日志、垃圾箱、CSV 导入/导出、明暗主题及行高/参数宽度调节，方便迭代与回滚。
