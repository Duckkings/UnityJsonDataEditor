# Docs

这份目录现在承载整套工具链的文档，而不再只放编辑器侧资料。

当前仓库包含两部分能力：

- 数据表编辑与代码生成器
- EventBus / TickRunner 运行时框架

## 目录分类

### `editor/`

编辑器自身的方案、计划和历史设计文档。

- `editor/plans/`
  编辑器相关方案稿和阶段性计划。
- `editor/roadmap/`
  编辑器未来规划与 TODO。
- `editor/legacy/`
  历史文档归档。

### `runtime/`

运行时框架文档。

- `runtime/architecture/`
  说明编辑器生成物、运行时框架和数据库读取接口之间的关系。
- `runtime/setup/`
  面向实际项目接入的配置说明。

### `reference/`

参考资料归档。

- `reference/eventbus-tickrunner/`
  原始设计 PDF、截图和保留资料。

## 建议阅读顺序

如果你是第一次接这套工具，建议按这个顺序读：

1. `runtime/architecture/tool-suite-overview.md`
2. `runtime/architecture/eventbus-tickrunner-runtime.md`
3. `runtime/setup/unity.md` 或 `runtime/setup/godot.md`
4. 再回看 `reference/` 里的设计 PDF

如果你只想用编辑器，不接运行时框架，可以直接看根目录 `README.md` 和 `editor/` 下文档。
