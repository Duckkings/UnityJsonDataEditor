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
            public ModuleEntry(IObjectModule module, int siblingIndex)
            {
                Module = module;
                SiblingIndex = siblingIndex;
            }

            public IObjectModule Module { get; }

            public int SiblingIndex { get; }
        }

        [Export]
        public NodePath ContextRootPath { get; set; } = new NodePath("..");

        [Export]
        public NodePath ScopeRootPath { get; set; }

        [Export]
        public NodePath LocalEventBusPath { get; set; } = new NodePath("../LocalEventBus");

        [Export]
        public NodePath DataTableProviderPath { get; set; }

        [Export]
        public NodePath GlobalEventBusPath { get; set; }

        [Export]
        public bool AutoInitialize { get; set; } = true;

        private readonly GodotRuntimeLogger _logger = new GodotRuntimeLogger();
        private readonly List<IObjectModule> _orderedModules = new List<IObjectModule>();

        private GodotEventBusNode _localEventBus;
        private IEventBus _globalEventBus;
        private IDataTableRuntime _dataRuntime;
        private bool _initialized;
        private bool _loggedMissingLocalEventBus;
        private bool _loggedPendingRootServices;

        public IEventBus GetLocalEventBus()
        {
            return _localEventBus;
        }

        public IEventBus GetGlobalEventBus()
        {
            return _globalEventBus;
        }

        public void PublishLocalThenGlobal(object sender, string eventName, object payload)
        {
            if (!_initialized)
            {
                InitializeObjectDomain();
            }

            if (_localEventBus == null || _globalEventBus == null)
            {
                _logger.Warning(
                    "[GodotObjectRootNode] PublishLocalThenGlobal skipped because local/global event bus is not ready.");
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
            _initialized = false;
            _orderedModules.Clear();
            _localEventBus = null;
            _globalEventBus = null;
            _dataRuntime = null;
            _loggedMissingLocalEventBus = false;
            _loggedPendingRootServices = false;
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
                    _logger.Error(
                        "[GodotObjectRootNode] LocalEventBus was not found. Ensure ObjectRoot and LocalEventBus are siblings under the same context root.");
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
                    _logger.Warning(
                        "[GodotObjectRootNode] Waiting for SystemRoot services before completing ObjectRoot initialization.");
                    _loggedPendingRootServices = true;
                }

                return;
            }

            var scopeRoot = ResolveScopeRoot(contextRoot);
            _localEventBus.Init(_dataRuntime, scopeRoot);
            CollectModules(contextRoot);
            InitialiseModules();

            _initialized = true;
            _loggedPendingRootServices = false;
            SetProcess(true);
            _logger.Info(
                $"[GodotObjectRootNode] Initialized {_orderedModules.Count} object modules under '{contextRoot.Name}'.");
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

            _logger.Error(
                "[GodotObjectRootNode] DataTableProviderPath must point to a node implementing IDataTableRuntime or IGodotDataTableProvider.");
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

            _logger.Error(
                "[GodotObjectRootNode] GlobalEventBusPath must point to a node implementing IEventBus.");
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

                _logger.Error(
                    "[GodotObjectRootNode] LocalEventBusPath must point to a GodotEventBusNode.");
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

        private void CollectModules(Node contextRoot)
        {
            _orderedModules.Clear();

            var moduleEntries = new List<ModuleEntry>();
            var childCount = contextRoot.GetChildCount();
            for (var index = 0; index < childCount; index++)
            {
                var child = contextRoot.GetChild(index);
                if (ReferenceEquals(child, this) || ReferenceEquals(child, _localEventBus))
                {
                    continue;
                }

                if (child is IObjectModule module)
                {
                    moduleEntries.Add(new ModuleEntry(module, index));
                }
            }

            moduleEntries.Sort(CompareModuleEntries);
            for (var index = 0; index < moduleEntries.Count; index++)
            {
                _orderedModules.Add(moduleEntries[index].Module);
            }
        }

        private void InitialiseModules()
        {
            for (var index = 0; index < _orderedModules.Count; index++)
            {
                var module = _orderedModules[index];
                try
                {
                    module.Init(this, _localEventBus, _globalEventBus);
                }
                catch (Exception ex)
                {
                    _logger.Error(
                        $"[GodotObjectRootNode] Init failed for object module '{ResolveModuleName(module)}': {ex}");
                }
            }
        }

        private void TickModules()
        {
            for (var index = 0; index < _orderedModules.Count; index++)
            {
                var module = _orderedModules[index];
                try
                {
                    module.Tick();
                }
                catch (Exception ex)
                {
                    _logger.Error(
                        $"[GodotObjectRootNode] Tick failed for object module '{ResolveModuleName(module)}': {ex}");
                }
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
