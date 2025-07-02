import { BufferedSubscribable } from "../Sinks/BufferedSubscribable";
import { NativeSignal } from "../Core/NativeSignal";
import { I_Subscribable, StatefulSubscribable, Subscribable } from "../Core/Subscribable";
import { I_NativeCollection } from "./Collection";

export type MapEvents<K,T> = {
    add:{
        event: "add"; 
        value: [K,T];
    },
    delete:{
        event: "delete"; 
        value: [K,T];
    }
};


export class SignalMap<K, V> 
extends Subscribable<Map<K, V>,MapEvents<K,V>> 
implements StatefulSubscribable<Map<K, V>>, I_NativeCollection<[K,V],MapEvents<K,V>>
{
    readonly _internal: Map<K, V>;
    // readonly _entries: Map<K, [K,V]>;
    _signals: Map<K, NativeSignal<V | undefined>> | undefined = undefined;

    // TODO : This is unnecessarily expensive.
    // _on_change = new BufferedSubscribable<MapEvents<K,V>[keyof MapEvents<K,V>]>();
    // _on_change_instant = new Subscribable<MapEvents<K,V>[keyof MapEvents<K,V>]>();

    constructor(items?: Iterable<[K, V]> | null | undefined)
    {
        super();
        this._internal = new Map();
        if(items)
        {
            // cheaper for few items, unknown for large counts.
            for(let item of items)
                this._internal.set(item[0],item[1]);
        }
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

            result = new NativeSignal<V | undefined>(value);

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

    _add(value: [K, V])
    {
        this.set(...value);
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
            const kv : [K,V] = [key,value];
            this._internal.set(key, value);
            // this._entries.set(key,kv);
            this._signals?.get(key)?.set(value);

            if (exists === undefined)
            {
                this.emit_event({ event: "add", value:kv });
                // this._on_change_instant.emit({ event: "add", value:kv });
            }

            this.dirty();
        }
    }

    _delete(value: [K, V])
    {
        this.delete(value[0]);
    }
    delete(key: K)
    {
        let v = this._internal.get(key)!;
        if (this._internal.delete(key))
        {
            const kv : [K,V] = [key,v] ;
            let signal = this._signals?.get(key);
            if (signal?.get() !== undefined)
                signal?.set(undefined);
            this.emit_event({ event: "delete", value:kv });
            // this._on_change_instant.emit({ event: "delete", value:kv });
            this.dirty();
        }
    }

    clear()
    {
        const entries = this._internal.entries();
        this._internal.clear();

        for (let kv of entries)
        {
            const reference = this._signals?.get(kv[0]);
            if(reference)
                reference.set(undefined);
            this.emit_event({ event: "delete", value:kv });
            // this._on_change_instant.emit({ event: "delete", value:kv });
        }

        this.dirty();
    }

    has(key: K)
    {
        return this._internal.has(key);
    }

    queued = false;
    override dirty(source?: I_Subscribable<any>, ref?:any)
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

        return super.dirty(source, ref);
    }

    override emit(value: Map<K,V> = this._internal): this
    {
        return super.emit(value);
    }
}
