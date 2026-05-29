import { NativeSignal } from "../Core/NativeSignal.js";
import { I_Subscribable, StatefulSubscribable, Subscribable } from "../Core/Subscribable.js";
import { I_NativeCollection } from "./Collection.js";
export type MapEvents<K, T> = {
    add: {
        event: "add";
        value: [K, T];
    };
    delete: {
        event: "delete";
        value: [K, T];
    };
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
export declare class SignalMap<K, V> extends Subscribable<Map<K, V>, MapEvents<K, V>> implements StatefulSubscribable<Map<K, V>>, I_NativeCollection<[K, V], MapEvents<K, V>> {
    /** The underlying native `Map`. Reading directly bypasses dependency tracking. */
    readonly _internal: Map<K, V>;
    /**
     * Lazily-allocated cache of per-key reactive references handed out by `ref()`.
     * Created on first call to `ref()` and reused thereafter.
     */
    _signals: Map<K, NativeSignal<V | undefined>> | undefined;
    constructor(items?: Iterable<[K, V]> | null | undefined);
    /** Get the underlying `Map<K, V>` (registers as a dependency in Computed contexts). */
    get(): Map<K, V>;
    /** Get the value at `key` (does not register as a dependency). */
    get(key: K): V;
    /**
     * Returns a `NativeSignal<V|undefined>` representing the value at `key`. Created
     * on first call for a given key, then cached. The signal updates when the map
     * entry changes; setting the signal updates the map.
     *
     * Setting the signal to `undefined` deletes the entry; setting it to a value
     * adds/updates the entry.
     */
    ref(key: K): NativeSignal<V | undefined>;
    /** I_NativeCollection adapter for `set`. */
    _add(value: [K, V]): void;
    /**
     * Set `key` to `value`. No-op if the value at the key is already `===` to the new
     * one. Re-keying with a different value fires no `add` event (only the first
     * insertion does); but always queues a whole-collection emission and updates
     * any existing per-key `ref` signal.
     */
    set(key: K, value: V): void;
    /** I_NativeCollection adapter for `delete`. */
    _delete(value: [K, V]): void;
    /**
     * Delete a key. No-op if the key isn't present. Otherwise fires `delete`
     * synchronously, sets any per-key ref signal to `undefined`, and queues a
     * whole-collection emission.
     */
    delete(key: K): void;
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
    clear(): void;
    has(key: K): boolean;
    /** True when an emission is already scheduled for the next microtask. */
    queued: boolean;
    dirty(source?: I_Subscribable<any>, ref?: any): void | this;
    emit(value?: Map<K, V>): this;
}
