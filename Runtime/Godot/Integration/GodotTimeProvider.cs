namespace GameFramework.Adapters.Godot
{
    public sealed class GodotTimeProvider : ITimeProvider
    {
        public float Now => global::Godot.Time.GetTicksMsec() / 1000f;
    }
}
