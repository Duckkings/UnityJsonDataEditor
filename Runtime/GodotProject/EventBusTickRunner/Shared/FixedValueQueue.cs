using System;

namespace GameFramework;

// Capacity is a configuration budget. Never resize a combat command/event queue in a tick.
public sealed class FixedValueQueue<T> where T:struct
{
    private readonly T[] _buffer;
    private int _head,_count;
    public int Count=>_count;
    public int Capacity=>_buffer.Length;
    public FixedValueQueue(int capacity){if(capacity<1)throw new ArgumentOutOfRangeException(nameof(capacity));_buffer=new T[capacity];}
    public bool TryEnqueue(T value){if(_count==Capacity)return false;_buffer[(_head+_count)%Capacity]=value;_count++;return true;}
    public void Enqueue(T value){if(!TryEnqueue(value))throw new InvalidOperationException("Combat queue capacity exceeded.");}
    public T Dequeue(){if(_count==0)throw new InvalidOperationException("Combat queue is empty.");var value=_buffer[_head];_buffer[_head]=default;_head=(_head+1)%Capacity;_count--;return value;}
    public void Clear(){Array.Clear(_buffer);_head=_count=0;}
}
