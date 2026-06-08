namespace GameFramework
{
    public interface ISystemModule
    {
        string Name { get; }

        void Init(IRootRuntime root, IEventBus eventBus);

        void Tick();
    }
}
