import { BufferedSubscribable } from "../Sinks/BufferedSubscribable";
import { Computed } from "../Core/Computed";
import { NativeSignal, ReadonlySignal } from "../Core/NativeSignal";
import { I_Subscribable, LinkedList, StatefulSubscribable, Subscribable } from "../Core/Subscribable";
import type { I_NativeCollection } from "./Collection";
import EventManager from "src/Core/_Events";

export type HeapEvents<T> = {
    add: {
        event: "add";
        value: T;
        ref: LinkedList<T>
    },
    delete: {
        event: "delete";
        value: T;
        ref: LinkedList<T>
    }
};

export class SignalHeap<T> extends Subscribable<
    Iterable<T>,
    HeapEvents<T>
> implements StatefulSubscribable<
Iterable<T>
>, I_NativeCollection<T, HeapEvents<any>>
{
    items: LinkedList<T> | undefined;

    constructor(items?: Iterable<T> | null | undefined)
    {
        super();
        if (items)
        {
            let prev = this.items;
            for (let item of items)
            {
                let entry: LinkedList<T> = {
                    next: prev,
                    value: item,
                    prev: undefined
                };

                if (prev)
                {
                    prev.prev = entry;
                }

                prev = entry;
            }

            this.items = prev;
        }
    }

    get(): Iterable<T>
    {
        let self = this;

        if (EventManager.global_listeners)
            EventManager.global_listeners.push(this);

        return (function* iterator()
        {
            let item = self.items;
            while (item)
            {
                yield item.value;
                item = item.next;
            }
        })()
    }

  
    add(value: T)
    {
        const prev = this.items;

        const ref : LinkedList<T> = {
            value: value,
            next: prev
        };

        if(prev !== undefined)
            prev.prev = ref;

        const event = { event: "add", value, ref };
        this.emit_event(event)
        this.dirty();

        return ref;
    }

    delete(value: LinkedList<T>)
    {
        if (value.next !== undefined)
            value.next.prev = value.prev;

        if (value.prev !== undefined)
            value.prev.next = value.next;
        else
        {
            if (this.items === value)
                this.items = this.items.next;
        }

        this.emit_event({ event: "delete", value:value.value, ref:value })
        this.dirty();
    
    }

    clear()
    {
        let values = this.items;
        this.items = undefined;

        while (values !== undefined)
        {
            this.emit_event({ event: "delete", value:values.value, ref:values })
            values = values.next;
        }

        this.dirty();
    }

    queued = false;
    override dirty(source?: I_Subscribable<any>, ref?: LinkedList<any>)
    {
        // If it's queued for emit(),
        // then it stands to reason that it has propagated dirty as well.
        if (this.queued)
            return this;

        if (this.subscribers)
        {
            this.queued = true;
            EventManager.register_async_emit(() => this.emit());
        }

        return super.dirty(source, ref);
    }

    override emit(value  = this.get()): this
    {
        return super.emit(value);
    }
}