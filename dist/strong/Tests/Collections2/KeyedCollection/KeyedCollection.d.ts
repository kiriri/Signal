import { StatefulSubscribable, Subscribable } from "../../Core/Subscribable.js";
import { EMPTY } from "../Collection2.js";
import { KeyedCollectionConsumer, KeyedCollectionConsumerCore } from "./KeyedCollectionConsumer.js";
export declare class KeyedCollectionEntry<K, T> {
    source: KeyedCollection<K, T, any>;
    readonly key: K;
    value: T | typeof EMPTY;
    subscribers: KeyedCollectionEntryRef<K, T> | undefined;
    private signals;
    constructor(source: KeyedCollection<K, T, any>, key: K, value: T | typeof EMPTY, subscribers: KeyedCollectionEntryRef<K, T> | undefined);
    set(value: T): void;
}
export declare class KeyedCollectionEntryRef<K, T> {
    prev: KeyedCollectionEntryRef<K, T>;
    next: KeyedCollectionEntryRef<K, T>;
    old_value: T | typeof EMPTY;
    ref: KeyedCollectionEntry<K, T>;
    consumer: KeyedCollectionConsumerCore<K, T, any>;
    constructor(prev: KeyedCollectionEntryRef<K, T>, next: KeyedCollectionEntryRef<K, T>, old_value: T | typeof EMPTY, ref: KeyedCollectionEntry<K, T>, consumer: KeyedCollectionConsumerCore<K, T, any>);
    delete(): void;
}
export type ConsumerList<K, T, ITERATOR> = {
    next: ConsumerList<K, T, ITERATOR>;
    prev: ConsumerList<K, T, ITERATOR>;
    consumer: KeyedCollectionConsumerCore<K, T, any>;
    source: KeyedCollection<K, T, ITERATOR>;
};
export declare abstract class KeyedCollection<K, T, ITERATOR> extends Subscribable<ITERATOR> implements StatefulSubscribable<ITERATOR> {
    consumers?: ConsumerList<K, T, ITERATOR>;
    abstract value: ITERATOR;
    consume(consumer: KeyedCollectionConsumer<K, T, any>): ConsumerList<K, T, ITERATOR>;
    abstract initialize_consumer(consumer: KeyedCollectionConsumerCore<K, T, any>): any;
    get(): ITERATOR;
    get(key: K): T;
}
