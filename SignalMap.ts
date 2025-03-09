import { BufferedSubscribable } from "./BufferedSubscribable";
import { Computed } from "./Computed";
import { NativeSignal } from "./Signal";
import { StatefulSubscribable, Subscribable, transaction } from "./Subscribable";

export class SignalMap<K, V> extends Subscribable<Map<K, V>> implements StatefulSubscribable<Map<K, V>>
{
    readonly _internal: Map<K, V>;
    _signals: Map<K, NativeSignal<V | undefined>> | undefined = undefined;

    on_change = new BufferedSubscribable<{ event: "add" | "delete", key: K, value: V }>();

    // TODO : return a signal which, using an external predicate function, 
    // tracks the number of entries which are true. (computed deeply)
    // This should use the on_add/delete subscribables to stay up to date. 

    constructor(items?: Iterable<[K, V]> | null | undefined)
    {
        super();
        this._internal = new Map(items);
    }

    /**
     * Get the underlying Map object according to the StatefulSubscribable Syntax.
     */
    get(): Map<K, V>;
    /**
     * Get a value in the map according to the Map Syntax.
     * @param key 
     */
    get(key: K): V;
    get(key?: K | undefined): V | Map<K, V>
    {
        if (key)
        {
            return this._internal.get(key) as V;
        }
        if (Subscribable.global_listeners)
            Subscribable.global_listeners.push(this);

        return this._internal;
    }

    /**
     * This will return a signal containing the value of the entry at the given key.
     * This works even if no value has been assigned yet.
     * The signal will automatically update when the entry changes.
     * Changing the signal to undefined removes the value from this map.
     * Changing it from undefined to something else adds the value to the map under the given key.
     * @param key 
     */
    ref(key: K): NativeSignal<V | undefined>
    {
        if (!this._signals)
            this._signals = new Map();

        let result: NativeSignal<V | undefined> = this._signals.get(key)!;
        if (!result)
        {
            let value = this.get(key);

            this._signals.set(key, result = new NativeSignal<V | undefined>(value));

            result.subscribe(v =>
            {
                if (v === undefined)
                {
                    this.delete(key);
                }
                else
                {
                    this.set(key, v);
                }
            }, false);
        }

        return result;
    }

    set(key: K, value: V)
    {
        let exists = this._internal.get(key);
        if (exists !== value)
        {
            this._internal.set(key, value);
            this._signals?.get(key)?.set(value);
            this.on_change.emit({ event: "add", key, value });
            this.emit(this._internal);
        }
    }

    delete(key: K)
    {

        let exists = this._internal.has(key);
        if (exists)
        {
            let value = this._internal.get(key)!;
            if (this._internal.delete(key))
            {
                let signal = this._signals?.get(key);
                if (signal?.get() !== undefined)
                    signal?.set(undefined);
                this.on_change.emit({ event: "delete", key, value });
                this.emit(this._internal);
            }
        }
    }

    clear()
    {
        let entries = [...this._internal.entries()];

        this._internal.clear();

        transaction(() =>
        {

            for (let v of entries)
            {
                this._signals?.get(v[0])?.set(undefined);
                this.on_change.emit({ event: "delete", key: v[0], value: v[1] });
            }

            this.emit(this._internal);
        })

    }

    has(key: K)
    {
        return this._internal.has(key);
    }
}
