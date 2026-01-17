// Computed signals will add a set to this when they get their value.
// Any other signal whose value is used will automatically add itself to the last array.

import { Flatten } from "src/_decorators/flatten";
import EventManager from "./_Events";
import { Dirtyable, I_Subscribable, LinkedList, StatefulSubscribable, Subscribable } from "./Subscribable";

/**
 * Represents a computed signal that dynamically computes its value based on other signals.
 */
@Flatten()
export class Computed<T, CONTEXT=any> extends Subscribable<T> implements StatefulSubscribable<T>, Dirtyable
{
    // This computed signal is currently listening to any change in any of these subscribables.
    // These subscribables are bound up in fn, so we don't have to worry about weakly referencing them here either.
    subscribed_to: { signal: Subscribable<any>, ref: any}[] = [];

    // The function that is called to compute the current value of this Subscribable.
    readonly fn: (self:CONTEXT) => T;
    readonly context:CONTEXT;

    _dirty: boolean | "first" = true;
    _cache !: T;
    _eager !: boolean;

    /**
     * Creates a new Computed signal with a function that computes its value.
     * @param fn - The function that computes the value of the computed signal.
     * @param [eager=false] If true, acts like a sink/effect, as in it does not wait to run the function until get() is called. Default false.
     */
    constructor(fn: (self:CONTEXT) => T, context?:CONTEXT, eager = false)
    {
        super();

        this.fn = fn;
        this.context = context;
        this._eager = eager;

        // Instantly run the function to subscribe to the relevant dependencies.
        if (eager)
        {
            this._cache = this._get();
        }
        // don't subscribe unless someone shows interest by calling get() or subscribe()
        else
        {
            this._dirty = "first";
        }
    }

    /**
     * Only propagates dirty state when its not already propagated 
     * ( ie no dependent signal has bothered to get this computed since )
     * This is a performance saving measure.
     * @param source 
     * @returns 
     */
    override dirty(source?: I_Subscribable<any>, ref?: LinkedList<any>)
    {
        if (this._dirty)
            return;
        this._dirty = true;

        // Propagate the dirty state.
        super.dirty(source, ref);

        // recalculate and propagate when we can be sure that all dependencies updated.
        if (this.subscribers !== undefined || this._eager)
        {
            EventManager.register_async_emit(() => this.emit(this.get()))
        }

        // return this;
    };

    get()
    {
        // If this computed type is called inside of another computed type:
        // store the parent listener and replace it with its own for a bit.
        if (EventManager.global_listeners !== null)
        {
            EventManager.global_listeners.push(this);
        }

        // if it's dirty, or if its in a transaction which delayed the dirty signal, recalculate the value
        if (this._dirty)
            return this._get();

        return this._cache;
    }

    override subscribe(
        subscribable: Dirtyable
    ): LinkedList<WeakRef<Dirtyable>>;
    override subscribe(
        subscribable: (source: I_Subscribable<T>, value: T, ref: LinkedList<T>) => any | void
    ): LinkedList<WeakRef<(source: I_Subscribable<T>, value: T, ref: LinkedList<T>) => any | void>>;
    override subscribe(
        fn: ((source: I_Subscribable<T>, value: T, ref: LinkedList<T>) => any) | Dirtyable
    ): LinkedList<WeakRef<Dirtyable | ((source: I_Subscribable<T>, value: T, ref: LinkedList<T>) => any)>>
    {
        if (this._dirty === "first")
        {
            this._get();  // initialize subscribers 
        }

        return super.subscribe(arguments[0]);
    }

    /**
     * Computes the current value of the computed signal and subscribes to any signals it depends on.
     * @returns The current value of the computed signal.
     */
    _get()
    {
        this._dirty = false;

        let parent_listeners = EventManager.global_listeners;
        const global_listeners = EventManager.global_listeners = <Subscribable<any>[]>[];
        EventManager.global_listeners = global_listeners;

        let value = this.fn(this.context);

        // subscribing and unsubscribing is *really* optimized, making it faster
        // than any Set/Map difference we could possibly come up with here.
        // And yes, just unsubscribing and resubscribing again and again looks 0 IQ,
        // but I tested this quite thoroughly.

        let subscribed_to = this.subscribed_to;
        
        const l1 = subscribed_to.length;
        for(let i = 0; i < l1; i++)
        {
            let {ref, signal} = subscribed_to[i];

            signal.unsubscribe(ref);
        }

        const length = global_listeners.length;
        for (let i = 0; i < length; i++)
        {
            const sub = global_listeners[i];

            // Avoid push if the array is already sufficiently sized
            if(i < l1)
            {
                // we'll reuse
                let existing = subscribed_to[i];
                existing.ref = sub.depend(this);
                existing.signal = sub;
            }
            else
                subscribed_to.push({
                    signal:sub,
                    ref: sub.depend(this)
                });
        }
        
        // Shrink the array if the number of subscribed to signals decreased.
        if(length<l1)
            subscribed_to.length = length;

        // If this was called inside another computed signal, switch back to that ones listeners so it can continue on.
        // If it was not inside another listener, set listeners to undefined!
        EventManager.global_listeners = parent_listeners;

        this._cache = value;

        // this.emit(this._cache)


        return value;
    }

    /**
     * Stop any future update of this computed.
     * Call _get() to undo this.
     */
    destroy()
    {
        this._dirty = false;
        for (let sub of this.subscribed_to)
        {
            sub[0].unsubscribe(sub[1].ref);
        }

        this.subscribed_to.length = 0;
    }
}
