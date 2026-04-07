using GameFramework.Adapters.Unity;
using GameFramework.Core;
using UnityEngine;

namespace GameFramework
{
    public class RootTickRunner : MonoBehaviour, IRootRuntime
    {
        public static RootTickRunner Instance { get; private set; }

        private readonly UnityRuntimeLogger _logger = new UnityRuntimeLogger();

        private RootTickRunnerCore _core;
        private EventBus _eventBus;
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

        private void Awake()
        {
            if (Instance != null)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject);
            InitBaseModules();
        }

        private void Update()
        {
            EnsureCore().Tick(TickPhase.Update);
        }

        private void LateUpdate()
        {
            EnsureCore().Tick(TickPhase.LateUpdate);
        }

        private void InitBaseModules()
        {
            DataEntityRuntimeLoader.Initialize();
            _dataRuntime = new DataEntityRuntimeAdapter();

            _eventBus = GetComponent<EventBus>();
            if (_eventBus == null)
            {
                _eventBus = gameObject.AddComponent<EventBus>();
            }

            EnsureCore().RegisterService("rootNodeName", gameObject.name);
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
    }
}
