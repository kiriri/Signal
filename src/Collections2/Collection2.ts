import { I_Subscribable, LinkedList, Subscribable } from "../Core/Subscribable.js";
import EventManager from "../Core/_events.js";

export const EMPTY = Symbol("EMPTY");

export type CollectionEventRef<T> = {
    fn: (
        value: T | typeof EMPTY,
        prev: T | typeof EMPTY,
        ref: CollectionEventRef<T>
    ) => any,
    source: Subscribable<any, any>,
}

export interface I_NativeCollection<T, Emission>
{
    get(): Iterable<T>;

    subscribe_event(
        fn: (
            source: Subscribable<any, any>,
            event: Emission,
            ref: CollectionEventRef<Emission>
        ) => any
    );

    unsubscribe_event(reference: CollectionEventRef<T>);

    emit_item(event: Emission);
}




export class DenseCollection<T, ITERATOR extends ArrayLike<T> = ArrayLike<T>>
{
    value: ITERATOR;

    constructor(base: ITERATOR)
    {
        this.value = base;
    }
}

new DenseCollection(new Uint16Array());
new DenseCollection(new Array());