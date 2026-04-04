using System;
using System.Collections.Generic;
using System.Linq;

namespace GameFramework.Core
{
    public sealed class RootTickRunnerCore : IRootRuntime
    {
        private sealed class ModuleEntry
        {
            public int Order;
            public int TickType;
            public ISystemModule Module;
            public bool Registered;
        }

        private readonly IRuntimeLogger _logger;
        private readonly ServiceRegistry _serviceRegistry = new ServiceRegistry();
        private readonly Dictionary<string, ModuleEntry> _moduleTable = new Dictionary<string, ModuleEntry>();

        private bool _modulesInitialised;
        private IEventBus _eventBus;
        private IDataTableRuntime _dataRuntime;

        public RootTickRunnerCore(IRuntimeLogger logger)
        {
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public void Initialize(IDataTableRuntime dataRuntime, IEventBus eventBus, string initTableName = "systemInitOrder")
        {
            _dataRuntime = dataRuntime ?? throw new ArgumentNullException(nameof(dataRuntime));
            _eventBus = eventBus ?? throw new ArgumentNullException(nameof(eventBus));

            RegisterService("eventbus", eventBus);
            RegisterService("database", dataRuntime);
            LoadSystemInitOrder(initTableName);
            _logger.Info("[RootTickRunner] 基础模块初始化完成");
        }

        public void RegisterService(string name, object instance)
        {
            _serviceRegistry.RegisterService(name, instance);
        }

        public T GetService<T>(string name) where T : class
        {
            return _serviceRegistry.GetService<T>(name);
        }

        public void RegisterModule(ISystemModule module)
        {
            if (module == null)
            {
                _logger.Error("[RootTickRunner] RegisterModule 参数为空");
                return;
            }

            if (!_moduleTable.TryGetValue(module.Name, out var entry))
            {
                _logger.Error($"[RootTickRunner] 未在 systemInitOrder 表中找到模块 '{module.Name}'");
                return;
            }

            if (entry.Registered)
            {
                _logger.Warning($"[RootTickRunner] 模块 '{module.Name}' 已经注册，重复注册已忽略");
                return;
            }

            entry.Module = module;
            entry.Registered = true;
            _logger.Info($"[RootTickRunner] 模块 '{module.Name}' 已注册");

            RegisterService(module.Name, module);
            CheckAndInitAllModules();
        }

        public void Tick(TickPhase phase)
        {
            if (!_modulesInitialised)
            {
                return;
            }

            var targetTickType = phase == TickPhase.LateUpdate ? 1 : 0;
            foreach (var entry in _moduleTable.Values.OrderBy(item => item.Order))
            {
                if (entry.TickType == targetTickType && entry.Module != null)
                {
                    entry.Module.Tick();
                }
            }
        }

        private void LoadSystemInitOrder(string initTableName)
        {
            EventBusTableSchema schema;
            try
            {
                schema = _dataRuntime.GetSchema(initTableName);
            }
            catch (Exception ex)
            {
                _logger.Error($"[RootTickRunner] 读取 {initTableName} 失败: {ex.Message}");
                return;
            }

            if (schema == null || schema.instances == null)
            {
                _logger.Error($"[RootTickRunner] 未找到 {initTableName} 表或表内没有实例");
                return;
            }

            _moduleTable.Clear();
            foreach (var pair in schema.instances)
            {
                var instance = pair.Value;
                var order = instance.GetInt("id", 0);
                var name = instance.GetString("name", null);
                var tickType = instance.GetInt("ticktype", 0);
                if (string.IsNullOrEmpty(name))
                {
                    _logger.Warning("[RootTickRunner] systemInitOrder 表中存在空名称实例，已跳过");
                    continue;
                }

                if (_moduleTable.ContainsKey(name))
                {
                    _logger.Warning($"[RootTickRunner] systemInitOrder 表存在重复名称 '{name}'，已忽略后续条目");
                    continue;
                }

                _moduleTable[name] = new ModuleEntry
                {
                    Order = order,
                    TickType = tickType,
                    Module = null,
                    Registered = false
                };
            }
        }

        private void CheckAndInitAllModules()
        {
            if (_modulesInitialised)
            {
                return;
            }

            foreach (var entry in _moduleTable.Values)
            {
                if (!entry.Registered)
                {
                    return;
                }
            }

            InitAllModules();
        }

        private void InitAllModules()
        {
            _modulesInitialised = true;
            foreach (var entry in _moduleTable.Values.OrderBy(item => item.Order).ToList())
            {
                try
                {
                    entry.Module.Init(this, _eventBus);
                    _logger.Info($"[RootTickRunner] 模块 '{entry.Module.Name}' 初始化完成");
                }
                catch (Exception ex)
                {
                    _logger.Error($"[RootTickRunner] 初始化模块 '{entry.Module.Name}' 时出现异常: {ex}");
                }
            }

            _logger.Info("[RootTickRunner] 所有业务模块初始化完成");
        }
    }
}
