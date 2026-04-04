using System;
using System.Collections.Generic;
using GameFramework;
using GameFramework.Adapters.Unity;
using GameFramework.Core;
using UnityEngine;

public class EventBus : MonoBehaviour, IEventBus
{
    public enum BusMode
    {
        Global,
        Local
    }

    public struct Envelope
    {
        public string eventName;
        public List<string> tags;
        public Transform busOwner;
        public Transform sender;
        public float time;
        public object payload;

        internal static Envelope FromEnvelope(EventEnvelope envelope)
        {
            return new Envelope
            {
                eventName = envelope.EventName,
                tags = envelope.Tags,
                busOwner = envelope.BusOwner as Transform,
                sender = envelope.Sender as Transform,
                time = envelope.Time,
                payload = envelope.Payload
            };
        }
    }

    [Header("Configuration")]
    [Tooltip("选择此总线是全局还是本地。本地总线限制订阅者必须在其子层级中。")]
    public BusMode mode = BusMode.Global;

    [Tooltip("要加载的事件表模板名称，必须在运行时数据系统中定义。")]
    public string eventTableTemplateName;

    [Tooltip("要加载的标签表模板名称，必须在运行时数据系统中定义。")]
    public string tagTableTemplateName;

    [Tooltip("用于声明事件的过滤列表。每个元素使用 '|' 表示 AND，列表之间为 OR。")]
    public List<string> initTagFilters = new List<string>();

    [Tooltip("对于本地总线，限制订阅者必须位于此 Transform 的子树下。")]
    public bool enableScopeCheckForLocal = true;

    [Tooltip("是否允许运行时直接调用 TriggerTagForTest()。仅用于调试。")]
    public bool allowTriggerTagAtRuntime = false;

    [Tooltip("启用时在初始化和派发期间输出详细日志。")]
    public bool logVerbose = false;

    private readonly UnityRuntimeLogger _logger = new UnityRuntimeLogger();
    private readonly UnityTimeProvider _timeProvider = new UnityTimeProvider();
    private readonly UnityScopeResolver _scopeResolver = new UnityScopeResolver();

    private EventBusCore _core;

    public void Init(IDataTableRuntime dbRuntime)
    {
        Init(dbRuntime, null);
    }

    public void Init(IDataTableRuntime dbRuntime, object busOwner)
    {
        EnsureCore().Init(dbRuntime, ResolveBusOwner(busOwner));
    }

    public void RegisterCustomEvent(string eventName, string tagExpression)
    {
        EnsureCore().RegisterCustomEvent(eventName, tagExpression);
    }

    public SubscriptionToken SubscribeEvent(object owner, string eventName, Action<object> onEvent)
    {
        return EnsureCore().SubscribeEvent(owner, eventName, onEvent);
    }

    public SubscriptionToken SubscribeTag(object owner, string tagName, Action<Envelope> onEnvelope)
    {
        if (onEnvelope == null)
        {
            return default;
        }

        return EnsureCore().SubscribeTag(owner, tagName, envelope => onEnvelope(Envelope.FromEnvelope(envelope)));
    }

    SubscriptionToken IEventBus.SubscribeTag(object owner, string tagName, Action<EventEnvelope> onEnvelope)
    {
        return EnsureCore().SubscribeTag(owner, tagName, onEnvelope);
    }

    public void PublishEvent(object sender, string eventName, object payload)
    {
        EnsureCore().PublishEvent(sender, eventName, payload);
    }

    public void PublishEvent(Transform sender, string eventName, object payload)
    {
        PublishEvent((object)sender, eventName, payload);
    }

    public void TriggerTagForTest(object sender, string tagName, string reasonEventName = "__DebugTagTrigger__", object payload = null)
    {
        EnsureCore().TriggerTagForTest(sender, tagName, reasonEventName, payload);
    }

    public void TriggerTagForTest(Transform sender, string tagName, string reasonEventName = "__DebugTagTrigger__", object payload = null)
    {
        TriggerTagForTest((object)sender, tagName, reasonEventName, payload);
    }

    public void Unsubscribe(SubscriptionToken token)
    {
        EnsureCore().Unsubscribe(token);
    }

    public void UnsubscribeAll(object owner)
    {
        EnsureCore().UnsubscribeAll(owner);
    }

    public void UnsubscribeAll(UnityEngine.Object owner)
    {
        UnsubscribeAll((object)owner);
    }

    public void DumpSubscribersOfEvent(string eventName)
    {
        EnsureCore().DumpSubscribersOfEvent(eventName);
    }

    public void DumpSubscribersOfTag(string tagName)
    {
        EnsureCore().DumpSubscribersOfTag(tagName);
    }

    private EventBusCore EnsureCore()
    {
        if (_core == null)
        {
            _core = new EventBusCore(name, BuildConfig(), _logger, _timeProvider, _scopeResolver);
        }

        return _core;
    }

    private EventBusConfig BuildConfig()
    {
        return new EventBusConfig
        {
            Mode = mode == BusMode.Local ? EventBusScopeMode.Local : EventBusScopeMode.Global,
            EventTableTemplateName = eventTableTemplateName,
            TagTableTemplateName = tagTableTemplateName,
            InitTagFilters = initTagFilters ?? new List<string>(),
            EnableScopeCheckForLocal = enableScopeCheckForLocal,
            AllowTriggerTagAtRuntime = allowTriggerTagAtRuntime,
            LogVerbose = logVerbose
        };
    }

    private object ResolveBusOwner(object busOwner)
    {
        if (busOwner is Transform ownerTransform)
        {
            return ownerTransform;
        }

        return transform;
    }
}
