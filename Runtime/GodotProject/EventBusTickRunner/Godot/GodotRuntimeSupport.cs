
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
