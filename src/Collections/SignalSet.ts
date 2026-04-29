import { I_Subscribable, LinkedList, StatefulSubscribable, Subscribable } from "../Core/Subscribable";
import type { I_NativeCollection } from "./Collection";
import EventManager from "src/Core/_events";

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
export class SignalSet<T> extends Subscribable<Set<T>, SetEvents<T>> implements StatefulSubscribable<Set<T>>, I_NativeCollection<T, SetEvents<T>>
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
        if (EventManager.global_listeners)
            EventManager.global_listeners.push(this);

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
        let exists = this._internal.has(value);
        this._internal.add(value);

        if (!exists)
        {
            const event = { event: "add", value } as const;
            // Inlining this directly (rather than guarding with can_emit + emit_event)
            // saves around 20% in the no-subscriber case.
            this.emit_event(event)
            this.dirty();
        }
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
        if (this._internal.delete(value))
        {
            this.emit_event({ event: "delete", value })
            this.dirty();
        }
    }

    /**
     * Remove every value. Each removed value fires its own `delete` event (so per-change
     * listeners see them all), then a single whole-collection emission is queued.
     */
    clear()
    {
        let values = [...this._internal.values()];

        this._internal.clear();

        for (let value of values)
        {
            this.emit_event({ event: "delete", value })
        }

        this.dirty();
    }

    /** True when an emission is already scheduled for the next microtask. */
    queued = false;

    override dirty(source?: I_Subscribable<any>, ref?: LinkedList<any>)
    {
        // If queued for emit, dirty has already been propagated.
        if (this.queued)
            return this;

        if (this.subscribers)
        {
            this.queued = true;
            EventManager.register_async_emit(() => this.emit());
        }

        return super.dirty(source, ref);
    }

    override emit(value: Set<T> = this._internal): this
    {
        return super.emit(value);
    }

    has(value: T)
    {
        return this._internal.has(value);
    }
}