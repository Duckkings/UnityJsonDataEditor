namespace GameFramework
{
    public interface IServiceRegistry
    {
        void RegisterService(string name, object instance);

        T GetService<T>(string name) where T : class;
    }
}
