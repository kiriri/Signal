import { LinkedList } from "../Core/Subscribable.js";

// Bins are sized as 2^bin_log_length entries. With bin_log_length = 8, each level
// holds 256 buckets, and we have 5 levels — covering up to 256^5 ticks of lookahead
// before we have to reschedule.
const bin_log_length = 8;
const bin_log_length_log = 3;

const bin_length = 1 << bin_log_length;
const bin_mask = bin_length - 1;
const bin_scale1 = bin_length ** 1;
const bin_scale2 = bin_length ** 2;
const bin_scale3 = bin_length ** 3;
const bin_scale4 = bin_length ** 4;
const bin_scale5 = bin_length ** 5;
const bin_scales = [bin_scale1, bin_scale2, bin_scale3, bin_scale4, bin_scale5];
const bin_log_lengths = [0, bin_log_length, bin_log_length * 2, bin_log_length * 3, bin_log_length * 4];
const bin_masks = [bin_mask, bin_mask << bin_log_length, bin_mask << (bin_log_length * 2), bin_mask << (bin_log_length * 3), bin_mask << (bin_log_length * 4)];


/**
 * Schedulable item. Extends a linked-list node so that all items ending at the same
 * bucket can chain together in O(1).
 */
export interface Tickable extends LinkedList<(context: Tickable) => any | void>
{
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
export function fixed_array<T>(length: number)
{
    return new Array(length).fill(undefined);
}

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
export class QuantizedQueue
{
    /** Level 0: one slot per upcoming tick (256 ticks of horizon). */
    readonly bins_0: (Tickable | undefined)[] = fixed_array(bin_length);
    /** Level 1: each slot covers `bin_length` ticks (256² = 65,536 ticks of horizon). */
    readonly bins_1: (Tickable | undefined)[] = fixed_array(bin_length);
    /** Level 2: each slot covers `bin_length²` ticks. */
    readonly bins_2: (Tickable | undefined)[] = fixed_array(bin_length);
    /** Level 3: each slot covers `bin_length³` ticks. */
    readonly bins_3: (Tickable | undefined)[] = fixed_array(bin_length);
    /** Level 4: each slot covers `bin_length⁴` ticks; topmost level. */
    readonly bins_4: (Tickable | undefined)[] = fixed_array(bin_length);

    /** Convenience array so `rebin` can iterate level numbers. */
    readonly bins = [this.bins_0, this.bins_1, this.bins_2, this.bins_3, this.bins_4];

    /** Logical clock. Incremented by every `tick`/`tick_long`. */
    current_tick = 0;

    /**
     * Advance the clock by one tick. Fires every action in the bottom-level bucket for
     * the current tick, then maybe rebins higher-level buckets down (if the new tick
     * is divisible by `bin_length`, we've crossed a level-1 boundary; if also by
     * `bin_length²`, a level-2 boundary; etc.).
     */
    tick()
    {
        const tick = this.current_tick;
        const bin_index = tick & bin_mask;
        let entry = this.bins_0[bin_index];

        while (entry !== undefined)
        {
            entry.value(entry);
            entry = entry.next as Tickable
        }
        this.bins_0[bin_index] = undefined;

        this.current_tick += 1;

        this.rebin();
    }

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
    tick_long(ticks: number)
    {
        let bin = this.bins_0;
        function _tick_long_process(relative_from: number, relative_to: number)
        {
            for (let i = relative_from; i <= relative_to; i++)
            {
                let _bin = bin[i];
                while (_bin !== undefined) { _bin.value(_bin); _bin = _bin.next as Tickable; };
                bin[i] = undefined;
            }
        }

        let current_relative_tick = this.current_tick & bin_mask;

        // Step 1: finish the current bucket if we're not aligned.
        if (current_relative_tick !== 0)
        {
            _tick_long_process(current_relative_tick, bin_length - 1);
            this.current_tick += bin_length - current_relative_tick;
            this.rebin();
            ticks -= bin_length - current_relative_tick;
        }

        // Step 2: process whole buckets at a time.
        const full_bins = ~~(ticks / bin_length);

        for (let i = 0; i < full_bins; i++)
        {
            _tick_long_process(0, bin_length - 1);
            this.current_tick += bin_length;
            this.rebin();
        }
        ticks -= bin_length * full_bins;

        // Step 3: leftover partial bucket.
        if (ticks > 0)
        {
            _tick_long_process(0, ticks);
            this.current_tick += ticks;
            this.rebin();
        }
    }

    /**
     * Cascade scheduled items down from higher levels to lower ones whenever the
     * clock crosses a level boundary.
     *
     * For example, when `current_tick` becomes divisible by `bin_length`, all the
     * items in the relevant level-1 bucket need to be redistributed into level-0
     * buckets according to their precise `end_time`. Same logic recursively applies
     * for level-2 → level-1, level-3 → level-2, etc.
     */
    rebin(bin_index = 0)
    {
        let lower_bin_index = (this.current_tick >> (bin_log_length * bin_index)) & bin_mask;

        // If the current tick isn't on a boundary at this level, no rebinning needed.
        if (lower_bin_index)
            return false;

        let higher_bin_index = (this.current_tick >> (bin_log_length * (bin_index + 1))) & bin_mask;

        // Try rebinning the next higher level too.
        this.rebin(bin_index + 1);


        // Splice items from the higher-level bucket into the appropriate lower-level
        // buckets.
        const lower_level_bins = this.bins[bin_index];
        let higher_level_entry = this.bins[bin_index + 1][higher_bin_index];

        while (higher_level_entry !== undefined)
        {
            let next_entry = higher_level_entry.next;

            const lower_bin_index = (higher_level_entry.end_time >> (bin_log_length * bin_index)) & bin_mask;

            const lower_bin = lower_level_bins[lower_bin_index];
            higher_level_entry.next = lower_bin;
            higher_level_entry.prev = undefined;

            if (lower_bin !== undefined)
            {
                lower_bin.prev = higher_level_entry;
            }

            lower_level_bins[lower_bin_index] = higher_level_entry;

            higher_level_entry = next_entry as Tickable;
        }

        this.bins[bin_index + 1][higher_bin_index] = undefined;

        return true;
    }

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
    add(value: (context: Tickable) => any | void, end_time: number)
    {
        const action = {
            value,
            end_time,
            prev: undefined,
            next: undefined
        };

        const current_tick = this.current_tick;

        // Should the action run this tick or in the past?
        if (end_time <= current_tick)
        {
            // Run instantly.
            value(action);
            return action;
        }

        const delta = end_time - current_tick;

        // Microoptimized log2: function calls (even Math.log2) are expensive in this
        // hot path. The loop terminates when `_delta` shifts to zero. TODO: re-benchmark
        // — modern engines may have made Math.log2 faster than this.
        let log_delta = 0;
        let _delta = delta;
        while (_delta >>= 1) log_delta++;

        const bin_index = (log_delta >> bin_log_length_log); // divide by 8 (bucket's log)
        const bin = this.bins[bin_index];

        const bucket_index = (action.end_time >> bin_log_lengths[bin_index]) & bin_mask;
        let bucket_entry = bin[bucket_index];
        bin[bucket_index] = action;

        if (bucket_entry !== undefined)
        {
            bucket_entry.prev = action;
            action.next = bucket_entry;
        }

        return action;
    }

    /**
     * Cancel a previously-added action. Pass the node returned by `add(...)`.
     *
     * If the action is still the head of its bucket, we have to find the bucket and
     * promote the next entry to the head. If it has a `prev`, simple linked-list
     * removal suffices.
     */
    remove(action: Tickable)
    {
        if (action.prev === undefined)
        {
            // Find the correct bin: since this action has no `prev`, it must be the
            // head of its bucket. We need to move the bucket's head to `action.next`.

            const delta = action.end_time - this.current_tick;

            // Microoptimized log2 — same as in `add`. TODO: check if this is still
            // faster than Math.log2 5+ years on.
            let log_delta = 0;
            let _delta = delta;
            while (_delta >>= 1) log_delta++;

            const bucket = (log_delta >> bin_log_length_log);
            const bucket_index = (action.end_time >> bin_log_lengths[bucket]) & bin_mask;
            let bucket_entry = this.bins[bucket][bucket_index];

            if (bucket_entry !== action)
            {
                console.warn("Tried to remove an action which was not registered in the queue.")
                return;
            }

            this.bins[bucket][bucket_index] = action.next as Tickable;
        }
        else
        {
            if (action.prev !== undefined)
                action.prev.next = action.next;
            if (action.next !== undefined)
                action.next.prev = action.prev;
        }
    }
};