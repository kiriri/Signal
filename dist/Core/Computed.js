// Computed signals will add a set to this when they get their value.
// Any other signal whose value is used will automatically add itself to the last array.
import { Subscribable } from "./Subscribable";
/**
 * Represents a computed signal that dynamically computes its value based on other signals.
 */
export class Computed extends Subscribable {
    // This computed signal is currently listening to any change in any of these subscribables.
    // These subscribables are bound up in fn, so we don't have to worry about weakly referencing them here either.
    subscribed_to = new Map();
    // The function that is called to compute the current value of this Subscribable.
    fn;
    _dirty = true;
    _cache;
    _eager;
    /**
     * Creates a new Computed signal with a function that computes its value.
     * @param fn - The function that computes the value of the computed signal.
     * @param [eager=false] If true, acts like a sink/effect, as in it does not wait to run the function until get() is called. Default false.
     */
    constructor(fn, eager = false) {
        super();
        this.fn = fn;
        this._eager = eager;
        // Instantly run the function to subscribe to the relevant dependencies.
        if (eager) {
            this._cache = this._get();
        }
        // don't subscribe unless someone shows interest by calling get() or subscribe()
        else {
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
    dirty(source) {
        if (this._dirty)
            return this;
        this._dirty = true;
        // Propagate the dirty state.
        super.dirty(source);
        // recalculate and propagate when we can be sure that all dependencies updated.
        if (this.subscribers || this._eager) {
            Subscribable.register_async_emit(() => this.emit(this.get()));
        }
        return this;
    }
    ;
    get() {
        // If this computed type is called inside of another computed type:
        // store the parent listener and replace it with its own for a bit.
        if (Subscribable.global_listeners) {
            Subscribable.global_listeners.push(this);
        }
        // if it's dirty, or if its in a transaction which delayed the dirty signal, recalculate the value
        if (this._dirty)
            return this._get();
        return this._cache;
    }
    subscribe(fn) {
        if (this._dirty === "first") {
            this._get(); // initialize subscribers 
        }
        return super.subscribe(arguments[0]);
    }
    /**
     * Computes the current value of the computed signal and subscribes to any signals it depends on.
     * @returns The current value of the computed signal.
     */
    _get() {
        this._dirty = false;
        let parent_listeners = Subscribable.global_listeners;
        const global_listeners = Subscribable.global_listeners = [];
        Subscribable.global_listeners = global_listeners;
        let value = this.fn();
        // let value = 0 as any;
        const subscribed_to = this.subscribed_to;
        // for (let sub of subscribed_to)
        // {
        //     sub[1].count = 0;
        // }
        const length = global_listeners.length;
        for (let i = 0; i < length; i++) {
            const sub = global_listeners[i];
            const o = subscribed_to.get(sub);
            if (o) {
                // mark it as unchanged
                o.count = 1;
            }
            else {
                // specially mark it as new.
                subscribed_to.set(sub, {
                    count: -1,
                    ref: sub.subscribe(this)
                });
            }
        }
        for (let o of subscribed_to) {
            const status = o[1];
            const signal = o[0];
            // Status 0 means it's no longer used
            if (status.count === 0) {
                signal.unsubscribe(status.ref);
                subscribed_to.delete(signal);
            }
            // Set all states to 0 for the next time around.
            status.count = 0;
        }
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
    destroy() {
        this._dirty = false;
        for (let sub of this.subscribed_to) {
            sub[0].unsubscribe(sub[1].ref);
        }
        this.subscribed_to.clear();
    }
}
//# sourceMappingURL=Computed.js.map