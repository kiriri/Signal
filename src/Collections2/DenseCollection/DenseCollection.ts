import { NativeSignal, ReadonlySignal } from "../../Core/NativeSignal.js";
import { StatefulSubscribable, Subscribable } from "../../Core/Subscribable.js";
import { push_subscribable } from "../../Core/_events.js";
import { EMPTY } from "../Collection2.js";
import type { DenseCollectionConsumerCore } from "./DenseCollectionConsumer.js";

export type TypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array
  | BigInt64Array
  | BigUint64Array
  | Float16Array;

/**
 * Creates a shallow clone of anything array-like (Array, TypedArray, arguments,
 * NodeList, strings via wrapper, or any object with a numeric `length`).
 * The result preserves the concrete type for Arrays and TypedArrays; other
 * array-likes are materialized into a plain Array.
 */
export function cloneArrayLike<T>(source: ArrayLike<T>): T[];
export function cloneArrayLike<A extends TypedArray>(source: A): A;
export function cloneArrayLike(source: ArrayLike<any> | TypedArray): any
{
    if (Array.isArray(source))
        return source.slice();

    if ((source as TypedArray).buffer !== undefined && ArrayBuffer.isView(source as ArrayBufferView))
        return (source as TypedArray).slice();

    const length = source.length;
    const out = new Array(length);
    for (let i = 0; i < length; i++)
        out[i] = (source as ArrayLike<any>)[i];

    return out;
}

/**
 * Dense collections are anything array-like: values live at contiguous integer indices
 * `0..length-1`. Only tail mutation is supported — `push` / `pop` / in-place `set` —
 * because splice-style operations would renumber existing slots and invalidate every
 * downstream consumer that is keyed on a stable index.
 *
 * ## Storage model (Tier 2 — no per-value objects)
 *
 * Unlike the keyed side (one heap `Entry` per key), the dense side stores values in a
 * single flat backing array `values` and everything reactive lives in flat, index-keyed
 * parallel arrays on the consumers. There is *no* object allocated per value.
 *
 * The backing array only ever grows (V8 grows it geometrically as we `push`). `pop`
 * decrements the logical `_length` but leaves the physical slot in place so the capacity
 * is reused by the next `push` — the array never shrinks. `values.length` is therefore
 * the high-water capacity; `_length` is the live count. All reads honor `_length`, so a
 * stale value sitting in a popped-but-not-yet-overwritten slot is never observed.
 *
 * A change at index `i` is broadcast to consumers by index (`core.mark_dirty(i)`); the
 * consumer records the change in its own flat state and reduces it lazily on `poll`. A
 * removal is not a distinct signal — a consumer detects it by finding a dirty index that
 * has fallen at or beyond the current `_length`.
 */
export abstract class DenseCollection<T> extends Subscribable<T[]> implements StatefulSubscribable<T[]>
{
    /**
     * Flat backing store. Physical length (`values.length`) is the high-water capacity
     * and never shrinks; slots at/after `_length` are stale and never read. Stored
     * packed (we only ever overwrite existing slots or `push` at the tail) so a numeric
     * `T` keeps V8's fast packed-elements representation.
     *
     * Public because consumers and mappers read it directly on the poll hot path; treat
     * it (and `_length`) as internal — do not mutate from outside the collection.
     */
    values: T[] = [];

    /** Live element count. `values.length - _length` slots are reusable dead capacity. */
    _length = 0;

    /** Consumers to broadcast per-index changes to. Array (not linked list) for cache-friendly iteration; O(1) swap-removal on dispose via `core.consumerIndex`. */
    consumers: DenseCollectionConsumerCore<T, any>[] = [];

    /**
     * Lazily allocated, sparse: `signals[i]` is the memoized per-index `ref(i)` signal,
     * or undefined. The collection drives it directly from `set`/`push`/`pop`. `undefined`
     * (via the EMPTY convention on the signal's value) means index `i` is currently at or
     * beyond `_length` — i.e. that positional slot has fallen off the live end.
     */
    protected signals?: (NativeSignal<T | undefined> | undefined)[];

    /** Look up the live value at an index (no dependency tracking). EMPTY if out of range. */
    protected raw(index: number): T | typeof EMPTY
    {
        return index < this._length ? this.values[index] : EMPTY;
    }

    /**
     * The number of live slots. Settles any lazy upstream first (a mapper only
     * reconciles its length on settle) and tracks as a whole-collection dependency —
     * length changes on every push/pop. Internal code reads `_length` directly.
     */
    get length()
    {
        this.settle();
        push_subscribable(this);
        return this._length;
    }

    /**
     * Append a value and return its index (a stable O(1) write handle: `set(index, …)`).
     * Reuses dead capacity left by earlier pops before growing the backing array.
     */
    push(value: T): number
    {
        const index = this._length;

        if (index < this.values.length)
            this.values[index] = value;   // reuse a dead slot; stays packed
        else
            this.values.push(value);      // extend; V8 grows the backing store geometrically
        this._length = index + 1;

        const consumers = this.consumers;
        for (let c = 0; c < consumers.length; c++)
            consumers[c].mark_dirty(index);

        // A per-index signal for this slot may survive from a previous element that once
        // occupied it (positional refs). Bring it back to life with the new value.
        if (this.signals !== undefined)
        {
            const signal = this.signals[index];
            if (signal !== undefined)
                signal.set(value);
        }

        this.dirty();
        return index;
    }

    /**
     * Remove and return the last value (or `undefined` if empty). The slot is left in the
     * backing array (capacity is reused, never shrunk); consumers learn of the removal by
     * seeing the dirtied index sit at/beyond the new `_length`.
     */
    pop(): T | undefined
    {
        const index = this._length - 1;
        if (index < 0)
            return undefined;

        const value = this.values[index];
        this._length = index; // the slot is now dead; its stale value is never read again.

        const consumers = this.consumers;
        for (let c = 0; c < consumers.length; c++)
            consumers[c].mark_dirty(index);

        if (this.signals !== undefined)
        {
            const signal = this.signals[index];
            if (signal !== undefined)
                signal.set(undefined); // fell off the live end.
        }

        this.dirty();
        return value;
    }

    /** Overwrite the value at an existing index. Out-of-range indices are rejected — grow with `push`. */
    set(index: number, value: T)
    {
        if (index < 0 || index >= this._length)
            throw new RangeError(`DenseCollection.set: index ${index} is out of range [0, ${this._length})`);

        this.values[index] = value;

        const consumers = this.consumers;
        for (let c = 0; c < consumers.length; c++)
            consumers[c].mark_dirty(index);

        if (this.signals !== undefined)
        {
            const signal = this.signals[index];
            if (signal !== undefined)
                signal.set(value);
        }

        this.dirty();
    }

    /**
     * A readonly signal tracking the value at *positional slot* `index`. It only updates
     * when this exact index changes (see `set`/`push`/`pop`), so depending on it doesn't
     * over-invalidate the way `get(index)` does. `index` must currently be in range.
     *
     * The signal is positional, not element-bound: if the slot is `pop`ed the signal
     * reads `undefined`; a later `push` that refills the slot revives it with the new
     * element's value.
     */
    ref(index: number): ReadonlySignal<T | undefined>
    {
        this.settle();

        if (index < 0 || index >= this._length)
            throw new RangeError(`DenseCollection.ref: index ${index} is out of range [0, ${this._length})`);

        let signals = this.signals;
        if (signals === undefined)
            signals = this.signals = [];

        let signal = signals[index];
        if (signal === undefined)
            signal = signals[index] = new NativeSignal<T | undefined>(this.values[index]);

        return signal;
    }

    /**
     * Bring lazily-computed upstream state up to date (see MappedArrayCollection).
     * A plain source collection is always current, so this is a no-op.
     */
    settle() { }

    consume(consumer: { core: DenseCollectionConsumerCore<T, any> })
    {
        const core = consumer.core;
        core.consumerIndex = this.consumers.length;
        this.consumers.push(core);

        // Mark all existing slots dirty (present bit stays 0 ⇒ reducers see them as
        // additions on the first poll). Does not poll — that stays lazy.
        this.initialize_consumer(core);
    }

    initialize_consumer(core: DenseCollectionConsumerCore<T, any>)
    {
        const n = this._length;
        if (n === 0)
            return;

        core.ensure_capacity(n - 1);
        for (let i = 0; i < n; i++)
            core.mark_dirty(i);
    }

    get(): T[];
    get(index: number): T | undefined;
    get(index?: number): T | T[] | undefined
    {
        this.settle();

        // A whole-collection read depends on every change (over-invalidates, but is
        // correct). For per-index granularity, depend on `ref(index)` instead.
        push_subscribable(this);

        if (index !== undefined)
            return index < 0 || index >= this._length ? undefined : this.values[index];

        return this.values.slice(0, this._length);
    }

    /** Materialize the live values into a fresh plain array (snapshot; excludes dead capacity). */
    toArray(): T[]
    {
        this.settle();
        push_subscribable(this);
        return this.values.slice(0, this._length);
    }
}
