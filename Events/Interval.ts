import { NativeSignal } from "../Signal";
import { Subscribable } from "../Subscribable";

let intervals = new Map<number, NativeSignal<number>>();

const registry = new FinalizationRegistry((intervalId: NodeJS.Timeout) =>
{
    clearInterval(intervalId);
    console.log('Interval cleared because the function was garbage collected.');
});

// Get an event which fires every delta ms. 
// Events are shared and reused if they have common delta.
// That means events don't fire instantly.
// Events get GCed when they are no longer used.
export function Interval(delta: number) : NativeSignal<number>
{
    if (!intervals.has(delta))
    {
        let event = new NativeSignal<number>(0);

        const callback = ()=>{
            event.set(event._value+1);
        };

        // Bind the callback function so it won't get gc'ed until the signal itself does.
        (event as any)["interval_cbk"] = callback; 

        // Create a weak reference to the callback function
        const weakRef = new WeakRef(callback);

        // Set up the interval
        const intervalId = setInterval(() =>
        {
            // Get the callback from the weak reference
            const cb = weakRef.deref();
            if (cb)
            {
                // If the callback still exists, call it
                cb();
            } else
            {
                // If the callback has been garbage collected, clear the interval
                clearInterval(intervalId);
            }
        }, delta);

        // Register the interval ID for cleanup when the callback is garbage collected
        registry.register(callback, intervalId);

        intervals.set(delta, event);
    }

    return intervals.get(delta)!;
}