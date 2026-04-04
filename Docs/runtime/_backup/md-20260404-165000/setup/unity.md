# Unity 配置说明

这份文档说明如何在 Unity 项目里把这套工具链完整接起来。

## 1. 需要哪些产物

### 来自编辑器生成的内容

- `dataEntity/`
- `csharpDate/`
- `Editor/`

### 来自本仓库运行时目录的内容

- `Runtime/Shared/`
- `Runtime/Unity/`

最常见的做法是：

```text
Assets/
  dataEntity/
  csharpDate/
  Editor/
  EventBusRuntime/
    Shared/
    Unity/
```

## 2. Root 场景结构

最小场景结构：

```text
GameRoot
  RootTickRunner
  EventBus
```

推荐把 `RootTickRunner` 和 `EventBus` 挂在同一个 GameObject 上。

当前 Unity 版 `RootTickRunner` 会在 `Awake()` 中自动完成：

1. `DataEntityRuntimeLoader.Initialize()`
2. 创建 `DataEntityRuntimeAdapter`
3. 获取或补建 `EventBus`
4. 初始化 `EventBus`
5. 注册基础服务 `"eventbus"` 和 `"database"`
6. 读取 `systemInitOrder`

## 3. 必备数据表

至少要准备三类表：

### `systemInitOrder`

默认表名就是 `systemInitOrder`。

至少包含：

- `id`
- `name`
- `ticktype`

语义：

- `id`
  初始化顺序，越小越早
- `name`
  必须和模块脚本里的 `ISystemModule.Name` 完全一致
- `ticktype`
  `0 = Update`，`1 = LateUpdate`

### 事件表

由 `EventBus.eventTableTemplateName` 指定。

### 标签表

由 `EventBus.tagTableTemplateName` 指定。

## 4. EventBus Inspector

主要关注这些字段：

- `mode`
- `eventTableTemplateName`
- `tagTableTemplateName`
- `initTagFilters`
- `enableScopeCheckForLocal`
- `allowTriggerTagAtRuntime`
- `logVerbose`

## 5. 模块怎么写

模块实现 `ISystemModule`，最小模式如下：

```csharp
using GameFramework;
using UnityEngine;

public class ExampleSystem : MonoBehaviour, ISystemModule
{
    public string Name => "examplesystem";

    private IEventBus eventBus;

    private void Start()
    {
        RootTickRunner.Instance.RegisterModule(this);
    }

    public void Init(IRootRuntime root, IEventBus eventBus)
    {
        this.eventBus = eventBus;
    }

    public void Tick()
    {
    }

    private void OnDestroy()
    {
        eventBus?.UnsubscribeAll(this);
    }
}
```

规则：

- `Name` 必须和 `systemInitOrder.name` 完全一致
- 在 `Start()` 里调用 `RegisterModule(this)`
- 模块不会在注册瞬间立刻 `Init()`，而是等所有声明模块注册完成后统一初始化

## 6. 推荐接入顺序

1. 先用编辑器导出 `dataEntity/` 和 Unity 运行时代码
2. 把 `Runtime/Shared + Runtime/Unity` 拷进 Unity 工程
3. 搭场景里的 `RootTickRunner + EventBus`
4. 填 `systemInitOrder`
5. 填事件表和标签表
6. 最后再挂业务模块

## 7. 常见问题

### Root 没有完成初始化

优先检查：

- `dataEntity/manifest.json` 是否存在
- `DataEntityRuntimeLoader` 是否能读到 `systemInitOrder`
- `systemInitOrder.name` 是否和模块 `Name` 完全一致
- 表里写的模块是否都真的执行了 `RegisterModule(this)`

### 模块没有进入 `Init()`

优先检查：

- 是否写进了 `systemInitOrder`
- 是否在 `Start()` 里调用了 `RegisterModule(this)`
- 是否还有别的声明模块没注册完成

### 事件发了没人收

优先检查：

- 事件名是否真的在事件表里声明
- 事件是否被 `initTagFilters` 过滤掉
- 是否订阅到了错误的总线实例
