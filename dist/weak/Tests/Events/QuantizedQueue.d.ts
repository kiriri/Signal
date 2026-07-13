import { LinkedList } from "../Core/Subscribable.js";
/**
 * Schedulable item. Extends a linked-list node so that all items ending at the same
 * bucket can chain together in O(1).
 */
export interface Tickable extends LinkedList<(context: Tickable) => any | void> {
    /** Absolute tick at which this item should fire. */
    end_time: number;
}
/**
 * Allocate a fixed-size array of `length` slots, each `undefined`.
 *
 * Various alternative implementations are kept commented inline as a record of what
 * we tried (object-as-array, push loop, hardcoded literal of 256 undefineds). The
 * `new Array(length).fill(undefined)` form was the winner across V8/Bun.
 */
export declare function fixed_array<T>(length: number): any[];
/**
 * **A timing-wheel scheduler with five hierarchical levels.**
 *
 * The intuition: instead of one giant sorted heap of "things to do at tick N", each
 * action is dropped into a bucket whose granularity matches how far in the future
 * it is. Things scheduled in the next 256 ticks live in `bins_0` — one bucket per
 * tick. Things 256–65535 ticks out live in `bins_1` — one bucket per 256 ticks.
 * And so on through five levels.
 *
 * Adding an item is O(1): compute log2(delta), pick the right level, drop into the
 * appropriate bucket. Ticking is O(1) for the per-tick work; once every 256 ticks
 * we "rebin" — pull the contents of the next higher-level bucket down and spread
 * them across `bin_length` lower-level buckets.
 *
 * **Why this shape.** Standard heap-based timer wheels are O(log n) per insert and
 * O(log n) per fire. Hierarchical timing wheels are O(1) for both, at the cost of
 * occasional rebinning that's amortized across the level transitions. Worst-case
 * latency at the top level is bounded by `bin_length^5` ticks — for delta = 8 that's
 * over a trillion ticks of horizon.
 *
 * The wheel as implemented covers up to 256^5 = 1,099,511,627,776 ticks. Anything
 * scheduled further out than that will need its own external rescheduling logic
 * (TODO: not yet implemented).
 */
export declare class QuantizedQueue {
    /** Level 0: one slot per upcoming tick (256 ticks of horizon). */
    readonly bins_0: (Tickable | undefined)[];
    /** Level 1: each slot covers `bin_length` ticks (256² = 65,536 ticks of horizon). */
    readonly bins_1: (Tickable | undefined)[];
    /** Level 2: each slot covers `bin_length²` ticks. */
    readonly bins_2: (Tickable | undefined)[];
    /** Level 3: each slot covers `bin_length³` ticks. */
    readonly bins_3: (Tickable | undefined)[];
    /** Level 4: each slot covers `bin_length⁴` ticks; topmost level. */
    readonly bins_4: (Tickable | undefined)[];
    /** Convenience array so `rebin` can iterate level numbers. */
    readonly bins: Tickable[][];
    /** Logical clock. Incremented by every `tick`/`tick_long`. */
    current_tick: number;
    /**
     * Advance the clock by one tick. Fires every action in the bottom-level bucket for
     * the current tick, then maybe rebins higher-level buckets down (if the new tick
     * is divisible by `bin_length`, we've crossed a level-1 boundary; if also by
     * `bin_length²`, a level-2 boundary; etc.).
     */
    tick(): void;
    /**
     * Advance by `ticks` ticks at once. This is much cheaper than calling `tick()`
     * `ticks` times because it avoids the per-tick rebin overhead and inlines the
     * fire-bucket loop.
     *
     * Implementation strategy:
     *   1. If we're mid-bucket (current tick not aligned to `bin_length`), finish out
     *      the current low-level bin first.
     *   2. Process every fully-contained low-level bin via the inline `process` loop.
     *   3. Process whatever ticks remain after the last full-bin boundary.
     */
    tick_long(ticks: number): void;
    /**
     * Cascade scheduled items down from higher levels to lower ones whenever the
     * clock crosses a level boundary.
     *
     * For example, when `current_tick` becomes divisible by `bin_length`, all the
     * items in the relevant level-1 bucket need to be redistributed into level-0
     * buckets according to their precise `end_time`. Same logic recursively applies
     * for level-2 → level-1, level-3 → level-2, etc.
     */
    rebin(bin_index?: number): boolean;
    /**
     * Schedule a callback to fire when the clock reaches `end_time`. If `end_time`
     * is already in the past, the callback fires immediately (synchronously).
     *
     * Returns the action node — hold onto it if you might need to cancel via `remove`.
     *
     * **Microoptimized log2.** Rather than calling `Math.log2(delta)` (a function call
     * and float math), we use a tight bit-shift loop. This was meaningfully faster
     * when first written; worth re-benchmarking on modern V8 someday.
     */
    add(value: (context: Tickable) => any | void, end_time: number): {
        value: (context: Tickable) => any | void;
        end_time: number;
        prev: any;
        next: any;
    };
    /**
     * Cancel a previously-added action. Pass the node returned by `add(...)`.
     *
     * If the action is still the head of its bucket, we have to find the bucket and
     * promote the next entry to the head. If it has a `prev`, simple linked-list
     * removal suffices.
     */
    remove(action: Tickable): void;
}
