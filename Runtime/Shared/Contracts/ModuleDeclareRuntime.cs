using System;
using System.Collections.Generic;

namespace GameFramework
{
    public sealed class ModuleDeclareRecord
    {
        public int Id { get; set; }

        public string ModuleKey { get; set; }

        public string Tags { get; set; }

        public int Priority { get; set; }
    }

    public interface IModuleDeclareRuntime
    {
        bool TryGetModuleDeclare(string moduleKey, out ModuleDeclareRecord record);
    }

    public sealed class ModuleDeclareRuntime : IModuleDeclareRuntime
    {
        private readonly Dictionary<string, ModuleDeclareRecord> _records =
            new Dictionary<string, ModuleDeclareRecord>(StringComparer.Ordinal);

        public ModuleDeclareRuntime(IDataTableRuntime dataRuntime, string templateName = "moduleDeclare")
        {
            if (dataRuntime == null || string.IsNullOrEmpty(templateName))
            {
                return;
            }

            EventBusTableSchema schema;
            try
            {
                schema = dataRuntime.GetSchema(templateName);
            }
            catch
            {
                return;
            }

            if (schema == null || schema.instances == null)
            {
                return;
            }

            foreach (var pair in schema.instances)
            {
                var instance = pair.Value;
                if (instance == null)
                {
                    continue;
                }

                var moduleKey = instance.GetString("moduleKey", instance.GetString("name", null));
                if (string.IsNullOrEmpty(moduleKey))
                {
                    continue;
                }

                _records[moduleKey] = new ModuleDeclareRecord
                {
                    Id = instance.GetInt("id", 0),
                    ModuleKey = moduleKey,
                    Tags = instance.GetString("tags", string.Empty),
                    Priority = instance.GetInt("priority", 0)
                };
            }
        }

        public bool TryGetModuleDeclare(string moduleKey, out ModuleDeclareRecord record)
        {
            record = null;
            return !string.IsNullOrEmpty(moduleKey) && _records.TryGetValue(moduleKey, out record);
        }
    }
}
