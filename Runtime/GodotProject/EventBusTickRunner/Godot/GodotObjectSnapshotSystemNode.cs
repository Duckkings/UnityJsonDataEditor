using System;
using System.Collections.Generic;
using Godot;

namespace GameFramework.Adapters.Godot
{
	[GlobalClass]
	public partial class GodotObjectSnapshotSystemNode : Node, IObjectSnapshotSystem
	{
		private readonly Dictionary<string, IObjectSnapshotRegion> _regions =
			new Dictionary<string, IObjectSnapshotRegion>(StringComparer.Ordinal);

		public IObjectSnapshotRegion RegisterRegion(object owner, string regionName)
		{
			if (owner == null)
			{
				throw new ArgumentNullException(nameof(owner));
			}

			if (string.IsNullOrWhiteSpace(regionName))
			{
				throw new ArgumentException("Snapshot region name cannot be empty.", nameof(regionName));
			}

			if (_regions.ContainsKey(regionName))
			{
				throw new InvalidOperationException($"Snapshot region '{regionName}' is already registered.");
			}

			var region = new TypedSnapshotRegion(owner, regionName);
			_regions.Add(regionName, region);
			return region;
		}

		public bool TryGetRegion(string regionName, out IObjectSnapshotRegion region)
		{
			if (string.IsNullOrWhiteSpace(regionName))
			{
				region = null;
				return false;
			}

			return _regions.TryGetValue(regionName, out region);
		}

		public IReadOnlyDictionary<string, IObjectSnapshotRegion> GetRegions()
		{
			return _regions;
		}

		public void ClearRegions()
		{
			foreach(var region in _regions.Values)if(region is TypedSnapshotRegion typed)typed.Clear();
			_regions.Clear();
		}

		private readonly List<string> _ownerRegionNames=new();
        public void UnregisterOwner(object owner)
		{
			var names = _ownerRegionNames;names.Clear();
			foreach (var pair in _regions)
				if (ReferenceEquals(pair.Value.Owner, owner)) names.Add(pair.Key);
			foreach (var name in names){if(_regions[name] is TypedSnapshotRegion typed)typed.Clear();_regions.Remove(name);}names.Clear();
		}
	}
}
