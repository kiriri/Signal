import { NativeSignal } from "../Core/NativeSignal.js";
import { I_Subscribable, LinkedList, StatefulSubscribable, Subscribable } from "../Core/Subscribable.js";
import { I_NativeCollection } from "./Collection.js";
import EventManager, { push_subscribable } from "src/Core/_events.js";

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
    extends Subscribable<Map<K, V>, MapEvents<K, V>>
    implements StatefulSubscribable<Map<K, V>>, I_NativeCollection<[K, V], MapEvents<K, V>>
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

        let exists = this._internal.get(key);
        if (exists !== value)
        {
            const kv: [K, V] = [key, value];
            this._internal.set(key, value);
            this._signals?.get(key)?.set(value);

            if (exists === undefined)
            {
                this.emit_event({ event: "add", value: kv });
            }

            this.dirty();
        }
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
        let v = this._internal.get(key)!;
        if (this._internal.delete(key))
        {
            const kv: [K, V] = [key, v];
            let signal = this._signals?.get(key);
            if (signal?.get() !== undefined)
                signal?.set(undefined);
            this.emit_event({ event: "delete", value: kv });
            this.dirty();
        }
    }

    /**
     * Remove every entry. Each removed entry fires its own `delete` event, then a
     * single whole-collection emission is queued.
     *
     * **NOTE — likely bug.** The original implementation captures `this._internal.entries()`
     * (a *live* iterator) *before* calling `clear()`, then iterates after the clear.
     * Once `clear()` runs the iterator is empty, so no events fire and no per-key
     * signals get reset. The fix would be to materialize the entries first
     * (`[...this._internal.entries()]`) — left as-is here so you can confirm the
     * intended behaviour before changing it.
     */
    clear()
    {
        const entries = this._internal.entries();
        this._internal.clear();

        for (let kv of entries)
        {
            const reference = this._signals?.get(kv[0]);
            if (reference)
                reference.set(undefined);
            this.emit_event({ event: "delete", value: kv });
        }

        this.dirty();
    }

    has(key: K)
    {
        return this._internal.has(key);
    }

    /** True when an emission is already scheduled for the next microtask. */
    queued = false;

    override dirty(source?: I_Subscribable<any>, ref?: any)
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

    override emit(value: Map<K, V> = this._internal): this
    {
        return super.emit(value);
    }
}