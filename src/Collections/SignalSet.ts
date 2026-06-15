import { StatefulSubscribable } from "../Core/Subscribable.js";
import { Collection } from "./Collection.js";
import { push_subscribable } from "src/Core/_events.js";

export type SetEvents<T> = {
    add: {
        event: "add";
        value: T;
    },
    delete: {
        event: "delete";
        value: T;
    }
};


/**
 * A `Set<T>` wrapped as a Subscribable.
 *
 * Two channels of notification:
 *
 * 1. **Whole-collection emission.** Subscribers via `subscribe(...)` receive the
 *    entire `Set<T>` after a microtask coalesces all changes from the current tick.
 *    Use this when you want "the set changed, here's the current state" semantics.
 * 2. **Per-change events.** Subscribers via `subscribe_event(...)` receive
 *    `{event: "add" | "delete", value}` synchronously, one per change. Use this
 *    when you want to react to individual operations rather than reading the whole
 *    set each time.
 *
 * Mutations preserve `Set` semantics: re-adding an existing value or deleting a
 * missing value is a no-op (no event, no dirty propagation).
 *
 */
export class SignalSet<T> extends Collection<T, Set<T>, SetEvents<T>> implements StatefulSubscribable<Set<T>>
{
    /** The underlying native `Set`. Reading this directly bypasses dependency tracking. */
    readonly _internal: Set<T>;

    /**
     * @param items Optional iterable of initial values. Each is added without firing events.
     */
    constructor(items?: Iterable<T> | null | undefined)
    {
        super();
        this._internal = new Set();
        if (items)
        {
            for (let item of items)
            {
                this._internal.add(item);
            }
        }
    }

    /**
     * Get the underlying `Set<T>`.
     *
     * If called inside a Computed evaluation, registers this set as a dependency.
     */
    get(): Set<T>
    {
        
        push_subscribable(this);

        return this._internal;
    }

    /** I_NativeCollection adapter for `add`. */
    _add(value: T)
    {
        this.add(value);
    }

    /**
     * Add a value. No-op if already present (no event, no dirty). Otherwise fires
     * `{event: "add", value}` synchronously and queues a whole-collection emission.
     */
    add(value: T)
    {
        const internal = this._internal;
        const size = internal.size;
        internal.add(value);

        // Already present — `size` is unchanged. One hash op (add) instead of has()+add().
        if (internal.size === size)
            return;

        // Only build the event object / walk the event channel when something listens.
        if (this.events !== undefined || this.any_events !== undefined)
            this.emit_event({ event: "add", value });

        // Skip the whole-collection dirty when nothing observes it.
        if (this.subscribers !== undefined || this.dependants !== undefined)
            this.dirty();
    }

    /** I_NativeCollection adapter for `delete`. */
    _delete(value: T)
    {
        this.delete(value);
    }

    /**
     * Delete a value. No-op if not present. Otherwise fires `{event: "delete", value}`
     * synchronously and queues a whole-collection emission.
     */
    delete(value: T)
    {
        if (!this._internal.delete(value))
            return;

        if (this.events !== undefined || this.any_events !== undefined)
            this.emit_event({ event: "delete", value });

        if (this.subscribers !== undefined || this.dependants !== undefined)
            this.dirty();
    }

    /**
     * Remove every value. Each removed value fires its own `delete` event (so per-change
     * listeners see them all), then a single whole-collection emission is queued.
     */
    clear()
    {
        let values = [...this._internal.values()];

        this._internal.clear();

        if (this.events !== undefined || this.any_events !== undefined)
            for (let value of values)
                this.emit_event({ event: "delete", value });

        this.dirty();
    }

    has(value: T)
    {
        return this._internal.has(value);
    }
}