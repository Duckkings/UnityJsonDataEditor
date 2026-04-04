namespace GameFramework
{
    public interface IObjectRuntime
    {
        IEventBus GetLocalEventBus();

        IEventBus GetGlobalEventBus();

        void PublishLocalThenGlobal(object sender, string eventName, object payload);
    }
}
