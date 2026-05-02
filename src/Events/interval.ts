import { NativeSignal } from "../Core/NativeSignal";

/**
 * Process-wide cache: one shared signal per `delta`. WeakRef so the signal can be
 * GC'd if nobody holds it; the FinalizationRegistry below reaps the underlying
 * `setInterval` when that happens.
 */
let intervals = new Map<number, WEAK_REF<NativeSignal<number>>>();

const registry = new FinalizationRegistry((interval_id: number) =>
{
    clearInterval(interval_id);
    // console.log('Interval cleared because nobody used its signal any longer.');
});

/**
 * Get a `NativeSignal<number>` that increments every `delta` milliseconds.
 *
 * **Sharing.** Calling `Interval(50)` twice returns the same signal both times.
 * That keeps the underlying `setInterval` from being scheduled multiple times for
 * the same delta.
 *
 * **GC.** The signal is held weakly by the cache, and `setInterval` itself only
 * sees a dereferenced lookup (not a closure over the signal), so once the caller
 * drops their reference the signal can be collected. When that happens the
 * `FinalizationRegistry` clears the interval. Note that the signal does NOT fire
 * instantly on subscription — it fires on the next interval boundary.
 *
 * **Caveat from the project README:** "you need to keep listener functions around
 * yourself. They will get garbage collected if you don't." Same applies to the
 * signal returned here — keep a reference if you want to keep ticking.
 */
export function interval(delta: number): NativeSignal<number>
{
    let signal = $USE_WEAK_REFS$ ? intervals.get(delta)?.["deref"]() : intervals.get(delta);

    if (!signal)
    {
        signal = new NativeSignal<number>(0);

        const interval_id = setInterval(() =>
        {
            // Don't reference the signal directly — that would pin it via the closure
            // held by setInterval (a global reference), preventing GC. Look it up via
            // the WeakRef cache instead.
            const signal = $USE_WEAK_REFS$ ? intervals.get(delta)?.["deref"]() : intervals.get(delta);
            signal?.set(signal._value + 1);
        }, delta);

        // Clean up the timer once the signal becomes unreachable.
        registry.register(signal, interval_id);

        intervals.set(delta, $USE_WEAK_REFS$ ? new WeakRef(signal) : signal);
    }

    return signal;
}