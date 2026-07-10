import { Subscribable } from "../Core/Subscribable.js";
export declare const EMPTY: unique symbol;
export type CollectionEventRef<T> = {
    fn: (value: T | typeof EMPTY, prev: T | typeof EMPTY, ref: CollectionEventRef<T>) => any;
    source: Subscribable<any, any>;
};
export interface I_NativeCollection<T, Emission> {
    get(): Iterable<T>;
    subscribe_event(fn: (source: Subscribable<any, any>, event: Emission, ref: CollectionEventRef<Emission>) => any): any;
    unsubscribe_event(reference: CollectionEventRef<T>): any;
    emit_item(event: Emission): any;
}
export declare class DenseCollection<T, ITERATOR extends ArrayLike<T> = ArrayLike<T>> {
    value: ITERATOR;
    constructor(base: ITERATOR);
}
