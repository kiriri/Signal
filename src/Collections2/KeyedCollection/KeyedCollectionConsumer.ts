import { StatefulSubscribable, Subscribable } from "src/Core";
import { KeyedCollection, KeyedCollectionEntryRef, ConsumerList } from "./KeyedCollection";
import { push_subscribable } from "src/Core/_events";



// The core is used in all strong references. It gets manually cleaned up when its
// corresponding handler class gets GCed.
export class KeyedCollectionConsumerCore<K, T, O> extends Subscribable<O> implements StatefulSubscribable<O>
{

    // Linked list of any unprocessed dirty entries in the source.
    // This ref contains the old value, and a fast way to retrieve the newest value.
    is_dirty?: KeyedCollectionEntryRef<K, T>; // truthy if something exists.

    _value: O; // To map, this would be another MapCollection. But it can also be just a number if we're summing, etc.

    refs2: ConsumerList<K, T, O>[] = [];



    // TODO : 1:1 mapping will have optimizations over a generic reducer !
    // Eg polling can happen on a per-entry basis.
    reducer: (ref: KeyedCollectionEntryRef<K, T>, current: O) => O;

    constructor(
        value: O,
        reducer: (ref: KeyedCollectionEntryRef<K, T>, current: O) => O,
        source: KeyedCollection<K, T, any>
    )
    {
        super();

        this._value = value;
        this.reducer = reducer;
    }

    get()
    {

        if (this.is_dirty)
            this.poll();


        push_subscribable(this);
        return this._value;
    }

    poll()
    {

        let dirty = this.is_dirty;
        // Clear the dirty list now so side effects can add new ones.
        this.is_dirty = undefined;
        while (dirty)
        {
            let next = dirty.next;

            this._value = this.reducer(dirty, this._value);

            // Move the dirty entry back to the source collections so it can receive the next changes.
            let existing_subscribers = dirty.ref.subscribers;
            dirty.ref.subscribers = dirty;
            existing_subscribers.prev = dirty;
            dirty.next = existing_subscribers;
            
            // Proceed to the next dirty entry in this loop
            dirty = next;
        }
        // last one
        dirty.prev = undefined;

    }
}

// This gets called whenever a KeyedCollectionConsumer gets GCed.
// It cleans up all underlying subscriptions referencing the core object.
export const finalizer = new FinalizationRegistry((core: KeyedCollectionConsumerCore<any,any,any>)=>{
    core.is_dirty = undefined;
    for(let subscriber of core.refs2)
    {
        if (subscriber.source.consumers === subscriber)
            subscriber.source.consumers = subscriber.source.consumers.next;
        if (subscriber.next)
            subscriber.next.prev = subscriber.prev;
        if (subscriber.prev)
            subscriber.prev.next = subscriber.next;
    }
}
);


export class KeyedCollectionConsumer<K, T, O> 
{
    source: KeyedCollection<K, T, any>;

    core: KeyedCollectionConsumerCore<K,T,O>;

    constructor(
        value: O,
        reducer: (ref: KeyedCollectionEntryRef<K, T>, current: O) => O,
        source: KeyedCollection<K, T, any>
    )
    {
        this.core = new KeyedCollectionConsumerCore(value, reducer, source);

        this.source = source;

        source.consume(this);

        finalizer.register(this,this.core)
    }

    get() { return this.core.get(); } // this causes reactivity!
}
