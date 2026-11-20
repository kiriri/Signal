import { EMPTY } from "../Collection2.js";
import type { DenseCollection } from "./DenseCollection.js";
import { ArrayCollection } from "./ArrayCollection.js";
import { DenseCollectionConsumer } from "./DenseCollectionConsumer.js";

/**
 * The 1:1 mapper: consumes a source `DenseCollection<S>` and exposes the result as a
 * `DenseCollection<T>` whose slot `i` is `fn(source[i], i)`. Source push/set/pop
 * propagate as push/set/pop here. Because the output *is* an `ArrayCollection`, it can be
 * consumed, mapped again, or read per-index — mappers chain. Mapping stays lazy: source
 * changes only invalidate; `fn` runs when someone reads `get()` / `get(i)` / `length` or
 * a downstream consumer settles.
 *
 * Do not `push`/`pop`/`set` the mapped collection directly — the mapper owns its slots and
 * will clobber such writes on the next source change.
 *
 * ## Why settle reconciles by length instead of replaying the dirty list
 *
 * The keyed mapper can apply each dirty change independently because keyed set/delete are
 * order-independent. Dense structure is *not*: `push`/`pop` only touch the tail, but the
 * dirty queue is coalesced and unordered, so replaying it could try to pop a non-tail slot
 * or push out of order. Instead we take structure straight from the source: it is
 * contiguous, so its `_length` fully determines which slots must exist. We pop/​push to
 * match that length (both tail-only, hence order-safe) and use the dirty queue *only* to
 * learn which already-existing slots changed value (a positional `set`, order-independent).
 */
export class MappedArrayCollection<S, T> extends ArrayCollection<T>
{
    // Held strongly so the mapper's subscription lives exactly as long as this collection
    // (the consumer's finalizer cleans up the source side on GC).
    private consumer: DenseCollectionConsumer<S, MappedArrayCollection<S, T>>;
    private src: DenseCollection<S>;
    private fn: (value: S, index: number) => T;

    // Scratch reused across settles: source indices whose *value* changed this batch. The
    // recording reducer fills it during poll(); settle() drains it. Reused to avoid a
    // per-settle allocation.
    private changed: number[] = [];

    constructor(source: DenseCollection<S>, fn: (value: S, index: number) => T)
    {
        super();

        this.src = source;
        this.fn = fn;

        // The reducer is only a recorder: it notes which in-range slots the source
        // touched. All structural work (grow/shrink) happens in settle() from the source
        // length; removals arrive as value === EMPTY and are ignored here.
        const record = (value: S | typeof EMPTY, _old: S | typeof EMPTY, index: number, current: MappedArrayCollection<S, T>) =>
        {
            if (value !== EMPTY)
                this.changed.push(index);
            return current;
        };

        this.consumer = new DenseCollectionConsumer(this, record, source);

        // A source change dirties the consumer core; registering this collection as a
        // dependant forwards that invalidation to computeds depending on the mapped
        // collection. Downstream *consumers* are instead reached through the settle()
        // chain when they poll.
        this.consumer.core.depend(this);
    }

    override settle()
    {
        const core = this.consumer.core;

        // Bring the source up to date first (it may itself be a lazy mapper). That may in
        // turn dirty our consumer, so read the queue afterwards.
        this.src.settle();

        if (core.queueLength === 0)
            return; // nothing changed upstream since the last settle.

        const src = this.src.values;
        const n = this.src._length;
        const old = this._length;

        // 1. Shrink to match (removals). pop() is tail-only ⇒ order-safe regardless of the
        //    order pops arrived in the dirty queue.
        while (this._length > n)
            this.pop();

        // 2. Drain the dirty queue (poll → `record`) to learn which slots changed value.
        //    poll() also advances the consumer's per-slot old_value/present bookkeeping.
        this.changed.length = 0;
        core.poll();
        const changed = this.changed;

        // 3. Re-map slots that already existed and are still in range. New slots
        //    (index >= old) are handled by the grow step below, so skip them here to avoid
        //    a redundant double set().
        for (let k = 0; k < changed.length; k++)
        {
            const index = changed[k];
            if (index < old && index < n)
                this.set(index, this.fn(src[index], index));
        }
        this.changed.length = 0;

        // 4. Grow to match (adds). push() is tail-only and ascending ⇒ order-safe.
        while (this._length < n)
        {
            const index = this._length;
            this.push(this.fn(src[index], index));
        }
    }

    /** Immediately detach from the source instead of waiting for GC. */
    dispose()
    {
        this.consumer.dispose();
    }
}
