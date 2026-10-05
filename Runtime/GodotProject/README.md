# Godot 项目注入快照

这里是编辑器 Godot C# 注入和刷新脚本的正式来源。16 个文件取自 PAS 项目当前工作目录，源路径和 SHA-256 见 [manifest.json](manifest.json)。`database-editor/build-godot-assets.ps1` 校验快照后将其嵌入浏览器 bundle；运行编辑器时不依赖 PAS 路径或在线下载。

更新请执行 `database-editor/sync-pas-runtime.ps1`。不要直接修改生成的 `godot-project-assets.js`。`Runtime/Shared` 和 `Runtime/Godot` 的历史分文件示例不参与此注入包。

新工程额外使用生成器提供的最小场景和声明表，不复制 PAS 的系统场景或表实例。UI 系统是通用依赖；机甲、碰撞、战斗、关卡等业务模块由项目自行扩展。当前验收基线为 Godot .NET 4.6.1、.NET 8、Newtonsoft.Json 13.0.4。
