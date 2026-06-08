function ensureContext(context) {
  if (!context || typeof context !== 'object') {
    throw new Error('createCSharpRuntimeGeneratorModule requires a context object');
  }
  if (!context.appState || typeof context.appState !== 'object') {
    throw new Error('createCSharpRuntimeGeneratorModule requires appState');
  }
}

export function buildModelStructContent() {
  return [
    'using System;',
    'using System.Collections.Generic;',
    'using Newtonsoft.Json;',
    'using Newtonsoft.Json.Linq;',
    '',
    '[Serializable]',
    'public class TableSchema',
    '{',
    '    public string name;',
    '    public string indexField;',
    '    public List<ParamDef> parameters;',
    '    public Dictionary<string, object> instances;',
    '}',
    '',
    '[Serializable]',
    'public class ParamDef',
    '{',
    '    public string name;',
    '    public string type;',
    '    public ParameterIndexBinding parameterIndexes;',
    '}',
    '',
    '[Serializable]',
    'public class ParameterIndexBinding',
    '{',
    '    public string template;',
    '    public string param;',
    '    public string indexField;',
    '}',
    '',
    '[Serializable]',
    'public class Row',
    '{',
    '    public int id;',
    '    public string name;',
    '    public Dictionary<string, object> payload; // 或Newtonsoft.Json.Linq.JObject payload;',
    '}',
    '',
    '[Serializable]',
    'public class DataRef',
    '{',
    '    public string template;  // 对应 JSON 里的 "template"',
    '    public string by;        // 对应 JSON 里的 "by"',
    '    public string value;     // 对应 JSON 里的 "value"',
    '',
    '    [JsonIgnore]',
    '    public object instance;  // 解析完后指向目标实例',
    '}',
    '',
    'public class DataRefConverter : JsonConverter<DataRef>',
    '{',
    '    public override DataRef ReadJson(JsonReader reader, Type objectType, DataRef existingValue, bool hasExistingValue, JsonSerializer serializer)',
    '    {',
    '        if (reader == null)',
    '        {',
    '            return null;',
    '        }',
    '        if (reader.TokenType == JsonToken.Null)',
    '        {',
    '            return null;',
    '        }',
    '        if (reader.TokenType == JsonToken.String)',
    '        {',
    '            return new DataRef { value = reader.Value?.ToString() };',
    '        }',
    '        var jToken = JToken.Load(reader);',
    '        if (jToken == null || jToken.Type == JTokenType.Null)',
    '        {',
    '            return null;',
    '        }',
    '        if (jToken.Type == JTokenType.String)',
    '        {',
    '            return new DataRef { value = jToken.ToString() };',
    '        }',
    '        return jToken.ToObject<DataRef>();',
    '    }',
    '',
    '    public override void WriteJson(JsonWriter writer, DataRef value, JsonSerializer serializer)',
    '    {',
    '        if (writer == null)',
    '        {',
    '            return;',
    '        }',
    '        if (value == null)',
    '        {',
    '            writer.WriteNull();',
    '            return;',
    '        }',
    '        var jObject = JObject.FromObject(value, serializer);',
    '        jObject.WriteTo(writer);',
    '    }',
    '}',
    '',
  ].join('\n');
}

export function buildUnityRuntimeLoaderContent() {
  return `
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
            throw new KeyNotFoundException($"\\u6a21\\u677f {templateName} \\u672a\\u52a0\\u8f7d\\u3002");
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
            throw new ArgumentException("\\u6a21\\u677f\\u540d\\u4e0d\\u80fd\\u4e3a\\u7a7a", nameof(templateName));
        }
        if (string.IsNullOrWhiteSpace(parameterName))
        {
            throw new ArgumentException("\\u53c2\\u6570\\u540d\\u4e0d\\u80fd\\u4e3a\\u7a7a", nameof(parameterName));
        }
        if (!SchemaCache.TryGetValue(templateName, out var schema))
        {
            throw new KeyNotFoundException($"\\u6a21\\u677f {templateName} \\u672a\\u627e\\u5230\\u3002");
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
                throw new InvalidOperationException($"{identifier} \\u662f\\u7d22\\u5f15\\u53c2\\u6570\\uff0c\\u65e0\\u6cd5\\u6b63\\u5e38\\u8bfb\\u53d6");
            }
        }
        else if (!string.IsNullOrWhiteSpace(getParameter))
        {
            var identifier = FormatInstanceIdentifier(templateName, instanceName, indexKey, parameterName);
            throw new InvalidOperationException($"{identifier} \\u4e0d\\u662f\\u7d22\\u5f15\\u53c2\\u6570\\uff0c\\u4e0d\\u914dgetparameter\\u3002");
        }

        var instance = LocateInstance(schema, instanceName, indexKey);
        var payload = ExtractPayload(instance);
        if (payload == null)
        {
            throw new InvalidOperationException($"\\u5b9e\\u4f8b {instanceName ?? indexKey} \\u4e0d\\u5305\\u542b payload\\u3002");
        }
        if (!payload.TryGetValue(parameterName, out var rawValue))
        {
            throw new KeyNotFoundException($"\\u5b9e\\u4f8b\\u4e2d\\u672a\\u627e\\u5230\\u53c2\\u6570 {parameterName}\\u3002");
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
            throw new InvalidOperationException($"{identifierFull} \\u7d22\\u5f15\\u89e3\\u6790\\u5931\\u8d25\\u3002");
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
            throw new KeyNotFoundException($"{identifierFull} \\u672a\\u627e\\u5230\\u7d22\\u5f15\\u5b9e\\u4f8b\\u3002");
        }

        var referencedPayload = ExtractPayload(dataRef.instance);
        if (referencedPayload == null || !referencedPayload.TryGetValue(getParameter, out var indexedValue))
        {
            throw new KeyNotFoundException($"{identifierFull} \\u7d22\\u5f15\\u5b9e\\u4f8b\\u6ca1\\u6709\\u53c2\\u6570 {getParameter}\\u3002");
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
                throw new InvalidOperationException("\\u8bf7\\u5148\\u8c03\\u7528 Initialize \\u6307\\u5b9a\\u6570\\u636e\\u76ee\\u5f55\\u3002");
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
            throw new FileNotFoundException($"\\u672a\\u627e\\u5230 manifest \\u6587\\u4ef6: {manifestPath}");
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
                Debug.LogError($"\\u52a0\\u8f7d\\u6a21\\u677f {kv.Key} \\u5931\\u8d25: {ex.Message}\\n{ex.StackTrace}");
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
            throw new FileNotFoundException($"\\u627e\\u4e0d\\u5230\\u6a21\\u677f {templateName} \\u7684\\u6570\\u636e\\u6587\\u4ef6", filePath);
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
            Debug.LogError($"{string.Join(",", duplicateMessages)} \\u91cd\\u590d\\u5b9e\\u4f8b \\u8fd9\\u4e9b\\u5b9e\\u4f8b\\u7684index\\u91cd\\u590d\\u5bfc\\u5165\\u5931\\u8d25");
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
            Debug.LogError($"{FormatInstanceIdentifier(ownerSchema?.name, instanceName, indexKey, paramDef?.name)} \\u5f15\\u7528\\u7684\\u6a21\\u677f {targetTemplate} \\u672a\\u52a0\\u8f7d\\u3002");
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
            Debug.LogError($"{FormatInstanceIdentifier(ownerSchema?.name, instanceName, indexKey, paramDef?.name)} \\u7d22\\u5f15 {targetTemplate}.{matchField} = {dataRef.value} \\u672a\\u627e\\u5230\\u7d22\\u5f15\\u5b9e\\u4f8b\\u3002");
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
            throw new InvalidOperationException($"\\u6a21\\u677f {schema.name} \\u6ca1\\u6709\\u52a0\\u8f7d\\u4efb\\u4f55\\u5b9e\\u4f8b\\u3002");
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

        throw new KeyNotFoundException($"\\u672a\\u627e\\u5230\\u5b9e\\u4f8b\\uff1a\\u6a21\\u677f={schema.name}, \\u540d\\u79f0={instanceName}, \\u7d22\\u5f15={indexKey}");
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
            throw new InvalidCastException($"\\u6a21\\u677f {templateName} \\u7684\\u53c2\\u6570 {parameterName} \\u65e0\\u6cd5\\u8f6c\\u6362\\u4e3a {targetType.Name}", ex);
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
        var sanitized = relativePath.Replace("\\\\", "/").TrimStart('.', '/');
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
`;
}

export function buildUnityRuntimeLoaderGuideContent() {
  return `
DataEntityRuntimeLoader 使用说明
================================

1. 初始化
   // dataEntity 目录位于 Assets 目录下时可直接调用
   DataEntityRuntimeLoader.Initialize();
   // 或者显式传入路径
   DataEntityRuntimeLoader.Initialize(Path.Combine(Application.dataPath, "dataEntity"));

2. 读取参数
   // 普通参数：支持通过实例名或索引键查询
   var damage = DataEntityRuntimeLoader.GetValue<int>("TemplateName", null, "indexKey", "damage");
   // 索引参数：通过 getParameter 指定引用实例中的字段
   var hp = DataEntityRuntimeLoader.GetValue<int>("TemplateName", "实例名称", null, "refParam", "hp");
   // 若需直接访问 DataRef 及其索引值
   var dataRef = DataEntityRuntimeLoader.GetIndexReference("TemplateName", "实例名称", null, "refParam");
   var refKey = DataEntityRuntimeLoader.GetIndexValue("TemplateName", "实例名称", null, "refParam");

3. 获取完整模板
   var schema = DataEntityRuntimeLoader.GetSchema("TemplateName");
   // schema.instances 为 Dictionary<string, object>

4. 热重载
   DataEntityRuntimeLoader.Reload(); // 自动暂停并恢复 EditorApplication.isPaused

注意事项:
- manifest.json 位于 dataEntity 目录，path 字段是 JSON 文件名。
- 重复的实例索引会在控制台输出错误，并为后续实例追加 _1/_2 后缀。
- 索引参数必须通过带 getParameter 的 GetValue 重载或 GetIndexReference/GetIndexValue 访问，直接读取会抛出异常。
- 如果索引实例缺少 getParameter 指定的字段，会抛出异常并在控制台打印错误。
- 如果请求的参数类型不匹配会抛出 InvalidCastException。
`;
}

function buildGodotRuntimeLoaderContentDraft() {
  return buildUnityRuntimeLoaderContent()
    .replace(
      `using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif`,
      'using Godot;',
    )
    .replace(
      'Path.Combine(Application.dataPath, "dataEntity")',
      'ProjectSettings.GlobalizePath("res://dataEntity")',
    )
    .replace(
      `#if UNITY_EDITOR
        var wasPaused = EditorApplication.isPaused;
        if (!wasPaused)
        {
            EditorApplication.isPaused = true;
        }
#endif
        try`,
      `        try`,
    )
    .replace(
      `        finally
        {
#if UNITY_EDITOR
            if (!wasPaused)
            {
                EditorApplication.isPaused = false;
            }
#endif
        }`,
      `        finally
        {
        }`,
    )
    .replaceAll('Debug.LogError(', 'GD.PushError(');
}

function buildGodotRuntimeLoaderGuideContentDraft() {
  return `
DataEntityRuntimeLoader (Godot C#) 使用说明
================================

1. 初始化
   DataEntityRuntimeLoader.Initialize();
   DataEntityRuntimeLoader.Initialize(ProjectSettings.GlobalizePath("res://dataEntity"));

2. 读取参数
   var damage = DataEntityRuntimeLoader.GetValue<int>("TemplateName", null, "indexKey", "damage");
   var hp = DataEntityRuntimeLoader.GetValue<int>("TemplateName", "实例名称", null, "refParam", "hp");
   var dataRef = DataEntityRuntimeLoader.GetIndexReference("TemplateName", "实例名称", null, "refParam");
   var refKey = DataEntityRuntimeLoader.GetIndexValue("TemplateName", "实例名称", null, "refParam");

3. 获取完整模板
   var schema = DataEntityRuntimeLoader.GetSchema("TemplateName");

4. 热重载
   DataEntityRuntimeLoader.Reload();

注意事项:
- 默认数据目录是 res://dataEntity，运行时会自动转换为绝对路径。
- Godot C# 项目需要引用 Newtonsoft.Json，因为当前运行时继续复用 Unity 模式的数据解析结构。
- 索引参数仍然必须通过带 getParameter 的 GetValue 重载，或 GetIndexReference/GetIndexValue 访问。
- manifest.json 仍位于 dataEntity 目录，path 字段仍为模板 JSON 文件名。
- 运行时错误会通过 GD.PushError 输出到 Godot 的 Output 面板。
`;
}

export function buildUnityRuntimeTesterContent() {
  return `
using System;
using System.Collections.Generic;
using UnityEngine;

public class DataEntityRuntimeTester : MonoBehaviour
{
    public enum TestOperation
    {
        Initialize,
        Reload,
        GetValue,
    }

    [SerializeField]
    private TestOperation operation = TestOperation.Initialize;

    [SerializeField]
    private string dataDirectory = string.Empty;

    [SerializeField]
    private string templateName = string.Empty;

    [SerializeField]
    private string instanceName = string.Empty;

    [SerializeField]
    private string indexKey = string.Empty;

    [SerializeField]
    private string parameterName = string.Empty;

    [SerializeField]
    private string parameterType = "string";

    [SerializeField]
    private string getParameter = string.Empty;

    public void ExecuteSelectedOperation()
    {
        try
        {
            switch (operation)
            {
                case TestOperation.Initialize:
                    ExecuteInitialize();
                    break;
                case TestOperation.Reload:
                    ExecuteReload();
                    break;
                case TestOperation.GetValue:
                    ExecuteGetValue();
                    break;
                default:
                    Debug.LogError("Unsupported operation");
                    break;
            }
        }
        catch (Exception ex)
        {
            Debug.LogError($"[DataEntityRuntimeTester] {ex.Message}/n{ex}");
        }
    }

    private void ExecuteInitialize()
    {
        var path = string.IsNullOrWhiteSpace(dataDirectory) ? null : dataDirectory;
        DataEntityRuntimeLoader.Initialize(path);
        Debug.Log("[DataEntityRuntimeTester] Initialize completed");
    }

    private void ExecuteReload()
    {
        DataEntityRuntimeLoader.Reload();
        Debug.Log("[DataEntityRuntimeTester] Reload completed");
    }

    private void ExecuteGetValue()
    {
        if (string.IsNullOrWhiteSpace(templateName) || string.IsNullOrWhiteSpace(parameterName))
        {
            Debug.LogError("输入不合法");
            return;
        }

        var type = ResolveParameterType(parameterType);
        if (type == null)
        {
            Debug.LogError("输入不合法");
            return;
        }

        var instance = string.IsNullOrWhiteSpace(instanceName) ? null : instanceName;
        var index = string.IsNullOrWhiteSpace(indexKey) ? null : indexKey;

        object value;
        if (string.IsNullOrWhiteSpace(getParameter))
        {
            value = DataEntityRuntimeLoader.GetValue(templateName, instance, index, parameterName, type);
        }
        else
        {
            value = DataEntityRuntimeLoader.GetValue(templateName, instance, index, parameterName, type, getParameter);
        }

        var identifier = !string.IsNullOrWhiteSpace(instance) ? instance : index;
        var valueText = value == null ? "<null>" : value.ToString();
        Debug.Log($"{templateName}/{identifier ?? "(null)"}/{parameterName}/{valueText}");
    }

    private static Type ResolveParameterType(string typeName)
    {
        if (string.IsNullOrWhiteSpace(typeName))
        {
            return typeof(object);
        }

        var normalized = typeName.Trim();
        if (TypeMappings.TryGetValue(normalized, out var mapped))
        {
            return mapped;
        }
        if (TypeMappings.TryGetValue(normalized.ToLowerInvariant(), out mapped))
        {
            return mapped;
        }
        try
        {
            return Type.GetType(normalized, false);
        }
        catch
        {
            return null;
        }
    }

    private static readonly Dictionary<string, Type> TypeMappings = new Dictionary<string, Type>(StringComparer.OrdinalIgnoreCase)
    {
        { "bool", typeof(bool) },
        { "byte", typeof(byte) },
        { "sbyte", typeof(sbyte) },
        { "char", typeof(char) },
        { "decimal", typeof(decimal) },
        { "double", typeof(double) },
        { "float", typeof(float) },
        { "int", typeof(int) },
        { "uint", typeof(uint) },
        { "long", typeof(long) },
        { "ulong", typeof(ulong) },
        { "short", typeof(short) },
        { "ushort", typeof(ushort) },
        { "string", typeof(string) },
        { "datetime", typeof(DateTime) },
        { "guid", typeof(Guid) },
    };
}
`;
}

export function buildRuntimeTesterEditorContent() {
  return `
#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;

[CustomEditor(typeof(DataEntityRuntimeTester))]
public class DataEntityRuntimeTesterEditor : Editor
{
    private SerializedProperty operation;
    private SerializedProperty dataDirectory;
    private SerializedProperty templateName;
    private SerializedProperty instanceName;
    private SerializedProperty indexKey;
    private SerializedProperty parameterName;
    private SerializedProperty parameterType;
    private SerializedProperty getParameter;

    private void OnEnable()
    {
        operation = serializedObject.FindProperty("operation");
        dataDirectory = serializedObject.FindProperty("dataDirectory");
        templateName = serializedObject.FindProperty("templateName");
        instanceName = serializedObject.FindProperty("instanceName");
        indexKey = serializedObject.FindProperty("indexKey");
        parameterName = serializedObject.FindProperty("parameterName");
        parameterType = serializedObject.FindProperty("parameterType");
        getParameter = serializedObject.FindProperty("getParameter");
    }

    public override void OnInspectorGUI()
    {
        serializedObject.Update();
        EditorGUILayout.PropertyField(operation);
        var op = (DataEntityRuntimeTester.TestOperation)operation.enumValueIndex;
        switch (op)
        {
            case DataEntityRuntimeTester.TestOperation.Initialize:
                EditorGUILayout.HelpBox("调用 DataEntityRuntimeLoader.Initialize", MessageType.Info);
                EditorGUILayout.PropertyField(dataDirectory, new GUIContent("数据目录(可空)"));
                break;
            case DataEntityRuntimeTester.TestOperation.Reload:
                EditorGUILayout.HelpBox("调用 DataEntityRuntimeLoader.Reload", MessageType.Info);
                break;
            case DataEntityRuntimeTester.TestOperation.GetValue:
                EditorGUILayout.HelpBox("读取数据并在控制台输出", MessageType.Info);
                EditorGUILayout.PropertyField(templateName, new GUIContent("模板名"));
                EditorGUILayout.PropertyField(instanceName, new GUIContent("实例名"));
                EditorGUILayout.PropertyField(indexKey, new GUIContent("索引字符"));
                EditorGUILayout.PropertyField(parameterName, new GUIContent("参数名"));
                EditorGUILayout.PropertyField(parameterType, new GUIContent("参数类型"));
                EditorGUILayout.PropertyField(getParameter, new GUIContent("索引获取参数(getParameter)"));
                break;
        }
        serializedObject.ApplyModifiedProperties();
        if (GUILayout.Button("执行"))
        {
            foreach (UnityEngine.Object target in targets)
            {
                if (target is DataEntityRuntimeTester tester)
                {
                    tester.ExecuteSelectedOperation();
                }
            }
        }
    }
}
#endif
`;
}

export function buildUnityRuntimeTesterGuideContent() {
  return `
DataEntityRuntimeTester 使用说明
================================

挂载脚本
1. 在 csharpDate 目录中找到 DataEntityRuntimeTester.cs 并挂载到需要测试的 GameObject。
2. 确保 Editor 文件夹中的 DataEntityRuntimeTesterEditor.cs 保持在 Editor 目录下，以启用自定义 Inspector 面板。
3. 在 Inspector 中使用生成的自定义面板选择要执行的操作。

操作说明
- Initialize：可选填写数据目录，为空时使用 dataEntity 目录。
- Reload：调用 DataEntityRuntimeLoader.Reload 并在 Editor 内自动暂停/恢复。
- GetValue：填写模板名、实例名或索引字符、参数名、参数类型。
  * 若目标参数为索引参数，在 getParameter 中填写要读取的字段。
  * 控制台会输出 template/entity/参数名/参数内容 或错误信息。

执行步骤
- 参数填写完成后点击“执行”按钮触发对应操作。
- 若输入不合法，Console 面板会打印提示便于排查。

注意事项
- 在未调用 Initialize 前执行读取会抛出异常。
- getParameter 仅在索引参数读取时需要，普通参数保持为空。
`;
}

function buildGodotReloadBlock() {
  return `public static void Reload()
    {
        if (string.IsNullOrWhiteSpace(_dataDirectory))
        {
            throw new InvalidOperationException("Please call Initialize before Reload.");
        }
        LoadAll();
    }`;
}

function buildGodotResolvePathBlock() {
  return `    private static string ResolvePath(string relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath))
        {
            return _dataDirectory;
        }
        if (IsVirtualPath(relativePath))
        {
            return NormalizeSeparators(relativePath);
        }
        if (Path.IsPathRooted(relativePath))
        {
            return Path.GetFullPath(relativePath);
        }
        var sanitized = NormalizeSeparators(relativePath).TrimStart('.', '/');
        if (sanitized.StartsWith("dataEntity/", StringComparison.OrdinalIgnoreCase))
        {
            sanitized = sanitized.Substring("dataEntity/".Length);
        }
        if (string.IsNullOrEmpty(_dataDirectory))
        {
            return sanitized;
        }
        if (IsVirtualPath(_dataDirectory))
        {
            return CombineVirtualPath(_dataDirectory, sanitized);
        }
        return Path.GetFullPath(Path.Combine(_dataDirectory, sanitized));
    }`;
}

function buildGodotLoaderHelpersBlock() {
  return `    private static string NormalizeDataDirectory(string dataDirectory)
    {
        var basePath = string.IsNullOrWhiteSpace(dataDirectory) ? "res://dataEntity" : dataDirectory;
        if (IsVirtualPath(basePath))
        {
            return NormalizeSeparators(basePath);
        }
        return Path.GetFullPath(basePath);
    }

    private static bool FileExists(string path)
    {
        return IsVirtualPath(path) ? GodotFileAccess.FileExists(path) : File.Exists(path);
    }

    private static string ReadAllText(string path)
    {
        if (!IsVirtualPath(path))
        {
            return File.ReadAllText(path);
        }
        using var file = GodotFileAccess.Open(path, GodotFileAccess.ModeFlags.Read);
        if (file == null)
        {
            throw new FileNotFoundException($"Failed to open file: {path}; error={GodotFileAccess.GetOpenError()}");
        }
        return file.GetAsText();
    }

    private static void LogError(string message)
    {
        GD.PrintErr(message);
    }

    private static bool IsVirtualPath(string path)
    {
        return !string.IsNullOrWhiteSpace(path)
            && (path.StartsWith("res://", StringComparison.OrdinalIgnoreCase)
                || path.StartsWith("user://", StringComparison.OrdinalIgnoreCase));
    }

    private static string NormalizeSeparators(string path)
    {
        return string.IsNullOrWhiteSpace(path) ? string.Empty : path.Replace("\\\\", "/");
    }

    private static string CombineVirtualPath(string basePath, string relativePath)
    {
        var left = NormalizeSeparators(basePath).TrimEnd('/');
        var right = NormalizeSeparators(relativePath).TrimStart('/');
        return string.IsNullOrEmpty(right) ? left : $"{left}/{right}";
    }

`;
}

export function buildGodotRuntimeLoaderContent() {
  return buildUnityRuntimeLoaderContent()
    .replace(
      `using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif`,
      `using Godot;
using GodotFileAccess = Godot.FileAccess;`,
    )
    .replace(
      `_dataDirectory = string.IsNullOrWhiteSpace(dataDirectory)
            ? Path.GetFullPath(Path.Combine(Application.dataPath, "dataEntity"))
            : Path.GetFullPath(dataDirectory);`,
      `_dataDirectory = NormalizeDataDirectory(dataDirectory);`,
    )
    .replace(
      `public static void Reload()
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
                throw new InvalidOperationException("\\u8bf7\\u5148\\u8c03\\u7528 Initialize \\u6307\\u5b9a\\u6570\\u636e\\u76ee\\u5f55\\u3002");
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
    }`,
      buildGodotReloadBlock(),
    )
    .replaceAll('Debug.LogError', 'LogError')
    .replaceAll('File.Exists', 'FileExists')
    .replaceAll('File.ReadAllText', 'ReadAllText')
    .replace(
      `    private static string ResolvePath(string relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath))
        {
            return _dataDirectory;
        }
        if (Path.IsPathRooted(relativePath))
        {
            return relativePath;
        }
        var sanitized = relativePath.Replace("\\\\", "/").TrimStart('.', '/');
        if (sanitized.StartsWith("dataEntity/", StringComparison.OrdinalIgnoreCase))
        {
            sanitized = sanitized.Substring("dataEntity/".Length);
        }
        var combined = string.IsNullOrEmpty(_dataDirectory) ? sanitized : Path.Combine(_dataDirectory, sanitized);
        return Path.GetFullPath(combined);
    }`,
      buildGodotResolvePathBlock(),
    )
    .replace('    private class ManifestRecord', `${buildGodotLoaderHelpersBlock()}    private class ManifestRecord`);
}

export function buildGodotRuntimeLoaderGuideContent() {
  return `
DataEntityRuntimeLoader for Godot
================================

1. Dependency
- Add the Newtonsoft.Json package to your Godot C# project.
- Generated files still use Newtonsoft.Json / Newtonsoft.Json.Linq, just like Unity mode.

2. Initialize
- Default data directory: \`res://dataEntity\`
- Or pass an absolute path / \`user://\` / \`res://\` path manually.

3. Read values
- \`DataEntityRuntimeLoader.GetValue<T>("Template", null, "indexKey", "damage")\`
- \`DataEntityRuntimeLoader.GetValue<T>("Template", "InstanceName", null, "refParam", "hp")\`
- \`DataEntityRuntimeLoader.GetIndexReference(...)\`

4. Reload
- \`DataEntityRuntimeLoader.Reload()\`
- Godot mode does not generate a Unity-style custom inspector or Editor pause behavior.

Notes
- Keep \`manifest.json\` and all template JSON files under \`dataEntity/\`.
- Virtual Godot paths (\`res://\`, \`user://\`) are read via \`Godot.FileAccess\`.
- Absolute OS paths are read via \`System.IO\`.
`;
}

function buildGodotRuntimeTesterContentDraft() {
  return `
using System;
using System.Collections.Generic;
using Godot;

[GlobalClass]
public partial class DataEntityRuntimeTester : Node
{
    public enum TestOperation
    {
        Initialize,
        Reload,
        GetValue,
    }

    [Export]
    private TestOperation operation = TestOperation.Initialize;

    [Export]
    private bool executeOnReady = false;

    [Export]
    private string dataDirectory = "res://dataEntity";

    [Export]
    private string templateName = string.Empty;

    [Export]
    private string instanceName = string.Empty;

    [Export]
    private string indexKey = string.Empty;

    [Export]
    private string parameterName = string.Empty;

    [Export]
    private string parameterType = "string";

    [Export]
    private string getParameter = string.Empty;

    public override void _Ready()
    {
        if (!executeOnReady)
        {
            return;
        }
        ExecuteSelectedOperation();
    }

    public void ExecuteSelectedOperation()
    {
        try
        {
            switch (operation)
            {
                case TestOperation.Initialize:
                    ExecuteInitialize();
                    break;
                case TestOperation.Reload:
                    ExecuteReload();
                    break;
                case TestOperation.GetValue:
                    ExecuteGetValue();
                    break;
                default:
                    GD.PrintErr("Unsupported operation");
                    break;
            }
        }
        catch (Exception ex)
        {
            GD.PrintErr($"[DataEntityRuntimeTester] {ex.Message}\\n{ex}");
        }
    }

    private void ExecuteInitialize()
    {
        var path = string.IsNullOrWhiteSpace(dataDirectory) ? null : dataDirectory;
        DataEntityRuntimeLoader.Initialize(path);
        GD.Print("[DataEntityRuntimeTester] Initialize completed");
    }

    private void ExecuteReload()
    {
        DataEntityRuntimeLoader.Reload();
        GD.Print("[DataEntityRuntimeTester] Reload completed");
    }

    private void ExecuteGetValue()
    {
        if (string.IsNullOrWhiteSpace(templateName) || string.IsNullOrWhiteSpace(parameterName))
        {
            GD.PrintErr("Invalid input");
            return;
        }

        var type = ResolveParameterType(parameterType);
        if (type == null)
        {
            GD.PrintErr("Invalid input");
            return;
        }

        var instance = string.IsNullOrWhiteSpace(instanceName) ? null : instanceName;
        var index = string.IsNullOrWhiteSpace(indexKey) ? null : indexKey;

        object value;
        if (string.IsNullOrWhiteSpace(getParameter))
        {
            value = DataEntityRuntimeLoader.GetValue(templateName, instance, index, parameterName, type);
        }
        else
        {
            value = DataEntityRuntimeLoader.GetValue(templateName, instance, index, parameterName, type, getParameter);
        }

        var identifier = !string.IsNullOrWhiteSpace(instance) ? instance : index;
        var valueText = value == null ? "<null>" : value.ToString();
        GD.Print($"{templateName}/{identifier ?? "(null)"}/{parameterName}/{valueText}");
    }

    private static Type ResolveParameterType(string typeName)
    {
        if (string.IsNullOrWhiteSpace(typeName))
        {
            return typeof(object);
        }

        var normalized = typeName.Trim();
        if (TypeMappings.TryGetValue(normalized, out var mapped))
        {
            return mapped;
        }
        if (TypeMappings.TryGetValue(normalized.ToLowerInvariant(), out mapped))
        {
            return mapped;
        }
        try
        {
            return Type.GetType(normalized, false);
        }
        catch
        {
            return null;
        }
    }

    private static readonly Dictionary<string, Type> TypeMappings = new Dictionary<string, Type>(StringComparer.OrdinalIgnoreCase)
    {
        { "bool", typeof(bool) },
        { "byte", typeof(byte) },
        { "sbyte", typeof(sbyte) },
        { "char", typeof(char) },
        { "decimal", typeof(decimal) },
        { "double", typeof(double) },
        { "float", typeof(float) },
        { "int", typeof(int) },
        { "uint", typeof(uint) },
        { "long", typeof(long) },
        { "ulong", typeof(ulong) },
        { "short", typeof(short) },
        { "ushort", typeof(ushort) },
        { "string", typeof(string) },
        { "datetime", typeof(DateTime) },
        { "guid", typeof(Guid) },
    };
}
`;
}

function buildGodotRuntimeTesterGuideContentDraft() {
  return `
DataEntityRuntimeTester for Godot
================================

1. Attach \`DataEntityRuntimeTester.cs\` to any Node in a test scene.
2. Fill exported fields in the Inspector.
3. Enable \`executeOnReady\` if you want the selected operation to run when the scene starts.
4. You can also call \`ExecuteSelectedOperation()\` from a button signal or another debug script.

Recommended flow
- Run \`Initialize\` once.
- Switch to \`GetValue\` to inspect a field.
- Use \`Reload\` after updating JSON files.

Notes
- This Godot version replaces the Unity custom inspector with exported fields on a Node script.
- The generated tester is for debugging/runtime validation and should not require changes to editor tooling.
`;
}

export function buildGodotRuntimeTesterContent() {
  return `
using System;
using System.Collections.Generic;
using Godot;

[GlobalClass]
public partial class DataEntityRuntimeTester : Node
{
    public enum TestOperation
    {
        Initialize,
        Reload,
        GetValue,
    }

    [Export]
    public bool ExecuteOnReady { get; set; }

    [Export]
    public TestOperation Operation { get; set; } = TestOperation.Initialize;

    [Export]
    public string DataDirectory { get; set; } = string.Empty;

    [Export]
    public string TemplateName { get; set; } = string.Empty;

    [Export]
    public string InstanceName { get; set; } = string.Empty;

    [Export]
    public string IndexKey { get; set; } = string.Empty;

    [Export]
    public string ParameterName { get; set; } = string.Empty;

    [Export]
    public string ParameterType { get; set; } = "string";

    [Export]
    public string GetParameter { get; set; } = string.Empty;

    public override void _Ready()
    {
        if (ExecuteOnReady)
        {
            ExecuteSelectedOperation();
        }
    }

    public void ExecuteSelectedOperation()
    {
        try
        {
            switch (Operation)
            {
                case TestOperation.Initialize:
                    ExecuteInitialize();
                    break;
                case TestOperation.Reload:
                    ExecuteReload();
                    break;
                case TestOperation.GetValue:
                    ExecuteGetValue();
                    break;
                default:
                    GD.PushError("Unsupported operation");
                    break;
            }
        }
        catch (Exception ex)
        {
            GD.PushError($"[DataEntityRuntimeTester] {ex.Message}\\n{ex}");
        }
    }

    private void ExecuteInitialize()
    {
        var path = string.IsNullOrWhiteSpace(DataDirectory) ? null : DataDirectory;
        DataEntityRuntimeLoader.Initialize(path);
        GD.Print("[DataEntityRuntimeTester] Initialize completed");
    }

    private void ExecuteReload()
    {
        DataEntityRuntimeLoader.Reload();
        GD.Print("[DataEntityRuntimeTester] Reload completed");
    }

    private void ExecuteGetValue()
    {
        if (string.IsNullOrWhiteSpace(TemplateName) || string.IsNullOrWhiteSpace(ParameterName))
        {
            GD.PushError("输入不合法");
            return;
        }

        var type = ResolveParameterType(ParameterType);
        if (type == null)
        {
            GD.PushError("参数类型不合法");
            return;
        }

        var instance = string.IsNullOrWhiteSpace(InstanceName) ? null : InstanceName;
        var index = string.IsNullOrWhiteSpace(IndexKey) ? null : IndexKey;

        object value;
        if (string.IsNullOrWhiteSpace(GetParameter))
        {
            value = DataEntityRuntimeLoader.GetValue(TemplateName, instance, index, ParameterName, type);
        }
        else
        {
            value = DataEntityRuntimeLoader.GetValue(TemplateName, instance, index, ParameterName, type, GetParameter);
        }

        var identifier = !string.IsNullOrWhiteSpace(instance) ? instance : index;
        var valueText = value == null ? "<null>" : value.ToString();
        GD.Print($"{TemplateName}/{identifier ?? "(null)"}/{ParameterName}/{valueText}");
    }

    private static Type ResolveParameterType(string typeName)
    {
        if (string.IsNullOrWhiteSpace(typeName))
        {
            return typeof(object);
        }

        var normalized = typeName.Trim();
        if (TypeMappings.TryGetValue(normalized, out var mapped))
        {
            return mapped;
        }
        if (TypeMappings.TryGetValue(normalized.ToLowerInvariant(), out mapped))
        {
            return mapped;
        }
        try
        {
            return Type.GetType(normalized, false);
        }
        catch
        {
            return null;
        }
    }

    private static readonly Dictionary<string, Type> TypeMappings = new Dictionary<string, Type>(StringComparer.OrdinalIgnoreCase)
    {
        { "bool", typeof(bool) },
        { "byte", typeof(byte) },
        { "sbyte", typeof(sbyte) },
        { "char", typeof(char) },
        { "decimal", typeof(decimal) },
        { "double", typeof(double) },
        { "float", typeof(float) },
        { "int", typeof(int) },
        { "uint", typeof(uint) },
        { "long", typeof(long) },
        { "ulong", typeof(ulong) },
        { "short", typeof(short) },
        { "ushort", typeof(ushort) },
        { "string", typeof(string) },
        { "datetime", typeof(DateTime) },
        { "guid", typeof(Guid) },
    };
}
`;
}

export function buildGodotRuntimeTesterGuideContent() {
  return `
DataEntityRuntimeTester (Godot C#) 使用说明
================================

挂载脚本
1. 将 godotCsharpDate/DataEntityRuntimeTester.cs 挂到任意 Node。
2. 默认读取 res://dataEntity；如果导出目录不在项目根目录，可在 DataDirectory 中填写绝对路径。
3. Godot 侧没有 Unity Inspector 那样的自定义按钮面板，建议通过以下任一方式执行：
   - 在 Inspector 中将 ExecuteOnReady 设为 true，然后直接运行场景。
   - 在自己的调试脚本中调用 tester.ExecuteSelectedOperation()。

操作说明
- Initialize：初始化运行时缓存，空路径时默认使用 res://dataEntity。
- Reload：重新读取 manifest.json 与全部模板 JSON。
- GetValue：读取模板参数；若目标参数是索引参数，请在 GetParameter 中填写要追读的字段。

注意事项
- 该测试脚本依赖 DataEntityRuntimeLoader.cs 与 modelCsharpe.cs 一起存在。
- Godot 项目需要引用 Newtonsoft.Json。
- 输出日志使用 GD.Print / GD.PushError，可在 Output 面板查看。
`;
}

export function createCSharpRuntimeGeneratorModule(context) {
  ensureContext(context);

  const {
    appState,
    isUnityMode = () => true,
    isGodotMode = () => false,
    isCSharpMode = () => isUnityMode() || isGodotMode(),
    getCurrentEngineLabel = () => 'C#',
    ensureEngineGenerationConsent = async () => true,
    cleanConflictingEngineArtifacts = async () => {},
    ensureSubFolders = async () => {},
    writeTextFile = async () => {},
    ensureTemplateUid = () => null,
    isEnumTemplate = () => false,
    getEnumTemplate = () => null,
    getEnumDefinitions = () => [],
    sanitizeCSharpMemberName = (value) => value,
    getEnumCSharpTypeName = (value) => value,
    getValidListElementType = () => 'string',
    isEnumType = () => false,
    showMessage = () => {},
  } = context;

  function getCurrentRuntimeVariant() {
    return isGodotMode() ? 'godot' : 'unity';
  }

  async function ensureModelStruct() {
    if (!appState.csharpHandle) return;
    try {
      appState.modelStructHandle = await appState.csharpHandle.getDirectoryHandle('modelstruct', {
        create: true,
      });
      await writeTextFile(
        appState.modelStructHandle,
        'modelCsharpe.cs',
        buildModelStructContent(),
      );
    } catch (err) {
      console.warn('ensureModelStruct failed', err);
    }
  }

  async function generateRuntimeLoaderArtifacts() {
    if (!isCSharpMode()) return;
    if (!appState.csharpHandle) return;
    if (!appState.modelStructHandle) {
      await ensureModelStruct();
    }
    if (!appState.modelStructHandle) return;
    const runtimeVariant = getCurrentRuntimeVariant();
    if (runtimeVariant === 'unity' && !appState.editorHandle && appState.csharpHandle) {
      try {
        appState.editorHandle = await appState.csharpHandle.getDirectoryHandle('Editor', {
          create: true,
        });
      } catch (err) {
        console.warn('generateRuntimeLoaderArtifacts 无法访问 Editor 文件夹', err);
        appState.editorHandle = null;
      }
    }
    if (runtimeVariant !== 'unity') {
      appState.editorHandle = null;
    }
    await writeTextFile(
      appState.modelStructHandle,
      'DataEntityRuntimeLoader.cs',
      runtimeVariant === 'godot'
        ? buildGodotRuntimeLoaderContent()
        : buildUnityRuntimeLoaderContent(),
    );
    await writeTextFile(
      appState.modelStructHandle,
      'DataEntityRuntimeLoaderGuide.txt',
      runtimeVariant === 'godot'
        ? buildGodotRuntimeLoaderGuideContent()
        : buildUnityRuntimeLoaderGuideContent(),
    );
    await writeTextFile(
      appState.csharpHandle,
      'DataEntityRuntimeTester.cs',
      runtimeVariant === 'godot'
        ? buildGodotRuntimeTesterContent()
        : buildUnityRuntimeTesterContent(),
    );
    if (runtimeVariant === 'unity' && appState.editorHandle) {
      await writeTextFile(
        appState.editorHandle,
        'DataEntityRuntimeTesterEditor.cs',
        buildRuntimeTesterEditorContent(),
      );
      await writeTextFile(
        appState.editorHandle,
        'DataEntityRuntimeTesterGuide.txt',
        buildUnityRuntimeTesterGuideContent(),
      );
    } else {
      await writeTextFile(
        appState.modelStructHandle,
        'DataEntityRuntimeTesterGuide.txt',
        buildGodotRuntimeTesterGuideContent(),
      );
    }
  }

  async function generateEnumCSFiles(enumTpl) {
    if (!appState.csharpHandle) return;
    let enumDir = appState.csharpHandle;
    let useSubDir = true;
    try {
      enumDir = await appState.csharpHandle.getDirectoryHandle('enums', { create: true });
    } catch (err) {
      console.warn('无法访问 enums 目录，枚举将生成到 csharpDate 根目录', err);
      enumDir = appState.csharpHandle;
      useSubDir = false;
    }
    const definitions = enumTpl ? getEnumDefinitions() : [];
    const generatedFiles = new Set();
    for (const def of definitions) {
      if (!def || !def.csharpName) continue;
      const members = [];
      const seenMembers = new Set();
      def.values.forEach((raw, idx) => {
        if (!raw) return;
        const fallback = `Member${idx + 1}`;
        const baseName = sanitizeCSharpMemberName(raw, fallback);
        let memberName = baseName;
        let suffix = 1;
        while (seenMembers.has(memberName)) {
          memberName = `${baseName}_${suffix++}`;
        }
        seenMembers.add(memberName);
        members.push({ name: memberName, original: raw });
      });
      if (members.length === 0) continue;
      const lines = [];
      lines.push('using System;');
      lines.push('');
      lines.push('[Serializable]');
      lines.push(`public enum ${def.csharpName}`);
      lines.push('{');
      members.forEach((member, index) => {
        if (member.original && member.original !== member.name) {
          lines.push(`    // ${member.original}`);
        }
        const suffix = index === members.length - 1 ? '' : ',';
        lines.push(`    ${member.name}${suffix}`);
      });
      lines.push('}');
      const fileName = `${def.csharpName}.cs`;
      await writeTextFile(enumDir, fileName, lines.join('\n') + '\n');
      generatedFiles.add(fileName);
    }
    if (useSubDir) {
      for await (const entry of enumDir.values()) {
        if (entry.kind === 'file' && !generatedFiles.has(entry.name)) {
          await enumDir.removeEntry(entry.name);
        }
      }
    }
  }

  function generateCSContent(tpl) {
    const lines = [];
    lines.push('using System;');
    lines.push('using System.Collections.Generic;');
    lines.push('');
    lines.push('[Serializable]');
    lines.push(`public class ${tpl.name}`);
    lines.push('{');
    lines.push('    public string template;');
    lines.push('    public int id;');
    lines.push('    public string name;');
    const idxField = tpl.indexField || 'id';
    let idxType = 'string';
    if (idxField === 'id') idxType = 'long';
    else if (idxField === 'name') idxType = 'string';
    else {
      const pp = tpl.parameters.find((p) => p.name === idxField);
      if (pp) idxType = mapToCSharpType(pp.type, pp);
    }
    lines.push(`    public ${idxType} index;`);
    tpl.parameters.forEach((p) => {
      if (!p) return;
      if (p.parameterIndexes) {
        if (p.type === 'list') {
          lines.push(`    public List<DataRef> ${p.name};`);
        } else {
          lines.push(`    public DataRef ${p.name};`);
        }
      } else {
        const csType = mapToCSharpType(p.type, p);
        lines.push(`    public ${csType} ${p.name};`);
      }
    });
    lines.push('}');
    return lines.join('\n');
  }

  function mapToCSharpType(type, param = null) {
    if (isEnumType(type)) {
      return getEnumCSharpTypeName(type);
    }
    if (type === 'list') {
      const elementType = getValidListElementType(param && param.elementType);
      if (isEnumType(elementType)) {
        return `List<${getEnumCSharpTypeName(elementType)}>`;
      }
      const inner = mapCSharpPrimitiveType(elementType);
      return `List<${inner}>`;
    }
    return mapCSharpPrimitiveType(type);
  }

  function mapCSharpPrimitiveType(type) {
    switch (type) {
      case 'string':
        return 'string';
      case 'int':
        return 'int';
      case 'long':
        return 'long';
      case 'float':
        return 'float';
      case 'bool':
        return 'bool';
      case 'object':
        return 'object';
      default:
        return 'object';
    }
  }

  async function regenerateCSharpStructures() {
    if (!appState.directoryHandle) {
      window.alert('请先选择工作目录');
      return;
    }
    if (!isCSharpMode()) {
      showMessage('请先切换到 Unity 或 Godot C# 模式再生成 C# 脚本', 'warn');
      return;
    }
    try {
      const consent = await ensureEngineGenerationConsent('生成 C# 数据结构脚本');
      if (!consent) return;
      await cleanConflictingEngineArtifacts();
      await ensureSubFolders();
      await ensureModelStruct();
      let updatedAny = false;
      for (const tpl of appState.templates) {
        ensureTemplateUid(tpl);
        if (isEnumTemplate(tpl)) continue;
        const content = generateCSContent(tpl);
        await writeTextFile(appState.csharpHandle, `${tpl.name}.cs`, content);
        updatedAny = true;
      }
      const enumTpl = getEnumTemplate();
      await generateEnumCSFiles(enumTpl);
      if (enumTpl) {
        updatedAny = true;
      }
      if (updatedAny) {
        showMessage(`已重新生成 ${getCurrentEngineLabel()} C# 数据结构脚本`);
      } else {
        showMessage(`没有可生成的 ${getCurrentEngineLabel()} C# 数据结构脚本`);
      }
      await generateRuntimeLoaderArtifacts();
    } catch (err) {
      console.error(err);
      showMessage('重新生成 C# 脚本失败，请检查权限');
    }
  }

  return {
    ensureModelStruct,
    generateRuntimeLoaderArtifacts,
    regenerateCSharpStructures,
    generateEnumCSFiles,
    generateCSContent,
    mapToCSharpType,
    mapCSharpPrimitiveType,
  };
}

export function getCSharpRuntimeGeneratorModule(context) {
  return createCSharpRuntimeGeneratorModule(context);
}

export default createCSharpRuntimeGeneratorModule;
