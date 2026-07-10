import { I_Subscribable, LinkedList, Subscribable } from "../../Core/Subscribable.js";
import EventManager from "../../Core/_events.js";
import { EMPTY } from "../Collection2.js";
import { DenseCollectionConsumer } from "./DenseCollectionConsumer.js";

export type DenseCollectionEntry<T> = {
    value: T | typeof EMPTY;
    subscribers: DenseCollectionEntryRef<T> | undefined;
}

// This is what a subscriber/consumer holds. 
// They can use it's `ref` field to register themselves again to the subscribers linked list
// After they have processed the newest changes.
// This avoids costly dynamic lookups in each subscriber.
export type DenseCollectionEntryRef<T> = {
    // In the SparseCollectionEntry this is the next subscriber, 
    // in SparseCollectionConsumer it's the next dirty entry.
    // EntryRefs are never in both at the same time.
    next: DenseCollectionEntryRef<T>;
    old_value: T | typeof EMPTY;
    ref: DenseCollectionEntry<T>;
    consumer: DenseCollectionConsumer<T, any>;
}

export type TypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array
  | BigInt64Array
  | BigUint64Array
  | Float16Array;

/**
 * Creates a shallow clone of anything array-like (Array, TypedArray, arguments,
 * NodeList, strings via wrapper, or any object with a numeric `length`).
 * The result preserves the concrete type for Arrays and TypedArrays; other
 * array-likes are materialized into a plain Array.
 */
export function cloneArrayLike<T>(source: ArrayLike<T>): T[];
export function cloneArrayLike<A extends TypedArray>(source: A): A;
export function cloneArrayLike(source: ArrayLike<any> | TypedArray): any
{
    // Plain Array: slice is the fastest engine-optimized clone path.
    if (Array.isArray(source))
        return source.slice();

    // TypedArray: detect via the shared buffer marker, then use its own
    // constructor for a tight memcpy-style copy.
    if ((source as TypedArray).buffer !== undefined && ArrayBuffer.isView(source as ArrayBufferView))
        return (source as TypedArray).slice();

    // Generic array-like (arguments, NodeList, custom { length }): preallocate
    // the exact length and copy by index — avoids push() reallocation churn.
    const length = source.length;
    const out = new Array(length);
    for (let i = 0; i < length; i++)
        out[i] = (source as ArrayLike<any>)[i];

    return out;
}

// Dense collections are anything arraylike.
export abstract class DenseCollection<T, ITERATOR extends Iterable<DenseCollectionEntry<T>> = Iterable<DenseCollectionEntry<T>>>
{
    value : T extends number ? Array<T> | TypedArray : Array<T> 
    consumers?: LinkedList<DenseCollectionConsumer<T, any>>;

    subscribe(consumer: DenseCollectionConsumer<T, any>)
    {
        let new_list_item = {
            value: consumer,
            next: this.consumers
        }
        this.consumers.prev = new_list_item;
        this.consumers = new_list_item

        // Mark all entries as dirty, but do not poll until it's required.
        this.initialize_consumer(consumer);

        return this.consumers;
    }

    unsubscribe(subscriber : LinkedList<DenseCollectionConsumer<T, any>>)
    {
        if(this.consumers === subscriber)
            this.consumers = this.consumers.next;
        if(subscriber.next)
            subscriber.next.prev = subscriber.prev;
        if(subscriber.prev)
            subscriber.prev.next = subscriber.next;
    }

    abstract initialize_consumer(consumer: DenseCollectionConsumer<T, any>);

    // abstract set(key: value: T);
    // abstract delete(key: K);

}


