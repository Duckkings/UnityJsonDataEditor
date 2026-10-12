using System;
using System.Collections.Generic;

namespace GameFramework
{
    public interface IValueEventBus
    {
        SubscriptionToken SubscribeValueEvent<T>(object owner,string name,Action<T> callback,Func<object,T> legacy=null) where T:struct;
        void PublishValueEvent<T>(object sender,string name,T value) where T:struct;
        bool RequiresLegacyEventPayload(string name);
    }
}
namespace GameFramework.Core
{
    public sealed partial class EventBusCore
    {
        private interface IValueSink {void InvokeLegacy(object value);}
        private sealed class ValueSink<T>:IValueSink where T:struct
        {
            public readonly Action<T> Callback;private readonly Func<object,T> _legacy;
            public ValueSink(Action<T> callback,Func<object,T> legacy){Callback=callback;_legacy=legacy;}
            public void InvokeLegacy(object value){if(value is T typed)Callback(typed);else if(_legacy!=null)Callback(_legacy(value));}
        }
        public SubscriptionToken SubscribeValueEvent<T>(object owner,string name,Action<T> callback,Func<object,T> legacy=null) where T:struct
        {
            if(owner==null||string.IsNullOrEmpty(name)||callback==null)return default;
            if(RequiresScopeCheck()&&!_scopeResolver.IsInScope(owner,_busOwner))return default;
            var token=new SubscriptionToken(_nextTokenId++);
            var sub=new Subscription{Token=token,Owner=owner,Key=name,Callback=new ValueSink<T>(callback,legacy),IsActive=true};
            if(!_eventSubs.TryGetValue(name,out var list))_eventSubs[name]=list=new();
            list.Add(sub);_subscriptionSnapshots.Remove(list);_tokenToSub[token.Id]=sub;TrackOwnerToken(owner,token);return token;
        }
        public bool RequiresLegacyEventPayload(string name)
        {
            if(_config.LogPublishedEvents)return true;
            if(_eventSubs.TryGetValue(name,out var subs))foreach(var sub in subs)if(sub.IsActive&&sub.Callback is Action<object>)return true;
            if(_eventDefs.TryGetValue(name,out var def))foreach(var tag in def.Tags)
                if(_tagSubs.TryGetValue(tag,out var tagged))foreach(var sub in tagged)if(sub.IsActive)return true;
            return false;
        }
        public void PublishValueEvent<T>(object sender,string name,T value) where T:struct
        {
            if(string.IsNullOrEmpty(name))return;
            IReadOnlyList<string> tags=Array.Empty<string>();
            if(_eventDefs.TryGetValue(name,out var def))tags=def.PublishedTags;
            else _logger.Warning($"[EventBus] Publishing unknown value event '{name}' on bus '{_busName}'.");
            object boxed=null;
            if(_config.LogPublishedEvents){boxed=value;_logger.Info(BuildPublishLogMessage(sender,name,boxed,tags));}
            if(_eventSubs.TryGetValue(name,out var list))foreach(var sub in DispatchSnapshot(list))
            {
                if(!sub.IsActive)continue;
                try
                {
                    if(sub.Callback is ValueSink<T> typed)typed.Callback(value);
                    else if(sub.Callback is Action<object> legacy){boxed??=value;legacy(boxed);}
                }
                catch(Exception ex){_logger.Error($"[EventBus] Value subscriber '{name}': {ex}");}
            }
            // Legacy envelopes retain independent payload boxes; never borrow a mutable pooled payload.
            for(int i=0;i<tags.Count;i++)if(_tagSubs.TryGetValue(tags[i],out var tagged))
                foreach(var sub in DispatchSnapshot(tagged))
                {
                    if(!sub.IsActive||sub.Callback is not Action<EventEnvelope> callback)continue;
                    boxed??=value;
                    try{callback(new EventEnvelope{EventName=name,Tags=tags,Sender=sender,BusOwner=_busOwner,Time=_timeProvider.Now,Payload=boxed});}
                    catch(Exception ex){_logger.Error($"[EventBus] Value tag subscriber '{tags[i]}': {ex}");}
                }
        }
    }
}
