import { I_Subscribable, LinkedList, StatefulSubscribable, Subscribable } from "../Core/Subscribable.js";
import type { I_NativeCollection } from "./Collection.js";
export type HeapEvents<T> = {
    add: {
        event: "add";
        value: T;
        ref: LinkedList<T>;
    };
    delete: {
        event: "delete";
        value: T;
        ref: LinkedList<T>;
    };
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
export declare class SignalHeap<T> extends Subscribable<Iterable<T>, HeapEvents<T>> implements StatefulSubscribable<Iterable<T>>, I_NativeCollection<T, HeapEvents<any>> {
    /** Head of the doubly-linked list. `undefined` when the heap is empty. */
    items: LinkedList<T> | undefined;
    constructor(items?: Iterable<T> | null | undefined);
    /**
     * Returns an iterable over the current values. The iterator captures the linked
     * list at iteration time, so concurrent mutation behaves like a snapshot of the
     * structure at that moment (advancing through `next` pointers).
     */
    get(): Iterable<T>;
    /**
     * Insert a value at the head and return its linked-list node. Hold onto the
     * returned node if you might want to delete it later in O(1).
     */
    add(value: T): LinkedList<T>;
    /**
     * Remove a node by reference. Pass the node returned by `add(...)`. O(1).
     */
    delete(value: LinkedList<T>): void;
    /**
     * Remove all values. Each removed value fires its own `delete` event, then a
     * single whole-collection emission is queued.
     */
    clear(): void;
    /** True when an emission is already scheduled for the next microtask. */
    queued: boolean;
    dirty(source?: I_Subscribable<any>, ref?: LinkedList<any>): void | this;
    emit(value?: Iterable<T>): this;
}
