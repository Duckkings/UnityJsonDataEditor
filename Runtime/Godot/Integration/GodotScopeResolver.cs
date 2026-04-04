using Godot;

namespace GameFramework.Adapters.Godot
{
    public sealed class GodotScopeResolver : IScopeResolver
    {
        public bool IsInScope(object owner, object busOwner)
        {
            if (!(owner is Node current) || !(busOwner is Node root))
            {
                return false;
            }

            while (current != null)
            {
                if (ReferenceEquals(current, root))
                {
                    return true;
                }

                current = current.GetParent();
            }

            return false;
        }
    }
}
