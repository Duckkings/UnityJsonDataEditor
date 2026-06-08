using UnityEngine;

namespace GameFramework.Adapters.Unity
{
    public sealed class UnityScopeResolver : IScopeResolver
    {
        public bool IsInScope(object owner, object busOwner)
        {
            if (!(busOwner is Transform root))
            {
                return false;
            }

            var targetTransform = ResolveTransform(owner);
            return targetTransform != null && targetTransform.IsChildOf(root);
        }

        private static Transform ResolveTransform(object owner)
        {
            switch (owner)
            {
                case Transform transform:
                    return transform;
                case GameObject gameObject:
                    return gameObject.transform;
                case MonoBehaviour behaviour:
                    return behaviour.transform;
                default:
                    return null;
            }
        }
    }
}
