

import { Dirtyable, I_Subscribable, LinkedList, StatefulSubscribable, Subscribable } from "./Subscribable";

/**
 * Represents a real Subscribable value that is stored in this Signal. 
 */
export class NativeSignal<T> extends Subscribable<T> implements StatefulSubscribable<T>
{

    // The internal value. Only get it directly if you want to make sure no computed type subscribes to it.
    _value: T;
    queued: boolean = false;

    /**
     * Creates a new Signal with an initial value.
     * @param value - The initial value of the signal.
     */
    constructor(value: T)
    {
        super();
        this._value = value;
    }

    /**
     * Gets the current value of the signal.
     * If called inside another computed signal, it will add itself to the list of listeners.
     * @returns The current value of the signal.
     */
    get(): T
    {
        if (Subscribable.global_listeners)
            Subscribable.global_listeners.push(this);
        return this._value;
    }

    /**
     * Sets a new value for the signal and emits it to all subscribers.
     * @param value - The new value to set.
     */
    set(value: T): void
    {
        if (value === this._value)
            return;
        this._value = value;
        this.dirty(this,undefined,value);
    }

    update(fn: (v: T) => T)
    {
        // this.set(fn(this._value));
        const value = fn(this._value);
        if (value === this._value)
            return;
        this._value = value;
        this.dirty(this,undefined,value)
    }

    override dirty(source: this, ref?: LinkedList<T>, value?:T)
    {
        // If it's queued for emit(), 
        // then it stands to reason that it has propagated dirty as well.
        if(this.queued) 
            return this;

        if (this.subscribers !== undefined)
        {
            this.queued = true;
            Subscribable.register_async_emit(this.on_emit, this);
        }

        super.dirty(source,ref);

        return this;
    }

    on_emit(context:this)
    {
        context.queued = false;
        context.emit(context._value);
    }


    // override emit(value: T = this._value)
    // {
    //     this.queued = false;
    //     return super.emit(value);
    // }
}

export type ReadonlySignal<T> = Omit<NativeSignal<T>,"set">;