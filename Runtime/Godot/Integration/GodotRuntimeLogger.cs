using Godot;

namespace GameFramework.Adapters.Godot
{
    public sealed class GodotRuntimeLogger : IRuntimeLogger
    {
        public void Info(string message)
        {
            GD.Print(message);
        }

        public void Warning(string message)
        {
            GD.PushWarning(message);
        }

        public void Error(string message)
        {
            GD.PushError(message);
        }
    }
}
