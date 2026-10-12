
using System.Collections.Generic;
using GameFramework;
using Godot;

[GlobalClass]
public partial class DataTableProvider : Node, IDataTableRuntime
{
    [Export]
    public string DataDir { get; set; } = "res://dataEntity";

    public void Init()
    {
        var path = string.IsNullOrWhiteSpace(DataDir) ? null : DataDir;
        DataEntityRuntimeLoader.Initialize(path);
    }

    public void ReloadData()
    {
        DataEntityRuntimeLoader.Reload();
    }

    public EventBusTableSchema GetSchema(string templateName)
    {
        var sourceSchema = DataEntityRuntimeLoader.GetSchema(templateName);
        if (sourceSchema == null)
        {
            return null;
        }

        return new EventBusTableSchema
        {
            instances = ConvertInstances(sourceSchema.instances)
        };
    }

    private static Dictionary<string, EventBusTableInstance> ConvertInstances(Dictionary<string, object> sourceInstances)
    {
        var result = new Dictionary<string, EventBusTableInstance>();
        if (sourceInstances == null)
        {
            return result;
        }

        foreach (var pair in sourceInstances)
        {
            if (pair.Value is Dictionary<string, object> fields)
            {
                result[pair.Key] = new EventBusTableInstance(fields);
            }
        }

        return result;
    }
}
