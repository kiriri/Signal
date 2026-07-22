import { StatefulSubscribable, Subscribable } from "../../Core/Subscribable.js";
import { push_subscribable } from "../../Core/_events.js";
import { EMPTY } from "../Collection2.js";
import type { KeyedCollectionConsumer, KeyedCollectionConsumerCore } from "./KeyedCollectionConsumer.js";

export class KeyedCollectionEntry<K, T>
{
    // TODO : per-key reactivity for computeds. `get(key)` currently registers a
    // dependency on the whole collection. The plan is permanent per-key signal refs
    // which survive delete/add/set and can be depended upon individually.

    constructor(
        public source: KeyedCollection<K, T, any>,
        public readonly key: K,
        public value: T | typeof EMPTY,
        public subscribers: KeyedCollectionEntryRef<K, T> | undefined,
    )
    {

    }

    /**
     * Overwrite this entry's value (or pass EMPTY to mark it deleted) and move every
     * currently-clean consumer ref onto its consumer's dirty list.
     * Consumers which are already dirty for this entry are not in `subscribers` and
     * need no work — their ref picks up the newest value when they poll.
     */
    set(value: T | typeof EMPTY)
    {
        this.value = value;

        let subscriber = this.subscribers;
        this.subscribers = undefined; // all get moved to their consumers' dirty lists.
        while (subscriber)
        {
            const next = subscriber.next;

            // Prepend to the consumer's dirty list (inlined on the hot path; the same
            // logic lives in entry_added/initialize_consumer). On the clean→dirty
            // transition, propagate invalidation to the consumer's dependants once —
            // polling stays lazy.
            const consumer = subscriber.consumer;
            const head = consumer.is_dirty;
            subscriber.prev = undefined;
            subscriber.next = head;
            consumer.is_dirty = subscriber;
            if (head !== undefined)
                head.prev = subscriber;
            else
                consumer.dirty();

            subscriber = next;
        }

        this.source.dirty();
    }
}

// This is what links an entry to a consumer. It is allocated once per (entry, consumer)
// pair and then ping-pongs between exactly two doubly-linked lists:
// the entry's `subscribers` list (clean) and the consumer's `is_dirty` list (dirty).
// It is never in both at the same time.
// This avoids costly dynamic lookups and allocations on the set/poll hot paths.
export class KeyedCollectionEntryRef<K, T>
{
    constructor(
        // In KeyedCollectionEntry these link the next/prev subscriber,
        // in KeyedCollectionConsumerCore the next/prev dirty entry.
        public prev: KeyedCollectionEntryRef<K, T> | undefined,
        public next: KeyedCollectionEntryRef<K, T> | undefined,
        public old_value: T | typeof EMPTY,
        public ref: KeyedCollectionEntry<K, T>,
        public consumer: KeyedCollectionConsumerCore<K, T, any>,
    )
    {

    }
}

export type ConsumerList<K, T, ITERATOR> = {
    next: ConsumerList<K, T, ITERATOR> | undefined;
    prev: ConsumerList<K, T, ITERATOR> | undefined;
    consumer: KeyedCollectionConsumerCore<K, T, any>;
    source: KeyedCollection<K, T, ITERATOR>;
}

// Keyed collections are usually anything non arraylike.
export abstract class KeyedCollection<K, T, ITERATOR> extends Subscribable<ITERATOR> implements StatefulSubscribable<ITERATOR>
{
    consumers?: ConsumerList<K, T, ITERATOR>;
    abstract value: ITERATOR;

    /** Look up the live entry for a key, if any. */
    abstract entry(key: K): KeyedCollectionEntry<K, T> | undefined;

    /** Iterate all live entries. Used for consumer setup/teardown, not on hot paths. */
    abstract entries(): Iterable<KeyedCollectionEntry<K, T>>;

    abstract set(key: K, value: T): void;
    abstract delete(key: K): boolean;

    /**
     * Bring lazily-computed upstream state up to date (see MappedCollection).
     * A plain source collection is always current, so this is a no-op.
     */
    settle() { }

    consume(consumer: KeyedCollectionConsumer<K, T, any>)
    {
        const new_list_item: ConsumerList<K, T, ITERATOR> = {
            consumer: consumer.core,
            next: this.consumers,
            prev: undefined,
            source: this
        };
        if (this.consumers !== undefined)
            this.consumers.prev = new_list_item;
        this.consumers = new_list_item;

        // Mark all entries as dirty, but do not poll until it's required.
        this.initialize_consumer(consumer.core);

        consumer.core.refs2.push(new_list_item);

        return new_list_item;
    }

    initialize_consumer(consumer: KeyedCollectionConsumerCore<K, T, any>)
    {
        for (const entry of this.entries())
        {
            // Constructed directly as the new dirty-list head. No dirty() propagation:
            // a consumer being initialized cannot have dependants yet.
            const ref = new KeyedCollectionEntryRef(undefined, consumer.is_dirty, EMPTY, entry, consumer);
            if (consumer.is_dirty !== undefined)
                consumer.is_dirty.prev = ref;
            consumer.is_dirty = ref;
        }
    }

    /**
     * Register a freshly-created entry with every consumer (dirty directly, with
     * old_value EMPTY so reducers see it as an addition) and dirty the collection.
     */
    protected entry_added(entry: KeyedCollectionEntry<K, T>)
    {
        let consumer = this.consumers;
        while (consumer)
        {
            // Prepend a fresh ref to the consumer's dirty list; on the clean→dirty
            // transition, propagate invalidation to the consumer's dependants once.
            const core = consumer.consumer;
            const head = core.is_dirty;
            core.is_dirty = new KeyedCollectionEntryRef(undefined, head, EMPTY, entry, core);
            if (head !== undefined)
                head.prev = core.is_dirty;
            else
                core.dirty();

            consumer = consumer.next;
        }

        this.dirty();
    }

    /**
     * Unlink every entry ref belonging to `core` from the entry subscriber lists.
     * Called when a consumer is disposed or finalized. O(entries), but only runs
     * at teardown, never on the set/poll hot paths.
     */
    remove_consumer(core: KeyedCollectionConsumerCore<K, T, any>)
    {
        for (const entry of this.entries())
        {
            let ref = entry.subscribers;
            while (ref)
            {
                const next = ref.next;
                if (ref.consumer === core)
                {
                    if (entry.subscribers === ref)
                        entry.subscribers = ref.next;
                    if (ref.prev)
                        ref.prev.next = ref.next;
                    if (ref.next)
                        ref.next.prev = ref.prev;
                    break; // at most one ref per (entry, consumer) pair.
                }
                ref = next;
            }
        }
    }

    get(): ITERATOR;
    get(key: K): T | undefined;
    get(key?: K): T | ITERATOR | undefined
    {
        this.settle();

        // TODO : per-key dependency granularity — for now a keyed read depends on the
        // whole collection (over-invalidates, but is correct).
        push_subscribable(this);

        if (key !== undefined)
        {
            const entry = this.entry(key);
            return entry === undefined || entry.value === EMPTY ? undefined : entry.value;
        }

        return this.value;
    }
}
