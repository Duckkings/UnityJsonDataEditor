using System.Collections.Generic;

namespace GameFramework
{
    public interface IObjectSnapshotRegion
    {
        string RegionName { get; }

        object Owner { get; }

        int Version { get; }

        bool IsDirty { get; }

        void Set(string key, object value);

        bool TryGet(string key, out object value);

        IReadOnlyDictionary<string, object> GetValues();
    }
}
