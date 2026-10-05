
using System;
using System.Collections.Generic;
using GameFramework;
using GameFramework.Core;
using Godot;

namespace GameFramework.Adapters.Godot
{
	public static class GodotEventBusRuntimeSettings
	{
		private static readonly List<WeakReference<GodotEventBusNode>> RegisteredBuses = new();

		public static bool PublishedEventLoggingEnabled { get; private set; }

		public static void SetPublishedEventLoggingEnabled(bool enabled)
		{
			PublishedEventLoggingEnabled = enabled;
			for (var index = RegisteredBuses.Count - 1; index >= 0; index--)
			{
				if (!RegisteredBuses[index].TryGetTarget(out var bus)
					|| bus == null
					|| !GodotObject.IsInstanceValid(bus))
				{
					RegisteredBuses.RemoveAt(index);
					continue;
				}
				bus.ApplyPublishedEventLogging(enabled);
			}
		}

		internal static void Register(GodotEventBusNode bus)
		{
			if (bus == null)
			{
				return;
			}
			for (var index = RegisteredBuses.Count - 1; index >= 0; index--)
			{
				if (!RegisteredBuses[index].TryGetTarget(out var existing)
					|| existing == null
					|| !GodotObject.IsInstanceValid(existing))
				{
					RegisteredBuses.RemoveAt(index);
					continue;
				}
				if (ReferenceEquals(existing, bus))
				{
					bus.ApplyPublishedEventLogging(PublishedEventLoggingEnabled);
					return;
				}
			}
			RegisteredBuses.Add(new WeakReference<GodotEventBusNode>(bus));
			bus.ApplyPublishedEventLogging(PublishedEventLoggingEnabled);
		}

		internal static void Unregister(GodotEventBusNode bus)
		{
			for (var index = RegisteredBuses.Count - 1; index >= 0; index--)
			{
				if (!RegisteredBuses[index].TryGetTarget(out var existing)
					|| existing == null
					|| !GodotObject.IsInstanceValid(existing)
					|| ReferenceEquals(existing, bus))
				{
					RegisteredBuses.RemoveAt(index);
				}
			}
		}
	}

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
		public bool LogPublishedEvents { get; set; }

		[Export]
		public NodePath ScopeRootPath { get; set; }

		private readonly GodotRuntimeLogger _logger = new GodotRuntimeLogger();
		private readonly GodotTimeProvider _timeProvider = new GodotTimeProvider();
		private readonly GodotScopeResolver _scopeResolver = new GodotScopeResolver();

		private EventBusCore _core;
		private EventBusConfig _coreConfig;
		private bool _hasLoggedInitialization;

		public bool RuntimeLogPublishedEventsEnabled =>
			_coreConfig?.LogPublishedEvents ?? GodotEventBusRuntimeSettings.PublishedEventLoggingEnabled;

		public void Init(IDataTableRuntime dbRuntime)
		{
			Init(dbRuntime, ResolveDefaultBusOwner());
		}

		public void Init(IDataTableRuntime dbRuntime, object busOwner)
		{
			GodotEventBusRuntimeSettings.Register(this);
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
				GodotEventBusRuntimeSettings.Register(this);
				_coreConfig = BuildConfig();
				_core = new EventBusCore(Name.ToString(), _coreConfig, _logger, _timeProvider, _scopeResolver);
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
				LogPublishedEvents = GodotEventBusRuntimeSettings.PublishedEventLoggingEnabled
			};
		}

		internal void ApplyPublishedEventLogging(bool enabled)
		{
			LogPublishedEvents = enabled;
			if (_coreConfig != null)
			{
				_coreConfig.LogPublishedEvents = enabled;
			}
		}

		public override void _ExitTree()
		{
			GodotEventBusRuntimeSettings.Unregister(this);
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
