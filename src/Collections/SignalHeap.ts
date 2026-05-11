import { I_Subscribable, LinkedList, StatefulSubscribable, Subscribable } from "../Core/Subscribable.js";
import type { I_NativeCollection } from "./Collection.js";
import EventManager, { push_subscribable } from "src/Core/_events.js";

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

/**
 * An unordered linked-list collection wrapped as a Subscribable.
 *
 * Despite the name, this is **not** a heap in the priority-queue sense — it's just a
 * doubly-linked list with O(1) insert (at head) and O(1) delete-by-reference. The
 * "heap" name reflects that order is not part of its semantics; values pile up.
 *
 * **Why a linked list and not an array?** `add` returns the linked-list node, which
 * the caller can hold and pass back to `delete(...)` later for O(1) removal. With
 * an array you'd need either an index (which shifts on delete) or a separate id map.
 *
 * **WIP.** Per the project README, collections are subject to change.
 */
export class SignalHeap<T>
    extends Subscribable<Iterable<T>, HeapEvents<T>>
    implements StatefulSubscribable<Iterable<T>>, I_NativeCollection<T, HeapEvents<any>>
{
    /** Head of the doubly-linked list. `undefined` when the heap is empty. */
    items: LinkedList<T> | undefined;

    constructor(items?: Iterable<T> | null | undefined)
    {
        super();
        if (items)
        {
            // Build the list head-first by walking the iterable and prepending each
            // item in front of the previous head.
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

    /**
     * Returns an iterable over the current values. The iterator captures the linked
     * list at iteration time, so concurrent mutation behaves like a snapshot of the
     * structure at that moment (advancing through `next` pointers).
     */
    get(): Iterable<T>
    {
        let self = this;

        push_subscribable(this);

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

    /**
     * Insert a value at the head and return its linked-list node. Hold onto the
     * returned node if you might want to delete it later in O(1).
     */
    add(value: T)
    {
        const prev = this.items;

        const ref: LinkedList<T> = {
            value: value,
            next: prev
        };

        if (prev !== undefined)
            prev.prev = ref;
        else
            this.items = ref;

        const event = { event: "add", value, ref } as const;
        this.emit_event(event)
        this.dirty();

        return ref;
    }

    /**
     * Remove a node by reference. Pass the node returned by `add(...)`. O(1).
     */
    delete(value: LinkedList<T>)
    {
        if (value.next !== undefined)
            value.next.prev = value.prev;

        if (value.prev !== undefined)
            value.prev.next = value.next;
        else
        {
            // No `prev` means this was the head — promote `next` to the new head.
            if (this.items === value)
                this.items = this.items.next;
        }

        this.emit_event({ event: "delete", value: value.value, ref: value })
        this.dirty();
    }

    /**
     * Remove all values. Each removed value fires its own `delete` event, then a
     * single whole-collection emission is queued.
     */
    clear()
    {
        let values = this.items;
        this.items = undefined;

        while (values !== undefined)
        {
            this.emit_event({ event: "delete", value: values.value, ref: values })
            values = values.next;
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

    override emit(value = this.get()): this
    {
        return super.emit(value);
    }
}