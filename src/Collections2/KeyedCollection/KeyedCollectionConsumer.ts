import { StatefulSubscribable, Subscribable } from "../../Core/Subscribable.js";
import { push_subscribable } from "../../Core/_events.js";
import { EMPTY } from "../Collection2.js";
import type { KeyedCollection, KeyedCollectionEntryRef, ConsumerList } from "./KeyedCollection.js";



// The core is used in all strong references. It gets manually cleaned up when its
// corresponding handler class gets GCed.
export class KeyedCollectionConsumerCore<K, T, O> extends Subscribable<O> implements StatefulSubscribable<O>
{

    // Linked list of any unprocessed dirty entries in the source.
    // Each ref contains the old value, and a fast way to retrieve the newest value.
    is_dirty?: KeyedCollectionEntryRef<K, T>; // truthy if something exists.

    _value: O; // To map, this would be another MapCollection. But it can also be just a number if we're summing, etc.

    refs2: ConsumerList<K, T, any>[] = [];



    // TODO : 1:1 mapping (see MappedCollection) could be optimized further:
    // polling could happen on a per-entry basis instead of settling the whole list.
    reducer: (ref: KeyedCollectionEntryRef<K, T>, current: O) => O;

    constructor(
        value: O,
        reducer: (ref: KeyedCollectionEntryRef<K, T>, current: O) => O,
    )
    {
        super();

        this._value = value;
        this.reducer = reducer;
    }

    /**
     * Prepend a ref to the dirty list. The ref must not currently be linked into any
     * list (entry.set and entry_added guarantee this).
     * If this is the first dirty entry since the last poll, invalidation is propagated
     * to this consumer's dependants (computeds etc.) exactly once — polling stays lazy.
     */
    enqueue(ref: KeyedCollectionEntryRef<K, T>)
    {
        const head = this.is_dirty;
        ref.prev = undefined;
        ref.next = head;
        this.is_dirty = ref;

        if (head !== undefined)
            head.prev = ref;
        else
            this.dirty();
    }

    /**
     * Bring `_value` up to date: settle upstream sources first (a source may itself be
     * a lazy MappedCollection), then reduce all pending dirty entries.
     */
    settle()
    {
        const sources = this.refs2;
        for (let i = 0; i < sources.length; i++)
            sources[i].source.settle();

        if (this.is_dirty)
            this.poll();
    }

    get()
    {
        this.settle();

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
            const next = dirty.next;

            this._value = this.reducer(dirty, this._value);

            const entry = dirty.ref;
            // Remember what we reduced so the next change diffs against it.
            dirty.old_value = entry.value;

            if (entry.value === EMPTY)
            {
                // The entry was deleted: drop the ref so entry+ref can be GCed.
                // Re-adding the key creates a fresh entry with fresh refs.
                dirty.prev = dirty.next = undefined;
            }
            else
            {
                // Move the ref back to the entry's subscriber list so it can receive
                // the next changes.
                const existing_subscribers = entry.subscribers;
                entry.subscribers = dirty;
                dirty.prev = undefined;
                dirty.next = existing_subscribers;
                if (existing_subscribers !== undefined)
                    existing_subscribers.prev = dirty;
            }

            // Proceed to the next dirty entry in this loop
            dirty = next;
        }
    }
}

/**
 * Detach a core from everything that references it: pending dirty refs, per-entry
 * subscriber lists, and the source collections' consumer lists.
 */
function release_core(core: KeyedCollectionConsumerCore<any, any, any>)
{
    core.is_dirty = undefined;
    const refs = core.refs2;
    for (let i = 0; i < refs.length; i++)
    {
        const subscriber = refs[i];
        subscriber.source.remove_consumer(core);

        if (subscriber.source.consumers === subscriber)
            subscriber.source.consumers = subscriber.next;
        if (subscriber.next)
            subscriber.next.prev = subscriber.prev;
        if (subscriber.prev)
            subscriber.prev.next = subscriber.next;
    }
    refs.length = 0;
}

// This gets called whenever a KeyedCollectionConsumer gets GCed.
// It cleans up all underlying subscriptions referencing the core object.
export const finalizer = new FinalizationRegistry(release_core);


export class KeyedCollectionConsumer<K, T, O>
{
    source: KeyedCollection<K, T, any>;

    core: KeyedCollectionConsumerCore<K, T, O>;

    constructor(
        value: O,
        reducer: (ref: KeyedCollectionEntryRef<K, T>, current: O) => O,
        source: KeyedCollection<K, T, any>
    )
    {
        this.core = new KeyedCollectionConsumerCore(value, reducer);

        this.source = source;

        source.consume(this);

        finalizer.register(this, this.core, this);
    }

    get() { return this.core.get(); } // this causes reactivity!

    /** Immediately detach from all sources instead of waiting for GC. */
    dispose()
    {
        finalizer.unregister(this);
        release_core(this.core);
    }
}
