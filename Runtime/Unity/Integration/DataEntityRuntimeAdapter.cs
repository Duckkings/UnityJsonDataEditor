using System.Collections.Generic;

namespace GameFramework.Adapters.Unity
{
    public sealed class DataEntityRuntimeAdapter : IDataTableRuntime
    {
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
}
