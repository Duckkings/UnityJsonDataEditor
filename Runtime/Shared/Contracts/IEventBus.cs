using System;

namespace GameFramework
{
    public interface IEventBus
    {
        void Init(IDataTableRuntime dbRuntime);

        void Init(IDataTableRuntime dbRuntime, object busOwner);

        void RegisterCustomEvent(string eventName, string tagExpression);

        SubscriptionToken SubscribeEvent(object owner, string eventName, Action<object> onEvent);

        SubscriptionToken SubscribeTag(object owner, string tagName, Action<EventEnvelope> onEnvelope);

        void PublishEvent(object sender, string eventName, object payload);

        void TriggerTagForTest(object sender, string tagName, string reasonEventName = "__DebugTagTrigger__", object payload = null);

        void Unsubscribe(SubscriptionToken token);

        void UnsubscribeAll(object owner);

        void DumpSubscribersOfEvent(string eventName);

        void DumpSubscribersOfTag(string tagName);
    }
}
