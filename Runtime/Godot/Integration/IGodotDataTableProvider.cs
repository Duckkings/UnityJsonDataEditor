namespace GameFramework.Adapters.Godot
{
    public interface IGodotDataTableProvider
    {
        EventBusTableSchema GetSchema(string templateName);
    }
}
