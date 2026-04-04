using System;

namespace GameFramework.Adapters.Godot
{
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
}
