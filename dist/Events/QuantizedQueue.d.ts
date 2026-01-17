import { LinkedList } from "src/Core/Subscribable";
export interface Tickable extends LinkedList<(context: Tickable) => any | void> {
    end_time: number;
}
export declare function FixedArray<T>(length: number): any[];
/**
 * For performance reasons, all actions will be assigned to buckets relative to how far in the future they are.
 * So everything in bins_0 will be done in the next {bin_length} ticks. And every tick will get the bin in bins_0[tick % bin_length].
 * When enough ticks pass, a higher order bin will be merged into the lower order bin corresponding to the delta time left for all actions in that bin.
 * It's hard to explain. Sorry. Just remember that the time in a single array in a higher order bin fills the entire bin in the
 * next lower level bin. Eg the single array bins_1[20] will when the time comes split into bins_0[0] all the
 * way to bins_0[bin_length], populating all arrays in bins_0. Same for all the higher order bins.
 */
/**
 * A quantized queue lets you register an event at a given time.
 * You can occasionally advance the time and events will emit
 * when they are due.
 */
export declare class QuantizedQueue {
    readonly bins_0: (Tickable | undefined)[];
    readonly bins_1: (Tickable | undefined)[];
    readonly bins_2: (Tickable | undefined)[];
    readonly bins_3: (Tickable | undefined)[];
    readonly bins_4: (Tickable | undefined)[];
    readonly bins: Tickable[][];
    current_tick: number;
    tick(): void;
    tick_long(ticks: number): void;
    rebin(bin_index?: number): boolean;
    add(value: (context: Tickable) => any | void, end_time: number): {
        value: (context: Tickable) => any | void;
        end_time: number;
        prev: any;
        next: any;
    };
    remove(action: Tickable): void;
}
