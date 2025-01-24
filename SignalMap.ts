import { Computed } from "./Computed";
import { Signal } from "./Signal";
import { StatefulSubscribable, Subscribable } from "./Subscribable";

export class SignalMap<K,V> extends Subscribable<Map<K,V>> implements StatefulSubscribable<Map<K,V>>
{
    readonly _internal: Map<K,V>;
    _signals: Map<K,Signal<V|undefined>> | undefined = undefined;

    on_add = new Subscribable<[K,V]>();
    on_delete = new Subscribable<[K,V]>();

    // TODO : return a signal which, using an external predicate function, 
    // tracks the number of entries which are true. (computed deeply)
    // This should use the on_add/delete subscribables to stay up to date. 

    constructor(items?: Iterable<[K,V]> | null | undefined)
    {
        super();
        this._internal = new Map(items);
    }

    /**
     * Get the underlying Map object according to the StatefulSubscribable Syntax.
     */
    get(): Map<K,V>;
    /**
     * Get a value in the map according to the Map Syntax.
     * @param key 
     */
    get(key:K) : V;
    get(key?:K|undefined): V | Map<K,V>
    {
        if(key)
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
     * @param key 
     */
    ref(key:K) : Signal<V|undefined>
    {
        if(!this._signals)
            this._signals = new Map();

        let result: Signal<V|undefined> = this._signals.get(key)!;
        if(!result)
        {
            let value = this.get(key);

            this._signals.set(key, result = new Signal<V|undefined>(value));
        }

        return result;
    }

    set(key:K, value: V)
    {
        let exists = this._internal.get(key);
        if (exists !== value)
        {
            this._internal.set(key, value);
            this._signals?.get(key)?.set(value);
            this.on_add.emit([key,value]);
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
                this._signals?.get(key)?.set(undefined);
                this.on_delete.emit([key, value]);
                this.emit(this._internal);
            }
        }
    }

    clear()
    {
        let entries = [...this._internal.entries()];

        this._internal.clear();

        for (let v of entries)
        {
            this._signals?.get(v[0])?.set(undefined);
            this.on_delete.emit(v);
        }

        this.emit(this._internal);
    }

    has(key:K)
    {
        return this._internal.has(key);
    }
}
