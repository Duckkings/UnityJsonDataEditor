using System.Collections.Generic;

namespace GameFramework
{
    public interface IObjectSnapshotSystem
    {
        IObjectSnapshotRegion RegisterRegion(object owner, string regionName);

        bool TryGetRegion(string regionName, out IObjectSnapshotRegion region);

        IReadOnlyDictionary<string, IObjectSnapshotRegion> GetRegions();
    }
}
