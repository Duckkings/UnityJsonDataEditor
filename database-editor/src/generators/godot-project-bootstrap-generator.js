export const GODOT_RUNTIME_FOLDER_NAME = 'EventBusTickRunner';
export const GODOT_PREFAB_FOLDER_NAME = 'prefab';
export const GODOT_GAME_ROOT_SCENE_NAME = 'GameRoot.tscn';
export const GODOT_OBJECT_BASE_SCENE_NAME = 'ObjectBase.tscn';
export const SYSTEM_MODULE_DECLARE_TEMPLATE_NAME = 'systemModuleDeclare';
export const MODULE_DECLARE_TEMPLATE_NAME = 'moduleDeclare';
export const SYSTEM_EVENT_TEMPLATE_NAME = 'systemEvent';
export const SYSTEM_EVENT_TAG_TEMPLATE_NAME = 'systemEventTag';
export const EVENT_BUS_INIT_FILTER_TEMPLATE_NAME = 'eventBusInitFilter';

const DEFAULT_SYSTEM_MODULE_DECLARE_INSTANCE_NAME = 'examplesystem';
const DEFAULT_MODULE_DECLARE_INSTANCE_NAME = 'examplemodule';
const DEFAULT_SYSTEM_EVENT_INSTANCE_NAME = 'systemevent';
const DEFAULT_SYSTEM_EVENT_TAG_INSTANCE_NAME = 'exampletag';
const DEFAULT_WORLD_BUS_PROFILE_NAME = 'global_world_bus';

function buildBootstrapTemplateInstance({
  templateName,
  indexField = 'id',
  id = 0,
  name = 'default',
  payload = {},
} = {}) {
  const resolvedName = String(name || '').trim();
  const nextPayload = {
    template: templateName,
    id,
    name: resolvedName,
    ...payload,
  };
  const rawIndexValue =
    Object.prototype.hasOwnProperty.call(nextPayload, indexField) && nextPayload[indexField] != null
      ? nextPayload[indexField]
      : indexField === 'name'
        ? resolvedName
        : id;
  nextPayload.index = String(rawIndexValue ?? id);

  return {
    id,
    name: resolvedName,
    payload: nextPayload,
  };
}

function buildGodotSharedContractsContent() {
  return `
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace GameFramework
{
    public enum EventBusScopeMode
    {
        Global,
        Local
    }

    public sealed class EventBusConfig
    {
        public EventBusScopeMode Mode { get; set; } = EventBusScopeMode.Global;

        public string EventTableTemplateName { get; set; }

        public string TagTableTemplateName { get; set; }

        public string InitTagFilterTableTemplateName { get; set; }

        public string InitTagFilterProfileName { get; set; }

        public List<string> InitTagFilters { get; set; } = new List<string>();

        public bool EnableScopeCheckForLocal { get; set; } = true;

        public bool AllowTriggerTagAtRuntime { get; set; }

        public bool LogVerbose { get; set; }

        public bool LogPublishedEvents { get; set; }
    }

    public class EventBusTableInstance
    {
        private readonly Dictionary<string, object> _fields;

        public EventBusTableInstance(Dictionary<string, object> fields)
        {
            _fields = fields;
        }

        public string GetString(string columnName, string defaultValue)
        {
            if (TryGetFieldValue(columnName, out var value) && value != null)
            {
                if (value is string text)
                {
                    return text;
                }

                return value.ToString();
            }

            return defaultValue;
        }

        public int GetInt(string columnName, int defaultValue)
        {
            if (!TryGetFieldValue(columnName, out var value) || value == null)
            {
                return defaultValue;
            }

            switch (value)
            {
                case int intValue:
                    return intValue;
                case long longValue when longValue >= int.MinValue && longValue <= int.MaxValue:
                    return (int)longValue;
                case float floatValue:
                    return (int)floatValue;
                case double doubleValue:
                    return (int)doubleValue;
                case decimal decimalValue:
                    return (int)decimalValue;
                case string text when int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed):
                    return parsed;
                case IConvertible convertible:
                    try
                    {
                        return Convert.ToInt32(convertible, CultureInfo.InvariantCulture);
                    }
                    catch
                    {
                        return defaultValue;
                    }
                default:
                    return defaultValue;
            }
        }

        private bool TryGetFieldValue(string columnName, out object value)
        {
            value = null;
            if (_fields == null || string.IsNullOrEmpty(columnName))
            {
                return false;
            }

            if (_fields.TryGetValue(columnName, out value))
            {
                return true;
            }

            if (_fields.TryGetValue("payload", out var payloadObject) && payloadObject is IDictionary<string, object> payload)
            {
                return payload.TryGetValue(columnName, out value);
            }

            return false;
        }
    }

    public class EventBusTableSchema
    {
        public Dictionary<string, EventBusTableInstance> instances;
    }

    public struct EventEnvelope
    {
        public string EventName;
        public List<string> Tags;
        public object BusOwner;
        public object Sender;
        public float Time;
        public object Payload;
    }

    public interface IDataTableRuntime
    {
        EventBusTableSchema GetSchema(string templateName);
    }

    public sealed class ModuleDeclareRecord
    {
        public int Id { get; set; }

        public string ModuleKey { get; set; }

        public string Tags { get; set; }

        public int Priority { get; set; }
    }

    public interface IModuleDeclareRuntime
    {
        bool TryGetModuleDeclare(string moduleKey, out ModuleDeclareRecord record);
    }

    public sealed class ModuleDeclareRuntime : IModuleDeclareRuntime
    {
        private readonly Dictionary<string, ModuleDeclareRecord> _records =
            new Dictionary<string, ModuleDeclareRecord>(StringComparer.Ordinal);

        public ModuleDeclareRuntime(IDataTableRuntime dataRuntime, string templateName = "moduleDeclare")
        {
            if (dataRuntime == null || string.IsNullOrEmpty(templateName))
            {
                return;
            }

            EventBusTableSchema schema;
            try
            {
                schema = dataRuntime.GetSchema(templateName);
            }
            catch
            {
                return;
            }

            if (schema == null || schema.instances == null)
            {
                return;
            }

            foreach (var pair in schema.instances)
            {
                var instance = pair.Value;
                if (instance == null)
                {
                    continue;
                }

                var moduleKey = instance.GetString("moduleKey", instance.GetString("name", null));
                if (string.IsNullOrEmpty(moduleKey))
                {
                    continue;
                }

                _records[moduleKey] = new ModuleDeclareRecord
                {
                    Id = instance.GetInt("id", 0),
                    ModuleKey = moduleKey,
                    Tags = instance.GetString("tags", string.Empty),
                    Priority = instance.GetInt("priority", 0)
                };
            }
        }

        public bool TryGetModuleDeclare(string moduleKey, out ModuleDeclareRecord record)
        {
            record = null;
            return !string.IsNullOrEmpty(moduleKey) && _records.TryGetValue(moduleKey, out record);
        }
    }

    public interface IEventBus
    {
        void Init(IDataTableRuntime dbRuntime);

        void Init(IDataTableRuntime dbRuntime, object busOwner);

        void RegisterCustomEvent(string eventName, string tagExpression);

        SubscriptionToken SubscribeEvent(object owner, string eventName, Action<object> onEvent);

        SubscriptionToken SubscribeTag(object owner, string tagName, Action<EventEnvelope> onEnvelope);

        void PublishEvent(object sender, string eventName, object payload);

        void TriggerTagForTest(object sender, string tagName, string reasonEventName = "__DebugTagTrigger__", object payload = null);

        void Unsubscribe(SubscriptionToken token);

        void UnsubscribeAll(object owner);

        void DumpSubscribersOfEvent(string eventName);

        void DumpSubscribersOfTag(string tagName);
    }

    public interface IRootRuntime : IServiceRegistry
    {
    }

    public interface IRuntimeLogger
    {
        void Info(string message);

        void Warning(string message);

        void Error(string message);
    }

    public interface IScopeResolver
    {
        bool IsInScope(object owner, object busOwner);
    }

    public interface IServiceRegistry
    {
        void RegisterService(string name, object instance);

        T GetService<T>(string name) where T : class;
    }

    public interface ISystemModule
    {
        string Name { get; }

        void Init(IRootRuntime root, IEventBus eventBus);

        void Tick();
    }

    public interface IObjectRuntime
    {
        IEventBus GetLocalEventBus();

        IEventBus GetGlobalEventBus();

        IObjectSnapshotSystem GetObjectSnapshotSystem();

        void PublishLocalThenGlobal(object sender, string eventName, object payload);
    }

    public interface IObjectSnapshotSystem
    {
        IObjectSnapshotRegion RegisterRegion(object owner, string regionName);

        bool TryGetRegion(string regionName, out IObjectSnapshotRegion region);

        IReadOnlyDictionary<string, IObjectSnapshotRegion> GetRegions();
    }

    public interface IObjectSnapshotRegion
    {
        string RegionName { get; }

        object Owner { get; }

        int Version { get; }

        bool IsDirty { get; }

        void Set(string key, object value);

        bool TryGet(string key, out object value);

        IReadOnlyDictionary<string, object> GetValues();
    }

    public interface IRequireObjectSnapshotRegion
    {
        void BindObjectSnapshot(IObjectSnapshotSystem snapshotSystem, IObjectSnapshotRegion region);
    }

    public interface IObjectSnapshotSync
    {
        void SyncObjectSnapshot(IObjectSnapshotRegion region);
    }

    public interface IObjectModule
    {
        string Name { get; }

        int TickPriority { get; }

        void Init(IObjectRuntime root, IEventBus localEventBus, IEventBus globalEventBus);

        void Tick();
    }

    public interface ITimeProvider
    {
        float Now { get; }
    }

    public readonly struct SubscriptionToken
    {
        internal SubscriptionToken(int id)
        {
            Id = id;
        }

        internal int Id { get; }

        public bool IsValid => Id != 0;
    }

    public enum TickPhase
    {
        Update = 0,
        LateUpdate = 1
    }
}
`;
}

function buildGodotSharedServiceRegistryContent() {
  return `
namespace GameFramework.Core
{
    public sealed class ServiceRegistry : IServiceRegistry
    {
        private readonly Dictionary<string, object> _serviceMap = new Dictionary<string, object>();

        public void RegisterService(string name, object instance)
        {
            if (string.IsNullOrEmpty(name) || instance == null)
            {
                return;
            }

            _serviceMap[name] = instance;
        }

        public T GetService<T>(string name) where T : class
        {
            if (_serviceMap.TryGetValue(name, out var instance))
            {
                return instance as T;
            }

            return null;
        }
    }
}
`;
}

function buildGodotSharedRootTickRunnerCoreContent() {
  return `
namespace GameFramework.Core
{
    public sealed class RootTickRunnerCore : IRootRuntime
    {
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
            LoadSystemModuleDeclare(initTableName);
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
                _logger.Error($"[RootTickRunner] 未在 {_moduleDeclareTableName} 表中找到模块 '{module.Name}'");
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
                    _logger.Warning("[RootTickRunner] systemModuleDeclare 未找到，已回退读取旧 systemInitOrder。");
                    resolvedTableName = "systemInitOrder";
                    schema = legacySchema;
                }
            }

            if (schema == null || schema.instances == null)
            {
                _logger.Error($"[RootTickRunner] 未找到 {resolvedTableName} 表或表内没有实例");
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
                    _logger.Warning($"[RootTickRunner] {resolvedTableName} 表中存在空 moduleKey/name 实例，已跳过");
                    continue;
                }

                if (_moduleTable.ContainsKey(name))
                {
                    _logger.Warning($"[RootTickRunner] {resolvedTableName} 表存在重复名称 '{name}'，已忽略后续条目");
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
            foreach (var entry in GetOrderedModuleEntries().ToList())
            {
                try
                {
                    entry.Module.Init(this, _eventBus);
                    _logger.Info($"[RootTickRunner] {ResolveRootNodeName()} {entry.Module.Name} 初始化完成");
                }
                catch (Exception ex)
                {
                    _logger.Error($"[RootTickRunner] 初始化模块 '{entry.Module.Name}' 时出现异常: {ex}");
                }
            }

            _logger.Info("[RootTickRunner] 所有业务模块初始化完成");
        }

        private EventBusTableSchema TryGetSystemModuleSchema(string tableName)
        {
            try
            {
                return _dataRuntime.GetSchema(tableName);
            }
            catch (Exception ex)
            {
                _logger.Warning($"[RootTickRunner] 读取 {tableName} 失败: {ex.Message}");
                return null;
            }
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
`;
}

function buildGodotSharedEventBusCoreContent() {
  return `
namespace GameFramework.Core
{
    public sealed class EventBusCore
    {
        private struct EventDef
        {
            public string EventName;
            public HashSet<string> Tags;
            public bool IsDeclaredFromTable;
        }

        private sealed class Subscription
        {
            public SubscriptionToken Token;
            public object Owner;
            public string Key;
            public bool IsTagSubscription;
            public Delegate Callback;
            public bool IsActive;
        }

        private static readonly object NoDataPayload = new object[] { "nodata" };

        private readonly string _busName;
        private readonly EventBusConfig _config;
        private readonly IRuntimeLogger _logger;
        private readonly ITimeProvider _timeProvider;
        private readonly IScopeResolver _scopeResolver;
        private readonly Dictionary<string, List<Subscription>> _eventSubs = new Dictionary<string, List<Subscription>>();
        private readonly Dictionary<string, List<Subscription>> _tagSubs = new Dictionary<string, List<Subscription>>();
        private readonly Dictionary<string, EventDef> _eventDefs = new Dictionary<string, EventDef>();
        private readonly HashSet<string> _validTags = new HashSet<string>();
        private readonly Dictionary<object, List<SubscriptionToken>> _ownerTokens = new Dictionary<object, List<SubscriptionToken>>();
        private readonly Dictionary<int, Subscription> _tokenToSub = new Dictionary<int, Subscription>();

        private int _nextTokenId = 1;
        private object _busOwner;
        private IDataTableRuntime _dbRuntime;

        public EventBusCore(string busName, EventBusConfig config, IRuntimeLogger logger, ITimeProvider timeProvider, IScopeResolver scopeResolver)
        {
            _busName = string.IsNullOrEmpty(busName) ? "<unnamed>" : busName;
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            _timeProvider = timeProvider ?? throw new ArgumentNullException(nameof(timeProvider));
            _scopeResolver = scopeResolver ?? throw new ArgumentNullException(nameof(scopeResolver));
        }

        public void Init(IDataTableRuntime dbRuntime, object busOwner)
        {
            if (_dbRuntime != null)
            {
                return;
            }

            _dbRuntime = dbRuntime ?? throw new ArgumentNullException(nameof(dbRuntime));
            _busOwner = busOwner;

            if (_config.LogVerbose)
            {
                _logger.Info($"[EventBus] Initialising bus '{_busName}' (mode={_config.Mode}).");
            }

            if (!string.IsNullOrEmpty(_config.TagTableTemplateName))
            {
                LoadTagsFromTable(_config.TagTableTemplateName);
            }
            else if (_config.LogVerbose)
            {
                _logger.Warning($"[EventBus] Tag table template name is empty on bus '{_busName}'. Tag validation will be skipped.");
            }

            if (!string.IsNullOrEmpty(_config.EventTableTemplateName))
            {
                var initTagFilters = ResolveInitTagFilters();
                var declared = LoadAndDeclareEventsFromTable(_config.EventTableTemplateName, initTagFilters);
                if (declared == 0)
                {
                    _logger.Warning($"[EventBus] No events declared after applying filters on bus '{_busName}'. Filters: {string.Join(", ", initTagFilters ?? new List<string>())}");
                }
            }
            else
            {
                _logger.Warning($"[EventBus] Event table template name is empty on bus '{_busName}'. No events will be declared by default.");
            }
        }

        public void RegisterCustomEvent(string eventName, string tagExpression)
        {
            if (string.IsNullOrEmpty(eventName))
            {
                return;
            }

            var tags = ParseTags(tagExpression);
            var validTagSet = new HashSet<string>();
            foreach (var tag in tags)
            {
                if (_validTags.Count > 0 && !_validTags.Contains(tag))
                {
                    _logger.Warning($"[EventBus] Custom event '{eventName}' references undefined tag '{tag}'. Tag will be ignored.");
                    continue;
                }

                validTagSet.Add(tag);
            }

            DeclareEvent(eventName, validTagSet, false);
        }

        public SubscriptionToken SubscribeEvent(object owner, string eventName, Action<object> onEvent)
        {
            if (owner == null || string.IsNullOrEmpty(eventName) || onEvent == null)
            {
                _logger.Warning($"[EventBus] SubscribeEvent called with invalid arguments on bus '{_busName}'.");
                return default;
            }

            if (RequiresScopeCheck() && !_scopeResolver.IsInScope(owner, _busOwner))
            {
                _logger.Warning($"[EventBus] Subscription rejected on bus '{_busName}': owner '{owner}' is not in the local scope of this bus.");
                return default;
            }

            var token = new SubscriptionToken(_nextTokenId++);
            var subscription = new Subscription
            {
                Token = token,
                Owner = owner,
                Key = eventName,
                IsTagSubscription = false,
                Callback = onEvent,
                IsActive = true
            };

            if (!_eventSubs.TryGetValue(eventName, out var list))
            {
                list = new List<Subscription>();
                _eventSubs[eventName] = list;
            }

            list.Add(subscription);
            _tokenToSub[token.Id] = subscription;
            TrackOwnerToken(owner, token);
            return token;
        }

        public SubscriptionToken SubscribeTag(object owner, string tagName, Action<EventEnvelope> onEnvelope)
        {
            if (owner == null || string.IsNullOrEmpty(tagName) || onEnvelope == null)
            {
                _logger.Warning($"[EventBus] SubscribeTag called with invalid arguments on bus '{_busName}'.");
                return default;
            }

            if (_validTags.Count > 0 && !_validTags.Contains(tagName))
            {
                _logger.Warning($"[EventBus] SubscribeTag rejected on bus '{_busName}': tag '{tagName}' is not defined.");
                return default;
            }

            if (RequiresScopeCheck() && !_scopeResolver.IsInScope(owner, _busOwner))
            {
                _logger.Warning($"[EventBus] Tag subscription rejected on bus '{_busName}': owner '{owner}' is not in local scope.");
                return default;
            }

            var token = new SubscriptionToken(_nextTokenId++);
            var subscription = new Subscription
            {
                Token = token,
                Owner = owner,
                Key = tagName,
                IsTagSubscription = true,
                Callback = onEnvelope,
                IsActive = true
            };

            if (!_tagSubs.TryGetValue(tagName, out var list))
            {
                list = new List<Subscription>();
                _tagSubs[tagName] = list;
            }

            list.Add(subscription);
            _tokenToSub[token.Id] = subscription;
            TrackOwnerToken(owner, token);
            return token;
        }

        public void PublishEvent(object sender, string eventName, object payload)
        {
            if (string.IsNullOrEmpty(eventName))
            {
                return;
            }

            var actualPayload = payload ?? NoDataPayload;
            List<string> eventTags;
            if (_eventDefs.TryGetValue(eventName, out var definition))
            {
                eventTags = new List<string>(definition.Tags);
            }
            else
            {
                _logger.Warning($"[EventBus] Publishing unknown event '{eventName}' on bus '{_busName}'. No tags will be dispatched unless event was declared previously.");
                eventTags = new List<string>();
            }

            if (_config.LogPublishedEvents)
            {
                _logger.Info(BuildPublishLogMessage(sender, eventName, actualPayload, eventTags));
            }

            if (_eventSubs.TryGetValue(eventName, out var subscriptions))
            {
                foreach (var subscription in subscriptions.ToArray())
                {
                    if (!subscription.IsActive)
                    {
                        continue;
                    }

                    if (subscription.Callback is Action<object> callback)
                    {
                        try
                        {
                            callback(actualPayload);
                        }
                        catch (Exception ex)
                        {
                            _logger.Error($"[EventBus] Exception in event subscriber for '{eventName}' on bus '{_busName}': {ex}");
                        }
                    }
                }
            }

            var envelope = new EventEnvelope
            {
                EventName = eventName,
                Tags = eventTags,
                BusOwner = _busOwner,
                Sender = sender,
                Time = _timeProvider.Now,
                Payload = actualPayload
            };

            foreach (var tag in eventTags)
            {
                if (!_tagSubs.TryGetValue(tag, out var tagSubscriptions))
                {
                    continue;
                }

                foreach (var subscription in tagSubscriptions.ToArray())
                {
                    if (!subscription.IsActive)
                    {
                        continue;
                    }

                    if (subscription.Callback is Action<EventEnvelope> callback)
                    {
                        try
                        {
                            callback(envelope);
                        }
                        catch (Exception ex)
                        {
                            _logger.Error($"[EventBus] Exception in tag subscriber for '{tag}' on bus '{_busName}': {ex}");
                        }
                    }
                }
            }
        }

        public void TriggerTagForTest(object sender, string tagName, string reasonEventName = "__DebugTagTrigger__", object payload = null)
        {
            if (!_config.AllowTriggerTagAtRuntime)
            {
                _logger.Warning($"[EventBus] TriggerTagForTest is disabled on bus '{_busName}'.");
                return;
            }

            if (string.IsNullOrEmpty(tagName))
            {
                return;
            }

            if (_validTags.Count > 0 && !_validTags.Contains(tagName))
            {
                _logger.Warning($"[EventBus] TriggerTagForTest rejected on bus '{_busName}': tag '{tagName}' is not defined.");
                return;
            }

            var envelope = new EventEnvelope
            {
                EventName = reasonEventName,
                Tags = new List<string> { tagName },
                BusOwner = _busOwner,
                Sender = sender,
                Time = _timeProvider.Now,
                Payload = payload ?? NoDataPayload
            };

            if (!_tagSubs.TryGetValue(tagName, out var subscriptions))
            {
                return;
            }

            foreach (var subscription in subscriptions.ToArray())
            {
                if (!subscription.IsActive)
                {
                    continue;
                }

                if (subscription.Callback is Action<EventEnvelope> callback)
                {
                    try
                    {
                        callback(envelope);
                    }
                    catch (Exception ex)
                    {
                        _logger.Error($"[EventBus] Exception in TriggerTagForTest subscriber for '{tagName}' on bus '{_busName}': {ex}");
                    }
                }
            }
        }

        public void Unsubscribe(SubscriptionToken token)
        {
            if (!token.IsValid || !_tokenToSub.TryGetValue(token.Id, out var subscription))
            {
                return;
            }

            subscription.IsActive = false;
            _tokenToSub.Remove(token.Id);

            if (subscription.IsTagSubscription)
            {
                if (_tagSubs.TryGetValue(subscription.Key, out var tagSubscriptions))
                {
                    tagSubscriptions.Remove(subscription);
                }
            }
            else if (_eventSubs.TryGetValue(subscription.Key, out var eventSubscriptions))
            {
                eventSubscriptions.Remove(subscription);
            }
        }

        public void UnsubscribeAll(object owner)
        {
            if (owner == null || !_ownerTokens.TryGetValue(owner, out var tokens))
            {
                return;
            }

            foreach (var token in tokens)
            {
                if (token.IsValid)
                {
                    Unsubscribe(token);
                }
            }

            _ownerTokens.Remove(owner);
        }

        public void DumpSubscribersOfEvent(string eventName)
        {
            _logger.Info($"[EventBus] Subscribers of event '{eventName}' on bus '{_busName}':");
            if (_eventSubs.TryGetValue(eventName, out var subscriptions))
            {
                foreach (var subscription in subscriptions)
                {
                    _logger.Info($" - owner={subscription.Owner}, active={subscription.IsActive}");
                }
            }
            else
            {
                _logger.Info(" (none)");
            }
        }

        public void DumpSubscribersOfTag(string tagName)
        {
            _logger.Info($"[EventBus] Subscribers of tag '{tagName}' on bus '{_busName}':");
            if (_tagSubs.TryGetValue(tagName, out var subscriptions))
            {
                foreach (var subscription in subscriptions)
                {
                    _logger.Info($" - owner={subscription.Owner}, active={subscription.IsActive}");
                }
            }
            else
            {
                _logger.Info(" (none)");
            }
        }

        private void LoadTagsFromTable(string tagTemplate)
        {
            if (_config.LogVerbose)
            {
                _logger.Info($"[EventBus] Loading tags from template '{tagTemplate}' for bus '{_busName}'.");
            }

            EventBusTableSchema schema;
            try
            {
                schema = _dbRuntime.GetSchema(tagTemplate);
            }
            catch (Exception ex)
            {
                _logger.Error($"[EventBus] Failed to load tag schema '{tagTemplate}': {ex.Message}");
                return;
            }

            if (schema == null || schema.instances == null)
            {
                _logger.Warning($"[EventBus] Tag schema '{tagTemplate}' has no instances. No tags loaded.");
                return;
            }

            var seenTags = new HashSet<string>();
            foreach (var pair in schema.instances)
            {
                var instance = pair.Value;
                if (instance == null)
                {
                    continue;
                }

                var tagName = instance.GetString("name", string.Empty);
                if (string.IsNullOrEmpty(tagName))
                {
                    continue;
                }

                if (!seenTags.Add(tagName))
                {
                    _logger.Warning($"[EventBus] Duplicate tag '{tagName}' in tag table '{tagTemplate}'. Skipping duplicate.");
                    continue;
                }

                _validTags.Add(tagName);
            }

            if (_config.LogVerbose)
            {
                _logger.Info($"[EventBus] Loaded {_validTags.Count} valid tags for bus '{_busName}'.");
            }
        }

        private List<string> ResolveInitTagFilters()
        {
            var inspectorFilters = _config.InitTagFilters ?? new List<string>();
            if (string.IsNullOrEmpty(_config.InitTagFilterTableTemplateName)
                || string.IsNullOrEmpty(_config.InitTagFilterProfileName))
            {
                return inspectorFilters;
            }

            EventBusTableSchema schema;
            try
            {
                schema = _dbRuntime.GetSchema(_config.InitTagFilterTableTemplateName);
            }
            catch (Exception ex)
            {
                _logger.Error($"[EventBus] Failed to load init tag filter schema '{_config.InitTagFilterTableTemplateName}': {ex.Message}");
                return inspectorFilters;
            }

            if (schema == null || schema.instances == null)
            {
                _logger.Warning($"[EventBus] Init tag filter schema '{_config.InitTagFilterTableTemplateName}' has no instances. Falling back to inspector filters.");
                return inspectorFilters;
            }

            EventBusTableInstance profile = null;
            if (!schema.instances.TryGetValue(_config.InitTagFilterProfileName, out profile))
            {
                foreach (var pair in schema.instances)
                {
                    var instance = pair.Value;
                    if (instance == null)
                    {
                        continue;
                    }

                    if (string.Equals(instance.GetString("name", string.Empty), _config.InitTagFilterProfileName, StringComparison.Ordinal)
                        || string.Equals(instance.GetString("index", string.Empty), _config.InitTagFilterProfileName, StringComparison.Ordinal))
                    {
                        profile = instance;
                        break;
                    }
                }
            }

            if (profile == null)
            {
                _logger.Warning($"[EventBus] Init tag filter profile '{_config.InitTagFilterProfileName}' was not found in table '{_config.InitTagFilterTableTemplateName}'. Falling back to inspector filters.");
                return inspectorFilters;
            }

            var filtersText = profile.GetString("filters", null);
            if (filtersText == null)
            {
                _logger.Warning($"[EventBus] Init tag filter profile '{_config.InitTagFilterProfileName}' has no 'filters' field. Falling back to inspector filters.");
                return inspectorFilters;
            }

            var filters = ParseInitTagFilterProfile(filtersText);
            if (_config.LogVerbose)
            {
                _logger.Info($"[EventBus] Loaded {filters.Count} init tag filters from table '{_config.InitTagFilterTableTemplateName}' profile '{_config.InitTagFilterProfileName}' for bus '{_busName}'.");
            }

            return filters;
        }

        private static List<string> ParseInitTagFilterProfile(string filtersText)
        {
            var filters = new List<string>();
            if (string.IsNullOrEmpty(filtersText))
            {
                return filters;
            }

            var parts = filtersText.Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var part in parts)
            {
                var trimmed = part.Trim();
                if (!string.IsNullOrEmpty(trimmed))
                {
                    filters.Add(trimmed);
                }
            }

            return filters;
        }

        private int LoadAndDeclareEventsFromTable(string eventTemplate, List<string> filters)
        {
            if (_config.LogVerbose)
            {
                _logger.Info($"[EventBus] Loading events from template '{eventTemplate}' for bus '{_busName}'.");
            }

            EventBusTableSchema schema;
            try
            {
                schema = _dbRuntime.GetSchema(eventTemplate);
            }
            catch (Exception ex)
            {
                _logger.Error($"[EventBus] Failed to load event schema '{eventTemplate}': {ex.Message}");
                return 0;
            }

            if (schema == null || schema.instances == null)
            {
                _logger.Warning($"[EventBus] Event schema '{eventTemplate}' has no instances. No events declared.");
                return 0;
            }

            var declaredCount = 0;
            var seenEventNames = new HashSet<string>();
            foreach (var pair in schema.instances)
            {
                var instance = pair.Value;
                if (instance == null)
                {
                    continue;
                }

                var eventName = instance.GetString("name", string.Empty);
                if (string.IsNullOrEmpty(eventName))
                {
                    continue;
                }

                if (!seenEventNames.Add(eventName))
                {
                    _logger.Warning($"[EventBus] Duplicate event name '{eventName}' in event table '{eventTemplate}'. Skipping duplicate.");
                    continue;
                }

                var tagExpression = instance.GetString("tags", string.Empty);
                var tags = ParseTags(tagExpression);
                var validTagSet = new HashSet<string>();
                foreach (var tag in tags)
                {
                    if (_validTags.Count > 0 && !_validTags.Contains(tag))
                    {
                        _logger.Warning($"[EventBus] Event '{eventName}' references undefined tag '{tag}'. Tag will be ignored.");
                        continue;
                    }

                    validTagSet.Add(tag);
                }

                if (filters != null && filters.Count > 0 && !IsEventMatchedFilters(validTagSet, filters))
                {
                    if (_config.LogVerbose)
                    {
                        _logger.Info($"[EventBus] Skipping event '{eventName}' due to filters on bus '{_busName}'.");
                    }

                    continue;
                }

                DeclareEvent(eventName, validTagSet, true);
                declaredCount++;
            }

            if (_config.LogVerbose)
            {
                _logger.Info($"[EventBus] Declared {declaredCount} events for bus '{_busName}'.");
            }

            return declaredCount;
        }

        private bool IsEventMatchedFilters(HashSet<string> eventTags, List<string> filters)
        {
            foreach (var filter in filters)
            {
                if (string.IsNullOrEmpty(filter))
                {
                    continue;
                }

                var allPresent = true;
                var requiredTags = filter.Split(new[] { '|', ',' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (var requiredTag in requiredTags)
                {
                    if (!eventTags.Contains(requiredTag))
                    {
                        allPresent = false;
                        break;
                    }
                }

                if (allPresent)
                {
                    return true;
                }
            }

            return false;
        }

        private void DeclareEvent(string eventName, HashSet<string> tags, bool fromTable)
        {
            if (_eventDefs.ContainsKey(eventName))
            {
                _logger.Warning($"[EventBus] Attempt to redeclare event '{eventName}' on bus '{_busName}'. Original declaration is retained.");
                return;
            }

            _eventDefs[eventName] = new EventDef
            {
                EventName = eventName,
                Tags = tags,
                IsDeclaredFromTable = fromTable
            };
        }

        private void TrackOwnerToken(object owner, SubscriptionToken token)
        {
            if (!_ownerTokens.TryGetValue(owner, out var tokens))
            {
                tokens = new List<SubscriptionToken>();
                _ownerTokens[owner] = tokens;
            }

            tokens.Add(token);
        }

        private bool RequiresScopeCheck()
        {
            return _config.Mode == EventBusScopeMode.Local && _config.EnableScopeCheckForLocal;
        }

        private string BuildPublishLogMessage(object sender, string eventName, object payload, List<string> tags)
        {
            var tagText = tags != null && tags.Count > 0 ? string.Join(", ", tags) : "<none>";
            return $"[EventBus] Published event '{eventName}' on bus '{_busName}' (sender={DescribeValueForLog(sender)}, tags={tagText}, payload={DescribeValueForLog(payload)}).";
        }

        private static string DescribeValueForLog(object value)
        {
            if (ReferenceEquals(value, NoDataPayload))
            {
                return "<none>";
            }

            if (value == null)
            {
                return "<null>";
            }

            switch (value)
            {
                case string text:
                    return string.Concat('"', TrimForLog(text), '"');
                case char charValue:
                    return $"'{charValue}'";
                case bool _:
                case byte _:
                case sbyte _:
                case short _:
                case ushort _:
                case int _:
                case uint _:
                case long _:
                case ulong _:
                case float _:
                case double _:
                case decimal _:
                    return value.ToString();
            }

            var typeName = value.GetType().Name;
            var valueText = value.ToString();
            if (string.IsNullOrEmpty(valueText)
                || string.Equals(valueText, typeName, StringComparison.Ordinal)
                || string.Equals(valueText, value.GetType().FullName, StringComparison.Ordinal))
            {
                return $"<{typeName}>";
            }

            return $"{typeName}({TrimForLog(valueText)})";
        }

        private static string TrimForLog(string value)
        {
            if (string.IsNullOrEmpty(value) || value.Length <= 120)
            {
                return value;
            }

            return value.Substring(0, 117) + "...";
        }

        private static HashSet<string> ParseTags(string tagExpression)
        {
            var result = new HashSet<string>();
            if (string.IsNullOrEmpty(tagExpression))
            {
                return result;
            }

            var parts = tagExpression.Split(new[] { '|', ',' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var part in parts)
            {
                var trimmed = part.Trim();
                if (!string.IsNullOrEmpty(trimmed))
                {
                    result.Add(trimmed);
                }
            }

            return result;
        }
    }
}
`;
}

export function buildGodotSharedRuntimeContent() {
  return [
    buildGodotSharedContractsContent(),
    buildGodotSharedServiceRegistryContent(),
    buildGodotSharedRootTickRunnerCoreLatestContent(),
    buildGodotSharedEventBusCoreContent(),
  ].join('\n\n');
}

function buildGodotSharedRootTickRunnerCoreLatestContent() {
  return `
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
                _logger.Warning($"[RootTickRunner] Event '{AllModulesInitializedEventName}' was not published because at least one module failed to initialize.");
            }

            _logger.Info("[RootTickRunner] All registered system modules finished initialization.");
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
`;
}

export function buildGodotRuntimeSupportContent() {
  return `
using System;
using Godot;

namespace GameFramework.Adapters.Godot
{
    public interface IGodotDataTableProvider
    {
        EventBusTableSchema GetSchema(string templateName);
    }

    public sealed class GodotDataTableRuntimeAdapter : IDataTableRuntime
    {
        private readonly IGodotDataTableProvider _provider;

        public GodotDataTableRuntimeAdapter(IGodotDataTableProvider provider)
        {
            _provider = provider ?? throw new ArgumentNullException(nameof(provider));
        }

        public EventBusTableSchema GetSchema(string templateName)
        {
            return _provider.GetSchema(templateName);
        }
    }

    public sealed class GodotRuntimeLogger : IRuntimeLogger
    {
        public void Info(string message)
        {
            GD.Print(message);
        }

        public void Warning(string message)
        {
            GD.PushWarning(message);
        }

        public void Error(string message)
        {
            GD.PushError(message);
        }
    }

    public sealed class GodotScopeResolver : IScopeResolver
    {
        public bool IsInScope(object owner, object busOwner)
        {
            if (!(owner is Node current) || !(busOwner is Node root))
            {
                return false;
            }

            while (current != null)
            {
                if (ReferenceEquals(current, root))
                {
                    return true;
                }

                current = current.GetParent();
            }

            return false;
        }
    }

    public sealed class GodotTimeProvider : ITimeProvider
    {
        public float Now => global::Godot.Time.GetTicksMsec() / 1000f;
    }
}
`;
}

export function buildGodotEventBusNodeContent() {
  return `
using System;
using System.Collections.Generic;
using GameFramework;
using GameFramework.Core;
using Godot;

namespace GameFramework.Adapters.Godot
{
    [GlobalClass]
    public partial class GodotEventBusNode : Node, IEventBus
    {
        public enum BusMode
        {
            Global,
            Local
        }

        public struct Envelope
        {
            public string eventName;
            public List<string> tags;
            public Node busOwner;
            public Node sender;
            public float time;
            public object payload;

            internal static Envelope FromEnvelope(EventEnvelope envelope)
            {
                return new Envelope
                {
                    eventName = envelope.EventName,
                    tags = envelope.Tags,
                    busOwner = envelope.BusOwner as Node,
                    sender = envelope.Sender as Node,
                    time = envelope.Time,
                    payload = envelope.Payload
                };
            }
        }

        [Export]
        public BusMode Mode { get; set; } = BusMode.Global;

        [Export]
        public string EventTableTemplateName { get; set; }

        [Export]
        public string TagTableTemplateName { get; set; }

        [Export]
        public string InitTagFilterTableTemplateName { get; set; }

        [Export]
        public string InitTagFilterProfileName { get; set; }

        [Export]
        public string[] InitTagFilters { get; set; } = Array.Empty<string>();

        [Export]
        public bool EnableScopeCheckForLocal { get; set; } = true;

        [Export]
        public bool AllowTriggerTagAtRuntime { get; set; }

        [Export]
        public bool LogVerbose { get; set; }

        [Export]
        public bool LogPublishedEvents { get; set; } = true;

        [Export]
        public NodePath ScopeRootPath { get; set; }

        private readonly GodotRuntimeLogger _logger = new GodotRuntimeLogger();
        private readonly GodotTimeProvider _timeProvider = new GodotTimeProvider();
        private readonly GodotScopeResolver _scopeResolver = new GodotScopeResolver();

        private EventBusCore _core;
        private bool _hasLoggedInitialization;

        public void Init(IDataTableRuntime dbRuntime)
        {
            Init(dbRuntime, ResolveDefaultBusOwner());
        }

        public void Init(IDataTableRuntime dbRuntime, object busOwner)
        {
            var resolvedBusOwner = busOwner ?? ResolveDefaultBusOwner();
            EnsureCore().Init(dbRuntime, resolvedBusOwner);
            if (!_hasLoggedInitialization)
            {
                _logger.Info($"[GodotEventBusNode] {ResolveInitializationRootName(resolvedBusOwner)} 初始化完成");
                _hasLoggedInitialization = true;
            }
        }

        public void RegisterCustomEvent(string eventName, string tagExpression)
        {
            EnsureCore().RegisterCustomEvent(eventName, tagExpression);
        }

        public SubscriptionToken SubscribeEvent(object owner, string eventName, Action<object> onEvent)
        {
            return EnsureCore().SubscribeEvent(owner, eventName, onEvent);
        }

        public SubscriptionToken SubscribeTag(object owner, string tagName, Action<Envelope> onEnvelope)
        {
            if (onEnvelope == null)
            {
                return default;
            }

            return EnsureCore().SubscribeTag(owner, tagName, envelope => onEnvelope(Envelope.FromEnvelope(envelope)));
        }

        SubscriptionToken IEventBus.SubscribeTag(object owner, string tagName, Action<EventEnvelope> onEnvelope)
        {
            return EnsureCore().SubscribeTag(owner, tagName, onEnvelope);
        }

        public void PublishEvent(object sender, string eventName, object payload)
        {
            EnsureCore().PublishEvent(sender, eventName, payload);
        }

        public void PublishEvent(Node sender, string eventName, object payload)
        {
            PublishEvent((object)sender, eventName, payload);
        }

        public void TriggerTagForTest(object sender, string tagName, string reasonEventName = "__DebugTagTrigger__", object payload = null)
        {
            EnsureCore().TriggerTagForTest(sender, tagName, reasonEventName, payload);
        }

        public void TriggerTagForTest(Node sender, string tagName, string reasonEventName = "__DebugTagTrigger__", object payload = null)
        {
            TriggerTagForTest((object)sender, tagName, reasonEventName, payload);
        }

        public void Unsubscribe(SubscriptionToken token)
        {
            EnsureCore().Unsubscribe(token);
        }

        public void UnsubscribeAll(object owner)
        {
            EnsureCore().UnsubscribeAll(owner);
        }

        public void UnsubscribeAll(Node owner)
        {
            UnsubscribeAll((object)owner);
        }

        public void DumpSubscribersOfEvent(string eventName)
        {
            EnsureCore().DumpSubscribersOfEvent(eventName);
        }

        public void DumpSubscribersOfTag(string tagName)
        {
            EnsureCore().DumpSubscribersOfTag(tagName);
        }

        private EventBusCore EnsureCore()
        {
            if (_core == null)
            {
                _core = new EventBusCore(Name.ToString(), BuildConfig(), _logger, _timeProvider, _scopeResolver);
            }

            return _core;
        }

        private EventBusConfig BuildConfig()
        {
            return new EventBusConfig
            {
                Mode = Mode == BusMode.Local ? EventBusScopeMode.Local : EventBusScopeMode.Global,
                EventTableTemplateName = EventTableTemplateName,
                TagTableTemplateName = TagTableTemplateName,
                InitTagFilterTableTemplateName = InitTagFilterTableTemplateName,
                InitTagFilterProfileName = InitTagFilterProfileName,
                InitTagFilters = InitTagFilters == null ? new List<string>() : new List<string>(InitTagFilters),
                EnableScopeCheckForLocal = EnableScopeCheckForLocal,
                AllowTriggerTagAtRuntime = AllowTriggerTagAtRuntime,
                LogVerbose = LogVerbose,
                LogPublishedEvents = LogPublishedEvents
            };
        }

        private object ResolveDefaultBusOwner()
        {
            var scopeRootPathText = ScopeRootPath.ToString();
            if (!string.IsNullOrEmpty(scopeRootPathText))
            {
                var configuredScopeRoot = GetNodeOrNull<Node>(ScopeRootPath);
                if (configuredScopeRoot != null)
                {
                    return configuredScopeRoot;
                }

                _logger.Warning(
                    "[GodotEventBusNode] ScopeRootPath is configured but the target node was not found. Falling back to the default scope root.");
            }

            if (Mode == BusMode.Local)
            {
                return GetParent() ?? this;
            }

            return this;
        }

        private string ResolveInitializationRootName(object busOwner)
        {
            if (busOwner is Node busOwnerNode)
            {
                if (ReferenceEquals(busOwnerNode, this))
                {
                    var parentNode = GetParent();
                    if (parentNode != null)
                    {
                        return ResolveNodeName(parentNode);
                    }
                }

                return ResolveNodeName(busOwnerNode);
            }

            return ResolveNodeName(GetParent() ?? this);
        }

        private static string ResolveNodeName(Node node)
        {
            if (node == null)
            {
                return "<unknown-root>";
            }

            var nodeName = node.Name.ToString();
            return string.IsNullOrEmpty(nodeName) ? node.GetType().Name : nodeName;
        }
    }
}
`;
}

export function buildGodotObjectModuleBaseContent() {
  return `
using GameFramework;
using GameFramework.Core;
using Godot;

namespace GameFramework.Adapters.Godot
{
    [GlobalClass]
    public abstract partial class GodotObjectModuleBase : Node, IObjectModule
    {
        [Export]
        public int TickPriority { get; set; }

        string IObjectModule.Name => Name.ToString();

        int IObjectModule.TickPriority => TickPriority;

        public virtual void Init(IObjectRuntime root, IEventBus localEventBus, IEventBus globalEventBus)
        {
        }

        public virtual void Tick()
        {
        }
    }
}
`;
}

export function buildGodotObjectSnapshotSystemNodeContent() {
  return `
using System;
using System.Collections.Generic;
using Godot;

namespace GameFramework.Adapters.Godot
{
	[GlobalClass]
	public partial class GodotObjectSnapshotSystemNode : Node, IObjectSnapshotSystem
	{
		private sealed class SnapshotRegion : IObjectSnapshotRegion
		{
			private readonly Dictionary<string, object> _values = new Dictionary<string, object>();

			public SnapshotRegion(object owner, string regionName)
			{
				Owner = owner ?? throw new ArgumentNullException(nameof(owner));
				RegionName = regionName ?? throw new ArgumentNullException(nameof(regionName));
			}

			public string RegionName { get; }

			public object Owner { get; }

			public int Version { get; private set; }

			public bool IsDirty { get; private set; }

			public void Set(string key, object value)
			{
				if (string.IsNullOrWhiteSpace(key))
				{
					throw new ArgumentException("Snapshot key cannot be empty.", nameof(key));
				}

				_values[key] = value;
				Version++;
				IsDirty = true;
			}

			public bool TryGet(string key, out object value)
			{
				if (string.IsNullOrWhiteSpace(key))
				{
					value = null;
					return false;
				}

				return _values.TryGetValue(key, out value);
			}

			public IReadOnlyDictionary<string, object> GetValues()
			{
				return _values;
			}
		}

		private readonly Dictionary<string, IObjectSnapshotRegion> _regions =
			new Dictionary<string, IObjectSnapshotRegion>(StringComparer.Ordinal);

		public IObjectSnapshotRegion RegisterRegion(object owner, string regionName)
		{
			if (owner == null)
			{
				throw new ArgumentNullException(nameof(owner));
			}

			if (string.IsNullOrWhiteSpace(regionName))
			{
				throw new ArgumentException("Snapshot region name cannot be empty.", nameof(regionName));
			}

			if (_regions.ContainsKey(regionName))
			{
				throw new InvalidOperationException($"Snapshot region '{regionName}' is already registered.");
			}

			var region = new SnapshotRegion(owner, regionName);
			_regions.Add(regionName, region);
			return region;
		}

		public bool TryGetRegion(string regionName, out IObjectSnapshotRegion region)
		{
			if (string.IsNullOrWhiteSpace(regionName))
			{
				region = null;
				return false;
			}

			return _regions.TryGetValue(regionName, out region);
		}

		public IReadOnlyDictionary<string, IObjectSnapshotRegion> GetRegions()
		{
			return _regions;
		}

		public void ClearRegions()
		{
			_regions.Clear();
		}
	}
}
`;
}

export function buildGodotObjectRootNodeContent() {
  return `
using System;
using System.Collections.Generic;
using Godot;

namespace GameFramework.Adapters.Godot
{
	[GlobalClass]
	public partial class GodotObjectRootNode : Node, IObjectRuntime
	{
		private sealed class ModuleEntry
		{
			public ModuleEntry(
				Node ownerNode,
				IObjectModule module,
				IObjectSnapshotSync snapshotSync,
				int siblingIndex,
				int priority,
				bool hasDeclareId,
				int declareId)
			{
				OwnerNode = ownerNode;
				Module = module;
				SnapshotSync = snapshotSync;
				SiblingIndex = siblingIndex;
				Priority = priority;
				HasDeclareId = hasDeclareId;
				DeclareId = declareId;
			}

			public Node OwnerNode { get; }

			public IObjectModule Module { get; }

			public IObjectSnapshotSync SnapshotSync { get; }

			public int SiblingIndex { get; }

			public int Priority { get; }

			public bool HasDeclareId { get; }

			public int DeclareId { get; }
		}

		private sealed class PassiveSnapshotSyncEntry
		{
			public PassiveSnapshotSyncEntry(Node ownerNode, IObjectSnapshotSync snapshotSync, int siblingIndex)
			{
				OwnerNode = ownerNode;
				SnapshotSync = snapshotSync;
				SiblingIndex = siblingIndex;
			}

			public Node OwnerNode { get; }

			public IObjectSnapshotSync SnapshotSync { get; }

			public int SiblingIndex { get; }
		}

		private sealed class SnapshotParticipantEntry
		{
			public SnapshotParticipantEntry(Node ownerNode, IRequireObjectSnapshotRegion snapshotBinder)
			{
				OwnerNode = ownerNode;
				SnapshotBinder = snapshotBinder;
			}

			public Node OwnerNode { get; }

			public IRequireObjectSnapshotRegion SnapshotBinder { get; }
		}

		[Export]
		public NodePath ContextRootPath { get; set; } = new NodePath("..");

		[Export]
		public NodePath ScopeRootPath { get; set; }

		[Export]
		public NodePath LocalEventBusPath { get; set; } = new NodePath("../LocalEventBus");

		[Export]
		public NodePath ObjectSnapshotSystemPath { get; set; } = new NodePath("../ObjectSnapshotSystem");

		[Export]
		public NodePath DataTableProviderPath { get; set; }

		[Export]
		public NodePath GlobalEventBusPath { get; set; }

		[Export]
		public bool AutoInitialize { get; set; } = true;

		[Export]
		public string ModuleDeclareTableTemplateName { get; set; } = string.Empty;

		private readonly GodotRuntimeLogger _logger = new GodotRuntimeLogger();
		private readonly List<ModuleEntry> _orderedModules = new List<ModuleEntry>();
		private readonly List<PassiveSnapshotSyncEntry> _orderedPassiveSnapshotSyncs = new List<PassiveSnapshotSyncEntry>();
		private readonly Dictionary<Node, IObjectSnapshotRegion> _snapshotRegions =
			new Dictionary<Node, IObjectSnapshotRegion>();

		private GodotEventBusNode _localEventBus;
		private IEventBus _globalEventBus;
		private IDataTableRuntime _dataRuntime;
		private IObjectSnapshotSystem _objectSnapshotSystem;
		private bool _initialized;
		private bool _loggedMissingLocalEventBus;
		private bool _loggedPendingRootServices;
		private bool _loggedMissingSnapshotSystem;

		public IEventBus GetLocalEventBus()
		{
			return _localEventBus;
		}

		public IEventBus GetGlobalEventBus()
		{
			return _globalEventBus;
		}

		public IObjectSnapshotSystem GetObjectSnapshotSystem()
		{
			return _objectSnapshotSystem;
		}

		public void PublishLocalThenGlobal(object sender, string eventName, object payload)
		{
			if (!_initialized)
			{
				InitializeObjectDomain();
			}

			if (_localEventBus == null || _globalEventBus == null)
			{
				_logger.Warning("[GodotObjectRootNode] PublishLocalThenGlobal skipped because local/global event bus is not ready.");
				return;
			}

			_localEventBus.PublishEvent(sender, eventName, payload);
			_globalEventBus.PublishEvent(sender, eventName, payload);
		}

		public override void _Ready()
		{
			if (!AutoInitialize)
			{
				return;
			}

			SetProcess(true);
			InitializeObjectDomain();
		}

		public override void _Process(double delta)
		{
			if (!_initialized)
			{
				if (AutoInitialize)
				{
					InitializeObjectDomain();
				}

				return;
			}

			TickModules();
		}

		public override void _ExitTree()
		{
			ClearRuntimeState();
			SetProcess(false);
		}

		public void InitializeObjectDomain()
		{
			if (_initialized)
			{
				return;
			}

			var contextRoot = ResolveContextRoot();
			_localEventBus = _localEventBus ?? ResolveLocalEventBus(contextRoot);
			if (_localEventBus == null)
			{
				if (!_loggedMissingLocalEventBus)
				{
					_logger.Error("[GodotObjectRootNode] LocalEventBus was not found. Ensure ObjectRoot and LocalEventBus are siblings under the same context root.");
					_loggedMissingLocalEventBus = true;
				}

				return;
			}

			_dataRuntime = _dataRuntime ?? ResolveDataRuntime();
			_globalEventBus = _globalEventBus ?? ResolveGlobalEventBus();
			if (_dataRuntime == null || _globalEventBus == null)
			{
				if (!_loggedPendingRootServices)
				{
					_logger.Warning("[GodotObjectRootNode] Waiting for SystemRoot services before completing ObjectRoot initialization.");
					_loggedPendingRootServices = true;
				}

				return;
			}

			var scopeRoot = ResolveScopeRoot(contextRoot);
			_localEventBus.Init(_dataRuntime, scopeRoot);
			_objectSnapshotSystem = ResolveObjectSnapshotSystem(contextRoot);

			CollectModulesAndSnapshotParticipants(contextRoot, out var snapshotParticipants);
			if (!BindSnapshotParticipants(contextRoot, snapshotParticipants))
			{
				return;
			}

			InitialiseModules(contextRoot);

			_initialized = true;
			_loggedMissingLocalEventBus = false;
			_loggedPendingRootServices = false;
			_loggedMissingSnapshotSystem = false;
			SetProcess(true);
			_logger.Info($"[GodotObjectRootNode] Initialized {_orderedModules.Count} object modules under '{ResolveNodeName(contextRoot)}'.");
		}

		private void ClearRuntimeState()
		{
			_initialized = false;
			_orderedModules.Clear();
			_orderedPassiveSnapshotSyncs.Clear();
			_snapshotRegions.Clear();
			_localEventBus = null;
			_globalEventBus = null;
			_dataRuntime = null;
			_objectSnapshotSystem = null;
			_loggedMissingLocalEventBus = false;
			_loggedPendingRootServices = false;
			_loggedMissingSnapshotSystem = false;
		}

		private Node ResolveContextRoot()
		{
			if (TryResolveNode(ContextRootPath, out var contextRoot))
			{
				return contextRoot;
			}

			return GetParent() ?? this;
		}

		private Node ResolveScopeRoot(Node contextRoot)
		{
			if (TryResolveNode(ScopeRootPath, out var scopeRoot))
			{
				return scopeRoot;
			}

			return contextRoot;
		}

		private IDataTableRuntime ResolveDataRuntime()
		{
			if (TryResolveExplicitDataRuntime(out var explicitRuntime))
			{
				return explicitRuntime;
			}

			return GodotRootTickRunnerNode.Instance?.GetService<IDataTableRuntime>("database");
		}

		private bool TryResolveExplicitDataRuntime(out IDataTableRuntime runtime)
		{
			runtime = null;
			if (!TryResolveNode(DataTableProviderPath, out var providerNode))
			{
				return false;
			}

			if (providerNode is IDataTableRuntime directRuntime)
			{
				runtime = directRuntime;
				return true;
			}

			if (providerNode is IGodotDataTableProvider provider)
			{
				runtime = new GodotDataTableRuntimeAdapter(provider);
				return true;
			}

			_logger.Error("[GodotObjectRootNode] DataTableProviderPath must point to a node implementing IDataTableRuntime or IGodotDataTableProvider.");
			return false;
		}

		private IEventBus ResolveGlobalEventBus()
		{
			if (TryResolveExplicitGlobalEventBus(out var explicitBus))
			{
				return explicitBus;
			}

			return GodotRootTickRunnerNode.Instance?.GetService<IEventBus>("eventbus");
		}

		private bool TryResolveExplicitGlobalEventBus(out IEventBus eventBus)
		{
			eventBus = null;
			if (!TryResolveNode(GlobalEventBusPath, out var busNode))
			{
				return false;
			}

			if (busNode is IEventBus directBus)
			{
				eventBus = directBus;
				return true;
			}

			_logger.Error("[GodotObjectRootNode] GlobalEventBusPath must point to a node implementing IEventBus.");
			return false;
		}

		private GodotEventBusNode ResolveLocalEventBus(Node contextRoot)
		{
			if (TryResolveNode(LocalEventBusPath, out var explicitBus))
			{
				if (explicitBus is GodotEventBusNode localBus)
				{
					return localBus;
				}

				_logger.Error("[GodotObjectRootNode] LocalEventBusPath must point to a GodotEventBusNode.");
				return null;
			}

			var namedBus = contextRoot.GetNodeOrNull<GodotEventBusNode>("LocalEventBus");
			if (namedBus != null)
			{
				return namedBus;
			}

			var childCount = contextRoot.GetChildCount();
			for (var index = 0; index < childCount; index++)
			{
				if (contextRoot.GetChild(index) is GodotEventBusNode candidate
					&& candidate.Mode == GodotEventBusNode.BusMode.Local)
				{
					return candidate;
				}
			}

			return null;
		}

		private IObjectSnapshotSystem ResolveObjectSnapshotSystem(Node contextRoot)
		{
			if (TryResolveNode(ObjectSnapshotSystemPath, out var explicitNode))
			{
				if (explicitNode is IObjectSnapshotSystem explicitSnapshotSystem)
				{
					return explicitSnapshotSystem;
				}

				_logger.Error("[GodotObjectRootNode] ObjectSnapshotSystemPath must point to a node implementing IObjectSnapshotSystem.");
				return null;
			}

			var namedNode = contextRoot.GetNodeOrNull<Node>("ObjectSnapshotSystem");
			if (namedNode is IObjectSnapshotSystem namedSnapshotSystem)
			{
				return namedSnapshotSystem;
			}

			var childCount = contextRoot.GetChildCount();
			for (var index = 0; index < childCount; index++)
			{
				var child = contextRoot.GetChild(index);
				if (child is IObjectSnapshotSystem snapshotSystem)
				{
					return snapshotSystem;
				}
			}

			return null;
		}

		private void CollectModulesAndSnapshotParticipants(
			Node contextRoot,
			out List<SnapshotParticipantEntry> snapshotParticipants)
		{
			_orderedModules.Clear();
			_orderedPassiveSnapshotSyncs.Clear();
			_snapshotRegions.Clear();

			snapshotParticipants = new List<SnapshotParticipantEntry>();
			var moduleEntries = new List<ModuleEntry>();
			var passiveSyncEntries = new List<PassiveSnapshotSyncEntry>();
			var moduleDeclareRuntime = LoadModuleDeclareRuntime();

			var childCount = contextRoot.GetChildCount();
			for (var index = 0; index < childCount; index++)
			{
				var child = contextRoot.GetChild(index);
				if (ReferenceEquals(child, this)
					|| ReferenceEquals(child, _localEventBus)
					|| ReferenceEquals(child, _objectSnapshotSystem))
				{
					continue;
				}

				var module = child as IObjectModule;
				var snapshotBinder = child as IRequireObjectSnapshotRegion;
				var snapshotSync = child as IObjectSnapshotSync;

				if (module != null)
				{
					moduleEntries.Add(CreateModuleEntry(child, module, snapshotSync, index, moduleDeclareRuntime));
				}

				if (snapshotBinder != null || snapshotSync != null)
				{
					snapshotParticipants.Add(new SnapshotParticipantEntry(child, snapshotBinder));
				}

				if (module == null && snapshotSync != null)
				{
					passiveSyncEntries.Add(new PassiveSnapshotSyncEntry(child, snapshotSync, index));
				}
			}

			moduleEntries.Sort(CompareModuleEntries);
			passiveSyncEntries.Sort((left, right) => left.SiblingIndex.CompareTo(right.SiblingIndex));
			_orderedModules.AddRange(moduleEntries);
			_orderedPassiveSnapshotSyncs.AddRange(passiveSyncEntries);
		}

		private bool BindSnapshotParticipants(Node contextRoot, List<SnapshotParticipantEntry> snapshotParticipants)
		{
			if (snapshotParticipants.Count == 0)
			{
				return true;
			}

			if (_objectSnapshotSystem == null)
			{
				if (!_loggedMissingSnapshotSystem)
				{
					_logger.Error(
						$"[GodotObjectRootNode] Snapshot participants were found under '{ResolveNodeName(contextRoot)}' but ObjectSnapshotSystem was not found. Initialization aborted.");
					_loggedMissingSnapshotSystem = true;
				}

				_orderedModules.Clear();
				_orderedPassiveSnapshotSyncs.Clear();
				_snapshotRegions.Clear();
				return false;
			}

			if (_objectSnapshotSystem is GodotObjectSnapshotSystemNode godotSnapshotSystem)
			{
				godotSnapshotSystem.ClearRegions();
			}

			var uniqueRegionNames = new HashSet<string>(StringComparer.Ordinal);
			for (var index = 0; index < snapshotParticipants.Count; index++)
			{
				var participant = snapshotParticipants[index];
				var regionName = ResolveNodeName(participant.OwnerNode);
				if (!uniqueRegionNames.Add(regionName))
				{
					_logger.Error($"[GodotObjectRootNode] Duplicate snapshot region name '{regionName}' under '{ResolveNodeName(contextRoot)}'. Snapshot region names must be unique.");
					_orderedModules.Clear();
					_orderedPassiveSnapshotSyncs.Clear();
					_snapshotRegions.Clear();
					return false;
				}
			}

			try
			{
				for (var index = 0; index < snapshotParticipants.Count; index++)
				{
					var participant = snapshotParticipants[index];
					var region = _objectSnapshotSystem.RegisterRegion(participant.OwnerNode, ResolveNodeName(participant.OwnerNode));
					_snapshotRegions[participant.OwnerNode] = region;

					if (participant.SnapshotBinder != null)
					{
						participant.SnapshotBinder.BindObjectSnapshot(_objectSnapshotSystem, region);
					}
				}
			}
			catch (Exception ex)
			{
				_logger.Error($"[GodotObjectRootNode] Failed to bind snapshot participants under '{ResolveNodeName(contextRoot)}': {ex}");
				_orderedModules.Clear();
				_orderedPassiveSnapshotSyncs.Clear();
				_snapshotRegions.Clear();
				return false;
			}

			return true;
		}

		private void InitialiseModules(Node contextRoot)
		{
			for (var index = 0; index < _orderedModules.Count; index++)
			{
				var entry = _orderedModules[index];
				try
				{
					entry.Module.Init(this, _localEventBus, _globalEventBus);
					_logger.Info($"[GodotObjectRootNode] Initialized object module '{ResolveModuleName(entry.Module)}' under '{ResolveNodeName(contextRoot)}'.");
				}
				catch (Exception ex)
				{
					_logger.Error($"[GodotObjectRootNode] Init failed for object module '{ResolveModuleName(entry.Module)}': {ex}");
				}
			}
		}

		private void TickModules()
		{
			for (var index = 0; index < _orderedModules.Count; index++)
			{
				var entry = _orderedModules[index];
				try
				{
					entry.Module.Tick();
				}
				catch (Exception ex)
				{
					_logger.Error($"[GodotObjectRootNode] Tick failed for object module '{ResolveModuleName(entry.Module)}': {ex}");
				}

				if (entry.SnapshotSync != null)
				{
					SyncSnapshot(entry.OwnerNode, entry.SnapshotSync);
				}
			}

			for (var index = 0; index < _orderedPassiveSnapshotSyncs.Count; index++)
			{
				var entry = _orderedPassiveSnapshotSyncs[index];
				SyncSnapshot(entry.OwnerNode, entry.SnapshotSync);
			}
		}

		private void SyncSnapshot(Node ownerNode, IObjectSnapshotSync snapshotSync)
		{
			if (ownerNode == null || snapshotSync == null)
			{
				return;
			}

			if (!_snapshotRegions.TryGetValue(ownerNode, out var region))
			{
				_logger.Warning($"[GodotObjectRootNode] Snapshot sync skipped for '{ResolveNodeName(ownerNode)}' because no region is bound.");
				return;
			}

			try
			{
				snapshotSync.SyncObjectSnapshot(region);
			}
			catch (Exception ex)
			{
				_logger.Error($"[GodotObjectRootNode] Snapshot sync failed for '{ResolveNodeName(ownerNode)}': {ex}");
			}
		}

		private ModuleEntry CreateModuleEntry(
			Node ownerNode,
			IObjectModule module,
			IObjectSnapshotSync snapshotSync,
			int siblingIndex,
			IModuleDeclareRuntime moduleDeclareRuntime)
		{
			var priority = module.TickPriority;
			var hasDeclareId = false;
			var declareId = 0;
			if (moduleDeclareRuntime != null
				&& moduleDeclareRuntime.TryGetModuleDeclare(ResolveModuleName(module), out var declare))
			{
				priority = declare.Priority;
				declareId = declare.Id;
				hasDeclareId = true;
			}

			return new ModuleEntry(ownerNode, module, snapshotSync, siblingIndex, priority, hasDeclareId, declareId);
		}

		private IModuleDeclareRuntime LoadModuleDeclareRuntime()
		{
			if (_dataRuntime == null || string.IsNullOrEmpty(ModuleDeclareTableTemplateName))
			{
				return null;
			}

			try
			{
				return new ModuleDeclareRuntime(_dataRuntime, ModuleDeclareTableTemplateName);
			}
			catch (Exception ex)
			{
				_logger.Warning($"[GodotObjectRootNode] Failed to load module declare table '{ModuleDeclareTableTemplateName}': {ex.Message}");
				return null;
			}
		}

		private static int CompareModuleEntries(ModuleEntry left, ModuleEntry right)
		{
			var priorityCompare = right.Priority.CompareTo(left.Priority);
			if (priorityCompare != 0)
			{
				return priorityCompare;
			}

			if (left.HasDeclareId && right.HasDeclareId)
			{
				return left.DeclareId.CompareTo(right.DeclareId);
			}

			return left.SiblingIndex.CompareTo(right.SiblingIndex);
		}

		private static string ResolveModuleName(IObjectModule module)
		{
			if (module == null)
			{
				return "<null>";
			}

			return string.IsNullOrEmpty(module.Name) ? module.GetType().Name : module.Name;
		}

		private static string ResolveNodeName(Node node)
		{
			if (node == null)
			{
				return "<unknown-node>";
			}

			var nodeName = node.Name.ToString();
			return string.IsNullOrEmpty(nodeName) ? node.GetType().Name : nodeName;
		}

		private bool TryResolveNode(NodePath path, out Node node)
		{
			node = null;
			if (string.IsNullOrEmpty(path.ToString()))
			{
				return false;
			}

			node = GetNodeOrNull<Node>(path);
			return node != null;
		}
	}
}
`;
}
export function buildGodotRootTickRunnerNodeContent() {
  return `
using GameFramework.Core;
using Godot;

namespace GameFramework.Adapters.Godot
{
    [GlobalClass]
    public partial class GodotRootTickRunnerNode : Node, IRootRuntime
    {
        public static GodotRootTickRunnerNode Instance { get; private set; }

        [Export]
        public NodePath EventBusNodePath { get; set; }

        [Export]
        public NodePath DataTableProviderPath { get; set; }

        [Export]
        public bool UsePhysicsProcessForLateTick { get; set; }

        private readonly GodotRuntimeLogger _logger = new GodotRuntimeLogger();

        private RootTickRunnerCore _core;
        private GodotEventBusNode _eventBus;
        private IDataTableRuntime _dataRuntime;

        public void RegisterService(string name, object instance)
        {
            EnsureCore().RegisterService(name, instance);
        }

        public T GetService<T>(string name) where T : class
        {
            return EnsureCore().GetService<T>(name);
        }

        public void RegisterModule(ISystemModule module)
        {
            EnsureCore().RegisterModule(module);
        }

        public void SetEventBus(GodotEventBusNode eventBus)
        {
            _eventBus = eventBus;
        }

        public void SetDataRuntime(IDataTableRuntime dataRuntime)
        {
            _dataRuntime = dataRuntime;
        }

        public override void _Ready()
        {
            if (Instance != null && !ReferenceEquals(Instance, this))
            {
                _logger.Error("[GodotRootTickRunnerNode] Duplicate root runner detected. The new instance will be ignored.");
                return;
            }

            Instance = this;
            InitBaseModules();
        }

        public override void _ExitTree()
        {
            if (ReferenceEquals(Instance, this))
            {
                Instance = null;
            }
        }

        public override void _Process(double delta)
        {
            EnsureCore().Tick(TickPhase.Update);
            if (!UsePhysicsProcessForLateTick)
            {
                EnsureCore().Tick(TickPhase.LateUpdate);
            }
        }

        public override void _PhysicsProcess(double delta)
        {
            if (UsePhysicsProcessForLateTick)
            {
                EnsureCore().Tick(TickPhase.LateUpdate);
            }
        }

        private void InitBaseModules()
        {
            _dataRuntime = _dataRuntime ?? ResolveDataRuntime();
            _eventBus = _eventBus ?? ResolveEventBus();
            if (_dataRuntime == null || _eventBus == null)
            {
                return;
            }

            EnsureCore().RegisterService("rootNodeName", Name.ToString());
            _eventBus.Init(_dataRuntime);
            EnsureCore().Initialize(_dataRuntime, _eventBus);
        }

        private RootTickRunnerCore EnsureCore()
        {
            if (_core == null)
            {
                _core = new RootTickRunnerCore(_logger);
            }

            return _core;
        }

        private IDataTableRuntime ResolveDataRuntime()
        {
            if (_dataRuntime != null)
            {
                return _dataRuntime;
            }

            if (TryGetNode(DataTableProviderPath, out var providerNode))
            {
                if (providerNode is IDataTableRuntime runtime)
                {
                    return runtime;
                }

                if (providerNode is IGodotDataTableProvider provider)
                {
                    return new GodotDataTableRuntimeAdapter(provider);
                }

                _logger.Error("[GodotRootTickRunnerNode] DataTableProviderPath must point to a node implementing IDataTableRuntime or IGodotDataTableProvider.");
                return null;
            }

            if (this is IDataTableRuntime selfRuntime)
            {
                return selfRuntime;
            }

            if (this is IGodotDataTableProvider selfProvider)
            {
                return new GodotDataTableRuntimeAdapter(selfProvider);
            }

            _logger.Error("[GodotRootTickRunnerNode] No data runtime configured. Call SetDataRuntime() or assign DataTableProviderPath.");
            return null;
        }

        private GodotEventBusNode ResolveEventBus()
        {
            if (_eventBus != null)
            {
                return _eventBus;
            }

            if (TryGetNode(EventBusNodePath, out var eventBusNode))
            {
                if (eventBusNode is GodotEventBusNode godotEventBusNode)
                {
                    return godotEventBusNode;
                }

                _logger.Error("[GodotRootTickRunnerNode] EventBusNodePath must point to a GodotEventBusNode.");
                return null;
            }

            var childEventBus = GetNodeOrNull<GodotEventBusNode>("EventBus");
            if (childEventBus != null)
            {
                return childEventBus;
            }

            var created = new GodotEventBusNode
            {
                Name = "EventBus"
            };
            AddChild(created);
            _logger.Warning("[GodotRootTickRunnerNode] Event bus node was missing. Created child node 'EventBus'.");
            return created;
        }

        private bool TryGetNode(NodePath path, out Node node)
        {
            node = null;
            var pathText = path.ToString();
            if (string.IsNullOrEmpty(pathText))
            {
                return false;
            }

            node = GetNodeOrNull<Node>(path);
            return node != null;
        }
    }
}
`;
}

export function buildGodotDataTableProviderContent() {
  return `
using System.Collections.Generic;
using GameFramework;
using Godot;

[GlobalClass]
public partial class DataTableProvider : Node, IDataTableRuntime
{
    [Export]
    public string DataDir { get; set; } = "res://dataEntity";

    public override void _Ready()
    {
        var path = string.IsNullOrWhiteSpace(DataDir) ? null : DataDir;
        DataEntityRuntimeLoader.Initialize(path);
    }

    public EventBusTableSchema GetSchema(string templateName)
    {
        var sourceSchema = DataEntityRuntimeLoader.GetSchema(templateName);
        if (sourceSchema == null)
        {
            return null;
        }

        return new EventBusTableSchema
        {
            instances = ConvertInstances(sourceSchema.instances)
        };
    }

    private static Dictionary<string, EventBusTableInstance> ConvertInstances(Dictionary<string, object> sourceInstances)
    {
        var result = new Dictionary<string, EventBusTableInstance>();
        if (sourceInstances == null)
        {
            return result;
        }

        foreach (var pair in sourceInstances)
        {
            if (pair.Value is Dictionary<string, object> fields)
            {
                result[pair.Key] = new EventBusTableInstance(fields);
            }
        }

        return result;
    }
}
`;
}

export function buildGodotRuntimeFiles() {
  return [
    {
      relativePath: 'godotCsharpDate/TickRunnerEventBusApiGuide.md',
      content: buildGodotTickRunnerEventBusApiGuideContent(),
    },
    {
      relativePath: `${GODOT_RUNTIME_FOLDER_NAME}/Shared/GameFrameworkRuntime.cs`,
      content: buildGodotSharedRuntimeContent(),
    },
    {
      relativePath: `${GODOT_RUNTIME_FOLDER_NAME}/Godot/GodotRuntimeSupport.cs`,
      content: buildGodotRuntimeSupportContent(),
    },
    {
      relativePath: `${GODOT_RUNTIME_FOLDER_NAME}/Godot/GodotEventBusNode.cs`,
      content: buildGodotEventBusNodeContent(),
    },
    {
      relativePath: `${GODOT_RUNTIME_FOLDER_NAME}/Godot/GodotObjectModuleBase.cs`,
      content: buildGodotObjectModuleBaseContent(),
    },
    {
      relativePath: `${GODOT_RUNTIME_FOLDER_NAME}/Godot/GodotObjectSnapshotSystemNode.cs`,
      content: buildGodotObjectSnapshotSystemNodeContent(),
    },
    {
      relativePath: `${GODOT_RUNTIME_FOLDER_NAME}/Godot/GodotObjectRootNode.cs`,
      content: buildGodotObjectRootNodeContent(),
    },
    {
      relativePath: `${GODOT_RUNTIME_FOLDER_NAME}/Godot/GodotRootTickRunnerNode.cs`,
      content: buildGodotRootTickRunnerNodeContent(),
    },
    {
      relativePath: `${GODOT_RUNTIME_FOLDER_NAME}/Godot/DataTableProvider.cs`,
      content: buildGodotDataTableProviderContent(),
    },
  ];
}
function buildGodotTickRunnerEventBusApiGuideContent() {
  return `
# Godot TickRunner / EventBus / ObjectSnapshot 使用说明

## 一键初始化会注入什么
- \`scripts/EventBusTickRunner/Shared/GameFrameworkRuntime.cs\`
- \`scripts/EventBusTickRunner/Godot/*.cs\`
- \`scripts/godotCsharpDate/TickRunnerEventBusApiGuide.md\`
- \`prefab/GameRoot.tscn\`
- \`prefab/ObjectBase.tscn\`
- \`dataEntity/systemModuleDeclare.json\`
- \`dataEntity/systemEventTag.json\`
- \`dataEntity/eventBusInitFilter.json\`
- \`dataEntity/moduleDeclare.json\`
- \`dataEntity/systemEvent.json\`

再次执行 Godot C# 一键初始化时，只会更新工具注入的脚本和文档，不会覆盖你已经配置好的模板和场景内容。

## 对象域默认结构
- \`ObjectSnapshotSystem\`
- \`ObjectRoot\`
- \`LocalEventBus\`

\`\`\`text
ObjectBase
├─ ObjectSnapshotSystem
├─ ObjectRoot
├─ LocalEventBus
└─ 你的模块或对象
\`\`\`

## 快照参与者判定
- 实现 \`IRequireObjectSnapshotRegion\` 的对象会在 \`Init(...)\` 前收到 \`BindObjectSnapshot(...)\`。
- 实现 \`IObjectSnapshotSync\` 的对象也算快照参与者，即使它没有实现 \`IRequireObjectSnapshotRegion\`。
- 只要对象实现了 \`IRequireObjectSnapshotRegion\` 或 \`IObjectSnapshotSync\`，\`ObjectRoot\` 都会为它注册区域。

## ObjectRoot 快照流程
1. 解析 \`ObjectSnapshotSystem\`。
2. 扫描 \`contextRoot\` 的直接子节点。
3. 收集模块、快照参与者、被动同步对象。
4. 若存在快照参与者但缺少 \`ObjectSnapshotSystem\`，直接报错并终止初始化。
5. 若快照中心是 \`GodotObjectSnapshotSystemNode\`，绑定前会先 \`ClearRegions()\`。
6. 所有快照参与者按节点名注册区域；重名会直接报错并终止初始化。
7. 实现了 \`IRequireObjectSnapshotRegion\` 的对象会收到 \`BindObjectSnapshot(...)\`。
8. 之后才初始化 \`IObjectModule\`。

## 同步时机
- 模块对象：\`Tick()\` 后立即同步。
- 非模块但实现了 \`IObjectSnapshotSync\` 的直接子节点：在所有模块 Tick 结束后按 sibling 顺序同步。
- 如果对象有同步接口但当前帧没有绑定区域，只会记警告并跳过同步。

## 对象模块示例
\`\`\`csharp
using GameFramework;
using GameFramework.Adapters.Godot;
using Godot;

public partial class ExampleMovementModule : GodotObjectModuleBase, IRequireObjectSnapshotRegion, IObjectSnapshotSync
{
    private IObjectSnapshotRegion _snapshotRegion;

    public void BindObjectSnapshot(IObjectSnapshotSystem snapshotSystem, IObjectSnapshotRegion region)
    {
        _snapshotRegion = region;
    }

    public override void Init(IObjectRuntime root, IEventBus localEventBus, IEventBus globalEventBus)
    {
        GD.Print(_snapshotRegion != null ? "snapshot bound before init" : "snapshot missing");
    }

    public void SyncObjectSnapshot(IObjectSnapshotRegion region)
    {
        region.Set("velocity", Vector3.Forward);
    }
}
\`\`\`

## 非模块对象示例
\`\`\`csharp
using GameFramework;
using Godot;

public partial class ExampleHudBridge : Node, IObjectSnapshotSync
{
    public void SyncObjectSnapshot(IObjectSnapshotRegion region)
    {
        region.Set("visible", Visible);
    }
}
\`\`\`
`;
}
export function buildGodotGameRootSceneContent(options = {}) {
  const scriptOutputRootName = options.scriptOutputRootName || 'scripts';
  const runtimeRootPath = `res://${scriptOutputRootName}/${GODOT_RUNTIME_FOLDER_NAME}/Godot`;
  return `[gd_scene load_steps=4 format=3]

[ext_resource type="Script" path="${runtimeRootPath}/GodotRootTickRunnerNode.cs" id="1_root"]
[ext_resource type="Script" path="${runtimeRootPath}/GodotEventBusNode.cs" id="2_bus"]
[ext_resource type="Script" path="${runtimeRootPath}/DataTableProvider.cs" id="3_provider"]

[node name="GameRoot" type="Node"]
script = ExtResource("1_root")
EventBusNodePath = NodePath("EventBus")
DataTableProviderPath = NodePath("DataTableProvider")

[node name="EventBus" type="Node" parent="."]
script = ExtResource("2_bus")
EventTableTemplateName = "${SYSTEM_EVENT_TEMPLATE_NAME}"
TagTableTemplateName = "${SYSTEM_EVENT_TAG_TEMPLATE_NAME}"
InitTagFilterTableTemplateName = "${EVENT_BUS_INIT_FILTER_TEMPLATE_NAME}"
InitTagFilterProfileName = "${DEFAULT_WORLD_BUS_PROFILE_NAME}"

[node name="DataTableProvider" type="Node" parent="."]
script = ExtResource("3_provider")
DataDir = "res://dataEntity"
`;
}

export function buildGodotObjectBaseSceneContent(options = {}) {
  const scriptOutputRootName = options.scriptOutputRootName || 'scripts';
  const runtimeRootPath = `res://${scriptOutputRootName}/${GODOT_RUNTIME_FOLDER_NAME}/Godot`;
  return `[gd_scene load_steps=4 format=3]

[ext_resource type="Script" path="${runtimeRootPath}/GodotObjectRootNode.cs" id="1_root"]
[ext_resource type="Script" path="${runtimeRootPath}/GodotEventBusNode.cs" id="2_bus"]
[ext_resource type="Script" path="${runtimeRootPath}/GodotObjectSnapshotSystemNode.cs" id="3_snapshot"]

[node name="ObjectBase" type="Node"]

[node name="ObjectSnapshotSystem" type="Node" parent="."]
script = ExtResource("3_snapshot")

[node name="ObjectRoot" type="Node" parent="."]
script = ExtResource("1_root")
ContextRootPath = NodePath("..")
LocalEventBusPath = NodePath("../LocalEventBus")
ObjectSnapshotSystemPath = NodePath("../ObjectSnapshotSystem")
ModuleDeclareTableTemplateName = "moduleDeclare"

[node name="LocalEventBus" type="Node" parent="."]
script = ExtResource("2_bus")
Mode = 1
EventTableTemplateName = "${SYSTEM_EVENT_TEMPLATE_NAME}"
TagTableTemplateName = "${SYSTEM_EVENT_TAG_TEMPLATE_NAME}"
ScopeRootPath = NodePath("..")
`;
}
export function buildSystemModuleDeclareTemplate() {
  return {
    name: SYSTEM_MODULE_DECLARE_TEMPLATE_NAME,
    indexField: 'moduleKey',
    parameters: [
      {
        name: 'moduleKey',
        type: 'string',
      },
      {
        name: 'priority',
        type: 'int',
      },
      {
        name: 'ticktype',
        type: 'int',
      },
      {
        name: 'tags',
        type: 'string',
      },
    ],
    instances: [
      buildBootstrapTemplateInstance({
        templateName: SYSTEM_MODULE_DECLARE_TEMPLATE_NAME,
        indexField: 'moduleKey',
        id: 0,
        name: DEFAULT_SYSTEM_MODULE_DECLARE_INSTANCE_NAME,
        payload: {
          moduleKey: DEFAULT_SYSTEM_MODULE_DECLARE_INSTANCE_NAME,
          priority: 0,
          ticktype: 0,
          tags: '',
        },
      }),
    ],
  };
}

export function buildSystemEventTemplate() {
  return {
    name: SYSTEM_EVENT_TEMPLATE_NAME,
    indexField: 'name',
    parameters: [
      {
        name: 'tags',
        type: 'string',
      },
    ],
    instances: [
      buildBootstrapTemplateInstance({
        templateName: SYSTEM_EVENT_TEMPLATE_NAME,
        indexField: 'name',
        id: 0,
        name: DEFAULT_SYSTEM_EVENT_INSTANCE_NAME,
        payload: {
          tags: '',
        },
      }),
    ],
  };
}

export function buildSystemEventTagTemplate() {
  return {
    name: SYSTEM_EVENT_TAG_TEMPLATE_NAME,
    indexField: 'name',
    parameters: [
      {
        name: 'description',
        type: 'string',
      },
    ],
    instances: [
      buildBootstrapTemplateInstance({
        templateName: SYSTEM_EVENT_TAG_TEMPLATE_NAME,
        indexField: 'name',
        id: 0,
        name: DEFAULT_SYSTEM_EVENT_TAG_INSTANCE_NAME,
        payload: {
          description: '',
        },
      }),
    ],
  };
}

export function buildEventBusInitFilterTemplate() {
  return {
    name: EVENT_BUS_INIT_FILTER_TEMPLATE_NAME,
    indexField: 'name',
    parameters: [
      {
        name: 'filters',
        type: 'string',
      },
    ],
    instances: [
      buildBootstrapTemplateInstance({
        templateName: EVENT_BUS_INIT_FILTER_TEMPLATE_NAME,
        indexField: 'name',
        id: 0,
        name: DEFAULT_WORLD_BUS_PROFILE_NAME,
        payload: {
          filters: '',
        },
      }),
    ],
  };
}

export function buildModuleDeclareTemplate() {
  return {
    name: MODULE_DECLARE_TEMPLATE_NAME,
    indexField: 'moduleKey',
    parameters: [
      {
        name: 'moduleKey',
        type: 'string',
      },
      {
        name: 'tags',
        type: 'string',
      },
      {
        name: 'priority',
        type: 'int',
      },
    ],
    instances: [
      buildBootstrapTemplateInstance({
        templateName: MODULE_DECLARE_TEMPLATE_NAME,
        indexField: 'moduleKey',
        id: 0,
        name: DEFAULT_MODULE_DECLARE_INSTANCE_NAME,
        payload: {
          moduleKey: DEFAULT_MODULE_DECLARE_INSTANCE_NAME,
          tags: '',
          priority: 0,
        },
      }),
    ],
  };
}
