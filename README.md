# 数据表编辑器 README 2.0

## 简介

这是一个运行在浏览器中的本地数据表编辑器，面向 `dataEntity` 目录下的 JSON 模板数据，并可按当前引擎模式生成对应的数据结构代码。

当前版本已经不是单一的 Unity 工具，而是一个支持三种生成形态的编辑器：

- `Unity` 模式：生成 C# 数据结构、枚举、Unity 运行时加载器和调试脚本。
- `Godot C#` 模式：生成 C# 数据结构、枚举、Godot 可用的运行时加载器和调试脚本。
- `UE` 模式：生成 Unreal Engine 使用的 C++ 头文件和枚举头文件。

编辑器提供两种编辑视图：

- `三列模式`：模板 / 实例 / 参数的结构化编辑。
- `表格模式`：基于 Luckysheet 的批量表格编辑。

它直接使用浏览器 `File System Access API` 读写本地目录，不依赖后端服务。

## 当前工作区结构

选择工作目录后，编辑器会按当前模式维护以下目录：

- `dataEntity/`
  用于保存模板 JSON。
- `dataEntity/manifest.json`
  记录非 `enum` 模板到 JSON 文件的映射。
- `dataEntity/toilet/`
  垃圾箱目录，被删除模板的 JSON 会先移动到这里。
- `dataEntity/csvoutput/`
  CSV 导出目录。
- `dataEditorConfig/config.json`
  编辑器配置，目前会记录当前引擎模式。

Unity 模式下还会维护：

- `csharpDate/`
  普通模板的 C# 数据结构脚本。
- `csharpDate/enums/`
  从 `enum` 模板生成的 C# 枚举。
- `csharpDate/modelstruct/`
  `modelCsharpe.cs`、`DataEntityRuntimeLoader.cs` 和说明文件。
- `csharpDate/DataEntityRuntimeTester.cs`
  运行时调试脚本。
- `Editor/DataEntityRuntimeTesterEditor.cs`
  Unity 自定义 Inspector 调试面板。

Godot C# 模式下还会维护：

- `godotCsharpDate/`
  普通模板的 C# 数据结构脚本。
- `godotCsharpDate/enums/`
  由 `enum` 模板生成的 C# 枚举。
- `godotCsharpDate/modelstruct/`
  `modelCsharpe.cs`、`DataEntityRuntimeLoader.cs` 和说明文件。
- `godotCsharpDate/DataEntityRuntimeTester.cs`
  Godot 调试脚本。

UE 模式下还会维护：

- `cppmodel/`
  普通模板生成的 `.h` 文件和 `DataRefTypes.h`。
- `cppmodel/enum/`
  枚举头文件。

## 快速开始

1. 用支持 `File System Access API` 的浏览器打开 `index.html`。
   当前默认入口为经典脚本 bundle，支持直接双击打开 `index.html`；推荐 Chrome 或 Edge。
   如果浏览器策略限制目录访问，再改用本地 HTTP 服务打开。
2. 点击“选择工作目录”。
   编辑器会自动检查并补齐所需子目录。
3. 根据目标引擎点击“切换引擎模式”。
   Unity 模式显示“重新生成 C# 数据结构脚本”，Godot C# 模式显示“重新生成 Godot C# 数据结构脚本”，UE 模式显示“重新生成 C++ 数据结构脚本”。
4. 在三列模式或表格模式中编辑模板数据。
5. 点击“保存”。
   保存会写入 JSON，并根据当前模式更新生成产物。

编辑器会尝试自动恢复上一次打开过的工作目录，并在工作目录里保存当前引擎模式。

## 按引擎使用

### Unity 项目

1. 切换到 `Unity` 模式。
2. 编辑模板后点击“保存”或“重新生成 C# 数据结构脚本”。
3. 将生成的 `csharpDate/`、`Editor/` 和 `dataEntity/` 放进 Unity 项目。
4. 运行时默认从 `Application.dataPath/dataEntity` 读取数据，也可以手动调用 `DataEntityRuntimeLoader.Initialize(customPath)`。
5. 调试时可使用 `DataEntityRuntimeTester.cs` 配合 `Editor/DataEntityRuntimeTesterEditor.cs`。

### Godot C# 项目

1. 切换到 `Godot C#` 模式。
2. 编辑模板后点击“保存”或“重新生成 Godot C# 数据结构脚本”。
3. 将生成的 `godotCsharpDate/` 和 `dataEntity/` 放进 Godot 项目。
4. 确保 Godot C# 项目已经安装 `Newtonsoft.Json` 依赖。
5. 运行时默认读取 `res://dataEntity`，也可以调用 `DataEntityRuntimeLoader.Initialize(customPath)` 指向别的目录。
6. 调试时可把 `godotCsharpDate/DataEntityRuntimeTester.cs` 挂到任意 `Node`，通过导出字段或代码调用执行测试。

### Unreal Engine 项目

1. 切换到 `UE` 模式。
2. 编辑模板后点击“保存”或“重新生成 C++ 数据结构脚本”。
3. 将生成的 `cppmodel/` 和 `dataEntity/` 放进 Unreal 工程。
4. 普通模板会生成 `.h`，枚举会生成到 `cppmodel/enum/`，公共引用类型会生成 `DataRefTypes.h`。
5. UE 模式下模板名和枚举值尽量只使用字母、数字和下划线，工具会对不合规命名做替换并记录日志。

## 基本操作方法

### 工具栏

- `选择工作目录`
  绑定本地目录，并自动加载模板。
- `保存`
  写入 JSON、`manifest.json`、垃圾箱状态和当前引擎产物。
- `表格模式`
  在三列模式和 Luckysheet 表格模式之间切换。
- `切换引擎模式`
  在 Unity / Godot C# / UE 三种生成形态之间切换。
- `重新生成 C# 数据结构脚本`
  Unity 和 Godot C# 模式可见；Godot 模式下按钮文案会切换为“重新生成 Godot C# 数据结构脚本”。
- `重新生成 C++ 数据结构脚本`
  仅 UE 模式可见。
- `导出为 CSV`
  进入导出选择模式，可按模板或实例选择导出范围。
- `从 CSV 导入`
  支持一次导入多个 CSV 文件。
- `夜间模式`
  切换深浅色主题。
- `操作指南`
  弹出快捷操作说明。
- `查看日志`
  打开日志面板，查看导入、导出、保存、生成和告警信息。
- `垃圾箱`
  查看、恢复或彻底删除已移入垃圾箱的模板。
- `参数栏比例 / 行高比例`
  调整参数栏宽度和列表行高。

### 三列模式

三列模式是当前的主编辑视图：

- 左列：模板列表。
- 中列：当前模板的实例列表。
- 右列：当前实例的保留字段和自定义参数。

常用流程：

1. 在左列新建或选择模板。
2. 在中列新建、复制、粘贴、删除实例。
3. 在右列新增参数、设置类型、填写索引绑定或直接编辑值。
4. 如需批量查看某几个字段，可使用“对比值”功能。
5. 保存到磁盘。

### 表格模式

表格模式用于按模板批量编辑实例数据：

- 左侧列出所有模板。
- 中间区域使用 Luckysheet 展示当前模板的实例表。
- 切回三列模式或执行保存时，会先尝试提交表格中的未落盘修改。

当模板没有实例时，表格模式会显示空状态提示。

### 搜索、多选和快捷键

编辑器内置了较完整的选择与批量操作能力：

- 单击：单选。
- 再次单击唯一选中项：取消选择。
- `Ctrl+点击`：增减选中模板、实例或参数。
- `Shift+点击`：区间多选。
- `Shift+拖拽`：拖拽范围多选。
- `Ctrl+C / Ctrl+V`：按当前焦点栏目复制 / 粘贴。
- `Delete`：删除当前选择。
- `Ctrl+S`：保存。
- `F1`：返回上一个选中的参数。
- `Alt+点击` 索引参数：跳转到被索引的模板 / 实例，并尽量定位到目标字段。

模板和实例列表支持搜索。搜索结果只剩一项时会自动选中该项。

## 功能介绍

### 1. 模板、实例、参数编辑

- 模板、实例、参数都支持创建、重命名、删除和多选。
- 实例支持拖拽排序。
- 模板和参数也支持通过快捷键复制 / 粘贴。
- 参数支持 `string`、`int`、`float`、`long`、`bool`、`list`、`object`，以及由 `enum` 模板派生出来的枚举类型。
- `list` 参数支持指定元素类型。

### 2. 保留字段与索引字段

每个实例都包含四个保留字段：

- `template`
- `id`
- `name`
- `index`

其中 `index` 不是独立输入字段，而是根据当前模板的 `indexField` 动态计算得出。普通模板可以把 `indexField` 切换为：

- `id`
- `name`
- 任一普通参数名

`enum` 模板的 `indexField` 固定为 `id`。

### 3. 索引参数

参数可以绑定到另一个模板的可索引字段，形成索引引用：

- 右栏头部可选择索引目标模板和目标参数。
- 绑定后，该参数会保存为 `{ template, by, value }` 形式的数据引用。
- 单值索引和列表索引都支持。
- 编辑器会为索引参数提供候选值建议。
- 索引目标不能指向 `enum` 模板。

### 4. enum 模板机制

名字为 `enum` 的模板具有特殊语义：

- 该模板创建后不可改名。
- 其他模板禁止重命名为 `enum`。
- `enum` 模板的每个实例可看作一个枚举类型。
- 枚举值从实例 `payload` 中的数字键 `0、1、2...` 顺序提取。
- `enum` 模板会参与 Unity C# 枚举生成，也会参与 UE 枚举头文件生成。

如果当前工作目录里没有 `enum.json`，编辑器还会尝试从浏览器 IndexedDB 中恢复 `enum` 模板缓存。

### 5. 对比值

“对比值”用于把当前选中的参数快照固定下来，并直接附加显示在实例列表上，适合做横向比对：

- 普通模板：显示所选参数的当前值。
- `enum` 模板：显示当前实例中所选数字键对应的值。

### 6. CSV 导入导出

导出：

- 导出目录固定为 `dataEntity/csvoutput/`。
- 支持整模板导出，也支持只导出选中的实例。
- CSV 前两行分别是字段名和字段类型。
- 索引参数会带出目标模板、目标参数和索引字段信息。

导入：

- 支持一次导入多个 CSV。
- CSV 至少需要 `template / id / name / index` 四列。
- `list` 列要求是 JSON 数组文本，`object` 列要求是 JSON 对象文本。
- 导入同名模板时会覆盖编辑器中的现有模板内容。

### 7. 日志与垃圾箱

日志：

- 导入、导出、保存、生成、告警和错误都会进入日志面板。
- 日志面板支持清空。

垃圾箱：

- 删除模板时，JSON 不会立刻物理删除，而是先移动到 `dataEntity/toilet/`。
- 垃圾箱支持恢复模板。
- 也支持彻底清空。

### 8. 保存与校验策略

保存不是“无条件原样落盘”，而是包含一层校验和过滤：

- 非 `enum` 模板会写入 `dataEntity/<模板名>.json`。
- `enum` 模板会额外生成 `enum.json`，并缓存到浏览器 IndexedDB。
- 保存后会重写 `manifest.json`。
- 如果实例 `id` 重复，重复项不会写入 JSON，会在日志里给出警告。
- 如果 `list` 参数里存在不符合元素类型的值，该实例也会被跳过保存，并记录到日志。
- Unity / Godot C# 模式下，如果结构变化导致对应 `.cs` 内容变化，保存时会提示你选择：
  替换 C# 并保存 JSON，或只保存 JSON。

### 9. 代码生成

Unity 模式：

- 生成每个普通模板对应的 C# 数据结构类。
- 从 `enum` 模板生成 C# 枚举文件。
- 生成 `DataEntityRuntimeLoader.cs`。
- 生成 `DataEntityRuntimeTester.cs` 和 `DataEntityRuntimeTesterEditor.cs`。

Godot C# 模式：

- 生成每个普通模板对应的 C# 数据结构类。
- 从 `enum` 模板生成 C# 枚举文件。
- 生成 Godot 可用的 `DataEntityRuntimeLoader.cs`。
- 生成 Godot 可用的 `DataEntityRuntimeTester.cs`。
- 不生成 Unity 专属的 `Editor/` 调试面板脚本。

UE 模式：

- 为普通模板生成 `.h` 头文件。
- 为枚举生成 `cppmodel/enum/*.h`。
- 生成 `DataRefTypes.h`。
- 遇到不符合 UE 命名规则的名称时，会自动替换并在日志中给出提示。

## 使用建议

- Unity 项目优先使用 Unity 模式，Godot C# 项目优先使用 Godot C# 模式，UE 项目优先使用 UE 模式。
- Godot C# 项目在接入前先确认 `Newtonsoft.Json` 依赖已安装。
- 模板名和实例名尽量不要使用纯数字。
- UE 模式下，模板名和枚举值最好只用字母、数字和下划线。
- 需要大量录表时优先用表格模式，做结构设计和引用配置时优先用三列模式。

## 注意事项

- 当前编辑器默认以“单工作区、单引擎产物”为目标。
  在保存或重新生成时，会清理另一种引擎模式下的生成目录：
  Unity 模式会清理 `godotCsharpDate/` 和 `cppmodel/`，Godot C# 模式会清理 `csharpDate/`、`Editor/` 和 `cppmodel/`，UE 模式会清理 `csharpDate/`、`Editor/` 和 `godotCsharpDate/`。
- 工作目录目录结构不符合要求时会阻止加载。
  例如 Unity / Godot C# 模式下各自的 C# 输出目录中出现非 `.cs` 文件，或 UE 模式下 `cppmodel/` 中出现非 `.h` 文件。
- `index` 参数跳转、重复标记、日志和垃圾箱都以当前编辑器内存状态为准，最终落盘结果仍以“保存时校验后的 JSON”为准。
- 旧版 README 已经过期，本文件以当前 `index.html` 和 `script.js` 的实现为准。
## 2026-04-02 拆分更新

- 源码入口保持为 `src/main.js`，浏览器运行入口调整为根目录 `script.js` bundle，以兼容直接打开 `index.html` 的 `file:///` 场景。
- `src/ui/panels.js`、`src/ui/interaction.js`、`src/ui/sheet-mode.js`、`src/services/csv-service.js` 已承载真实实现，不再只是桥接壳。
- `window.LegacyApp.modules` 继续保留，但其 `panels`、`interaction`、`sheetMode`、`csvService` 已指向真实模块实例。
- `src/main.js` 当前职责以模块装配、静态事件绑定和跨模块编排为主，`script.js` 由其打包生成，不再承载手写业务逻辑。

## 运行入口与重建

- 浏览器实际加载：`index.html -> script.js`
- 源码维护入口：`src/main.js`
- 重建运行 bundle：

```powershell
.\build-runtime.ps1
```
