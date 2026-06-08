namespace GameFramework
{
    public interface IRequireObjectSnapshotRegion
    {
        void BindObjectSnapshot(IObjectSnapshotSystem snapshotSystem, IObjectSnapshotRegion region);
    }
}
