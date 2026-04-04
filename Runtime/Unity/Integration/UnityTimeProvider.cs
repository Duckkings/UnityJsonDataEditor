using UnityEngine;

namespace GameFramework.Adapters.Unity
{
    public sealed class UnityTimeProvider : ITimeProvider
    {
        public float Now => Time.time;
    }
}
