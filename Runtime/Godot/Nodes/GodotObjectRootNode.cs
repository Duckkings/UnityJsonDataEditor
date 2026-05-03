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
			public ModuleEntry(Node ownerNode, IObjectModule module, IObjectSnapshotSync snapshotSync, int siblingIndex)
			{
				OwnerNode = ownerNode;
				Module = module;
				SnapshotSync = snapshotSync;
				SiblingIndex = siblingIndex;
			}

			public Node OwnerNode { get; }

			public IObjectModule Module { get; }

			public IObjectSnapshotSync SnapshotSync { get; }

			public int SiblingIndex { get; }
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
					moduleEntries.Add(new ModuleEntry(child, module, snapshotSync, index));
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

		private static int CompareModuleEntries(ModuleEntry left, ModuleEntry right)
		{
			var priorityCompare = right.Module.TickPriority.CompareTo(left.Module.TickPriority);
			if (priorityCompare != 0)
			{
				return priorityCompare;
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
