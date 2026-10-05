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
				int declareId,
				IReadOnlyList<string> tags,
				ModuleUiRequest uiRequest)
			{
				OwnerNode = ownerNode;
				Module = module;
				SnapshotSync = snapshotSync;
				SiblingIndex = siblingIndex;
				Priority = priority;
				HasDeclareId = hasDeclareId;
				DeclareId = declareId;
				Tags = tags ?? Array.Empty<string>();
				UiRequest = uiRequest;
			}

			public Node OwnerNode { get; }

			public IObjectModule Module { get; }

			public IObjectSnapshotSync SnapshotSync { get; }

			public int SiblingIndex { get; }

			public int Priority { get; }

			public bool HasDeclareId { get; }

			public int DeclareId { get; }

			public IReadOnlyList<string> Tags { get; }

			public ModuleUiRequest UiRequest { get; }
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
		public bool UsePhysicsProcess { get; set; }

		// Opt-in diagnostic counters; normal gameplay never reads the clock or allocates samples.
		public bool CollectModuleTimings { get; set; }
		private readonly Dictionary<string, ModuleTiming> _moduleTimings = new();
		public sealed class ModuleTiming
		{
			public long Calls { get; set; }
			public double TotalMilliseconds { get; set; }
			public double MaxMilliseconds { get; set; }
		}
		public IReadOnlyDictionary<string, ModuleTiming> ModuleTimings => _moduleTimings;
		public void ResetModuleTimings() => _moduleTimings.Clear();
		private void RecordModuleTiming(string key, long started)
		{
			var milliseconds = (System.Diagnostics.Stopwatch.GetTimestamp() - started)
				* 1000.0 / System.Diagnostics.Stopwatch.Frequency;
			if (!_moduleTimings.TryGetValue(key, out var timing))
			{
				timing = new ModuleTiming();
				_moduleTimings.Add(key, timing);
			}
			timing.Calls++;
			timing.TotalMilliseconds += milliseconds;
			timing.MaxMilliseconds = Math.Max(timing.MaxMilliseconds, milliseconds);
		}

		[Export]
		public string ModuleDeclareTableTemplateName { get; set; } = "moduleDeclare";

		private readonly GodotRuntimeLogger _logger = new GodotRuntimeLogger();
		private readonly List<ModuleEntry> _orderedModules = new List<ModuleEntry>();
		private readonly List<PassiveSnapshotSyncEntry> _orderedPassiveSnapshotSyncs = new List<PassiveSnapshotSyncEntry>();
		private readonly List<SubscriptionToken> _moduleTagSubscriptions = new List<SubscriptionToken>();
		private readonly Dictionary<Node, List<SubscriptionToken>> _moduleTagSubscriptionsByOwner = new();
		private readonly List<object> _boundModuleUiOwners = new List<object>();
		private readonly List<string> _initializationErrors = new List<string>();
		private readonly Dictionary<Node, IObjectSnapshotRegion> _snapshotRegions =
			new Dictionary<Node, IObjectSnapshotRegion>();

		private GodotEventBusNode _localEventBus;
		private IEventBus _globalEventBus;
		private IDataTableRuntime _dataRuntime;
		private IObjectSnapshotSystem _objectSnapshotSystem;
		private IUiSystem _uiSystem;
		private bool _initialized;
		private bool _loggedMissingLocalEventBus;
		private bool _loggedPendingRootServices;
		private bool _loggedMissingSnapshotSystem;
		private bool _loggedPendingUiSystem;
		private bool _deferredInitializationQueued;
		private bool _initializingModules;
		private readonly List<(Node[] Removed, Node[] Added)> _pendingModuleChanges = new();

		public bool IsInitialized => _initialized;

		public IReadOnlyList<string> LastInitializationErrors => _initializationErrors;

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

			SetProcess(!UsePhysicsProcess);
			SetPhysicsProcess(UsePhysicsProcess);
			QueueDeferredInitialization();
		}

		private void QueueDeferredInitialization()
		{
			if (_deferredInitializationQueued || !IsInsideTree())
			{
				return;
			}

			_deferredInitializationQueued = true;
			Callable.From(InitializeObjectDomainDeferred).CallDeferred();
		}

		private void InitializeObjectDomainDeferred()
		{
			_deferredInitializationQueued = false;
			if (_initialized || !IsInsideTree())
			{
				return;
			}

			var contextRoot = ResolveContextRoot();
			if (contextRoot != null && !contextRoot.IsNodeReady())
			{
				QueueDeferredInitialization();
				return;
			}

			InitializeObjectDomain();
		}

		public override void _Process(double delta)
		{
			if (UsePhysicsProcess)
			{
				return;
			}

			AdvanceObjectDomain();
		}

		public override void _PhysicsProcess(double delta)
		{
			if (!UsePhysicsProcess)
			{
				return;
			}

			AdvanceObjectDomain();
		}

		private void AdvanceObjectDomain()
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
			_deferredInitializationQueued = false;
			ClearRuntimeState();
			SetProcess(false);
			SetPhysicsProcess(false);
		}

		public void InitializeObjectDomain()
		{
			if (_initialized)
			{
				return;
			}

			_initializationErrors.Clear();
			UnsubscribeModuleTagSubscriptions();

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
			_uiSystem = _uiSystem ?? ResolveUiSystem();
			if (_uiSystem == null && HasPendingModuleUiBindings())
			{
				if (!_loggedPendingUiSystem)
				{
					_logger.Warning("[GodotObjectRootNode] Waiting for global UISystem before completing ObjectRoot initialization.");
					_loggedPendingUiSystem = true;
				}

				return;
			}

			if (!BindSnapshotParticipants(contextRoot, snapshotParticipants))
			{
				return;
			}

			_initializingModules = true;
			try { InitialiseModules(contextRoot); }
			finally { _initializingModules = false; }

			_initialized = true;
			var pendingChanges = _pendingModuleChanges.ToArray();
			_pendingModuleChanges.Clear();
			foreach (var change in pendingChanges) ReplaceDynamicModules(change.Removed, change.Added);
			_loggedMissingLocalEventBus = false;
			_loggedPendingRootServices = false;
			_loggedMissingSnapshotSystem = false;
			_loggedPendingUiSystem = false;
			SetProcess(!UsePhysicsProcess);
			SetPhysicsProcess(UsePhysicsProcess);
			_logger.Info($"[GodotObjectRootNode] Initialized {_orderedModules.Count} object modules under '{ResolveNodeName(contextRoot)}'.");
		}

		public void ReinitializeObjectDomain()
		{
			ClearRuntimeState();
			var contextRoot = ResolveContextRoot();
			if (IsInsideTree() && (contextRoot == null || contextRoot.IsNodeReady()))
			{
				InitializeObjectDomain();
				return;
			}

			QueueDeferredInitialization();
		}

		/// <summary>Replace only explicitly changed modules; all unrelated modules and regions retain their state.</summary>
		public void ReplaceDynamicModules(IReadOnlyList<Node> removedNodes, IReadOnlyList<Node> addedNodes)
		{
			// Before first Init the normal collection owns discovery and initialization.
			if (!_initialized)
			{
				if (_initializingModules)
				{
					var removedCopy = new List<Node>(removedNodes ?? Array.Empty<Node>()).ToArray();
					var addedCopy = new List<Node>(addedNodes ?? Array.Empty<Node>()).ToArray();
					_pendingModuleChanges.Add((removedCopy, addedCopy));
				}
				return;
			}
			var context = ResolveContextRoot();
			var removed = new HashSet<Node>(removedNodes ?? Array.Empty<Node>());
			var additions = new List<ModuleEntry>();
			var regionNames = new HashSet<string>(StringComparer.Ordinal);
			foreach (var pair in _snapshotRegions)
				if (!removed.Contains(pair.Key)) regionNames.Add(pair.Value.RegionName);
			var declares = LoadModuleDeclareRuntime();
			foreach (var node in addedNodes ?? Array.Empty<Node>())
			{
				if (node == null || !GodotObject.IsInstanceValid(node) || node.GetParent() != context
					|| node is not IObjectModule module)
					throw new InvalidOperationException("Dynamic modules must be valid object modules attached directly under the context root.");
				if (_orderedModules.Exists(entry => ReferenceEquals(entry.OwnerNode, node)) || additions.Exists(entry => ReferenceEquals(entry.OwnerNode, node)))
					throw new InvalidOperationException("A dynamic module cannot be registered twice.");
				if (node is IRequireObjectSnapshotRegion && !regionNames.Add(ResolveSnapshotRegionName(node)))
					throw new InvalidOperationException($"Duplicate dynamic snapshot region '{ResolveSnapshotRegionName(node)}'.");
				additions.Add(CreateModuleEntry(node, module, node as IObjectSnapshotSync, node.GetIndex(), declares));
			}
			if (_objectSnapshotSystem is not GodotObjectSnapshotSystemNode snapshots && (removed.Count > 0 || additions.Count > 0))
				throw new InvalidOperationException("Dynamic modules require a snapshot system supporting owner release.");
			foreach (var node in removed)
			{
				var entry = _orderedModules.Find(value => ReferenceEquals(value.OwnerNode, node));
				if (entry == null) continue;
				entry.Module.Shutdown();
				UnregisterModuleUi(entry.Module);
				((IEventBus)_localEventBus)?.UnsubscribeAll(node);
				_globalEventBus?.UnsubscribeAll(node);
				if (_moduleTagSubscriptionsByOwner.Remove(node, out var tokens))
					foreach (var token in tokens) _moduleTagSubscriptions.Remove(token);
				(_objectSnapshotSystem as GodotObjectSnapshotSystemNode)?.UnregisterOwner(node);
				_snapshotRegions.Remove(node);
				_orderedModules.Remove(entry);
			}
			var initialized = new List<ModuleEntry>();
			try
			{
				foreach (var entry in additions)
				{
					initialized.Add(entry);
					if (entry.OwnerNode is IRequireObjectSnapshotRegion binder)
					{
						var region = _objectSnapshotSystem.RegisterRegion(entry.OwnerNode, ResolveSnapshotRegionName(entry.OwnerNode));
						_snapshotRegions[entry.OwnerNode] = region;
						binder.BindObjectSnapshot(_objectSnapshotSystem, region);
					}
					BindModuleUi(entry, context);
					entry.Module.Init(this, _localEventBus, _globalEventBus);
					SubscribeModuleTags(entry, context);
				}
				_orderedModules.AddRange(additions);
				_orderedModules.Sort(CompareModuleEntries);
			}
			catch
			{
				foreach (var entry in initialized)
				{
					entry.Module.Shutdown();
					UnregisterModuleUi(entry.Module);
					((IEventBus)_localEventBus)?.UnsubscribeAll(entry.OwnerNode);
					_globalEventBus?.UnsubscribeAll(entry.OwnerNode);
					if (_moduleTagSubscriptionsByOwner.Remove(entry.OwnerNode, out var tokens))
						foreach (var token in tokens) _moduleTagSubscriptions.Remove(token);
					(_objectSnapshotSystem as GodotObjectSnapshotSystemNode)?.UnregisterOwner(entry.OwnerNode);
					_snapshotRegions.Remove(entry.OwnerNode);
				}
				throw;
			}
		}

		private void ClearRuntimeState()
		{
			_pendingModuleChanges.Clear();
			_initializingModules = false;
			ShutdownModules();
			UnsubscribeModuleTagSubscriptions();
			UnregisterModuleUis();
			_initialized = false;
			_orderedModules.Clear();
			_orderedPassiveSnapshotSyncs.Clear();
			_snapshotRegions.Clear();
			_localEventBus = null;
			_globalEventBus = null;
			_dataRuntime = null;
			_objectSnapshotSystem = null;
			_uiSystem = null;
			_loggedMissingLocalEventBus = false;
			_loggedPendingRootServices = false;
			_loggedMissingSnapshotSystem = false;
			_loggedPendingUiSystem = false;
			_initializationErrors.Clear();
			SetProcess(false);
			SetPhysicsProcess(false);
		}

		private void ShutdownModules()
		{
			for (var index = _orderedModules.Count - 1; index >= 0; index--)
			{
				var module = _orderedModules[index]?.Module;
				if (module == null)
				{
					continue;
				}

				try
				{
					module.Shutdown();
				}
				catch (Exception ex)
				{
					_logger.Error($"[GodotObjectRootNode] Shutdown failed for object module '{ResolveModuleName(module)}': {ex}");
				}
			}
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

		private IUiSystem ResolveUiSystem()
		{
			return GodotRootTickRunnerNode.Instance?.GetService<IUiSystem>("uisystem");
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
				var regionName = ResolveSnapshotRegionName(participant.OwnerNode);
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
					var region = _objectSnapshotSystem.RegisterRegion(participant.OwnerNode, ResolveSnapshotRegionName(participant.OwnerNode));
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
					BindModuleUi(entry, contextRoot);
					entry.Module.Init(this, _localEventBus, _globalEventBus);
					_logger.Info($"[GodotObjectRootNode] Initialized object module '{ResolveModuleName(entry.Module)}' under '{ResolveNodeName(contextRoot)}'.");
					SubscribeModuleTags(entry, contextRoot);
				}
				catch (Exception ex)
				{
					UnregisterModuleUi(entry?.Module);
					var error =
						$"[GodotObjectRootNode] Init failed for object module "
						+ $"'{ResolveModuleName(entry.Module)}': {ex}";
					_initializationErrors.Add(error);
					_logger.Error(error);
				}
			}
		}

		private bool HasPendingModuleUiBindings()
		{
			for (var index = 0; index < _orderedModules.Count; index++)
			{
				var entry = _orderedModules[index];
				if (entry.UiRequest != null && entry.Module is IRequireModuleUi)
				{
					return true;
				}
			}

			return false;
		}

		private void BindModuleUi(ModuleEntry entry, Node contextRoot)
		{
			if (entry == null || entry.UiRequest == null)
			{
				return;
			}

			if (!(entry.Module is IRequireModuleUi moduleUiReceiver))
			{
				_logger.Warning($"[GodotObjectRootNode] Object module '{ResolveModuleName(entry.Module)}' declares uiPrefabPath but does not implement IRequireModuleUi. UI binding skipped.");
				return;
			}

			_uiSystem = _uiSystem ?? ResolveUiSystem();
			if (_uiSystem == null)
			{
				_logger.Warning($"[GodotObjectRootNode] Object module '{ResolveModuleName(entry.Module)}' requires UI but UISystem service is not ready.");
				return;
			}

			if (!moduleUiReceiver.WantsScreenUi) return;
			var handle = _uiSystem.RegisterModuleUi(entry.Module, entry.UiRequest);
			if (!handle.IsValid)
			{
				_logger.Warning($"[GodotObjectRootNode] Failed to register UI for object module '{ResolveModuleName(entry.Module)}' under '{ResolveNodeName(contextRoot)}'.");
				return;
			}

			_boundModuleUiOwners.Add(entry.Module);
			moduleUiReceiver.BindModuleUi(handle, handle.View);
		}

		private void UnregisterModuleUi(IObjectModule module)
		{
			if (module == null || _uiSystem == null)
			{
				return;
			}

			_uiSystem.UnregisterModuleUi(module);
			_boundModuleUiOwners.Remove(module);
		}

		private void UnregisterModuleUis()
		{
			if (_uiSystem == null || _boundModuleUiOwners.Count == 0)
			{
				_boundModuleUiOwners.Clear();
				return;
			}

			for (var index = 0; index < _boundModuleUiOwners.Count; index++)
			{
				_uiSystem.UnregisterModuleUi(_boundModuleUiOwners[index]);
			}

			_boundModuleUiOwners.Clear();
		}

		private void TickModules()
		{
			for (var index = 0; index < _orderedModules.Count; index++)
			{
				var entry = _orderedModules[index];
				var timingStarted = CollectModuleTimings ? System.Diagnostics.Stopwatch.GetTimestamp() : 0L;
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
				if (CollectModuleTimings)
				{
					RecordModuleTiming(entry.OwnerNode.Name.ToString(), timingStarted);
				}
			}

			for (var index = 0; index < _orderedPassiveSnapshotSyncs.Count; index++)
			{
				var entry = _orderedPassiveSnapshotSyncs[index];
				var timingStarted = CollectModuleTimings ? System.Diagnostics.Stopwatch.GetTimestamp() : 0L;
				SyncSnapshot(entry.OwnerNode, entry.SnapshotSync);
				if (CollectModuleTimings)
				{
					RecordModuleTiming("snapshot:" + entry.OwnerNode.Name, timingStarted);
				}
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
			IReadOnlyList<string> tags = Array.Empty<string>();
			ModuleUiRequest uiRequest = null;
			if (moduleDeclareRuntime != null
				&& moduleDeclareRuntime.TryGetModuleDeclare(ResolveModuleName(module), out var declare))
			{
				priority = declare.Priority;
				declareId = declare.Id;
				hasDeclareId = true;
				tags = ParseTagExpression(declare.Tags);
				if (!string.IsNullOrWhiteSpace(declare.UiPrefabPath))
				{
					uiRequest = new ModuleUiRequest
					{
						ModuleKey = declare.ModuleKey,
						UiPrefabPath = declare.UiPrefabPath,
						UiPriority = declare.UiPriority,
						DeclareId = declare.Id
					};
				}
			}

			return new ModuleEntry(ownerNode, module, snapshotSync, siblingIndex, priority, hasDeclareId, declareId, tags, uiRequest);
		}

		private void SubscribeModuleTags(ModuleEntry entry, Node contextRoot)
		{
			if (entry == null || entry.Tags.Count == 0)
			{
				return;
			}

			if (!(entry.Module is IObjectTagEventReceiver receiver))
			{
				_logger.Warning($"[GodotObjectRootNode] Object module '{ResolveModuleName(entry.Module)}' declares tags '{string.Join(", ", entry.Tags)}' but does not implement IObjectTagEventReceiver. Tag subscription skipped.");
				return;
			}

			if (_localEventBus == null)
			{
				_logger.Warning($"[GodotObjectRootNode] Object module '{ResolveModuleName(entry.Module)}' declares tags but LocalEventBus is not ready. Tag subscription skipped.");
				return;
			}

			var localEventBus = (IEventBus)_localEventBus;
			for (var index = 0; index < entry.Tags.Count; index++)
			{
				var tag = entry.Tags[index];
				try
				{
					var matchedTag = tag;
					var token = localEventBus.SubscribeTag(entry.OwnerNode, matchedTag, envelope => receiver.OnTagEvent(matchedTag, envelope));
					if (!token.IsValid)
					{
						_logger.Warning($"[GodotObjectRootNode] Failed to subscribe object module '{ResolveModuleName(entry.Module)}' to tag '{matchedTag}' under '{ResolveNodeName(contextRoot)}'.");
						continue;
					}

					_moduleTagSubscriptions.Add(token);
					if (!_moduleTagSubscriptionsByOwner.TryGetValue(entry.OwnerNode, out var ownedTokens))
						_moduleTagSubscriptionsByOwner[entry.OwnerNode] = ownedTokens = new List<SubscriptionToken>();
					ownedTokens.Add(token);
				}
				catch (Exception ex)
				{
					_logger.Warning($"[GodotObjectRootNode] Failed to subscribe object module '{ResolveModuleName(entry.Module)}' to tag '{tag}' under '{ResolveNodeName(contextRoot)}': {ex.Message}");
				}
			}
		}

		private void UnsubscribeModuleTagSubscriptions()
		{
			_moduleTagSubscriptionsByOwner.Clear();
			if (_localEventBus == null || _moduleTagSubscriptions.Count == 0)
			{
				_moduleTagSubscriptions.Clear();
				return;
			}

			var localEventBus = (IEventBus)_localEventBus;
			for (var index = 0; index < _moduleTagSubscriptions.Count; index++)
			{
				var token = _moduleTagSubscriptions[index];
				if (token.IsValid)
				{
					localEventBus.Unsubscribe(token);
				}
			}

			_moduleTagSubscriptions.Clear();
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

		private static string ResolveSnapshotRegionName(Node ownerNode)
		{
			if (ownerNode is IObjectSnapshotRegionNameProvider provider)
			{
				var regionName = provider.GetObjectSnapshotRegionName();
				if (!string.IsNullOrWhiteSpace(regionName))
				{
					return regionName;
				}
			}

			return ResolveNodeName(ownerNode);
		}

		private static IReadOnlyList<string> ParseTagExpression(string tagExpression)
		{
			var result = new List<string>();
			if (string.IsNullOrEmpty(tagExpression))
			{
				return result;
			}

			var seen = new HashSet<string>(StringComparer.Ordinal);
			var parts = tagExpression.Split(new[] { '|', ',' }, StringSplitOptions.RemoveEmptyEntries);
			for (var index = 0; index < parts.Length; index++)
			{
				var trimmed = parts[index].Trim();
				if (!string.IsNullOrEmpty(trimmed) && seen.Add(trimmed))
				{
					result.Add(trimmed);
				}
			}

			return result;
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
			if (path == null || path.IsEmpty)
			{
				return false;
			}

			node = GetNodeOrNull<Node>(path);
			return node != null;
		}
	}
}
