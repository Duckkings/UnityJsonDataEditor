using System.Collections.Generic;

namespace GameFramework
{
    public enum EventBusScopeMode
    {
        Global,
        Local
    }

    public sealed class EventBusConfig
    {
        public EventBusScopeMode Mode { get; set; } = EventBusScopeMode.Global;

        public string EventTableTemplateName { get; set; }

        public string TagTableTemplateName { get; set; }

        public List<string> InitTagFilters { get; set; } = new List<string>();

        public bool EnableScopeCheckForLocal { get; set; } = true;

        public bool AllowTriggerTagAtRuntime { get; set; }

        public bool LogVerbose { get; set; }

        public bool LogPublishedEvents { get; set; }
    }
}
