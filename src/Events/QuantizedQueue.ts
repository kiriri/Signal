import { LinkedList } from "src/Core/Subscribable";

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


export interface Tickable extends LinkedList<(context: Tickable)=>any|void>
{
    end_time: number;
}

export function FixedArray<T>(length:number)
{
    // let result = {};

    // for(let i = 0; i < length; i++)
    // {
    //     result[i] = undefined;
    // }

    // return result as any as T[];

    // let arr = [];

    // for(let i = 0; i < length; i++)
    //     arr.push(undefined);

    // return arr;

    return new Array(length).fill(undefined);
    // return [
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,

    // ]
}

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
export class QuantizedQueue
{
    readonly bins_0: (Tickable|undefined)[] = FixedArray(bin_length); // The next {bin_length} ticks have individual action bins
    readonly bins_1: (Tickable|undefined)[] = FixedArray(bin_length); // Each array in here contains the combined values of the next {1<<bin_length} buckets. Meaning this bin contains the next {bin_length^2} buckets total, over {bin_length} individual bins.
    readonly bins_2: (Tickable|undefined)[] = FixedArray(bin_length); // same drill, but {bin_length} larger than the previous bin.
    readonly bins_3: (Tickable|undefined)[] = FixedArray(bin_length); // same drill
    readonly bins_4: (Tickable|undefined)[] = FixedArray(bin_length); // same drill. Everything further in the future will have to reschedule every 1<<40 ticks. (TODO)

    readonly bins = [this.bins_0, this.bins_1, this.bins_2, this.bins_3, this.bins_4];

    current_tick = 0;

    tick()
    {
        // TODO : Process bins
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

    tick_long(ticks:number)
    {
        let bin = this.bins_0;
        function _tick_long_process(relative_from:number, relative_to:number)
        {
            for(let i = relative_from; i <= relative_to; i++)
            {
                let _bin = bin[i];
                while(_bin !== undefined) { _bin.value(_bin); _bin = _bin.next as Tickable;  };
                bin[i] = undefined;
            }
        }

        let current_relative_tick = this.current_tick & bin_mask;

        if(current_relative_tick !== 0)
        {
            _tick_long_process(current_relative_tick, bin_length-1);
            this.current_tick += bin_length - current_relative_tick;
            this.rebin();
            ticks -= bin_length - current_relative_tick;
        }

        const full_bins = ~~(ticks / bin_length);

        for(let i = 0; i < full_bins; i++)
        {
            _tick_long_process(0, bin_length-1);
            this.current_tick += bin_length;
            this.rebin();
        }
        ticks -= bin_length * full_bins;

        if(ticks > 0)
        {
            _tick_long_process(0, ticks);
            this.current_tick += ticks;
            this.rebin();
        }
    }

    

    rebin(bin_index = 0)
    {
        // const _bin_length = 1 << (bin_log_length + bin_index);
        let lower_bin_index = (this.current_tick >> (bin_log_length * bin_index)) & bin_mask;

        // If the current tick is not neatly divisible by the bin's size, no rebin is in order  
        if (lower_bin_index)
            return false;

        let higher_bin_index = (this.current_tick >> (bin_log_length * (bin_index + 1))) & bin_mask;

        // Try rebinning the next higher level too
        this.rebin(bin_index + 1);


        // Now merge the current higher order bin into the bins below it
        const lower_level_bins = this.bins[bin_index];
        let higher_level_entry = this.bins[bin_index + 1][higher_bin_index];

        while (higher_level_entry !== undefined)
        {
            let next_entry = higher_level_entry.next;

            const lower_bin_index = (higher_level_entry.end_time >> (bin_log_length * bin_index)) & bin_mask;

            const lower_bin = lower_level_bins[lower_bin_index];
            higher_level_entry.next = lower_bin;
            higher_level_entry.prev = undefined;
            
            if(lower_bin !== undefined)
            {
                lower_bin.prev = higher_level_entry;
            }

            lower_level_bins[lower_bin_index] = higher_level_entry;

            higher_level_entry = next_entry as Tickable;
        }

        this.bins[bin_index + 1][higher_bin_index] = undefined;

        return true;
    }

    add(value: (context: Tickable)=>any|void, end_time : number)
    {
        const action = {
            value,
            end_time,
            prev:undefined,
            next:undefined
        };

        const current_tick = this.current_tick;
        
        if (end_time <= current_tick)
        {
            // Run instantly
            value(action);
            return action;
        }

        // const log_time = Math.log2(delta);
        const delta = end_time - current_tick;

        // Some microoptimized log2 calculations ( Because function calls are expensive, even builtin ones like Math.log2 )
        let log_delta = 0;
        let _delta = delta;
        while (_delta >>= 1) log_delta++;

        const bin_index = (log_delta >> bin_log_length_log); // divide by 8 because that's the bucket's log
        const bin = this.bins[bin_index];

        const bucket_index = (action.end_time >> bin_log_lengths[bin_index]) & bin_mask;
        let bucket_entry = bin[bucket_index];
        bin[bucket_index] = action;

        if(bucket_entry !== undefined)
        {
            bucket_entry.prev = action;
            action.next = bucket_entry;
        }

        return action;
    }

    remove(action: Tickable)
    {
        if(action.prev === undefined)
        {
            // find the correct bin; Because this action has no previous item, it should be first in that bin.
            // We will need to replace it with the next one in line.
         
            // const log_time = Math.log2(delta);
            const delta = action.end_time - this.current_tick;

            // Some microoptimized log2 calculations ( Because function calls are expensive, even builtin ones like Math.log2 )
            // TODO : Check if this is still the case 5 years later!
            let log_delta = 0;
            let _delta = delta;
            while (_delta >>= 1) log_delta++;

            const bucket = (log_delta >> bin_log_length_log); // divide by 8 because that's the bucket's log
            const bucket_index = (action.end_time >> bin_log_lengths[bucket]) & bin_mask;
            let bucket_entry = this.bins[bucket][bucket_index];

            if(bucket_entry !== action)
            {
                console.warn("Tried to remove an action which was not registered in the queue.")
                return;
            }

            this.bins[bucket][bucket_index] = action.next as Tickable;
        }
        else
        {
            if(action.prev !== undefined)
                action.prev.next = action.next;
            if(action.next !== undefined)
                action.next.prev = action.prev;
        }
    }

};
// export const queue = new ActionQueue();
// export const queue_first = new ActionQueue();

