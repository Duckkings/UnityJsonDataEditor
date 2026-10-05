
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
			GD.PushError($"[DataEntityRuntimeTester] {ex.Message}\n{ex}");
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
