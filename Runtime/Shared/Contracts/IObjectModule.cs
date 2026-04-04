namespace GameFramework
{
    public interface IObjectModule
    {
        string Name { get; }

        int TickPriority { get; }

        void Init(IObjectRuntime root, IEventBus localEventBus, IEventBus globalEventBus);

        void Tick();
    }
}
