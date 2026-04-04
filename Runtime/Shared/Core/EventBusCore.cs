using System;
using System.Collections.Generic;

namespace GameFramework.Core
{
    public sealed class EventBusCore
    {
        private struct EventDef
        {
            public string EventName;
            public HashSet<string> Tags;
            public bool IsDeclaredFromTable;
        }

        private sealed class Subscription
        {
            public SubscriptionToken Token;
            public object Owner;
            public string Key;
            public bool IsTagSubscription;
            public Delegate Callback;
            public bool IsActive;
        }

        private static readonly object NoDataPayload = new object[] { "nodata" };

        private readonly string _busName;
        private readonly EventBusConfig _config;
        private readonly IRuntimeLogger _logger;
        private readonly ITimeProvider _timeProvider;
        private readonly IScopeResolver _scopeResolver;
        private readonly Dictionary<string, List<Subscription>> _eventSubs = new Dictionary<string, List<Subscription>>();
        private readonly Dictionary<string, List<Subscription>> _tagSubs = new Dictionary<string, List<Subscription>>();
        private readonly Dictionary<string, EventDef> _eventDefs = new Dictionary<string, EventDef>();
        private readonly HashSet<string> _validTags = new HashSet<string>();
        private readonly Dictionary<object, List<SubscriptionToken>> _ownerTokens = new Dictionary<object, List<SubscriptionToken>>();
        private readonly Dictionary<int, Subscription> _tokenToSub = new Dictionary<int, Subscription>();

        private int _nextTokenId = 1;
        private object _busOwner;
        private IDataTableRuntime _dbRuntime;

        public EventBusCore(string busName, EventBusConfig config, IRuntimeLogger logger, ITimeProvider timeProvider, IScopeResolver scopeResolver)
        {
            _busName = string.IsNullOrEmpty(busName) ? "<unnamed>" : busName;
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            _timeProvider = timeProvider ?? throw new ArgumentNullException(nameof(timeProvider));
            _scopeResolver = scopeResolver ?? throw new ArgumentNullException(nameof(scopeResolver));
        }

        public void Init(IDataTableRuntime dbRuntime, object busOwner)
        {
            if (_dbRuntime != null)
            {
                return;
            }

            _dbRuntime = dbRuntime ?? throw new ArgumentNullException(nameof(dbRuntime));
            _busOwner = busOwner;

            if (_config.LogVerbose)
            {
                _logger.Info($"[EventBus] Initialising bus '{_busName}' (mode={_config.Mode}).");
            }

            if (!string.IsNullOrEmpty(_config.TagTableTemplateName))
            {
                LoadTagsFromTable(_config.TagTableTemplateName);
            }
            else if (_config.LogVerbose)
            {
                _logger.Warning($"[EventBus] Tag table template name is empty on bus '{_busName}'. Tag validation will be skipped.");
            }

            if (!string.IsNullOrEmpty(_config.EventTableTemplateName))
            {
                var declared = LoadAndDeclareEventsFromTable(_config.EventTableTemplateName, _config.InitTagFilters);
                if (declared == 0)
                {
                    _logger.Warning($"[EventBus] No events declared after applying filters on bus '{_busName}'. Filters: {string.Join(", ", _config.InitTagFilters ?? new List<string>())}");
                }
            }
            else
            {
                _logger.Warning($"[EventBus] Event table template name is empty on bus '{_busName}'. No events will be declared by default.");
            }
        }

        public void RegisterCustomEvent(string eventName, string tagExpression)
        {
            if (string.IsNullOrEmpty(eventName))
            {
                return;
            }

            var tags = ParseTags(tagExpression);
            var validTagSet = new HashSet<string>();
            foreach (var tag in tags)
            {
                if (_validTags.Count > 0 && !_validTags.Contains(tag))
                {
                    _logger.Warning($"[EventBus] Custom event '{eventName}' references undefined tag '{tag}'. Tag will be ignored.");
                    continue;
                }

                validTagSet.Add(tag);
            }

            DeclareEvent(eventName, validTagSet, false);
        }

        public SubscriptionToken SubscribeEvent(object owner, string eventName, Action<object> onEvent)
        {
            if (owner == null || string.IsNullOrEmpty(eventName) || onEvent == null)
            {
                _logger.Warning($"[EventBus] SubscribeEvent called with invalid arguments on bus '{_busName}'.");
                return default;
            }

            if (RequiresScopeCheck() && !_scopeResolver.IsInScope(owner, _busOwner))
            {
                _logger.Warning($"[EventBus] Subscription rejected on bus '{_busName}': owner '{owner}' is not in the local scope of this bus.");
                return default;
            }

            var token = new SubscriptionToken(_nextTokenId++);
            var subscription = new Subscription
            {
                Token = token,
                Owner = owner,
                Key = eventName,
                IsTagSubscription = false,
                Callback = onEvent,
                IsActive = true
            };

            if (!_eventSubs.TryGetValue(eventName, out var list))
            {
                list = new List<Subscription>();
                _eventSubs[eventName] = list;
            }

            list.Add(subscription);
            _tokenToSub[token.Id] = subscription;
            TrackOwnerToken(owner, token);
            return token;
        }

        public SubscriptionToken SubscribeTag(object owner, string tagName, Action<EventEnvelope> onEnvelope)
        {
            if (owner == null || string.IsNullOrEmpty(tagName) || onEnvelope == null)
            {
                _logger.Warning($"[EventBus] SubscribeTag called with invalid arguments on bus '{_busName}'.");
                return default;
            }

            if (_validTags.Count > 0 && !_validTags.Contains(tagName))
            {
                _logger.Warning($"[EventBus] SubscribeTag rejected on bus '{_busName}': tag '{tagName}' is not defined.");
                return default;
            }

            if (RequiresScopeCheck() && !_scopeResolver.IsInScope(owner, _busOwner))
            {
                _logger.Warning($"[EventBus] Tag subscription rejected on bus '{_busName}': owner '{owner}' is not in local scope.");
                return default;
            }

            var token = new SubscriptionToken(_nextTokenId++);
            var subscription = new Subscription
            {
                Token = token,
                Owner = owner,
                Key = tagName,
                IsTagSubscription = true,
                Callback = onEnvelope,
                IsActive = true
            };

            if (!_tagSubs.TryGetValue(tagName, out var list))
            {
                list = new List<Subscription>();
                _tagSubs[tagName] = list;
            }

            list.Add(subscription);
            _tokenToSub[token.Id] = subscription;
            TrackOwnerToken(owner, token);
            return token;
        }

        public void PublishEvent(object sender, string eventName, object payload)
        {
            if (string.IsNullOrEmpty(eventName))
            {
                return;
            }

            var actualPayload = payload ?? NoDataPayload;
            List<string> eventTags;
            if (_eventDefs.TryGetValue(eventName, out var definition))
            {
                eventTags = new List<string>(definition.Tags);
            }
            else
            {
                _logger.Warning($"[EventBus] Publishing unknown event '{eventName}' on bus '{_busName}'. No tags will be dispatched unless event was declared previously.");
                eventTags = new List<string>();
            }

            if (_eventSubs.TryGetValue(eventName, out var subscriptions))
            {
                foreach (var subscription in subscriptions.ToArray())
                {
                    if (!subscription.IsActive)
                    {
                        continue;
                    }

                    if (subscription.Callback is Action<object> callback)
                    {
                        try
                        {
                            callback(actualPayload);
                        }
                        catch (Exception ex)
                        {
                            _logger.Error($"[EventBus] Exception in event subscriber for '{eventName}' on bus '{_busName}': {ex}");
                        }
                    }
                }
            }

            var envelope = new EventEnvelope
            {
                EventName = eventName,
                Tags = eventTags,
                BusOwner = _busOwner,
                Sender = sender,
                Time = _timeProvider.Now,
                Payload = actualPayload
            };

            foreach (var tag in eventTags)
            {
                if (!_tagSubs.TryGetValue(tag, out var tagSubscriptions))
                {
                    continue;
                }

                foreach (var subscription in tagSubscriptions.ToArray())
                {
                    if (!subscription.IsActive)
                    {
                        continue;
                    }

                    if (subscription.Callback is Action<EventEnvelope> callback)
                    {
                        try
                        {
                            callback(envelope);
                        }
                        catch (Exception ex)
                        {
                            _logger.Error($"[EventBus] Exception in tag subscriber for '{tag}' on bus '{_busName}': {ex}");
                        }
                    }
                }
            }
        }

        public void TriggerTagForTest(object sender, string tagName, string reasonEventName = "__DebugTagTrigger__", object payload = null)
        {
            if (!_config.AllowTriggerTagAtRuntime)
            {
                _logger.Warning($"[EventBus] TriggerTagForTest is disabled on bus '{_busName}'.");
                return;
            }

            if (string.IsNullOrEmpty(tagName))
            {
                return;
            }

            if (_validTags.Count > 0 && !_validTags.Contains(tagName))
            {
                _logger.Warning($"[EventBus] TriggerTagForTest rejected on bus '{_busName}': tag '{tagName}' is not defined.");
                return;
            }

            var envelope = new EventEnvelope
            {
                EventName = reasonEventName,
                Tags = new List<string> { tagName },
                BusOwner = _busOwner,
                Sender = sender,
                Time = _timeProvider.Now,
                Payload = payload ?? NoDataPayload
            };

            if (!_tagSubs.TryGetValue(tagName, out var subscriptions))
            {
                return;
            }

            foreach (var subscription in subscriptions.ToArray())
            {
                if (!subscription.IsActive)
                {
                    continue;
                }

                if (subscription.Callback is Action<EventEnvelope> callback)
                {
                    try
                    {
                        callback(envelope);
                    }
                    catch (Exception ex)
                    {
                        _logger.Error($"[EventBus] Exception in TriggerTagForTest subscriber for '{tagName}' on bus '{_busName}': {ex}");
                    }
                }
            }
        }

        public void Unsubscribe(SubscriptionToken token)
        {
            if (!token.IsValid || !_tokenToSub.TryGetValue(token.Id, out var subscription))
            {
                return;
            }

            subscription.IsActive = false;
            _tokenToSub.Remove(token.Id);

            if (subscription.IsTagSubscription)
            {
                if (_tagSubs.TryGetValue(subscription.Key, out var tagSubscriptions))
                {
                    tagSubscriptions.Remove(subscription);
                }
            }
            else if (_eventSubs.TryGetValue(subscription.Key, out var eventSubscriptions))
            {
                eventSubscriptions.Remove(subscription);
            }
        }

        public void UnsubscribeAll(object owner)
        {
            if (owner == null || !_ownerTokens.TryGetValue(owner, out var tokens))
            {
                return;
            }

            foreach (var token in tokens)
            {
                if (token.IsValid)
                {
                    Unsubscribe(token);
                }
            }

            _ownerTokens.Remove(owner);
        }

        public void DumpSubscribersOfEvent(string eventName)
        {
            _logger.Info($"[EventBus] Subscribers of event '{eventName}' on bus '{_busName}':");
            if (_eventSubs.TryGetValue(eventName, out var subscriptions))
            {
                foreach (var subscription in subscriptions)
                {
                    _logger.Info($" - owner={subscription.Owner}, active={subscription.IsActive}");
                }
            }
            else
            {
                _logger.Info(" (none)");
            }
        }

        public void DumpSubscribersOfTag(string tagName)
        {
            _logger.Info($"[EventBus] Subscribers of tag '{tagName}' on bus '{_busName}':");
            if (_tagSubs.TryGetValue(tagName, out var subscriptions))
            {
                foreach (var subscription in subscriptions)
                {
                    _logger.Info($" - owner={subscription.Owner}, active={subscription.IsActive}");
                }
            }
            else
            {
                _logger.Info(" (none)");
            }
        }

        private void LoadTagsFromTable(string tagTemplate)
        {
            if (_config.LogVerbose)
            {
                _logger.Info($"[EventBus] Loading tags from template '{tagTemplate}' for bus '{_busName}'.");
            }

            EventBusTableSchema schema;
            try
            {
                schema = _dbRuntime.GetSchema(tagTemplate);
            }
            catch (Exception ex)
            {
                _logger.Error($"[EventBus] Failed to load tag schema '{tagTemplate}': {ex.Message}");
                return;
            }

            if (schema == null || schema.instances == null)
            {
                _logger.Warning($"[EventBus] Tag schema '{tagTemplate}' has no instances. No tags loaded.");
                return;
            }

            var seenTags = new HashSet<string>();
            foreach (var pair in schema.instances)
            {
                var instance = pair.Value;
                if (instance == null)
                {
                    continue;
                }

                var tagName = instance.GetString("name", string.Empty);
                if (string.IsNullOrEmpty(tagName))
                {
                    continue;
                }

                if (!seenTags.Add(tagName))
                {
                    _logger.Warning($"[EventBus] Duplicate tag '{tagName}' in tag table '{tagTemplate}'. Skipping duplicate.");
                    continue;
                }

                _validTags.Add(tagName);
            }

            if (_config.LogVerbose)
            {
                _logger.Info($"[EventBus] Loaded {_validTags.Count} valid tags for bus '{_busName}'.");
            }
        }

        private int LoadAndDeclareEventsFromTable(string eventTemplate, List<string> filters)
        {
            if (_config.LogVerbose)
            {
                _logger.Info($"[EventBus] Loading events from template '{eventTemplate}' for bus '{_busName}'.");
            }

            EventBusTableSchema schema;
            try
            {
                schema = _dbRuntime.GetSchema(eventTemplate);
            }
            catch (Exception ex)
            {
                _logger.Error($"[EventBus] Failed to load event schema '{eventTemplate}': {ex.Message}");
                return 0;
            }

            if (schema == null || schema.instances == null)
            {
                _logger.Warning($"[EventBus] Event schema '{eventTemplate}' has no instances. No events declared.");
                return 0;
            }

            var declaredCount = 0;
            var seenEventNames = new HashSet<string>();
            foreach (var pair in schema.instances)
            {
                var instance = pair.Value;
                if (instance == null)
                {
                    continue;
                }

                var eventName = instance.GetString("name", string.Empty);
                if (string.IsNullOrEmpty(eventName))
                {
                    continue;
                }

                if (!seenEventNames.Add(eventName))
                {
                    _logger.Warning($"[EventBus] Duplicate event name '{eventName}' in event table '{eventTemplate}'. Skipping duplicate.");
                    continue;
                }

                var tagExpression = instance.GetString("tags", string.Empty);
                var tags = ParseTags(tagExpression);
                var validTagSet = new HashSet<string>();
                foreach (var tag in tags)
                {
                    if (_validTags.Count > 0 && !_validTags.Contains(tag))
                    {
                        _logger.Warning($"[EventBus] Event '{eventName}' references undefined tag '{tag}'. Tag will be ignored.");
                        continue;
                    }

                    validTagSet.Add(tag);
                }

                if (filters != null && filters.Count > 0 && !IsEventMatchedFilters(validTagSet, filters))
                {
                    if (_config.LogVerbose)
                    {
                        _logger.Info($"[EventBus] Skipping event '{eventName}' due to filters on bus '{_busName}'.");
                    }

                    continue;
                }

                DeclareEvent(eventName, validTagSet, true);
                declaredCount++;
            }

            if (_config.LogVerbose)
            {
                _logger.Info($"[EventBus] Declared {declaredCount} events for bus '{_busName}'.");
            }

            return declaredCount;
        }

        private bool IsEventMatchedFilters(HashSet<string> eventTags, List<string> filters)
        {
            foreach (var filter in filters)
            {
                if (string.IsNullOrEmpty(filter))
                {
                    continue;
                }

                var allPresent = true;
                var requiredTags = filter.Split(new[] { '|', ',' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (var requiredTag in requiredTags)
                {
                    if (!eventTags.Contains(requiredTag))
                    {
                        allPresent = false;
                        break;
                    }
                }

                if (allPresent)
                {
                    return true;
                }
            }

            return false;
        }

        private void DeclareEvent(string eventName, HashSet<string> tags, bool fromTable)
        {
            if (_eventDefs.ContainsKey(eventName))
            {
                _logger.Warning($"[EventBus] Attempt to redeclare event '{eventName}' on bus '{_busName}'. Original declaration is retained.");
                return;
            }

            _eventDefs[eventName] = new EventDef
            {
                EventName = eventName,
                Tags = tags,
                IsDeclaredFromTable = fromTable
            };
        }

        private void TrackOwnerToken(object owner, SubscriptionToken token)
        {
            if (!_ownerTokens.TryGetValue(owner, out var tokens))
            {
                tokens = new List<SubscriptionToken>();
                _ownerTokens[owner] = tokens;
            }

            tokens.Add(token);
        }

        private bool RequiresScopeCheck()
        {
            return _config.Mode == EventBusScopeMode.Local && _config.EnableScopeCheckForLocal;
        }

        private static HashSet<string> ParseTags(string tagExpression)
        {
            var result = new HashSet<string>();
            if (string.IsNullOrEmpty(tagExpression))
            {
                return result;
            }

            var parts = tagExpression.Split(new[] { '|', ',' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var part in parts)
            {
                var trimmed = part.Trim();
                if (!string.IsNullOrEmpty(trimmed))
                {
                    result.Add(trimmed);
                }
            }

            return result;
        }
    }
}
