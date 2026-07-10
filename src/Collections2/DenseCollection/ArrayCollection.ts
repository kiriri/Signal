import { EMPTY } from "../Collection2";
import { DenseCollection, DenseCollectionEntry } from "./DenseCollection";
import { DenseCollectionConsumer } from "./DenseCollectionConsumer";

export class ArrayCollection<T> extends DenseCollection<T>
{
    value: Array<DenseCollectionEntry<T>>;

    initialize_consumer(consumer: DenseCollectionConsumer<T, any>)
    {
        for(let ref of this.value.values())
        {
            consumer.dirty = {
                next: consumer.dirty,
                old_value: EMPTY,
                ref,
                consumer
            }
        }
    }

    push(value: T)
    {

        let ref = this.value.get(key);
        if (!ref)
        {
            ref = {
                key,
                value: EMPTY,
                subscribers: undefined
            };

            this.value.set(key, ref);
            // Add all consumer/subscribers! (Dirty directly)
            let consumer = this.consumers;
            while (consumer)
            {
                consumer.value.dirty = {
                    next: consumer.value.dirty,
                    old_value: EMPTY,
                    ref,
                    consumer: consumer.value
                }
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
                subscriber.next = subscriber.consumer.dirty;
                subscriber.consumer.dirty = subscriber;

                subscriber = next;
            }
            ref.subscribers = undefined; // all have been marked dirty.

        }
    }

    pop()
    {
        this.value.delete(key);
    }

}