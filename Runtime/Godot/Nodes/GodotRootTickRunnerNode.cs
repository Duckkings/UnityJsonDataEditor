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
