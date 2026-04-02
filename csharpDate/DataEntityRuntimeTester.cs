
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
