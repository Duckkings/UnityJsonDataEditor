
using GameFramework;
using GameFramework.Core;
using Godot;

namespace GameFramework.Adapters.Godot
{
    [GlobalClass]
    public abstract partial class GodotObjectModuleBase : Node, IObjectModule, IObjectTagEventReceiver
    {
        [Export]
        public int TickPriority { get; set; }

        [Export]
        public string ModuleKey { get; set; } = string.Empty;

        string IObjectModule.Name => string.IsNullOrWhiteSpace(ModuleKey)
            ? Name.ToString()
            : ModuleKey.Trim();

        int IObjectModule.TickPriority => TickPriority;

        public virtual void Init(IObjectRuntime root, IEventBus localEventBus, IEventBus globalEventBus)
        {
        }

        public virtual void Tick()
        {
        }

        public virtual void Shutdown()
        {
        }

        public virtual void OnTagEvent(string matchedTag, EventEnvelope envelope)
        {
            switch (envelope.EventName)
            {
                default:
                    return;
            }
        }
    }
}
