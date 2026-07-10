import { EMPTY } from "../Collection2";
import { KeyedCollection, KeyedCollectionEntry, KeyedCollectionEntryRef } from "./KeyedCollection";
import { KeyedCollectionConsumer, KeyedCollectionConsumerCore } from "./KeyedCollectionConsumer";

export class MapCollection<K, T> extends KeyedCollection<K, T, Map<K, KeyedCollectionEntry<K, T>>>
{
    value: Map<K, KeyedCollectionEntry<K, T>>;

    constructor(value: Map<K, T>)
    {
        super();

        for(let [k,v] of value)
        {
            this.set(k, v);
        }
    }

    initialize_consumer(consumer: KeyedCollectionConsumerCore<K, T, any>)
    {
        for(let ref of this.value.values())
        {
            let r = new KeyedCollectionEntryRef(
                undefined,
                consumer.is_dirty,
                EMPTY,
                ref,
                consumer
            );

            if(consumer.is_dirty)
                consumer.is_dirty.prev = r;

            consumer.is_dirty = r;
        }
    }

    set(key: K, value: T)
    {

        let ref = this.value.get(key);
        if (!ref)
        {
            ref = new KeyedCollectionEntry(
                this,
                key,
                value,
                undefined
            );

            this.value.set(key, ref);
            // Add all consumer/subscribers! (Dirty directly)
            let consumer = this.consumers;
            while (consumer)
            {
                let r = new KeyedCollectionEntryRef(
                    undefined,
                    consumer.consumer.is_dirty,
                    EMPTY,
                    ref,
                    consumer.consumer
                );
                if(consumer.consumer.is_dirty)
                    consumer.consumer.is_dirty.prev = r;
                consumer.consumer.is_dirty = r;
                consumer = consumer.next;
            }
        }
        else
        {
            ref.value = value;
            // Iterate non dirty subscribers (see ref.subscribers)
            // Consumers who are already dirty for this entry will not appear here. 
            let subscriber = ref.subscribers;
            while (subscriber)
            {
                let next = subscriber.next;
                // prepend subscriber to the consumer's dirty list:
                subscriber.next = subscriber.consumer.is_dirty;
                if(subscriber.consumer.is_dirty)
                    subscriber.consumer.is_dirty.prev = subscriber;
                subscriber.consumer.is_dirty = subscriber;
                
                subscriber = next;
            }
            // last prepended subscriber has no prev:
            if(subscriber)
                subscriber.prev = undefined;
            ref.subscribers = undefined; // all have been marked dirty.

        }

        this.dirty();
    }

    delete(key: K)
    {
        this.value.delete(key);
        this.dirty();

    }

}