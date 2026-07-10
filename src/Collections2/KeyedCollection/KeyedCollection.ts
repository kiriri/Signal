import { I_Subscribable, LinkedList, StatefulSubscribable, Subscribable } from "../../Core/Subscribable.js";
import EventManager, { push_subscribable } from "../../Core/_events.js";
import { EMPTY } from "../Collection2.js";
import { KeyedCollectionConsumer, KeyedCollectionConsumerCore } from "./KeyedCollectionConsumer.js";

export class KeyedCollectionEntry<K, T>
{
    // TODO : map collectionEntryRefs to permanent signal refs, 
    // which survive delete/add/set and are used in computeds. 
    private signals = new Map<K,T>();

    constructor(
        public source: KeyedCollection<K, T, any>,
        public readonly key: K,
        public value: T | typeof EMPTY,
        public subscribers: KeyedCollectionEntryRef<K, T> | undefined,
    )
    {

    }

    set(value: T)
    {
        this.value = value;

        // Iterate non dirty subscribers (see ref.subscribers)
        // Consumers who are already dirty for this entry will not appear here. 
        let subscriber = this.subscribers;
        while (subscriber)
        {
            let next = subscriber.next;
            subscriber.next = subscriber.consumer.is_dirty;
            subscriber.consumer.is_dirty = subscriber;

            subscriber = next;
        }
        this.subscribers = undefined; // all have been marked dirty.

        this.source.dirty();
    }
}

// This is what a subscriber/consumer holds. 
// They can use it's `ref` field to register themselves again to the subscribers linked list
// After they have processed the newest changes.
// This avoids costly dynamic lookups in each subscriber.
export class KeyedCollectionEntryRef<K, T>
{
    constructor(
        // In the SparseCollectionEntry this is the next subscriber, 
        // in SparseCollectionConsumer it's the next dirty entry.
        // EntryRefs are never in both at the same time.
        public prev: KeyedCollectionEntryRef<K, T>,
        public next: KeyedCollectionEntryRef<K, T>,
        public old_value: T | typeof EMPTY,
        public ref: KeyedCollectionEntry<K, T>,
        public consumer: KeyedCollectionConsumerCore<K, T, any>,
    )
    {

    }

    delete()
    {
        if(this.ref.subscribers === this)
            this.ref.subscribers = this.next;

        if(this.prev)
            this.prev.next = this.next;
        if(this.next)
            this.next.prev = this.prev;
    }
}

export type ConsumerList<K, T, ITERATOR> = {
    next: ConsumerList<K,T,ITERATOR>;
    prev:ConsumerList<K,T,ITERATOR>;
    consumer:KeyedCollectionConsumerCore<K, T, any>;
    source:KeyedCollection<K, T, ITERATOR>;
}

// Keyed collections are usually anything non arraylike.
export abstract class KeyedCollection<K, T, ITERATOR> extends Subscribable<ITERATOR> implements StatefulSubscribable<ITERATOR>
{
    consumers?: ConsumerList<K,T,ITERATOR>;
    abstract value: ITERATOR;

    consume(consumer: KeyedCollectionConsumer<K, T, any>)
    {
        let new_list_item = {
            consumer: consumer.core,
            next: this.consumers,
            prev:undefined,
            source: this
        }
        this.consumers.prev = new_list_item;
        this.consumers = new_list_item

        // Mark all entries as dirty, but do not poll until it's required.
        this.initialize_consumer(consumer.core);

        consumer.core.refs2.push(new_list_item)

        return this.consumers;
    }

    abstract initialize_consumer(consumer: KeyedCollectionConsumerCore<K, T, any>);

    get():ITERATOR;
    get(key:K):T;
    get(key?:K) : T | ITERATOR
    {
        // TODO : Work with computed!
        if(key !== undefined)
        {
            // TODO : Implement the exact item getter in subclasses!
            throw new Error("NotImplementedException");
        }

        push_subscribable(this);
        return this.value;
    }

    // abstract set(key: K, value: T);
    // abstract delete(key: K);

}


