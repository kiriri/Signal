import { DenseCollectionEntry, DenseCollection, DenseCollectionEntryRef } from "./DenseCollection";
export declare class DenseCollectionConsumer<T, O, ITERATOR extends Iterable<DenseCollectionEntry<T>> = Iterable<DenseCollectionEntry<T>>> {
    source: DenseCollection<T, ITERATOR>;
    dirty?: DenseCollectionEntryRef<T>;
    _value: O;
    reducer: (ref: DenseCollectionEntryRef<T>, current: O) => O;
    constructor(value: O, reducer: (ref: DenseCollectionEntryRef<T>, current: O) => O, source: DenseCollection<T, ITERATOR>);
    get(): O;
    poll(): void;
}
