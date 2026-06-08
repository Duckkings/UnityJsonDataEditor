using System.Collections.Generic;

namespace GameFramework
{
    public struct EventEnvelope
    {
        public string EventName;
        public List<string> Tags;
        public object BusOwner;
        public object Sender;
        public float Time;
        public object Payload;
    }
}
