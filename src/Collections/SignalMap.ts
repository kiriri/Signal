import { NativeSignal } from "../Core/NativeSignal.js";
import { StatefulSubscribable } from "../Core/Subscribable.js";
import { Collection } from "./Collection.js";
import { push_subscribable } from "src/Core/_events.js";

export type MapEvents<K, T> = {
    add: {
        event: "add";
        value: [K, T];
    },
    delete: {
        event: "delete";
        value: [K, T];
    }
};


/**
 * A `Map<K, V>` wrapped as a Subscribable, with optional per-key reactive references.
 *
 * Two channels of notification (same as `SignalSet`):
 *
 * 1. **Whole-collection emission** via `subscribe(...)`: receives the entire map
 *    after a microtask coalesces a tick's worth of changes.
 * 2. **Per-change events** via `subscribe_event(...)`: receives `{event, value:[K,V]}`
 *    synchronously, one per add/delete.
 *
 * **Per-key signals via `ref(key)`.** Returns a `NativeSignal<V|undefined>` that
 * tracks the value at that key. Setting the signal to `undefined` deletes the entry;
 * setting it to a non-undefined value sets the entry. The signal stays alive across
 * the existence of the entry, so a Computed can subscribe to a single key without
 * caring about the rest of the map.
 */
export class SignalMap<K, V>
    extends Collection<[K, V], Map<K, V>, MapEvents<K, V>>
    implements StatefulSubscribable<Map<K, V>>
{
    /** The underlying native `Map`. Reading directly bypasses dependency tracking. */
    readonly _internal: Map<K, V>;

    /**
     * Lazily-allocated cache of per-key reactive references handed out by `ref()`.
     * Created on first call to `ref()` and reused thereafter.
     */
    _signals: Map<K, NativeSignal<V | undefined>> | undefined = undefined;

    constructor(items?: Iterable<[K, V]> | null | undefined)
    {
        super();
        this._internal = new Map();
        if (items)
        {
            // Cheaper for few items; for very large counts the constructor copy may win.
            for (let item of items)
                this._internal.set(item[0], item[1]);
        }
    }

    /** Get the underlying `Map<K, V>` (registers as a dependency in Computed contexts). */
    get(): Map<K, V>;
    /** Get the value at `key` (does not register as a dependency). */
    get(key: K): V;
    get(key?: K | undefined): V | Map<K, V>
    {
        if (key)
        {
            return this._internal.get(key) as V;
        }

            push_subscribable(this);

        return this._internal;
    }

    /**
     * Returns a `NativeSignal<V|undefined>` representing the value at `key`. Created
     * on first call for a given key, then cached. The signal updates when the map
     * entry changes; setting the signal updates the map.
     *
     * Setting the signal to `undefined` deletes the entry; setting it to a value
     * adds/updates the entry.
     */
    ref(key: K): NativeSignal<V | undefined>
    {
        if (!this._signals)
            this._signals = new Map();

        let result = this._signals.get(key)!;
        if (!result)
        {
            let value = this.get(key);

            result = new NativeSignal<V | undefined>(value);

            // Capture the original `set` *before* we override it on the instance, so
            // we can still mutate the signal value internally without recursing.
            const original_set = result.set.bind(result);

            this._signals.set(key, result);

            const fn = (v) =>
            {
                original_set(v);

                if (v === undefined)
                {
                    this.delete(key);
                }
                else
                {
                    this.set(key, v);
                }
            };

            result.set = fn;
        }

        return result;
    }

    /** I_NativeCollection adapter for `set`. */
    _add(value: [K, V])
    {
        this.set(...value);
    }

    /**
     * Set `key` to `value`. No-op if the value at the key is already `===` to the new
     * one. Re-keying with a different value fires no `add` event (only the first
     * insertion does); but always queues a whole-collection emission and updates
     * any existing per-key `ref` signal.
     */
    set(key: K, value: V)
    {
        if (value === undefined)
        {
            console.error("Cannot set Signal Map's value to undefined, using null instead!");
            value = null;
        }

        const internal = this._internal;
        let exists = internal.get(key);
        if (exists === value)
            return;

        internal.set(key, value);
        if (this._signals !== undefined)
            this._signals.get(key)?.set(value);

        // Only the first insertion fires `add`; re-keying with a new value does not.
        // Build the tuple only when there is an `add` to emit to a listener.
        if (exists === undefined && (this.events !== undefined || this.any_events !== undefined))
            this.emit_event({ event: "add", value: [key, value] });

        if (this.subscribers !== undefined || this.dependants !== undefined)
            this.dirty();
    }

    /** I_NativeCollection adapter for `delete`. */
    _delete(value: [K, V])
    {
        this.delete(value[0]);
    }

    /**
     * Delete a key. No-op if the key isn't present. Otherwise fires `delete`
     * synchronously, sets any per-key ref signal to `undefined`, and queues a
     * whole-collection emission.
     */
    delete(key: K)
    {
        const internal = this._internal;
        const v = internal.get(key)!;
        if (!internal.delete(key))
            return;

        if (this._signals !== undefined)
        {
            const signal = this._signals.get(key);
            if (signal !== undefined && signal.get() !== undefined)
                signal.set(undefined);
        }

        if (this.events !== undefined || this.any_events !== undefined)
            this.emit_event({ event: "delete", value: [key, v] });

        if (this.subscribers !== undefined || this.dependants !== undefined)
            this.dirty();
    }

    /**
     * Remove every entry. Each removed entry fires its own `delete` event and resets
     * its per-key `ref` signal, then a single whole-collection emission is queued.
     *
     * The entries are materialized *before* `clear()` — iterating the live iterator
     * after clearing it would yield nothing.
     */
    clear()
    {
        const entries = [...this._internal.entries()];
        this._internal.clear();

        const has_listeners = this.events !== undefined || this.any_events !== undefined;

        for (let kv of entries)
        {
            if (this._signals !== undefined)
                this._signals.get(kv[0])?.set(undefined);
            if (has_listeners)
                this.emit_event({ event: "delete", value: kv });
        }

        this.dirty();
    }

    has(key: K)
    {
        return this._internal.has(key);
    }
}