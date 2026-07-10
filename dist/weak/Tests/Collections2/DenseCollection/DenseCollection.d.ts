import { LinkedList } from "../../Core/Subscribable.js";
import { EMPTY } from "../Collection2.js";
import { DenseCollectionConsumer } from "./DenseCollectionConsumer.js";
export type DenseCollectionEntry<T> = {
    value: T | typeof EMPTY;
    subscribers: DenseCollectionEntryRef<T> | undefined;
};
export type DenseCollectionEntryRef<T> = {
    next: DenseCollectionEntryRef<T>;
    old_value: T | typeof EMPTY;
    ref: DenseCollectionEntry<T>;
    consumer: DenseCollectionConsumer<T, any>;
};
export type TypedArray = Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array | BigInt64Array | BigUint64Array | Float16Array;
/**
 * Creates a shallow clone of anything array-like (Array, TypedArray, arguments,
 * NodeList, strings via wrapper, or any object with a numeric `length`).
 * The result preserves the concrete type for Arrays and TypedArrays; other
 * array-likes are materialized into a plain Array.
 */
export declare function cloneArrayLike<T>(source: ArrayLike<T>): T[];
export declare function cloneArrayLike<A extends TypedArray>(source: A): A;
export declare abstract class DenseCollection<T, ITERATOR extends Iterable<DenseCollectionEntry<T>> = Iterable<DenseCollectionEntry<T>>> {
    value: T extends number ? Array<T> | TypedArray : Array<T>;
    consumers?: LinkedList<DenseCollectionConsumer<T, any>>;
    subscribe(consumer: DenseCollectionConsumer<T, any>): LinkedList<DenseCollectionConsumer<T, any, Iterable<DenseCollectionEntry<T>>>>;
    unsubscribe(subscriber: LinkedList<DenseCollectionConsumer<T, any>>): void;
    abstract initialize_consumer(consumer: DenseCollectionConsumer<T, any>): any;
}
