using System.Collections.Generic;
namespace GameFramework;
public static class SnapshotValueExtensions
{
    // Compare the typed value before crossing the object API, so stable fields do not allocate boxes.
    public static void SetIfChanged<T>(this IObjectSnapshotRegion region,string key,T value)
    {
        if(region.TryGet<T>(key,out var previous)&&EqualityComparer<T>.Default.Equals(previous,value))return;
        region.Set(key,value);
    }
}
