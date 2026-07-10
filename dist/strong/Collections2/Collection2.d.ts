import { I_Subscribable, LinkedList, Subscribable } from "../Core/Subscribable.js";
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
export type SparseCollectionEntry<K, T> = {
    readonly key: K;
    value: T | typeof EMPTY;
    subscribers: SparseCollectionEntryRef<K, T> | undefined;
};
export type SparseCollectionEntryRef<K, T> = {
    next: SparseCollectionEntryRef<K, T>;
    old_value: T | typeof EMPTY;
    ref: SparseCollectionEntry<K, T>;
    consumer: SparseCollectionConsumer<K, T>;
};
export declare abstract class SparseCollection<K, T, ITERATOR extends Iterable<SparseCollectionEntry<K, T>> = Iterable<SparseCollectionEntry<K, T>>> {
    abstract set(key: K, value: T): any;
    abstract delete(key: K): any;
}
export declare class MapCollection<K, T> extends SparseCollection<K, T> {
    value: Map<K, SparseCollectionEntry<K, T>>;
    consumers?: LinkedList<SparseCollectionConsumer<K, T>>;
    set(key: K, value: T): void;
    delete(key: K): void;
}
export declare class SparseCollectionConsumer<K, T, ITERATOR extends Iterable<SparseCollectionEntry<K, T>> = Iterable<SparseCollectionEntry<K, T>>> {
    source: SparseCollection<K, T, ITERATOR>;
    dirty?: SparseCollectionEntryRef<K, T>;
}
export declare class DenseCollection<T, ITERATOR extends ArrayLike<T> = ArrayLike<T>> {
    value: ITERATOR;
    constructor(base: ITERATOR);
}
export declare abstract class Collection<T, ITERATOR extends Iterable<T> = Iterable<T>> implements I_NativeCollection<T, T | typeof EMPTY> {
    /** Named event subscribers, keyed by event name. Lazily allocated. */
    events: CollectionEventRef<T | typeof EMPTY> | undefined;
    /** True when a whole-collection emission is already scheduled for the next microtask. */
    queued: boolean;
    /** Returns an iterable over the current contents. */
    abstract get(): ITERATOR;
    subscribe_event(fn: (source: Subscribable<any, any>, event: T | typeof EMPTY, ref: EventRef<any>) => any): EventRef<any>;
    unsubscribe_event(reference: EventRef<any>): this;
    emit_item(event: T | typeof EMPTY, prev?: T | typeof EMPTY): this;
    /**
     * Mark the collection changed.
     *
     * Whereas the per-change *event* channel fires synchronously from the mutators,
     * whole-collection *value* subscribers are notified asynchronously: every mutation
     * in a tick coalesces into a single emission on the next microtask. The `queued`
     * flag guards against scheduling more than one emission per tick; it is cleared by
     * {@link on_emit} when that emission fires, so the next tick's mutations schedule
     * afresh.
     *
     * Shared by every collection (`SignalSet`/`SignalMap`/`SignalHeap`/`Order`) — the
     * subclasses only differ in *what* they emit, which {@link emit} resolves via `get()`.
     */
    dirty(source?: I_Subscribable<any>, ref?: LinkedList<any>): this;
    /**
     * Microtask callback registered by {@link dirty}. Clears `queued` (so the next
     * mutation can schedule a fresh emission) and emits the current contents. Receives
     * its target via `context` so it can live on the prototype without a bound `this`,
     * mirroring `NativeSignal.on_emit`.
     */
    on_emit(context: Collection<T, ITERATOR, Events>): void;
    /**
     * Emit the whole-collection value to value subscribers. Defaults to the current
     * contents via `get()`, so subclasses don't need to special-case their backing
     * field (e.g. `SignalHeap` emits a fresh iterator, `SignalSet`/`SignalMap` emit the
     * live `Set`/`Map`).
     */
    emit(value?: ITERATOR): this;
}
