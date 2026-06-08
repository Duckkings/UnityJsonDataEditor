using System;
using System.Collections.Generic;
using System.Linq;

namespace GameFramework.Core
{
    public sealed class RootTickRunnerCore : IRootRuntime
    {
        public const string AllModulesInitializedEventName = "tickrunner.all_modules_initialized";

        public sealed class ModulesInitializedEventPayload
        {
            public string RootName { get; set; }

            public int ModuleCount { get; set; }

            public IReadOnlyList<string> ModuleNames { get; set; }
        }

        private sealed class ModuleEntry
        {
            public int Order;
            public int Priority;
            public int TickType;
            public IReadOnlyList<string> Tags;
            public ISystemModule Module;
            public bool Registered;
        }

        private readonly IRuntimeLogger _logger;
        private readonly ServiceRegistry _serviceRegistry = new ServiceRegistry();
        private readonly Dictionary<string, ModuleEntry> _moduleTable = new Dictionary<string, ModuleEntry>();

        private bool _modulesInitialised;
        private IEventBus _eventBus;
        private IDataTableRuntime _dataRuntime;
        private string _moduleDeclareTableName = "systemModuleDeclare";

        public RootTickRunnerCore(IRuntimeLogger logger)
        {
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public void Initialize(IDataTableRuntime dataRuntime, IEventBus eventBus, string initTableName = "systemModuleDeclare")
        {
            _dataRuntime = dataRuntime ?? throw new ArgumentNullException(nameof(dataRuntime));
            _eventBus = eventBus ?? throw new ArgumentNullException(nameof(eventBus));

            RegisterService("eventbus", eventBus);
            RegisterService("database", dataRuntime);
            _eventBus.RegisterCustomEvent(AllModulesInitializedEventName, string.Empty);
            LoadSystemModuleDeclare(initTableName);
            _logger.Info("[RootTickRunner] Base services initialized.");
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
                _logger.Error("[RootTickRunner] RegisterModule received a null module.");
                return;
            }

            if (!_moduleTable.TryGetValue(module.Name, out var entry))
            {
                _logger.Error($"[RootTickRunner] Module '{module.Name}' was not declared in {_moduleDeclareTableName}.");
                return;
            }

            if (entry.Registered)
            {
                _logger.Warning($"[RootTickRunner] Module '{module.Name}' is already registered. Duplicate registration ignored.");
                return;
            }

            entry.Module = module;
            entry.Registered = true;
            _logger.Info($"[RootTickRunner] Module '{module.Name}' registered.");

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
            foreach (var entry in GetOrderedModuleEntries())
            {
                if (entry.TickType == targetTickType && entry.Module != null)
                {
                    entry.Module.Tick();
                }
            }
        }

        private void LoadSystemModuleDeclare(string initTableName)
        {
            var resolvedTableName = string.IsNullOrEmpty(initTableName) ? "systemModuleDeclare" : initTableName;
            var schema = TryGetSystemModuleSchema(resolvedTableName);
            if ((schema == null || schema.instances == null)
                && string.Equals(resolvedTableName, "systemModuleDeclare", StringComparison.Ordinal))
            {
                var legacySchema = TryGetSystemModuleSchema("systemInitOrder");
                if (legacySchema != null && legacySchema.instances != null)
                {
                    _logger.Warning("[RootTickRunner] systemModuleDeclare was not found. Falling back to legacy systemInitOrder.");
                    resolvedTableName = "systemInitOrder";
                    schema = legacySchema;
                }
            }

            if (schema == null || schema.instances == null)
            {
                _logger.Error($"[RootTickRunner] Table '{resolvedTableName}' was not found or has no instances.");
                return;
            }

            _moduleDeclareTableName = resolvedTableName;
            _moduleTable.Clear();
            foreach (var pair in schema.instances)
            {
                var instance = pair.Value;
                var order = instance.GetInt("id", 0);
                var priority = instance.GetInt("priority", 0);
                var name = instance.GetString("moduleKey", instance.GetString("name", null));
                var tickType = instance.GetInt("ticktype", 0);
                if (string.IsNullOrEmpty(name))
                {
                    _logger.Warning($"[RootTickRunner] Found a {resolvedTableName} entry with an empty moduleKey/name. It was skipped.");
                    continue;
                }

                if (_moduleTable.ContainsKey(name))
                {
                    _logger.Warning($"[RootTickRunner] Duplicate module name '{name}' found in {resolvedTableName}. Later entries were skipped.");
                    continue;
                }

                _moduleTable[name] = new ModuleEntry
                {
                    Order = order,
                    Priority = priority,
                    TickType = tickType,
                    Tags = ParseTags(instance.GetString("tags", string.Empty)).AsReadOnly(),
                    Module = null,
                    Registered = false
                };
            }
        }

        private EventBusTableSchema TryGetSystemModuleSchema(string tableName)
        {
            try
            {
                return _dataRuntime.GetSchema(tableName);
            }
            catch (Exception ex)
            {
                _logger.Warning($"[RootTickRunner] Failed to load {tableName}: {ex.Message}");
                return null;
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
            var initializedModuleNames = new List<string>();
            var allModulesSucceeded = true;

            foreach (var entry in GetOrderedModuleEntries().ToList())
            {
                try
                {
                    entry.Module.Init(this, _eventBus);
                    initializedModuleNames.Add(entry.Module.Name);
                    _logger.Info($"[RootTickRunner] {ResolveRootNodeName()} {entry.Module.Name} initialized.");
                }
                catch (Exception ex)
                {
                    allModulesSucceeded = false;
                    _logger.Error($"[RootTickRunner] Exception while initializing module '{entry.Module.Name}': {ex}");
                }
            }

            if (allModulesSucceeded)
            {
                _eventBus.PublishEvent(
                    this,
                    AllModulesInitializedEventName,
                    new ModulesInitializedEventPayload
                    {
                        RootName = ResolveRootNodeName(),
                        ModuleCount = initializedModuleNames.Count,
                        ModuleNames = initializedModuleNames.AsReadOnly()
                    });
            }
            else
            {
                _logger.Warning(
                    $"[RootTickRunner] Event '{AllModulesInitializedEventName}' was not published because at least one module failed to initialize.");
            }

            _logger.Info("[RootTickRunner] All registered system modules finished initialization.");
        }

        private IEnumerable<ModuleEntry> GetOrderedModuleEntries()
        {
            return _moduleTable.Values
                .OrderByDescending(item => item.Priority)
                .ThenBy(item => item.Order);
        }

        private string ResolveRootNodeName()
        {
            var rootNodeName = GetService<string>("rootNodeName");
            if (!string.IsNullOrEmpty(rootNodeName))
            {
                return rootNodeName;
            }

            return "Root";
        }

        private static List<string> ParseTags(string tagExpression)
        {
            var result = new List<string>();
            if (string.IsNullOrEmpty(tagExpression))
            {
                return result;
            }

            var parts = tagExpression.Split(new[] { '|', ',' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var part in parts)
            {
                var trimmed = part.Trim();
                if (!string.IsNullOrEmpty(trimmed) && !result.Contains(trimmed))
                {
                    result.Add(trimmed);
                }
            }

            return result;
        }
    }
}
