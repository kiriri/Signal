import { Subscribable, StatefulSubscribable } from "../../Core/Subscribable.js";
import { push_subscribable } from "../../Core/_events.js";
import { EMPTY } from "../Collection2.js";
import type { DenseCollection } from "./DenseCollection.js";

/**
 * The reducer folds one per-index change into the running aggregate. It receives values
 * directly (not a ref wrapper), so it is representation-agnostic — the identical shape
 * works for the keyed side. `value`/`old_value` are `EMPTY` when the slot is absent
 * (a removal has `value === EMPTY`; a fresh addition has `old_value === EMPTY`).
 */
export type DenseReducer<T, O> = (
    value: T | typeof EMPTY,
    old_value: T | typeof EMPTY,
    index: number,
    current: O,
) => O;

const DIRTY = 1;   // this slot is already queued this batch (dedup / coalescing).
const PRESENT = 2; // this consumer currently counts a contribution from this slot.

const EMPTY_U8 = new Uint8Array(0);
const EMPTY_U32 = new Uint32Array(0);

/**
 * The reactive consumer, Tier-2 style: *no* per-(slot, consumer) ref objects. All state
 * is flat, index-keyed, and grown geometrically (never shrunk):
 *
 *   - `flags[i]`   — DIRTY | PRESENT bits for slot `i`.
 *   - `oldValues[i]` — what this consumer last folded in for slot `i` (valid iff PRESENT).
 *   - `queue`      — the list of dirty indices to visit on the next poll (deduped by DIRTY).
 *
 * A removal carries no explicit marker: on poll, a dirty index that now sits at/beyond
 * the source's live `_length` is a removal (`value = EMPTY`), and its old contribution is
 * subtracted out via the PRESENT bit.
 *
 * Single-source by construction: the parallel arrays are indexed by the source's slot,
 * so a consumer folds exactly one dense collection.
 */
export class DenseCollectionConsumerCore<T, O> extends Subscribable<O> implements StatefulSubscribable<O>
{
    source?: DenseCollection<T>;
    // Position in `source.consumers`, kept current for O(1) swap-removal on dispose.
    consumerIndex = -1;

    _value: O;
    reducer: DenseReducer<T, O>;

    // Flat per-slot state. Capacity is `flags.length === queue.length`; grown by doubling.
    flags: Uint8Array = EMPTY_U8;
    queue: Uint32Array = EMPTY_U32;
    oldValues: T[] = [];
    queueLength = 0;
    capacity = 0;

    constructor(value: O, reducer: DenseReducer<T, O>, source: DenseCollection<T>)
    {
        super();
        this._value = value;
        this.reducer = reducer;
        this.source = source;
    }

    /** Ensure `flags`/`queue` cover `index`, doubling (and copying) as needed. Never shrinks. */
    ensure_capacity(index: number)
    {
        if (index < this.capacity)
            return;

        let capacity = this.capacity === 0 ? 4 : this.capacity;
        while (capacity <= index)
            capacity *= 2;

        const flags = new Uint8Array(capacity);
        flags.set(this.flags); // preserves DIRTY/PRESENT bits for existing slots.
        this.flags = flags;

        const queue = new Uint32Array(capacity);
        queue.set(this.queue.subarray(0, this.queueLength)); // preserves already-queued indices.
        this.queue = queue;

        this.capacity = capacity;
    }

    /**
     * Record that slot `index` changed (or was added/removed). Deduped by the DIRTY bit
     * so repeated writes to the same slot in a batch coalesce. On the clean→dirty
     * transition, propagate invalidation to dependants once so polling stays lazy.
     */
    mark_dirty(index: number)
    {
        if (index >= this.capacity)
            this.ensure_capacity(index);

        const flags = this.flags;
        if ((flags[index] & DIRTY) !== 0)
            return;

        if (this.queueLength === 0)
            this.dirty(); // clean → dirty: invalidate dependants exactly once.

        flags[index] |= DIRTY;
        this.queue[this.queueLength++] = index;
    }

    /**
     * Bring `_value` up to date: settle the source first (it may be a lazy mapper), then
     * reduce every queued index.
     */
    settle()
    {
        if (this.source !== undefined)
            this.source.settle();

        if (this.queueLength > 0)
            this.poll();
    }

    get()
    {
        if (this.source !== undefined)
            this.source.settle();

        if (this.queueLength > 0)
            this.poll();

        push_subscribable(this);
        return this._value;
    }

    /**
     * Fold every queued slot into `_value`. A slot now at/beyond the source length is a
     * removal (`value = EMPTY`); its previously-counted contribution is subtracted via the
     * PRESENT bit. Reducers must be pure w.r.t. their own source (they may not mutate the
     * collection they are folding during a poll).
     */
    poll()
    {
        const queue = this.queue;
        const flags = this.flags;
        const oldValues = this.oldValues;
        const source = this.source!;
        const values = source.values;
        const n = source._length;
        const reducer = this.reducer;
        const length = this.queueLength;

        let value = this._value;
        for (let k = 0; k < length; k++)
        {
            const index = queue[k];
            const flag = flags[index];
            const was_present = (flag & PRESENT) !== 0;
            const in_range = index < n;

            const new_value = in_range ? values[index] : EMPTY;
            const old_value = was_present ? oldValues[index] : EMPTY;

            value = reducer(new_value, old_value, index, value);

            if (in_range)
            {
                oldValues[index] = values[index];
                flags[index] = (flag & ~DIRTY) | PRESENT;
            }
            else
            {
                // Removed: clear DIRTY and drop PRESENT so a future re-add counts as an addition.
                flags[index] = flag & ~(DIRTY | PRESENT);
            }
        }
        this.queueLength = 0;
        this._value = value;
    }
}

/**
 * Detach a core from its source in O(1): swap-remove it from the source's consumer array.
 */
function release_core(core: DenseCollectionConsumerCore<any, any>)
{
    const source = core.source;
    if (source === undefined)
        return; // already released.

    const consumers = source.consumers;
    const index = core.consumerIndex;
    const last = consumers.pop();
    if (last !== undefined && last !== core)
    {
        consumers[index] = last;
        last.consumerIndex = index;
    }

    core.source = undefined;
    core.consumerIndex = -1;
    core.queueLength = 0;
}

// This gets called whenever a DenseCollectionConsumer gets GCed.
// It cleans up the source-side subscription referencing the core object.
export const finalizer = new FinalizationRegistry(release_core);


export class DenseCollectionConsumer<T, O>
{
    source: DenseCollection<T>;
    core: DenseCollectionConsumerCore<T, O>;

    constructor(value: O, reducer: DenseReducer<T, O>, source: DenseCollection<T>)
    {
        this.core = new DenseCollectionConsumerCore(value, reducer, source);
        this.source = source;

        source.consume(this);

        finalizer.register(this, this.core, this);
    }

    get() { return this.core.get(); } // this causes reactivity!

    /** Immediately detach from the source instead of waiting for GC. */
    dispose()
    {
        finalizer.unregister(this);
        release_core(this.core);
    }
}
