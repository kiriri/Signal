import { StatefulSubscribable, Subscribable } from "../Core";
import { KeyedCollection, KeyedCollectionEntryRef, ConsumerList } from "./KeyedCollection";
export declare class KeyedCollectionConsumerCore<K, T, O> extends Subscribable<O> implements StatefulSubscribable<O> {
    is_dirty?: KeyedCollectionEntryRef<K, T>;
    _value: O;
    refs2: ConsumerList<K, T, O>[];
    reducer: (ref: KeyedCollectionEntryRef<K, T>, current: O) => O;
    constructor(value: O, reducer: (ref: KeyedCollectionEntryRef<K, T>, current: O) => O, source: KeyedCollection<K, T, any>);
    get(): O;
    poll(): void;
}
export declare const finalizer: FinalizationRegistry<KeyedCollectionConsumerCore<any, any, any>>;
export declare class KeyedCollectionConsumer<K, T, O> {
    source: KeyedCollection<K, T, any>;
    core: KeyedCollectionConsumerCore<K, T, O>;
    constructor(value: O, reducer: (ref: KeyedCollectionEntryRef<K, T>, current: O) => O, source: KeyedCollection<K, T, any>);
    get(): O;
}
