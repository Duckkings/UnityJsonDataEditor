namespace GameFramework
{
    public interface IObjectRuntime
    {
        IEventBus GetLocalEventBus();

        IEventBus GetGlobalEventBus();

        IObjectSnapshotSystem GetObjectSnapshotSystem();

        void PublishLocalThenGlobal(object sender, string eventName, object payload);
    }
}
