import { I_Subscribable, LinkedList, StatefulSubscribable, Subscribable } from "../Core/Subscribable";
import type { I_NativeCollection } from "./Collection";
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
export declare class SignalHeap<T> extends Subscribable<Iterable<T>, HeapEvents<T>> implements StatefulSubscribable<Iterable<T>>, I_NativeCollection<T, HeapEvents<any>> {
    items: LinkedList<T> | undefined;
    constructor(items?: Iterable<T> | null | undefined);
    get(): Iterable<T>;
    add(value: T): LinkedList<T>;
    delete(value: LinkedList<T>): void;
    clear(): void;
    queued: boolean;
    dirty(source?: I_Subscribable<any>, ref?: LinkedList<any>): void | this;
    emit(value?: Iterable<T>): this;
}
