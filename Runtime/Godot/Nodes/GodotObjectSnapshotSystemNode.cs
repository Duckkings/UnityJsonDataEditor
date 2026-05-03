using System;
using System.Collections.Generic;
using Godot;

namespace GameFramework.Adapters.Godot
{
	[GlobalClass]
	public partial class GodotObjectSnapshotSystemNode : Node, IObjectSnapshotSystem
	{
		private sealed class SnapshotRegion : IObjectSnapshotRegion
		{
			private readonly Dictionary<string, object> _values = new Dictionary<string, object>();

			public SnapshotRegion(object owner, string regionName)
			{
				Owner = owner ?? throw new ArgumentNullException(nameof(owner));
				RegionName = regionName ?? throw new ArgumentNullException(nameof(regionName));
			}

			public string RegionName { get; }

			public object Owner { get; }

			public int Version { get; private set; }

			public bool IsDirty { get; private set; }

			public void Set(string key, object value)
			{
				if (string.IsNullOrWhiteSpace(key))
				{
					throw new ArgumentException("Snapshot key cannot be empty.", nameof(key));
				}

				_values[key] = value;
				Version++;
				IsDirty = true;
			}

			public bool TryGet(string key, out object value)
			{
				if (string.IsNullOrWhiteSpace(key))
				{
					value = null;
					return false;
				}

				return _values.TryGetValue(key, out value);
			}

			public IReadOnlyDictionary<string, object> GetValues()
			{
				return _values;
			}
		}

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

			var region = new SnapshotRegion(owner, regionName);
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
			_regions.Clear();
		}
	}
}
