import { BufferedSubscribable } from "../Sinks/BufferedSubscribable";
import { Computed } from "../Core/Computed";
import { NativeSignal, ReadonlySignal } from "../Core/NativeSignal";
import { I_Subscribable, LinkedList, StatefulSubscribable, Subscribable } from "../Core/Subscribable";
import type { I_NativeCollection } from "./Collection";

export type SetEvents<T> = {
    add:{
        event: "add"; 
        value: T;
    },
    delete:{
        event: "delete"; 
        value: T;
    }
};

export class SignalSet<T> extends Subscribable<Set<T>,SetEvents<T>> implements StatefulSubscribable<Set<T>>, I_NativeCollection<T,SetEvents<T>>
{
    readonly _internal: Set<T>;

    constructor(items?: Iterable<T> | null | undefined)
    {
        super();
        this._internal = new Set();
        if(items)
        {
            for(let item of items)
            {
                this._internal.add(item);
            }
        }
    }

    get(): Set<T>
    {
        if (Subscribable.global_listeners)
            Subscribable.global_listeners.push(this);

        return this._internal;
    }

    _add(value: T)
    {
        this.add(value);
    }
    add(value: T)
    {
        let exists = this._internal.has(value);
        this._internal.add(value);
        
        if (!exists)
        {
            const event = { event: "add", value };
            // if(this.can_emit(event))
            // {
                // Inlining this will save around 20% performance 
                this.emit_event(event)
            // }
            this.dirty();
        }
    }

    _delete(value: T)
    {
        this.delete(value);
    }
    delete(value: T)
    {
        if (this._internal.delete(value))
        {
            this.emit_event({ event: "delete", value })
            // this._on_change_instant.emit({ event: "delete", value })
            this.dirty();
        }
    }

    clear()
    {
        let values = [...this._internal.values()];

        this._internal.clear();

        for (let value of values)
        {
            this.emit_event({ event: "delete", value })
            // this._on_change_instant.emit({ event: "delete", value })
        }

        this.dirty();
    }

    queued = false;
    override dirty(source?: I_Subscribable<any>, ref?: LinkedList<any>)
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

        return super.dirty(source,ref);
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
