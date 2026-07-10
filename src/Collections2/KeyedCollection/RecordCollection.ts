// import { EMPTY } from "../Collection2";
// import { KeyedCollection, KeyedCollectionEntry, KeyedCollectionEntryRef } from "./KeyedCollection";
// import { KeyedCollectionConsumer } from "./KeyedCollectionConsumer";

// export class RecordCollection<K extends string, T> extends KeyedCollection<K, T, Record<K, KeyedCollectionEntry<K, T>>>
// {
//     value = {} as Record<K, KeyedCollectionEntry<K, T>>;

//     constructor(value: Record<K, T>)
//     {
//         super();

//         for (let k in value)
//         {
//             this.set(k, value[k]);
//         }
//     }

//     get()
//     {
//         return this.value;
//     }

//     initialize_consumer(consumer: KeyedCollectionConsumer<K, T, any>)
//     {
//         for (let k in this.value)
//         {
//             const ref = this.value[k];
//             consumer.dirty = new KeyedCollectionEntryRef(
//                 undefined,
//                 consumer.dirty,
//                 EMPTY,
//                 ref,
//                 consumer
//             );
//         }
//     }

//     set(key: K, value: T)
//     {

//         let ref = this.value[key];
//         if (!ref)
//         {
//             ref = new KeyedCollectionEntry(
//                 this,
//                 key,
//                 value,
//                 undefined
//             );

//             this.value[key] = ref;
//             // Add all consumer/subscribers! (Dirty directly)
//             let consumer = this.consumers;
//             while (consumer)
//             {
//                 consumer.value.dirty = new KeyedCollectionEntryRef(
//                     undefined,
//                     consumer.value.dirty,
//                     EMPTY,
//                     ref,
//                     consumer.value
//                 );
//                 consumer = consumer.next;
//             }
//         }
//         else
//         {
//             ref.value = value;
//             // Iterate non dirty subscribers (see ref.subscribers)
//             // Consumers who are already dirty for this entry will not appear here. 
//             let subscriber = ref.subscribers;
//             while (subscriber)
//             {
//                 let next = subscriber.next;
//                 subscriber.next = subscriber.consumer.dirty;
//                 subscriber.consumer.dirty = subscriber;

//                 subscriber = next;
//             }
//             ref.subscribers = undefined; // all have been marked dirty.

//         }
//     }

//     delete(key: K)
//     {
//         let ref = this.value[key];
//         if (!ref)
//             return;

//         delete this.value[key];
//     }

// }