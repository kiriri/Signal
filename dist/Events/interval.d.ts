import { NativeSignal } from "../Core/NativeSignal";
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
export declare function interval(delta: number): NativeSignal<number>;
