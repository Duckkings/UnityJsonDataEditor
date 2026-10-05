using System;
using System.Collections.Generic;
using GameFramework;
using GameFramework.Adapters.Godot;
using Godot;

[GlobalClass]
public partial class UiSystemModule : Node, ISystemModule, IUiSystem
{
	private const string ServiceName = "uisystem";
	private const string ScreenUiRootNodeName = "ScreenUiRoot";
	private const string SystemModuleDeclareTableName = "systemModuleDeclare";
	private const string ModuleDeclareTableName = "moduleDeclare";

	[Export]
	public int ScreenUiRootLayer { get; set; } = 200;

	private sealed class ModuleUiEntry
	{
		public int Id;
		public int RegisterOrder;
		public object Owner;
		public string ModuleKey;
		public string UiPrefabPath;
		public int UiPriority;
		public int DeclareId;
		public Node UiNode;
		public IModuleUiView View;
		public ModuleUiHandle Handle;
	}

	private readonly GodotRuntimeLogger _logger = new GodotRuntimeLogger();
	private readonly Dictionary<object, ModuleUiEntry> _entriesByOwner = new Dictionary<object, ModuleUiEntry>();
	private readonly List<ModuleUiEntry> _entries = new List<ModuleUiEntry>();

	private IRootRuntime _root;
	private IDataTableRuntime _dataRuntime;
	private Node _screenUiRoot;
	private int _nextHandleId = 1;
	private int _nextRegisterOrder;

	string ISystemModule.Name => Name.ToString();

	public Node ScreenUiRoot => EnsureScreenUiRoot();

	public override void _ExitTree()
	{
		UnregisterAllModuleUi();
	}

	public void Init(IRootRuntime root, IEventBus eventBus)
	{
		_root = root;
		_dataRuntime = root?.GetService<IDataTableRuntime>("database");
		EnsureScreenUiRoot();
		root?.RegisterService(ServiceName, this);
		_logger.Info("[UiSystemModule] Initialized and registered service 'uisystem'.");
	}

	public void Tick()
	{
	}

	public ModuleUiHandle RegisterModuleUi(object owner, ModuleUiRequest request)
	{
		if (owner is IRequireModuleUi { WantsScreenUi: false })
		{
			UnregisterModuleUi(owner);
			return default;
		}
		if (owner == null)
		{
			_logger.Warning("[UiSystemModule] RegisterModuleUi skipped because owner is null.");
			return default;
		}

		var resolvedRequest = ResolveRequest(request);
		if (resolvedRequest == null || string.IsNullOrWhiteSpace(resolvedRequest.UiPrefabPath))
		{
			_logger.Warning($"[UiSystemModule] RegisterModuleUi skipped for owner '{DescribeOwner(owner)}' because uiPrefabPath is empty.");
			return default;
		}

		UnregisterModuleUi(owner);

		var packedScene = ResourceLoader.Load<PackedScene>(resolvedRequest.UiPrefabPath);
		if (packedScene == null)
		{
			_logger.Error($"[UiSystemModule] Failed to load UI prefab '{resolvedRequest.UiPrefabPath}' for '{resolvedRequest.ModuleKey}'.");
			return default;
		}

		var uiNode = packedScene.Instantiate<Node>();
		if (uiNode == null)
		{
			_logger.Error($"[UiSystemModule] UI prefab '{resolvedRequest.UiPrefabPath}' did not instantiate as a Node.");
			return default;
		}

		if (string.IsNullOrWhiteSpace(uiNode.Name.ToString()) && !string.IsNullOrWhiteSpace(resolvedRequest.ModuleKey))
		{
			uiNode.Name = $"{resolvedRequest.ModuleKey}Ui";
		}

		var view = uiNode as IModuleUiView;
		var handle = new ModuleUiHandle(_nextHandleId++, owner, uiNode, view);
		var entry = new ModuleUiEntry
		{
			Id = handle.Id,
			RegisterOrder = _nextRegisterOrder++,
			Owner = owner,
			ModuleKey = resolvedRequest.ModuleKey ?? string.Empty,
			UiPrefabPath = resolvedRequest.UiPrefabPath,
			UiPriority = resolvedRequest.UiPriority,
			DeclareId = resolvedRequest.DeclareId,
			UiNode = uiNode,
			View = view,
			Handle = handle
		};

		_entriesByOwner[owner] = entry;
		_entries.Add(entry);
		EnsureScreenUiRoot().AddChild(uiNode);
		try
		{
			view?.Init(new ModuleUiContext
			{
				UiSystem = this,
				Owner = owner,
				ModuleKey = entry.ModuleKey,
				UiPriority = entry.UiPriority,
				DeclareId = entry.DeclareId,
				UiPrefabPath = entry.UiPrefabPath
			});
			view?.SetModuleVisible(true);
			SortUiSiblings();
		}
		catch (Exception ex)
		{
			_logger.Error($"[UiSystemModule] UI view initialization failed for '{entry.ModuleKey}': {ex}");
			UnregisterModuleUi(owner);
			return default;
		}

		if (view == null)
		{
			_logger.Warning($"[UiSystemModule] UI prefab '{entry.UiPrefabPath}' for '{entry.ModuleKey}' does not implement IModuleUiView.");
		}

		return handle;
	}

	public void UnregisterModuleUi(object owner)
	{
		if (owner == null || !_entriesByOwner.TryGetValue(owner, out var entry))
		{
			return;
		}

		_entriesByOwner.Remove(owner);
		_entries.Remove(entry);
		if (entry.View != null)
		{
			try
			{
				entry.View.SetModuleVisible(false);
			}
			catch (Exception ex)
			{
				_logger.Warning($"[UiSystemModule] UI view hide failed for '{entry.ModuleKey}': {ex.Message}");
			}
		}

		if (entry.UiNode != null && GodotObject.IsInstanceValid(entry.UiNode))
		{
			if (entry.UiNode.GetParent() != null)
			{
				entry.UiNode.GetParent().RemoveChild(entry.UiNode);
			}

			entry.UiNode.QueueFree();
		}
	}

	public bool TryGetView<TView>(object owner, out TView view) where TView : class
	{
		view = null;
		if (owner == null || !_entriesByOwner.TryGetValue(owner, out var entry))
		{
			return false;
		}

		view = entry.View as TView;
		return view != null;
	}

	private void UnregisterAllModuleUi()
	{
		var owners = new List<object>(_entriesByOwner.Keys);
		for (var index = 0; index < owners.Count; index++)
		{
			UnregisterModuleUi(owners[index]);
		}
	}

	private Node EnsureScreenUiRoot()
	{
		if (_screenUiRoot != null && GodotObject.IsInstanceValid(_screenUiRoot))
		{
			return _screenUiRoot;
		}

		_screenUiRoot = GetNodeOrNull<Node>(ScreenUiRootNodeName);
		if (_screenUiRoot != null)
		{
			ApplyScreenUiRootLayer(_screenUiRoot);
			return _screenUiRoot;
		}

		_screenUiRoot = new CanvasLayer
		{
			Name = ScreenUiRootNodeName,
			Layer = ScreenUiRootLayer
		};
		AddChild(_screenUiRoot);
		return _screenUiRoot;
	}

	private void ApplyScreenUiRootLayer(Node node)
	{
		if (node is CanvasLayer canvasLayer)
		{
			canvasLayer.Layer = ScreenUiRootLayer;
		}
	}

	private ModuleUiRequest ResolveRequest(ModuleUiRequest request)
	{
		if (request == null)
		{
			return null;
		}

		if (!string.IsNullOrWhiteSpace(request.UiPrefabPath) || string.IsNullOrWhiteSpace(request.ModuleKey))
		{
			return request;
		}

		if (TryResolveDeclare(request.ModuleKey, SystemModuleDeclareTableName, out var declaredRequest)
			|| TryResolveDeclare(request.ModuleKey, ModuleDeclareTableName, out declaredRequest))
		{
			return new ModuleUiRequest
			{
				ModuleKey = request.ModuleKey,
				UiPrefabPath = declaredRequest.UiPrefabPath,
				UiPriority = declaredRequest.UiPriority,
				DeclareId = declaredRequest.DeclareId
			};
		}

		return request;
	}

	private bool TryResolveDeclare(string moduleKey, string tableName, out ModuleUiRequest request)
	{
		request = null;
		if (string.IsNullOrWhiteSpace(moduleKey))
		{
			return false;
		}

		_dataRuntime ??= _root?.GetService<IDataTableRuntime>("database");
		if (_dataRuntime == null)
		{
			return false;
		}

		EventBusTableSchema schema;
		try
		{
			schema = _dataRuntime.GetSchema(tableName);
		}
		catch (Exception ex)
		{
			_logger.Warning($"[UiSystemModule] Failed to load '{tableName}' while resolving '{moduleKey}': {ex.Message}");
			return false;
		}

		if (schema?.instances == null)
		{
			return false;
		}

		foreach (var pair in schema.instances)
		{
			var instance = pair.Value;
			if (instance == null)
			{
				continue;
			}

			var declaredModuleKey = instance.GetString("moduleKey", instance.GetString("name", string.Empty));
			if (!string.Equals(declaredModuleKey, moduleKey, StringComparison.Ordinal))
			{
				continue;
			}

			request = new ModuleUiRequest
			{
				ModuleKey = moduleKey,
				UiPrefabPath = instance.GetString("uiPrefabPath", string.Empty),
				UiPriority = instance.GetInt("uiPriority", 0),
				DeclareId = instance.GetInt("id", 0)
			};
			return true;
		}

		return false;
	}

	private void SortUiSiblings()
	{
		var root = EnsureScreenUiRoot();
		_entries.Sort(CompareEntriesForSiblingOrder);
		for (var index = 0; index < _entries.Count; index++)
		{
			var node = _entries[index].UiNode;
			if (node != null && GodotObject.IsInstanceValid(node) && ReferenceEquals(node.GetParent(), root))
			{
				root.MoveChild(node, index);
			}
		}
	}

	private static int CompareEntriesForSiblingOrder(ModuleUiEntry left, ModuleUiEntry right)
	{
		var priorityCompare = left.UiPriority.CompareTo(right.UiPriority);
		if (priorityCompare != 0)
		{
			return priorityCompare;
		}

		var declareCompare = left.DeclareId.CompareTo(right.DeclareId);
		if (declareCompare != 0)
		{
			return declareCompare;
		}

		return left.RegisterOrder.CompareTo(right.RegisterOrder);
	}

	private static string DescribeOwner(object owner)
	{
		return owner is Node node ? node.Name.ToString() : owner?.GetType().Name ?? "<null>";
	}
}
