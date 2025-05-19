import { BufferedSubscribable } from "../Sinks/BufferedSubscribable";
import { NativeSignal } from "../Core/Signal";
import { I_Subscribable, StatefulSubscribable, Subscribable } from "../Core/Subscribable";

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

        let result = this._signals.get(key)!;
        if (!result)
        {
            let value = this.get(key);

            this._signals.set(key, result = new NativeSignal<V | undefined>(value));

            const fn = (_, v) =>
            {
                if (v === undefined)
                {
                    this.delete(key);
                }
                else
                {
                    this.set(key, v);
                }
            };

            // Anchor fn to the signal, so it gets GC'ed when the signal does.
            result["$refFn"] = fn;

            result.subscribe(fn);
        }

        return result;
    }

    set(key: K, value: V)
    {
        if(value === undefined)
        {
            console.error("Cannot set Signal Map's value to undefined, using null instead!");
            value = null;
        }

        let exists = this._internal.get(key);
        if (exists !== value)
        {
            this._internal.set(key, value);
            this._signals?.get(key)?.set(value);

            if (exists === undefined)
                this.on_change.emit({ event: "add", key, value });

            this.dirty();
        }
    }

    delete(key: K)
    {
        if (this._internal.delete(key))
        {
            let value = this._internal.get(key)!;
            let signal = this._signals?.get(key);
            if (signal?.get() !== undefined)
                signal?.set(undefined);
            this.on_change.emit({ event: "delete", key, value });
            this.dirty();
        }
    }

    clear()
    {
        let entries = [...this._internal.entries()];

        this._internal.clear();

        for (let v of entries)
        {
            const reference = this._signals?.get(v[0]);
            if(reference)
                reference.set(undefined);
            this.on_change.emit({ event: "delete", key: v[0], value: v[1] });
        }

        this.dirty();
    }

    has(key: K)
    {
        return this._internal.has(key);
    }

    queued = false;
    override dirty(source?: I_Subscribable<any>)
    {
        // If it's queued for emit(),
        // then it stands to reason that it has propagated dirty as well.
        if(this.queued) 
            return this;

        if (this.subscribers)
        {
            this.queued = true;
            Subscribable.register_async_emit(() => this.emit());
        }

        return super.dirty(source);
    }

    override emit(value: Map<K,V> = this._internal): this
    {
        return super.emit(value);
    }
}
