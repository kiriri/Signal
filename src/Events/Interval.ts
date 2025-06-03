import { NativeSignal } from "../Core/NativeSignal";
import { Subscribable } from "../Core/Subscribable";

let intervals = new Map<number, WeakRef<NativeSignal<number>>>();

const registry = new FinalizationRegistry((intervalId: NodeJS.Timeout) =>
{
    clearInterval(intervalId);
    console.log('Interval cleared because nobody used its signal any longer.');
});

// Get an event which fires every delta ms. 
// Events are shared and reused if they have common delta.
// That means events don't fire instantly.
// Events get GCed when they are no longer used.
export function Interval(delta: number) : NativeSignal<number>
{
    if (!intervals.has(delta))
    {
        let signal = new NativeSignal<number>(0);

        // Set up the interval
        const intervalId = setInterval(()=>{
            // Don't reference the signal directly, else it won't be able to get GCed because setInterval holds a reference to a function which references the signal. (Which means its permanently pinned in global space).
            const signal = intervals.get(delta)?.deref();
            signal?.set(signal._value+1);
        }, delta);

        // Register the interval ID for cleanup when the signal is garbage collected
        registry.register(signal, intervalId);

        intervals.set(delta, new WeakRef(signal));
    }

    const signal = intervals.get(delta)!.deref();

    // Has the signal since been GCed?
    if(!signal)
    {
        intervals.delete(delta);
        return Interval(delta); // try again from the top.
    }

    return signal;
}