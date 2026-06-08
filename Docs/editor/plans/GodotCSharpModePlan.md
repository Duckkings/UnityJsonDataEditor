# Godot C# 方案评审清单

这份文档用于在实现前后快速检查 Godot C# 方案是否只碰到允许范围，没有误伤工具主体功能。

## 评审重点

只看三件事：

1. 是否真的只是在 `Unity / Godot C# / UE` 三模式之间扩展，而不是重写编辑器主体。
2. 是否把 Unity 专属运行时脚本替换成 Godot 可用实现。
3. 是否没有把 CSV、垃圾箱、三列编辑、表格编辑等核心功能带偏。

## 阻断问题

以下问题任意一个没解决，Godot C# 方案就只能算草案，不能直接上线：

1. Godot 项目缺少 `Newtonsoft.Json`。
2. 运行时脚本仍然依赖 `UnityEngine`、`UnityEditor` 或 `EditorApplication`。
3. Godot 输出目录和 Unity 输出目录混在一起，导致后续保存互相清理。
4. 方案试图把 Unity 的 `Editor/` Inspector 调试体验原样搬到 Godot。
5. 方案修改了 `dataEntity/manifest.json` 格式或模板 JSON 结构。

## 注意事项

1. `Unity` 和 `Godot C#` 都属于 C# 生成模式，但不应把它们当成同一个模式。
2. 共享的是模板和枚举的结构生成，不共享 Unity 专属的 Editor 调试脚本。
3. Godot C# 运行时脚本应保持数据访问接口风格一致，但内部实现必须改成 Godot API。
4. 目录清理只能清理冲突产物，不能误删 `dataEntity/`、配置目录或其他业务文件。
5. `script.js` 必须重新打包验证，不能只改 `src/` 里的源码就结束。

## 允许改动范围

允许：

- 新增 `ENGINE_MODES.GODOT`
- 新增 `isGodotMode`、`isCSharpMode`
- 新增 Godot 运行时生成器
- 调整 C# 保存计划，让 Unity 和 Godot 共用 C# 结构生成
- 调整工作区目录规则，让 Godot 使用独立输出目录
- 更新 `Docs/` 文档
- 重新打包 `script.js`

不允许：

- 改动三列编辑主逻辑
- 改动表格编辑主逻辑
- 改动 CSV 导入导出
- 改动垃圾箱恢复规则
- 改动 UE 生成逻辑的命名约束
- 改动模板、实例、参数的数据结构定义

## 回归清单

评审时建议逐项确认：

- Unity 模式切回后，原有 C# 生成结果不变。
- Godot C# 模式切换后，按钮文案和可见性正确。
- Godot C# 模式保存后只生成 Godot 运行时脚本，不生成 Unity 的 `Editor/` 文件。
- UE 模式仍然只生成 UE 产物。
- `script.js` 重新打包后能直接打开页面。
- 文档里清楚写了 Godot 依赖和目录约定。
