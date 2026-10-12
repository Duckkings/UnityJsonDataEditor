using System;
using System.Collections;
using System.Collections.Generic;
using System.Runtime.CompilerServices;

namespace GameFramework;

public interface ITypedObjectSnapshotRegion
{
    void SetTyped<T>(string key,T value);
    bool TryGetTyped<T>(string key,out T value);
    bool TryGetNumber(string key,out double value);
}

// Handles resolve metadata once; values retain their actual T, including engine structs.
public readonly struct SnapshotField<T>
{
    internal readonly TypedSnapshotRegion Owner;
    internal readonly int Index,Generation;
    internal SnapshotField(TypedSnapshotRegion owner,int index,int generation){Owner=owner;Index=index;Generation=generation;}
    public bool IsValid=>Owner!=null&&Owner.Generation==Generation;
}

public sealed class TypedSnapshotRegion:IObjectSnapshotRegion,ITypedObjectSnapshotRegion
{
    private interface ISlot
    {
        string Key {get;}
        bool HasValue {get;}
        object Boxed();
        bool Number(out double value);
        bool SetBoxed(object value,bool pending);
        void Commit();void Cancel();
        void CopyTo(IObjectSnapshotRegion target,string key);
    }
    private sealed class Slot<T>:ISlot
    {
        public string Key {get;}
        public T Value,Next;
        public bool Present,NextPresent,Pending;
        private object _boxed;private bool _boxValid;
        public Slot(string key){Key=key;}
        public bool HasValue=>Present;
        public void Set(T value,bool pending)
        {
            if(pending){Next=value;NextPresent=true;Pending=true;return;}
            if(!Present||!EqualityComparer<T>.Default.Equals(Value,value))_boxValid=false;
            Value=value;Present=true;
        }
        public bool SetBoxed(object value,bool pending)
        {
            if(value is T typed){Set(typed,pending);return true;}
            if(value!=null)return false;
            if(pending){Next=default;NextPresent=false;Pending=true;}
            else{Value=default;Present=false;_boxed=null;_boxValid=false;}
            return true;
        }
        public object Boxed(){if(!Present)return null;if(!_boxValid){_boxed=Value;_boxValid=true;}return _boxed;}
        public bool Number(out double value)
        {
            value=0;if(!Present)return false;
            if(typeof(T)==typeof(float))value=Unsafe.As<T,float>(ref Value);
            else if(typeof(T)==typeof(double))value=Unsafe.As<T,double>(ref Value);
            else if(typeof(T)==typeof(int))value=Unsafe.As<T,int>(ref Value);
            else if(typeof(T)==typeof(uint))value=Unsafe.As<T,uint>(ref Value);
            else if(typeof(T)==typeof(long))value=Unsafe.As<T,long>(ref Value);
            else if(typeof(T)==typeof(ulong))value=Unsafe.As<T,ulong>(ref Value);
            else if(typeof(T)==typeof(bool))value=Unsafe.As<T,bool>(ref Value)?1:0;
            else return false;return true;
        }
        public void Commit(){if(!Pending)return;Pending=false;if(NextPresent)Set(Next,false);else SetBoxed(null,false);Next=default;}
        public void Cancel(){Pending=false;Next=default;NextPresent=false;}
        public void CopyTo(IObjectSnapshotRegion target,string key){if(Present)target.Set(key,Value);else target.Set(key,null);}
    }
    private sealed class LegacyView:IReadOnlyDictionary<string,object>
    {
        private readonly TypedSnapshotRegion _owner;
        public LegacyView(TypedSnapshotRegion owner){_owner=owner;}
        public int Count=>_owner._indices.Count;
        public IEnumerable<string> Keys=>_owner._indices.Keys;
        public IEnumerable<object> Values {get{foreach(var pair in _owner._indices)yield return _owner._slots[pair.Value].Boxed();}}
        public object this[string key]=>_owner._slots[_owner._indices[key]].Boxed();
        public bool ContainsKey(string key)=>_owner._indices.ContainsKey(key);
        public bool TryGetValue(string key,out object value)=>_owner.TryGet(key,out value);
        public IEnumerator<KeyValuePair<string,object>> GetEnumerator(){foreach(var pair in _owner._indices)yield return new(pair.Key,_owner._slots[pair.Value].Boxed());}
        IEnumerator IEnumerable.GetEnumerator()=>GetEnumerator();
    }
    private readonly Dictionary<string,int> _indices=new(StringComparer.Ordinal);
    private readonly List<ISlot> _slots=new(32);
    private readonly LegacyView _view;
    private bool _writing;private int _pendingWrites;
    public object Owner {get;}
    public string RegionName {get;}
    public int Version {get;private set;}
    public bool IsDirty {get;private set;}
    internal int Generation {get;private set;}
    public bool IsWriting=>_writing;
    public TypedSnapshotRegion(object owner,string name){Owner=owner??throw new ArgumentNullException(nameof(owner));RegionName=name??throw new ArgumentNullException(nameof(name));_view=new(this);}
    private static void Validate(string key){if(string.IsNullOrWhiteSpace(key))throw new ArgumentException("Snapshot key cannot be empty.",nameof(key));}
    private Slot<T> Resolve<T>(string key)
    {
        Validate(key);
        if(_indices.TryGetValue(key,out var i))
        {
            if(_slots[i] is Slot<T> slot)return slot;
            // A schema may change type at a configuration boundary. Legacy reads remain compatible.
            if(_writing)throw new InvalidOperationException("Register snapshot types before publication.");
            var next=new Slot<T>(key);_slots[i]=next;return next;
        }
        if(_writing)throw new InvalidOperationException("Register snapshot fields before publication.");
        var value=new Slot<T>(key);_indices.Add(key,_slots.Count);_slots.Add(value);return value;
    }
    public SnapshotField<T> RegisterField<T>(string key){Resolve<T>(key);return new(this,_indices[key],Generation);}
    public void Set<T>(SnapshotField<T> field,T value)
    {if(!ReferenceEquals(field.Owner,this)||!field.IsValid||_slots[field.Index] is not Slot<T> slot)throw new InvalidOperationException("Stale or foreign snapshot field.");slot.Set(value,_writing);Written();}
    public bool TryGet<T>(SnapshotField<T> field,out T value)
    {value=default;if(!ReferenceEquals(field.Owner,this)||!field.IsValid||_slots[field.Index] is not Slot<T> slot||!slot.Present)return false;value=slot.Value;return true;}
    public void SetTyped<T>(string key,T value){if(typeof(T)==typeof(object)){Set(key,(object)value);return;}Resolve<T>(key).Set(value,_writing);Written();}
    public void Set(string key,object value)
    {Validate(key);if(_indices.TryGetValue(key,out var i)&&_slots[i].SetBoxed(value,_writing)){Written();return;}Resolve<object>(key).Set(value,_writing);Written();}
    private void Written(){if(_writing)_pendingWrites++;else{Version++;IsDirty=true;}}
    public bool TryGetTyped<T>(string key,out T value)
    {
        value=default;if(key==null||!_indices.TryGetValue(key,out var i))return false;
        if(_slots[i] is Slot<T> slot&&slot.Present){value=slot.Value;return true;}
        if(_slots[i] is Slot<object> legacy&&legacy.Present&&legacy.Value is T typed){value=typed;return true;}
        if(!typeof(T).IsValueType&&_slots[i].Boxed() is T compatible){value=compatible;return true;}
        return false;
    }
    public bool TryGetNumber(string key,out double value){value=0;return key!=null&&_indices.TryGetValue(key,out var i)&&_slots[i].Number(out value);}
    public bool TryGet(string key,out object value){value=null;if(string.IsNullOrWhiteSpace(key)||!_indices.TryGetValue(key,out var i))return false;value=_slots[i].Boxed();return true;}
    public IReadOnlyDictionary<string,object> GetValues()=>_view;
    // Opt-in publication transaction. Existing synchronous module ordering remains immediate by default.
    public void BeginWrite(){if(_writing)throw new InvalidOperationException("Nested snapshot publication.");_writing=true;_pendingWrites=0;}
    public void CommitWrite(){if(!_writing)throw new InvalidOperationException("No snapshot publication.");foreach(var slot in _slots)slot?.Commit();_writing=false;Version+=_pendingWrites;IsDirty|=_pendingWrites>0;_pendingWrites=0;}
    public void CancelWrite(){foreach(var slot in _slots)slot?.Cancel();_writing=false;_pendingWrites=0;}
    public void CopyTo(IObjectSnapshotRegion target,Func<string,string> map=null,Action<string> visit=null)
    {foreach(var pair in _indices){var key=map==null?pair.Key:map(pair.Key);_slots[pair.Value].CopyTo(target,key);visit?.Invoke(key);}}
    public bool Remove(string key){if(!_indices.Remove(key,out var i))return false;_slots[i]=null;Generation++;return true;}
    public void Clear(){_indices.Clear();_slots.Clear();Generation++;_writing=false;_pendingWrites=0;}
}
