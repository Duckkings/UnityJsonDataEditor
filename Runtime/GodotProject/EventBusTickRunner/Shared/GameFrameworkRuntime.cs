
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

		public object GetValue(string columnName, object defaultValue = null)
		{
			return TryGetFieldValue(columnName, out var value) ? value : defaultValue;
		}

		public IReadOnlyList<string> GetFieldNames()
		{
			if (_fields == null)
			{
				return Array.Empty<string>();
			}

			if (_fields.TryGetValue("payload", out var payloadObject)
				&& payloadObject is IDictionary<string, object> payload)
			{
				return payload.Keys.ToList().AsReadOnly();
			}

			return _fields.Keys.ToList().AsReadOnly();
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

		public string UiPrefabPath { get; set; }

		public int UiPriority { get; set; }
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
					Priority = instance.GetInt("priority", 0),
					UiPrefabPath = instance.GetString("uiPrefabPath", string.Empty),
					UiPriority = instance.GetInt("uiPriority", 0)
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

		void Shutdown()
		{
		}
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

	public interface IObjectSnapshotRegionNameProvider
	{
		string GetObjectSnapshotRegionName();
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

		void Shutdown();
	}

	public interface IObjectTagEventReceiver
	{
		void OnTagEvent(string matchedTag, EventEnvelope envelope);
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

		public void Clear()
		{
			_serviceMap.Clear();
		}
	}
}



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
		private readonly List<ISystemModule> _initializedModules = new List<ISystemModule>();

		private bool _modulesInitialised;
		private bool _shutdown;
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
			if (_shutdown)
			{
				_logger.Warning("[RootTickRunner] RegisterModule ignored because the runner has already shut down.");
				return;
			}

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
				if (ReferenceEquals(entry.Module, module))
				{
					return;
				}

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
			if (!_modulesInitialised || _shutdown)
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

		public void Shutdown()
		{
			if (_shutdown)
			{
				return;
			}

			_shutdown = true;
			_modulesInitialised = false;

			for (var index = _initializedModules.Count - 1; index >= 0; index--)
			{
				var module = _initializedModules[index];
				try
				{
					module.Shutdown();
					_logger.Info($"[RootTickRunner] {ResolveRootNodeName()} {module.Name} shut down.");
				}
				catch (Exception ex)
				{
					_logger.Error($"[RootTickRunner] Exception while shutting down initialized module at index {index}: {ex}");
				}
			}

			_initializedModules.Clear();
			_logger.Info("[RootTickRunner] All initialized system modules finished shutdown.");

			foreach (var entry in _moduleTable.Values)
			{
				entry.Module = null;
				entry.Registered = false;
			}

			_serviceRegistry.Clear();
			_eventBus = null;
			_dataRuntime = null;
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
			_initializedModules.Clear();
			var initializedModuleNames = new List<string>();
			var allModulesSucceeded = true;
			foreach (var entry in GetOrderedModuleEntries().ToList())
			{
				try
				{
					entry.Module.Init(this, _eventBus);
					_initializedModules.Add(entry.Module);
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
