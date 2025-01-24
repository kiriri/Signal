// Computed signals will add a set to this when they get their value.
// Any other signal whose value is used will automatically add itself to the last array.

import { uid, uid2 } from "./Shared/UID";
import { StatefulSubscribable, Subscribable } from "./Subscribable";

/**
 * Represents a computed signal that dynamically computes its value based on other signals.
 */
export class Computed<T> extends Subscribable<T> implements StatefulSubscribable<T>
{
    // This computed signal is currently listening to any change in any of these subscribables.
    // These subscribables are bound up in fn, making this a WeakSet likely has little to no effect.
    subscribed_to: Subscribable<any>[] = [];

    // The function that is called to compute the current value of this Subscribable.
    fn: () => T;

    _dirty = true;
    _cache: T;

    readonly uid = uid2();

    /**
     * Creates a new Computed signal with a function that computes its value.
     * @param fn - The function that computes the value of the computed signal.
     */
    constructor(fn: () => T)
    {
        super();
        this.fn = fn;

        // Call it once to subscribe to all signals.
        this._cache = this._get();
    }

    // subscribe(fn: (value: T) => any): this
    // {
    //     super.subscribe(fn);

    //     fn(this.get());

    //     return this;
    // }

    on_constituent_signal_change = () =>
    {
        // Don't call _get() unless actual subscribers exist
        if (this.subscribers)
            this.emit(this._get());
        // If no subscribers exist, defer the update until the value is requested.
        else
        {
            this._dirty = true;
        }
    }

    get()
    {
        // if it's dirty, or if its in a transaction which delayed the dirty signal, recalculate the value
        if (this._dirty || Subscribable.global_transaction_depth && Subscribable.global_transactions.has(this.on_constituent_signal_change))
        {
            return this._get();
        }
        return this._cache;
    }

    /**
     * Computes the current value of the computed signal and subscribes to any signals it depends on.
     * @returns The current value of the computed signal.
     */
    _get()
    {
        this._dirty = false;

        // If this computed type is called inside of another computed type:
        // store the parent listener and replace it with its own for a bit.
        let parent_listeners = Subscribable.global_listeners;
        if (Subscribable.global_listeners)
        {
            parent_listeners.push(this);
        }
        const global_listeners = Subscribable.global_listeners = <Subscribable<any>[]>[];

        let value = this.fn();

        // const unique_listeners = new Set(global_listeners);

        // let news = global_listeners.difference(this.subscribed_to)

        let unique_subscription: Subscribable<any>[] = [];
        let pass = uid2();

        // iterate all listeners
        for (let i = 0; i < global_listeners.length; i++)
        {
            const signal = global_listeners[i];
            const existing_pass = (signal as any)[this.uid];
            // Skip duplicates
            if (existing_pass === pass)
                continue;
            (signal as any)[this.uid] = pass; // remember in case of duplicates
            // Skip already subscribed ones
            if (existing_pass)
                continue;
            signal.subscribe(this.on_constituent_signal_change);
            unique_subscription.push(signal);
        }
        // delete old listeners, which didn't appear in the new pass
        for (let i = 0; i < this.subscribed_to.length; i++)
        {
            const signal = this.subscribed_to[i];
            if ((signal as any)[this.uid] !== pass)
                signal.unsubscribe(this.on_constituent_signal_change)
        }


        this.subscribed_to = unique_subscription;

        // If this was called inside another computed signal, switch back to that ones listeners so it can continue on.
        // If it was not inside another listener, set listeners to undefined!
        Subscribable.global_listeners = parent_listeners;

        this._cache = value;


        return value;
    }
}
