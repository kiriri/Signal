// Computed signals will add a set to this when they get their value.
// Any other signal whose value is used will automatically add itself to the last array.

import { Dirtyable, I_Subscribable, StatefulSubscribable, Subscribable } from "./Subscribable";

/**
 * Represents a computed signal that dynamically computes its value based on other signals.
 */
export class Computed<T> extends Subscribable<T> implements StatefulSubscribable<T>, Dirtyable
{
    // This computed signal is currently listening to any change in any of these subscribables.
    // These subscribables are bound up in fn, so we don't have to worry about weakly referencing them here either.
    subscribed_to: Map<Subscribable<any>, number> = new Map();

    // The function that is called to compute the current value of this Subscribable.
    fn: () => T;

    _dirty = true;
    _cache !: T;
    _eager !: boolean;

    /**
     * Creates a new Computed signal with a function that computes its value.
     * @param fn - The function that computes the value of the computed signal.
     * @param [eager=false] If true, acts like a sink/effect, as in it does not wait to run the function until get() is called. Default false.
     */
    constructor(fn: () => T, eager = false)
    {
        super();

        this.fn = fn;
        this._eager = eager;

        // Instantly run the function to subscribe to the relevant dependencies.
        this._cache = this._get();
    }

    /**
     * Only propagates dirty state when its not already propagated 
     * ( ie no dependent signal has bothered to get this computed since )
     * This is a performance saving measure.
     * @param source 
     * @returns 
     */
    override dirty(source?: I_Subscribable<any>)
    {
        if (this._dirty)
            return this;
        this._dirty = true;

        // Propagate the dirty state.
        super.dirty(source);

        // recalculate and propagate when we can be sure that all dependencies updated.
        if(this.subscribers || this._eager)
        {
            Subscribable.register_async_emit(()=>this.emit(this.get()))
        }

        return this;
    };

    get()
    {
        // If this computed type is called inside of another computed type:
        // store the parent listener and replace it with its own for a bit.
        if (Subscribable.global_listeners)
        {
            Subscribable.global_listeners.push(this);
        }

        // if it's dirty, or if its in a transaction which delayed the dirty signal, recalculate the value
        if (this._dirty)
            return this._get();

        return this._cache;
    }

    /**
     * Computes the current value of the computed signal and subscribes to any signals it depends on.
     * @returns The current value of the computed signal.
     */
    _get()
    {
        this._dirty = false;


        let parent_listeners = Subscribable.global_listeners;
        const global_listeners = Subscribable.global_listeners = <Subscribable<any>[]>[];
        Subscribable.global_listeners = global_listeners;

        let value = this.fn();

        // Set all states to 0.
        for (let sub of this.subscribed_to.keys())
        {
            this.subscribed_to.set(sub, 0);
        }

        for (let sub of global_listeners)
        {
            if (this.subscribed_to.has(sub))
            {
                // mark it as unchanged
                if (this.subscribed_to.get(sub) === 0)
                    this.subscribed_to.set(sub, 1);
            }
            else
            {
                // specially mark it as new.
                this.subscribed_to.set(sub,-1);
            }
        }

        for(let [signal,status] of this.subscribed_to)
        {
            switch(status)
            {
                // Newly added
                case -1:
                    signal.subscribe(this);
                    break
                // Status 0 means it's no longer used
                case 0:
                    signal.unsubscribe(this);
                    break;
                
                // We can ignore 1 (same old)
            }
        }

        // let unique_subscription: Subscribable<any>[] = [];

        // const set = new Set(this.subscribed_to);
        // const new_set = new Set(global_listeners);


        // for (let i = 0; i < this.subscribed_to.length; i++)
        // {
        //     const signal = this.subscribed_to[i];
        //     if (!new_set.has(signal))
        //     {
        //         signal.unsubscribe(this)
        //     }
        //     else
        //     {
        //         unique_subscription.push(signal);
        //     }
        // }

        // for (let i = 0; i < global_listeners.length; i++)
        // {
        //     const signal = global_listeners[i];
        //     if (!set.has(signal))
        //     {
        //         signal.subscribe(this);
        //         set.add(signal);
        //         unique_subscription.push(signal);
        //     }
        // }

        // this.subscribed_to = unique_subscription;

        // If this was called inside another computed signal, switch back to that ones listeners so it can continue on.
        // If it was not inside another listener, set listeners to undefined!
        Subscribable.global_listeners = parent_listeners;

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
        for(let sub of [...this.subscribed_to.keys()])
        {
            sub.unsubscribe(this);
        }

        this.subscribed_to.clear();
    }
}
