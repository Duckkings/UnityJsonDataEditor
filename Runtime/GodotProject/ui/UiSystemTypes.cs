using Godot;

namespace GameFramework
{
	public interface IUiSystem
	{
		ModuleUiHandle RegisterModuleUi(object owner, ModuleUiRequest request);

		void UnregisterModuleUi(object owner);

		bool TryGetView<TView>(object owner, out TView view) where TView : class;
	}

	public interface IRequireModuleUi
	{
		bool WantsScreenUi => true;

		void BindModuleUi(ModuleUiHandle handle, IModuleUiView view);
	}

	public interface IModuleUiView
	{
		void Init(ModuleUiContext context);

		void SetModuleVisible(bool visible);
	}

	public sealed class ModuleUiRequest
	{
		public string ModuleKey { get; set; }

		public string UiPrefabPath { get; set; }

		public int UiPriority { get; set; }

		public int DeclareId { get; set; }
	}

	public readonly struct ModuleUiHandle
	{
		public ModuleUiHandle(int id, object owner, Node uiNode, IModuleUiView view)
		{
			Id = id;
			Owner = owner;
			UiNode = uiNode;
			View = view;
		}

		public int Id { get; }

		public object Owner { get; }

		public Node UiNode { get; }

		public IModuleUiView View { get; }

		public bool IsValid => Id != 0 && Owner != null && UiNode != null;
	}

	public sealed class ModuleUiContext
	{
		public IUiSystem UiSystem { get; set; }

		public object Owner { get; set; }

		public string ModuleKey { get; set; }

		public int UiPriority { get; set; }

		public int DeclareId { get; set; }

		public string UiPrefabPath { get; set; }
	}
}
