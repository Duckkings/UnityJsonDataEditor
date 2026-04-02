
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

public static class DataEntityRuntimeLoader
{
    private const string DefaultManifestName = "manifest.json";
    private static readonly JsonSerializerSettings SerializerSettings = new JsonSerializerSettings
    {
        MissingMemberHandling = MissingMemberHandling.Ignore,
        NullValueHandling = NullValueHandling.Ignore,
        Converters = new List<JsonConverter>
        {
            // 在共享设置中显式注册 DataRefConverter，避免 DataRef 在 ToObject 时递归套用自身转换器
            new DataRefConverter(),
        },
    };

    private static readonly Dictionary<string, string> ManifestIndex = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    private static readonly Dictionary<string, TableSchema> SchemaCache = new Dictionary<string, TableSchema>(StringComparer.OrdinalIgnoreCase);
    private static string _dataDirectory = string.Empty;
    private static bool _initialized;

    public static IReadOnlyDictionary<string, TableSchema> Schemas => SchemaCache;

    public static void Initialize(string dataDirectory = null)
    {
        _dataDirectory = string.IsNullOrWhiteSpace(dataDirectory)
            ? Path.GetFullPath(Path.Combine(Application.dataPath, "dataEntity"))
            : Path.GetFullPath(dataDirectory);
        LoadAll();
    }

    public static TableSchema GetSchema(string templateName)
    {
        EnsureInitialized();
        if (!SchemaCache.TryGetValue(templateName, out var schema))
        {
            throw new KeyNotFoundException($"\u6a21\u677f {templateName} \u672a\u52a0\u8f7d\u3002");
        }
        return schema;
    }

    public static T GetValue<T>(string templateName, string instanceName, string indexKey, string parameterName)
    {
        var value = GetValueInternal(templateName, instanceName, indexKey, parameterName, typeof(T), null, false);
        if (value == null)
        {
            return default;
        }
        return (T)value;
    }

    public static T GetValue<T>(string templateName, string instanceName, string indexKey, string parameterName, string getParameter)
    {
        var value = GetValueInternal(templateName, instanceName, indexKey, parameterName, typeof(T), getParameter, false);
        if (value == null)
        {
            return default;
        }
        return (T)value;
    }

    public static object GetValue(string templateName, string instanceName, string indexKey, string parameterName, Type parameterType)
    {
        return GetValueInternal(templateName, instanceName, indexKey, parameterName, parameterType, null, false);
    }

    public static object GetValue(string templateName, string instanceName, string indexKey, string parameterName, Type parameterType, string getParameter)
    {
        return GetValueInternal(templateName, instanceName, indexKey, parameterName, parameterType, getParameter, false);
    }

    public static DataRef GetIndexReference(string templateName, string instanceName, string indexKey, string parameterName)
    {
        var value = GetValueInternal(templateName, instanceName, indexKey, parameterName, typeof(DataRef), null, true);
        return value as DataRef;
    }

    public static string GetIndexValue(string templateName, string instanceName, string indexKey, string parameterName)
    {
        var reference = GetIndexReference(templateName, instanceName, indexKey, parameterName);
        return reference?.value;
    }

    private static object GetValueInternal(string templateName, string instanceName, string indexKey, string parameterName, Type parameterType, string getParameter, bool allowIndexReference)
    {
        EnsureInitialized();
        if (string.IsNullOrWhiteSpace(templateName))
        {
            throw new ArgumentException("\u6a21\u677f\u540d\u4e0d\u80fd\u4e3a\u7a7a", nameof(templateName));
        }
        if (string.IsNullOrWhiteSpace(parameterName))
        {
            throw new ArgumentException("\u53c2\u6570\u540d\u4e0d\u80fd\u4e3a\u7a7a", nameof(parameterName));
        }
        if (!SchemaCache.TryGetValue(templateName, out var schema))
        {
            throw new KeyNotFoundException($"\u6a21\u677f {templateName} \u672a\u627e\u5230\u3002");
        }

        var paramDef = FindParameter(schema, parameterName);
        var binding = paramDef?.parameterIndexes;
        var isIndexParameter = binding != null
            && !string.IsNullOrEmpty(binding.template)
            && !string.IsNullOrEmpty(binding.param);

        if (isIndexParameter)
        {
            if (string.IsNullOrWhiteSpace(getParameter) && !allowIndexReference)
            {
                var identifier = FormatInstanceIdentifier(templateName, instanceName, indexKey, parameterName);
                throw new InvalidOperationException($"{identifier} \u662f\u7d22\u5f15\u53c2\u6570\uff0c\u65e0\u6cd5\u6b63\u5e38\u8bfb\u53d6");
            }
        }
        else if (!string.IsNullOrWhiteSpace(getParameter))
        {
            var identifier = FormatInstanceIdentifier(templateName, instanceName, indexKey, parameterName);
            throw new InvalidOperationException($"{identifier} \u4e0d\u662f\u7d22\u5f15\u53c2\u6570\uff0c\u4e0d\u914dgetparameter\u3002");
        }

        var instance = LocateInstance(schema, instanceName, indexKey);
        var payload = ExtractPayload(instance);
        if (payload == null)
        {
            throw new InvalidOperationException($"\u5b9e\u4f8b {instanceName ?? indexKey} \u4e0d\u5305\u542b payload\u3002");
        }
        if (!payload.TryGetValue(parameterName, out var rawValue))
        {
            throw new KeyNotFoundException($"\u5b9e\u4f8b\u4e2d\u672a\u627e\u5230\u53c2\u6570 {parameterName}\u3002");
        }

        if (!isIndexParameter)
        {
            return ConvertValue(rawValue, parameterType ?? typeof(object), templateName, parameterName);
        }

        var payloadName = payload.TryGetValue("name", out var payloadNameObj) ? payloadNameObj?.ToString() : instanceName;
        var payloadIndex = indexKey;
        if (string.IsNullOrWhiteSpace(payloadIndex) && payload.TryGetValue("index", out var payloadIndexObj))
        {
            payloadIndex = payloadIndexObj?.ToString();
        }
        var identifierFull = FormatInstanceIdentifier(templateName, payloadName, payloadIndex, parameterName);
        var dataRef = NormalizeDataRef(rawValue);
        if (dataRef == null)
        {
            throw new InvalidOperationException($"{identifierFull} \u7d22\u5f15\u89e3\u6790\u5931\u8d25\u3002");
        }

        ApplyReferenceDefaults(dataRef, binding);
        EnsureDataRefInstance(schema, paramDef, payloadName, payloadIndex, dataRef);
        payload[parameterName] = dataRef;

        if (allowIndexReference && string.IsNullOrWhiteSpace(getParameter))
        {
            return dataRef;
        }

        if (string.IsNullOrWhiteSpace(getParameter))
        {
            return ConvertValue(dataRef, parameterType ?? typeof(object), templateName, parameterName);
        }

        if (dataRef.instance == null)
        {
            throw new KeyNotFoundException($"{identifierFull} \u672a\u627e\u5230\u7d22\u5f15\u5b9e\u4f8b\u3002");
        }

        var referencedPayload = ExtractPayload(dataRef.instance);
        if (referencedPayload == null || !referencedPayload.TryGetValue(getParameter, out var indexedValue))
        {
            throw new KeyNotFoundException($"{identifierFull} \u7d22\u5f15\u5b9e\u4f8b\u6ca1\u6709\u53c2\u6570 {getParameter}\u3002");
        }

        var targetTemplate = dataRef.template ?? binding?.template ?? templateName;
        return ConvertValue(indexedValue, parameterType ?? typeof(object), targetTemplate, getParameter);
    }

    public static void Reload()
    {
#if UNITY_EDITOR
        var wasPaused = EditorApplication.isPaused;
        if (!wasPaused)
        {
            EditorApplication.isPaused = true;
        }
#endif
        try
        {
            if (string.IsNullOrWhiteSpace(_dataDirectory))
            {
                throw new InvalidOperationException("\u8bf7\u5148\u8c03\u7528 Initialize \u6307\u5b9a\u6570\u636e\u76ee\u5f55\u3002");
            }
            LoadAll();
        }
        finally
        {
#if UNITY_EDITOR
            if (!wasPaused)
            {
                EditorApplication.isPaused = false;
            }
#endif
        }
    }

    private static void EnsureInitialized()
    {
        if (!_initialized)
        {
            if (string.IsNullOrWhiteSpace(_dataDirectory))
            {
                Initialize();
            }
            else
            {
                LoadAll();
            }
        }
    }

    private static void LoadAll()
    {
        ManifestIndex.Clear();
        SchemaCache.Clear();

        var manifestPath = ResolvePath(DefaultManifestName);
        if (!File.Exists(manifestPath))
        {
            throw new FileNotFoundException($"\u672a\u627e\u5230 manifest \u6587\u4ef6: {manifestPath}");
        }

        var manifestContent = File.ReadAllText(manifestPath);
        var manifestEntries = JsonConvert.DeserializeObject<List<ManifestRecord>>(manifestContent, SerializerSettings) ?? new List<ManifestRecord>();
        foreach (var entry in manifestEntries)
        {
            if (string.IsNullOrWhiteSpace(entry.template) || string.IsNullOrWhiteSpace(entry.path))
            {
                continue;
            }
            var normalized = entry.template.Trim();
            ManifestIndex[normalized] = ResolvePath(entry.path);
        }

        foreach (var kv in ManifestIndex)
        {
            try
            {
                var schema = LoadSchema(kv.Key, kv.Value);
                SchemaCache[kv.Key] = schema;
            }
            catch (Exception ex)
            {
                Debug.LogError($"\u52a0\u8f7d\u6a21\u677f {kv.Key} \u5931\u8d25: {ex.Message}\n{ex.StackTrace}");
            }
        }

        foreach (var schema in SchemaCache.Values)
        {
            if (schema?.parameters == null) continue;
            foreach (var param in schema.parameters)
            {
                if (param?.parameterIndexes == null) continue;
                if (string.IsNullOrEmpty(param.parameterIndexes.indexField) && !string.IsNullOrEmpty(param.parameterIndexes.template) && SchemaCache.TryGetValue(param.parameterIndexes.template, out var target))
                {
                    param.parameterIndexes.indexField = target.indexField ?? "id";
                }
            }
        }

        foreach (var kvp in SchemaCache)
        {
            HydrateIndexReferences(kvp.Value);
        }

        _initialized = true;
    }

    private static TableSchema LoadSchema(string templateName, string filePath)
    {
        if (!File.Exists(filePath))
        {
            throw new FileNotFoundException($"\u627e\u4e0d\u5230\u6a21\u677f {templateName} \u7684\u6570\u636e\u6587\u4ef6", filePath);
        }
        var json = File.ReadAllText(filePath);
        var raw = JsonConvert.DeserializeObject<RawTableSchema>(json, SerializerSettings) ?? new RawTableSchema();
        if (raw.parameters != null)
        {
            foreach (var param in raw.parameters)
            {
                if (param?.parameterIndexes != null && string.IsNullOrEmpty(param.parameterIndexes.indexField))
                {
                    param.parameterIndexes.indexField = string.Empty;
                }
            }
        }
        var schema = new TableSchema
        {
            name = string.IsNullOrWhiteSpace(raw.name) ? templateName : raw.name,
            indexField = string.IsNullOrWhiteSpace(raw.indexField) ? "id" : raw.indexField,
            parameters = raw.parameters ?? new List<ParamDef>(),
            instances = BuildInstanceDictionary(templateName, raw.instances)
        };
        return schema;
    }

    private static Dictionary<string, object> BuildInstanceDictionary(string templateName, List<RawInstance> instances)
    {
        var result = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        if (instances == null || instances.Count == 0)
        {
            return result;
        }

        var grouped = new Dictionary<string, List<RawInstance>>(StringComparer.OrdinalIgnoreCase);
        foreach (var inst in instances)
        {
            var payloadIndex = inst?.payload?.Value<string>("index");
            var key = string.IsNullOrWhiteSpace(payloadIndex) ? inst?.id.ToString() ?? Guid.NewGuid().ToString("N") : payloadIndex;
            if (!grouped.TryGetValue(key, out var list))
            {
                list = new List<RawInstance>();
                grouped[key] = list;
            }
            list.Add(inst);
        }

        var duplicateMessages = new List<string>();
        foreach (var kv in grouped)
        {
            var ordered = kv.Value.OrderBy(r => r?.id ?? int.MaxValue).ToList();
            if (ordered.Count > 1)
            {
                var names = ordered
                    .Select(r => !string.IsNullOrEmpty(r?.name) ? r.name : r?.payload?.Value<string>("name") ?? string.Empty)
                    .Where(n => !string.IsNullOrEmpty(n))
                    .ToList();
                if (names.Count > 0)
                {
                    duplicateMessages.Add($"{templateName}[{string.Join(",", names)}]");
                }
            }
            for (var i = 0; i < ordered.Count; i++)
            {
                var suffix = i == 0 ? string.Empty : $"_{i}";
                var baseKey = string.IsNullOrEmpty(kv.Key) ? ordered[i]?.id.ToString() ?? $"__generated_{i}" : kv.Key;
                var finalKey = baseKey + suffix;
                var attempt = 1;
                while (result.ContainsKey(finalKey))
                {
                    finalKey = $"{baseKey}_{attempt++}";
                }
                result[finalKey] = ordered[i]?.ToDictionary();
            }
        }

        if (duplicateMessages.Count > 0)
        {
            Debug.LogError($"{string.Join(",", duplicateMessages)} \u91cd\u590d\u5b9e\u4f8b \u8fd9\u4e9b\u5b9e\u4f8b\u7684index\u91cd\u590d\u5bfc\u5165\u5931\u8d25");
        }

        return result;
    }

    private static void HydrateIndexReferences(TableSchema schema)
    {
        if (schema?.parameters == null || schema.instances == null)
        {
            return;
        }
        foreach (var param in schema.parameters)
        {
            if (param?.parameterIndexes == null)
            {
                continue;
            }
            foreach (var kv in schema.instances)
            {
                var payload = ExtractPayload(kv.Value);
                if (payload == null || !payload.TryGetValue(param.name, out var rawValue))
                {
                    continue;
                }
                var payloadName = payload.TryGetValue("name", out var nameObj) ? nameObj?.ToString() : null;
                var payloadIndex = payload.TryGetValue("index", out var indexObj) ? indexObj?.ToString() : kv.Key;
                var dataRef = NormalizeDataRef(rawValue);
                if (dataRef == null)
                {
                    continue;
                }
                ApplyReferenceDefaults(dataRef, param.parameterIndexes);
                EnsureDataRefInstance(schema, param, payloadName, payloadIndex, dataRef);
                payload[param.name] = dataRef;
            }
        }
    }

    private static ParamDef FindParameter(TableSchema schema, string parameterName)
    {
        if (schema?.parameters == null)
        {
            return null;
        }
        return schema.parameters.FirstOrDefault(p => p != null && string.Equals(p.name, parameterName, StringComparison.OrdinalIgnoreCase));
    }

    private static DataRef NormalizeDataRef(object rawValue)
    {
        switch (rawValue)
        {
            case null:
                return null;
            case DataRef existing:
                return existing;
            case JObject jObject:
                return jObject.ToObject<DataRef>();
            case Dictionary<string, object> dict:
                return JsonConvert.DeserializeObject<DataRef>(JsonConvert.SerializeObject(dict, SerializerSettings));
            default:
                try
                {
                    return JsonConvert.DeserializeObject<DataRef>(JsonConvert.SerializeObject(rawValue, SerializerSettings));
                }
                catch
                {
                    return null;
                }
            }
        }

    private static void ApplyReferenceDefaults(DataRef dataRef, ParameterIndexBinding binding)
    {
        if (dataRef == null || binding == null)
        {
            return;
        }
        if (string.IsNullOrEmpty(dataRef.template))
        {
            dataRef.template = binding.template;
        }
        if (string.IsNullOrEmpty(dataRef.by))
        {
            dataRef.by = !string.IsNullOrEmpty(binding.param) ? binding.param : binding.indexField;
        }
    }

    private static void EnsureDataRefInstance(TableSchema ownerSchema, ParamDef paramDef, string instanceName, string indexKey, DataRef dataRef)
    {
        if (dataRef == null || dataRef.instance != null)
        {
            return;
        }
        var binding = paramDef?.parameterIndexes;
        var targetTemplate = !string.IsNullOrEmpty(dataRef.template) ? dataRef.template : binding?.template;
        if (string.IsNullOrEmpty(targetTemplate))
        {
            return;
        }
        if (!SchemaCache.TryGetValue(targetTemplate, out var targetSchema) || targetSchema?.instances == null)
        {
            Debug.LogError($"{FormatInstanceIdentifier(ownerSchema?.name, instanceName, indexKey, paramDef?.name)} \u5f15\u7528\u7684\u6a21\u677f {targetTemplate} \u672a\u52a0\u8f7d\u3002");
            return;
        }
        var matchField = !string.IsNullOrEmpty(dataRef.by) ? dataRef.by : binding?.param;
        if (string.IsNullOrEmpty(matchField))
        {
            matchField = binding?.indexField;
        }
        if (string.IsNullOrEmpty(matchField))
        {
            matchField = targetSchema.indexField ?? "id";
        }
        if (string.IsNullOrWhiteSpace(dataRef.value))
        {
            dataRef.instance = null;
            return;
        }
        var resolved = FindInstanceByField(targetSchema, matchField, dataRef.value);
        if (resolved == null)
        {
            Debug.LogError($"{FormatInstanceIdentifier(ownerSchema?.name, instanceName, indexKey, paramDef?.name)} \u7d22\u5f15 {targetTemplate}.{matchField} = {dataRef.value} \u672a\u627e\u5230\u7d22\u5f15\u5b9e\u4f8b\u3002");
            return;
        }
        dataRef.instance = resolved;
    }

    private static object FindInstanceByField(TableSchema schema, string fieldName, string expectedValue)
    {
        if (schema?.instances == null)
        {
            return null;
        }
        if (!string.IsNullOrEmpty(expectedValue))
        {
            if (string.Equals(fieldName, "index", StringComparison.OrdinalIgnoreCase)
                || (!string.IsNullOrEmpty(schema.indexField) && string.Equals(fieldName, schema.indexField, StringComparison.OrdinalIgnoreCase)))
            {
                if (schema.instances.TryGetValue(expectedValue, out var byIndex))
                {
                    return byIndex;
                }
            }
        }
        foreach (var kv in schema.instances)
        {
            var payload = ExtractPayload(kv.Value);
            if (payload == null)
            {
                continue;
            }
            if (!payload.TryGetValue(fieldName, out var candidate) || candidate == null)
            {
                continue;
            }
            var candidateValue = candidate.ToString();
            if (string.Equals(candidateValue, expectedValue, StringComparison.OrdinalIgnoreCase))
            {
                return kv.Value;
            }
        }
        return null;
    }

    private static string FormatInstanceIdentifier(string templateName, string instanceName, string indexKey, string parameterName)
    {
        var instancePart = !string.IsNullOrWhiteSpace(instanceName) ? instanceName : indexKey;
        if (string.IsNullOrWhiteSpace(instancePart))
        {
            instancePart = "(unknown)";
        }
        var tpl = string.IsNullOrWhiteSpace(templateName) ? "(unknown)" : templateName;
        var param = string.IsNullOrWhiteSpace(parameterName) ? "(unknown)" : parameterName;
        return $"{tpl}/{instancePart}/{param}";
    }

    private static object LocateInstance(TableSchema schema, string instanceName, string indexKey)
    {
        if (schema.instances == null)
        {
            throw new InvalidOperationException($"\u6a21\u677f {schema.name} \u6ca1\u6709\u52a0\u8f7d\u4efb\u4f55\u5b9e\u4f8b\u3002");
        }

        if (!string.IsNullOrWhiteSpace(indexKey) && schema.instances.TryGetValue(indexKey, out var indexed))
        {
            return indexed;
        }

        if (!string.IsNullOrWhiteSpace(instanceName))
        {
            foreach (var kv in schema.instances)
            {
                var payload = ExtractPayload(kv.Value);
                var name = payload != null && payload.TryGetValue("name", out var v) ? v?.ToString() : null;
                if (!string.IsNullOrEmpty(name) && string.Equals(name, instanceName, StringComparison.OrdinalIgnoreCase))
                {
                    return kv.Value;
                }
            }
        }

        throw new KeyNotFoundException($"\u672a\u627e\u5230\u5b9e\u4f8b\uff1a\u6a21\u677f={schema.name}, \u540d\u79f0={instanceName}, \u7d22\u5f15={indexKey}");
    }

    private static Dictionary<string, object> ExtractPayload(object instance)
    {
        if (instance is RawInstance raw)
        {
            return raw.payload?.ToObject<Dictionary<string, object>>();
        }
        if (instance is Dictionary<string, object> dict)
        {
            if (dict.TryGetValue("payload", out var payloadObj))
            {
                return ConvertToDictionary(payloadObj);
            }
            return dict;
        }
        if (instance is JObject jObject)
        {
            var payload = jObject["payload"] ?? jObject;
            return payload.ToObject<Dictionary<string, object>>();
        }
        return ConvertToDictionary(instance);
    }

    private static Dictionary<string, object> ConvertToDictionary(object value)
    {
        switch (value)
        {
            case null:
                return null;
            case Dictionary<string, object> dict:
                return dict;
            case JObject jObject:
                return jObject.ToObject<Dictionary<string, object>>();
            default:
                return JsonConvert.DeserializeObject<Dictionary<string, object>>(JsonConvert.SerializeObject(value, SerializerSettings));
        }
    }

    private static object ConvertValue(object rawValue, Type targetType, string templateName, string parameterName)
    {
        if (rawValue == null || targetType == typeof(object))
        {
            return rawValue;
        }
        if (targetType.IsInstanceOfType(rawValue))
        {
            return rawValue;
        }
        try
        {
            switch (rawValue)
            {
                case JToken token:
                    return token.ToObject(targetType);
                case Dictionary<string, object> dict:
                    return JsonConvert.DeserializeObject(JsonConvert.SerializeObject(dict, SerializerSettings), targetType);
                case IList<object> list when targetType.IsAssignableFrom(rawValue.GetType()):
                    return rawValue;
                case IConvertible convertible when typeof(IConvertible).IsAssignableFrom(targetType):
                    return Convert.ChangeType(convertible, targetType, CultureInfo.InvariantCulture);
                default:
                    return JsonConvert.DeserializeObject(JsonConvert.SerializeObject(rawValue, SerializerSettings), targetType);
            }
        }
        catch (Exception ex)
        {
            throw new InvalidCastException($"\u6a21\u677f {templateName} \u7684\u53c2\u6570 {parameterName} \u65e0\u6cd5\u8f6c\u6362\u4e3a {targetType.Name}", ex);
        }
    }

    private static string ResolvePath(string relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath))
        {
            return _dataDirectory;
        }
        if (Path.IsPathRooted(relativePath))
        {
            return relativePath;
        }
        var sanitized = relativePath.Replace("\\", "/").TrimStart('.', '/');
        if (sanitized.StartsWith("dataEntity/", StringComparison.OrdinalIgnoreCase))
        {
            sanitized = sanitized.Substring("dataEntity/".Length);
        }
        var combined = string.IsNullOrEmpty(_dataDirectory) ? sanitized : Path.Combine(_dataDirectory, sanitized);
        return Path.GetFullPath(combined);
    }

    private class ManifestRecord
    {
        public string template;
        public string path;
    }

    private class RawTableSchema
    {
        public string name;
        public string indexField;
        public List<ParamDef> parameters;
        public List<RawInstance> instances;
    }

    private class RawInstance
    {
        public int id;
        public string name;
        public JObject payload;

        public Dictionary<string, object> ToDictionary()
        {
            return new Dictionary<string, object>
            {
                { "id", id },
                { "name", name },
                { "payload", payload != null ? payload.ToObject<Dictionary<string, object>>() : new Dictionary<string, object>() }
            };
        }
    }
}
