import type { I_Subscribable, LinkedList } from "../Core/Subscribable.js";
import Subscribable from "../Core/Subscribable.js";
type MappedSignals<Inputs extends Record<string, I_Subscribable<any>>> = {
    [K in keyof Inputs]: Inputs[K] extends Subscribable<infer U> ? U : Inputs[K] extends {
        get(): infer U;
    } ? U : never;
};
/**
 * A side-effect sink that re-runs whenever any of a fixed set of named source
 * subscribables changes.
 *
 * **What it is for.** When you want "do X when any of these signals changes", and
 * you don't need a derived value back. The function `fn` receives a record of the
 * current values of every source, keyed by the same names you passed in `sources`.
 *
 * **Coalescing.** Like `NativeSignal`, multiple synchronous source changes within a
 * tick collapse into a single `fn` invocation on the next microtask. The `_dirty`
 * flag prevents double-registration.
 *
 * **Lifecycle.** An Effect is alive as long as anyone holds a reference to it.
 * Subscriptions are held by the source signals, but those references are weak — so
 * if your Effect goes out of scope, it stops firing. Call `destroy()` to stop
 * firing immediately rather than waiting for GC.
 *
 * Note that `Effect` does **not** extend `Subscribable` — it has no observers of its
 * own, it only consumes.
 */
export declare class Effect<Inputs extends Record<string, I_Subscribable<any>>, T> {
    readonly sources: Inputs;
    fn: (v: MappedSignals<Inputs>, self: any) => T;
    /**
     * Most-recent value seen from each source, keyed by the same names as `sources`.
     * Built up as sources emit; populated lazily on first run for sources that haven't
     * emitted yet (see `initialize`).
     */
    _source_cache: Record<keyof Inputs, Inputs[keyof Inputs] extends Subscribable<infer U> ? U : never>;
    /** Per-source subscription handles, used for `destroy()`. */
    _updaters: {
        [x: string]: LinkedList<WEAK_REF<(source: I_Subscribable<any>, value: any, ref: LinkedList<T>) => any | void>>;
    };
    /** True between "a source changed" and "we ran fn". Prevents duplicate microtask scheduling. */
    _dirty: boolean;
    /** True after the first run, where we pull initial values from any source that hadn't emitted. */
    _initialized: boolean;
    /**
     * @param sources Record of source subscribables. Keys are arbitrary; the same keys
     *                appear on the `values` argument passed to `fn`.
     * @param fn      The side-effect function. Receives `(values, self)`.
     */
    constructor(sources: Inputs, fn: (v: MappedSignals<Inputs>, self: any) => T);
    /**
     * Single subscriber function shared across all source signals. Uses the per-ref
     * `key` tag (set in the constructor) to know which cache slot to write.
     *
     * Sharing one function across all sources avoids allocating a new closure per
     * source, which matters for Effects with many inputs. Defined as an instance
     * arrow so the `WeakRef` GC story still works (one strong ref per Effect, not
     * per source).
     */
    update_key_function: (signal: any, value: any, ref: any) => void;
    /**
     * Pull initial values from any source that hasn't emitted yet. Sources without
     * a `get()` method (i.e. stateless subscribables) get `null` as their initial
     * value.
     */
    initialize(): void;
    /**
     * Immediately remove all source subscriptions.
     *
     * Call this to make sure an Effect for sure no longer triggers. Without this,
     * garbage collection may take seconds before it cleans up an orphaned Effect,
     * during which time it will still fire whenever its sources change.
     */
    destroy(): void;
}
export {};
