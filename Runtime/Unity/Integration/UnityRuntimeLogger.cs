using UnityEngine;

namespace GameFramework.Adapters.Unity
{
    public sealed class UnityRuntimeLogger : IRuntimeLogger
    {
        public void Info(string message)
        {
            Debug.Log(message);
        }

        public void Warning(string message)
        {
            Debug.LogWarning(message);
        }

        public void Error(string message)
        {
            Debug.LogError(message);
        }
    }
}
