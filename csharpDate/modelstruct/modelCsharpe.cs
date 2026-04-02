using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

[Serializable]
public class TableSchema
{
    public string name;
    public string indexField;
    public List<ParamDef> parameters;
    public Dictionary<string, object> instances;
}

[Serializable]
public class ParamDef
{
    public string name;
    public string type;
    public ParameterIndexBinding parameterIndexes;
}

[Serializable]
public class ParameterIndexBinding
{
    public string template;
    public string param;
    public string indexField;
}

[Serializable]
public class Row
{
    public int id;
    public string name;
    public Dictionary<string, object> payload; // 或Newtonsoft.Json.Linq.JObject payload;
}

[Serializable]
public class DataRef
{
    public string template;  // 对应 JSON 里的 "template"
    public string by;        // 对应 JSON 里的 "by"
    public string value;     // 对应 JSON 里的 "value"

    [JsonIgnore]
    public object instance;  // 解析完后指向目标实例
}

public class DataRefConverter : JsonConverter<DataRef>
{
    public override DataRef ReadJson(JsonReader reader, Type objectType, DataRef existingValue, bool hasExistingValue, JsonSerializer serializer)
    {
        if (reader == null)
        {
            return null;
        }
        if (reader.TokenType == JsonToken.Null)
        {
            return null;
        }
        if (reader.TokenType == JsonToken.String)
        {
            return new DataRef { value = reader.Value?.ToString() };
        }
        var jToken = JToken.Load(reader);
        if (jToken == null || jToken.Type == JTokenType.Null)
        {
            return null;
        }
        if (jToken.Type == JTokenType.String)
        {
            return new DataRef { value = jToken.ToString() };
        }
        return jToken.ToObject<DataRef>();
    }

    public override void WriteJson(JsonWriter writer, DataRef value, JsonSerializer serializer)
    {
        if (writer == null)
        {
            return;
        }
        if (value == null)
        {
            writer.WriteNull();
            return;
        }
        var jObject = JObject.FromObject(value, serializer);
        jObject.WriteTo(writer);
    }
}
