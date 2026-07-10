import { DenseCollection, DenseCollectionEntry } from "./DenseCollection";
import { DenseCollectionConsumer } from "./DenseCollectionConsumer";
export declare class ArrayCollection<T> extends DenseCollection<T> {
    value: Array<DenseCollectionEntry<T>>;
    initialize_consumer(consumer: DenseCollectionConsumer<T, any>): void;
    push(value: T): void;
    pop(): void;
}
