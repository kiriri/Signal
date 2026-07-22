import { EMPTY } from "../Collection2.js";
import type { KeyedCollection, KeyedCollectionEntryRef } from "./KeyedCollection.js";
import { MapCollection } from "./MapCollection.js";
import { KeyedCollectionConsumer } from "./KeyedCollectionConsumer.js";

/**
 * The 1:1 mapper: consumes a source KeyedCollection<K, S> and exposes the result as a
 * KeyedCollection<K, T> whose entries are `fn(value, key)` of the source entries.
 * Adds/sets/deletes on the source propagate as adds/sets/deletes on this collection.
 *
 * Because the output *is* a MapCollection, it can itself be consumed, mapped again, or
 * read per-key — mappers chain. Mapping stays lazy: source changes only invalidate
 * (marking this collection and its consumers dirty); `fn` runs when someone reads via
 * `get()` / `get(key)` or a downstream consumer settles.
 *
 * Do not `set`/`delete` on the mapped collection directly — the mapper owns its
 * entries, and will clobber such writes the next time the source key changes.
 *
 * TODO : per-entry polling — `get(key)` currently settles the whole dirty list; a 1:1
 * mapping could remap just the requested entry.
 */
export class MappedCollection<K, S, T> extends MapCollection<K, T>
{
    // Held strongly so the mapper's subscriptions live exactly as long as this
    // collection (the consumer's finalizer cleans up the source side on GC).
    private consumer: KeyedCollectionConsumer<K, S, MappedCollection<K, S, T>>;

    constructor(source: KeyedCollection<K, S, any>, fn: (value: S, key: K) => T)
    {
        super();

        const apply = (ref: KeyedCollectionEntryRef<K, S>, current: MappedCollection<K, S, T>) =>
        {
            const value = ref.ref.value;
            if (value === EMPTY)
                this.delete(ref.ref.key);
            else
                this.set(ref.ref.key, fn(value, ref.ref.key));
            return current;
        };

        this.consumer = new KeyedCollectionConsumer(this, apply, source);

        // A source change dirties the consumer core; registering this
        // collection as a dependant forwards that invalidation to computeds depending
        // on the mapped collection. Downstream *consumers* are instead reached through
        // the settle() chain when they poll.
        this.consumer.core.depend(this);
    }

    override settle()
    {
        this.consumer.core.settle();
    }

    /** Immediately detach from the source instead of waiting for GC. */
    dispose()
    {
        this.consumer.dispose();
    }
}
