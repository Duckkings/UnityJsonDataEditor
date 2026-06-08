namespace GameFramework
{
    public interface IScopeResolver
    {
        bool IsInScope(object owner, object busOwner);
    }
}
