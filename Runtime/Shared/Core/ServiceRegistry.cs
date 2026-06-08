using System.Collections.Generic;

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
