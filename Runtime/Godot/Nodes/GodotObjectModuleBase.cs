using GameFramework;
using GameFramework.Core;
using Godot;

namespace GameFramework.Adapters.Godot
{
    [GlobalClass]
    public abstract partial class GodotObjectModuleBase : Node, IObjectModule
    {
        [Export]
        public int TickPriority { get; set; }

        string IObjectModule.Name => Name.ToString();

        int IObjectModule.TickPriority => TickPriority;

        public virtual void Init(IObjectRuntime root, IEventBus localEventBus, IEventBus globalEventBus)
        {
        }

        public virtual void Tick()
        {
        }
    }
}
