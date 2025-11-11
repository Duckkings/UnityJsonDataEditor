# UnityJsonDataEditor

## Overview
UnityJsonDataEditor is a browser-based content authoring tool designed for managing Unity data schemas that live alongside generated C# classes. The application provides a three-column form editor, a spreadsheet-style table mode powered by Luckysheet, CSV import/export pipelines, and helper utilities for generating runtime loader artefacts.

## Core Features
- **Template management** – create, rename, duplicate, copy/paste and delete data templates while enforcing name validation rules.
- **Instance editing** – maintain ordered instance lists with range selection, drag support, duplicate-index navigation, and contextual actions.
- **Parameter configuration** – add and reorder parameters, configure types (including enum bindings), and edit payloads using context-aware inputs.
- **Luckysheet table mode** – switch between column mode and table mode, with locked header rows, validation for index columns, and Luckysheet synchronisation helpers.
- **File system integration** – select a working directory, ensure required sub-folders exist, regenerate supporting C# files, and persist the chosen folder via the File System Access API with permission recovery.
- **CSV import/export** – batch export selected templates to CSV, import spreadsheets back, and reconcile schema updates while guarding against incompatible changes.
- **Enum tooling** – dedicated handling for enum templates, cached persistence, and automatic C# enum regeneration.
- **Operational logging** – in-app log overlay with capped history, severity highlighting, and detailed error traces.
- **Productivity helpers** – keyboard shortcuts, dark/light theme toggle, adjustable parameter panel width, row height control, and contextual help dialog.

## Frontend Structure
All runtime logic lives in `script.js`, following the original immediately invoked function expression (IIFE) that scopes shared state and helper utilities. Responsibilities remain grouped by region within the file (state initialisation, data management, file access, CSV workflows, and UI events) with descriptive comment banners to simplify navigation.

## Runtime Workflow
1. On load, the app restores dark mode, registers event handlers, and attempts to reopen the previously authorised working directory if stored in IndexedDB.
2. When the user clicks **Select Working Directory**, `chooseDirectory()` now explicitly requests read/write permission via `verifyPermission()` immediately after `showDirectoryPicker()`. This prevents follow-up file operations from failing silently and provides a user-visible message when permission is declined or the picker is cancelled.
3. Once a directory is available, the tool ensures `csharpDate/`, `dataEntity/`, and optional `Editor/` sub-folders exist, then generates runtime loader artefacts and reads existing JSON/C# files into memory.
4. Users edit templates, instances, and parameters in either column mode or Luckysheet table mode. All changes stay in memory until **Save** is pressed.
5. The save pipeline writes JSON, regenerates C# files based on user decisions, updates manifests, and cleans up stale files. Enum definitions are cached and regenerated as needed.

## Usage
1. Serve the project through a local HTTPS-capable static server (the File System Access API requires a secure context) and open `index.html` in a Chromium-based browser.
2. Click **Select Working Directory** and grant read/write access to the folder containing (or intended to contain) `csharpDate` and `dataEntity`.
3. Create or modify templates, instances, and parameters as required. Use table mode for spreadsheet editing and leverage the log overlay to inspect warnings.
4. Use **Save** to persist JSON and optionally replace generated C# files. **Export CSV** and **Import CSV** allow round-tripping through external editors.
5. The application remembers the authorised folder and restores it automatically on the next launch.

## Design Notes
- State is maintained in-memory and serialised on demand; helper snapshots track structural changes to minimise redundant C# regeneration.
- Enum templates receive specialised handling so that JSON remains in sync with generated enum classes and cached metadata.
- Logging utilities are capped at 500 entries and update live when the overlay is visible.
- Permission recovery uses IndexedDB to cache directory handles; failure scenarios surface user-friendly messages and console traces for diagnosis.

## Development Tips
- `script.js` is referenced with `defer` so it executes after Luckysheet assets load while still running before DOMContentLoaded handlers fire.
- When editing or extending functionality, follow the existing section headers inside `script.js`: shared utilities live near the top, data/domain logic in the middle, file access helpers around the save/load region, and UI wiring near the bottom.
- Luckysheet integration expects the CDN resources referenced in `index.html`; update the versions in one place if necessary.

---

# UnityJsonDataEditor（中文）

## 概览
UnityJsonDataEditor 是一款基于浏览器的数据编辑工具，用于管理与 Unity C# 数据结构配套的 JSON 配置。它提供三栏式表单编辑界面、Luckysheet 表格模式、CSV 导入导出流程以及运行时加载脚本的生成能力。

## 核心功能
- **模板管理**：创建、重命名、复制/粘贴、删除模板，并对命名进行合法性校验。
- **实例编辑**：维护实例列表，支持范围选择、拖拽、多选删除以及重复索引跳转提示。
- **参数配置**：新增/排序参数，设置类型（包含枚举关联），根据上下文编辑实例载荷。
- **Luckysheet 表格模式**：在列编辑与表格模式之间切换，表头行锁定，索引列校验，并提供 Luckysheet 同步工具。
- **文件系统集成**：选择工作目录，自动创建所需子目录，重新生成 C# 辅助脚本，并通过 File System Access API 缓存目录授权。
- **CSV 导入导出**：批量导出选定模板为 CSV，导入外部表格并校验结构差异，阻止不兼容更新。
- **枚举支持**：专门的枚举模板处理逻辑，缓存持久化，以及自动生成 C# 枚举代码。
- **操作日志**：应用内日志浮层，展示最多 500 条记录，区分严重级别并附带错误详情。
- **效率工具**：键盘快捷键、深浅色主题切换、参数栏宽度和行高调节、帮助面板等。

## 前端结构
全部运行时代码集中在 `script.js` 中，通过一个 IIFE 封装共享状态和工具方法。文件内部按区域划分功能块（状态初始化、数据管理、文件系统、CSV 流程和界面事件），并配有注释标题以方便定位和维护。

## 运行流程
1. 页面加载后默认启用夜间模式、注册所有事件处理器，并尝试从 IndexedDB 恢复上一次授权的工作目录。
2. 点击「选择工作目录」时，`chooseDirectory()` 会在 `showDirectoryPicker()` 之后立即通过 `verifyPermission()` 申请读写权限，避免后续文件操作因权限不足而失败；若拒绝或取消会给出明确提示。
3. 成功选择目录后，工具会确保存在 `csharpDate/`、`dataEntity/`（以及可选的 `Editor/`）子目录，然后生成运行时加载脚本并读取现有 JSON/C# 文件。
4. 用户可以在列模式或 Luckysheet 表格模式中编辑模板、实例与参数，所有改动在点击「保存」前都保留在内存中。
5. 保存流程会写回 JSON，根据用户选择决定是否覆盖生成的 C# 文件，更新清单并清理冗余文件；枚举定义会按需缓存与再生成。

## 使用指南
1. 通过支持 HTTPS 的本地静态服务器提供站点（File System Access API 需要安全上下文），在 Chromium 系浏览器中打开 `index.html`。
2. 点击「选择工作目录」，为包含（或将要包含）`csharpDate` 与 `dataEntity` 的文件夹授予读写权限。
3. 按需创建或修改模板、实例和参数，可在表格模式中进行批量编辑，并使用日志面板查看警告信息。
4. 使用「保存」持久化 JSON，并视情况替换生成的 C# 文件；「导出 CSV」与「从 CSV 导入」用于与外部表格工具互通。
5. 应用会记住已授权的文件夹，下次打开时自动恢复。

## 设计说明
- 状态维护在内存中，通过结构快照判断是否需要重新生成 C# 代码，从而避免不必要的覆盖。
- 枚举模板拥有独立逻辑，保证 JSON、枚举 C# 文件与缓存三者保持一致。
- 日志记录上限为 500 条，打开面板时实时刷新。
- 通过 IndexedDB 缓存目录句柄并在失败时显示友好的提示，同时在控制台输出详细错误方便排查。

## 开发建议
- 通过 `defer` 引入 `script.js`，先加载 Luckysheet 依赖，再在 DOMContentLoaded 之前执行核心逻辑。
- 修改或扩展功能时，可依照 `script.js` 内的注释分区：前半部分是通用工具与校验，中段是数据和文件逻辑，保存/加载附近是文件系统工具，末尾集中处理界面事件与绑定。
- Luckysheet 依赖 `index.html` 中的 CDN 资源，如需升级版本，可在该处集中修改。
