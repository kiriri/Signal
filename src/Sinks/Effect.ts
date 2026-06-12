import EventManager from "src/Core/_events.js";
import type { I_Subscribable, LinkedList } from "../Core/Subscribable.js";
import Subscribable from "../Core/Subscribable.js";

type MappedSignals<Inputs extends Record<string, I_Subscribable<any>>> = {
    [K in keyof Inputs]: Inputs[K] extends Subscribable<infer U>
        ? U
        : Inputs[K] extends { get(): infer U } ? U : never
};

/**
 * Microtask body for an Effect's deferred run. Defined at module scope so it can
 * be reused across all Effects without allocating a new closure per registration.
 */
function async_caller(self: Effect<any, any>)
{
    self._dirty = false;
    if (self._initialized === false)
        self.initialize();
    self.fn(self._source_cache, self);
}

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
export class Effect<Inputs extends Record<string, I_Subscribable<any>>, T>
{
    /**
     * Most-recent value seen from each source, keyed by the same names as `sources`.
     * Built up as sources emit; populated lazily on first run for sources that haven't
     * emitted yet (see `initialize`).
     */
    _source_cache: Record<keyof Inputs, Inputs[keyof Inputs] extends Subscribable<infer U> ? U : never> = {} as any;

    /** Per-source subscription handles, used for `destroy()`. */
    _updaters: {
        [x: string]: LinkedList<WEAK_REF<(source: I_Subscribable<any>, value: any, ref: LinkedList<T>) => any | void>>;
    } = {};

    /** True between "a source changed" and "we ran fn". Prevents duplicate microtask scheduling. */
    _dirty = false;

    /** True after the first run, where we pull initial values from any source that hadn't emitted. */
    _initialized = false;

    /**
     * @param sources Record of source subscribables. Keys are arbitrary; the same keys
     *                appear on the `values` argument passed to `fn`.
     * @param fn      The side-effect function. Receives `(values, self)`.
     */
    constructor(
        public readonly sources: Inputs,
        public fn: (v: MappedSignals<Inputs>, self: any) => T
    )
    {
        // Subscribe to each source. We tag every subscription ref with its key so the
        // shared `update_key_function` below can write to the right slot in the cache
        // without allocating a per-source closure.
        for (let key in sources)
        {
            let ref = this._updaters[key] = sources[key].subscribe(this.update_key_function);
            // @ts-ignore
            ref.key = key;
        }
    }

    /**
     * Single subscriber function shared across all source signals. Uses the per-ref
     * `key` tag (set in the constructor) to know which cache slot to write.
     *
     * Sharing one function across all sources avoids allocating a new closure per
     * source, which matters for Effects with many inputs. Defined as an instance
     * arrow so the `WeakRef` GC story still works (one strong ref per Effect, not
     * per source).
     */
    update_key_function = (signal, value, ref) =>
    {
        // @ts-ignore
        this._source_cache[ref.key] = value;

        if (this._dirty)
            return;

        this._dirty = true;

        EventManager.register_async_emit(async_caller, this);
    };

    /**
     * Pull initial values from any source that hasn't emitted yet. Sources without
     * a `get()` method (i.e. stateless subscribables) get `null` as their initial
     * value.
     */
    initialize()
    {
        const sources = this.sources;
        for (let key in sources)
        {
            if (!(key in this._source_cache))
                this._source_cache[key] = (sources[key] as any)["get"]?.() ?? null;
        }

        this._initialized = true;
    }

    add_listener(key:string, source:I_Subscribable<any>)
    {
        const ref = this._updaters[key] = (this.sources[key] = source).subscribe(this.update_key_function);
        // @ts-ignore
        ref.key = key;
        return ref;
    }

    /**
     * Immediately remove all source subscriptions.
     *
     * Call this to make sure an Effect for sure no longer triggers. Without this,
     * garbage collection may take seconds before it cleans up an orphaned Effect,
     * during which time it will still fire whenever its sources change.
     */
    destroy()
    {
        for (let key in this.sources)
        {
            const source = this.sources[key];
            source.unsubscribe(this._updaters[key]);
        }
    }
}