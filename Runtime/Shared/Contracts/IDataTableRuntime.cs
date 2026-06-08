namespace GameFramework
{
    public interface IDataTableRuntime
    {
        EventBusTableSchema GetSchema(string templateName);
    }
}
