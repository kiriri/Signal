import { KeyedCollection, KeyedCollectionEntry } from "./KeyedCollection";
import { KeyedCollectionConsumerCore } from "./KeyedCollectionConsumer";
export declare class MapCollection<K, T> extends KeyedCollection<K, T, Map<K, KeyedCollectionEntry<K, T>>> {
    value: Map<K, KeyedCollectionEntry<K, T>>;
    constructor(value: Map<K, T>);
    initialize_consumer(consumer: KeyedCollectionConsumerCore<K, T, any>): void;
    set(key: K, value: T): void;
    delete(key: K): void;
}
