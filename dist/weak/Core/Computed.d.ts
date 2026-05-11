import { Dirtyable, I_Subscribable, LinkedList, StatefulSubscribable, Subscribable } from "./Subscribable.js";
/**
 * A signal whose value is *derived* from other signals via a user-provided function.
 *
 * **Auto-tracked dependencies.** When the function runs, every signal whose `get()` is
 * called registers itself as a dependency. There is no manual dependency declaration —
 * if your function reads `a.get() + b.get()`, the computed depends on `a` and `b`.
 * Conditional reads work too: branches that don't run on a given evaluation simply
 * aren't dependencies of that evaluation.
 *
 * **Lazy by default.** A non-eager `Computed` doesn't run its function until something
 * shows interest (someone calls `get()` or `subscribe(...)`). Once it has run at least
 * once, dependency invalidation will cause the cached value to be marked dirty; the
 * next `get()` recomputes.
 *
 * **Eager mode.** Pass `eager = true` to act like a sink/effect: the function runs
 * once at construction and re-runs whenever any dependency changes, regardless of
 * whether anyone is reading the result. Use this when the side effect of computing
 * is what you want, not the value.
 *
 * **GC behavior.** Like other subscribables, dependants are held weakly. If nothing
 * references a Computed, it gets collected. Eager computeds keep themselves alive
 * via their own dependency edges only as long as they are reachable.
 */
export declare class Computed<T, CONTEXT = any> extends Subscribable<T> implements StatefulSubscribable<T>, Dirtyable {
    /**
     * Currently-tracked dependencies, paired with the linked-list reference returned
     * by `depend()`. We store them in an array (not a Set/Map) because the array is
     * recycled across recomputations — this is significantly faster than recomputing
     * a difference between old and new dependency sets each time. See `_get`.
     */
    subscribed_to: {
        signal: Subscribable<any>;
        ref: any;
    }[];
    /** The user-provided function. The dependencies are captured by closure inside `fn`. */
    readonly fn: (self: CONTEXT) => T;
    /** Optional `this`-like context object passed to `fn` on each evaluation. */
    readonly context: CONTEXT;
    /**
     * Tri-state dirty flag:
     *   - `"first"` — never run yet, will subscribe to dependencies on first `get`/`subscribe`.
     *   - `true`    — known stale, recompute on next `get`.
     *   - `false`   — `_cache` is current.
     */
    _dirty: boolean | "first";
    /** Last computed value. Defined after the first evaluation. */
    _cache: T;
    /** Whether this computed re-runs whenever a dependency changes (vs lazily on `get`).
     * An eager computed behaves more like an 'Effect' .
    */
    _eager: boolean;
    /**
     * @param fn       The function that computes the value.
     * @param context  Optional context object passed to `fn`.
     * @param eager    If true, behaves like a sink: runs immediately and on every dep change.
     *                 Default false (lazy: only runs when someone reads it).
     */
    constructor(fn: (self: CONTEXT) => T, context?: CONTEXT, eager?: boolean);
    on_emit(context: Computed<T, CONTEXT>): void;
    /**
     * Mark this computed dirty and propagate through the dependency graph.
     *
     * The early return on `_dirty === true` is a perf measure: if we're already known
     * stale, downstream dependants are already marked stale too — no need to walk the
     * graph again.
     */
    dirty(source?: I_Subscribable<any>, ref?: LinkedList<any>): void;
    /**
     * Read the current value. If a parent `Computed` is currently evaluating, this
     * computed registers itself as a dependency of the parent. If the cache is stale,
     * the function is re-run.
     */
    get(): T;
    subscribe(fn: (source: this, value: T, ref: LinkedList<any>) => any | void): LinkedList<WEAK_REF<(source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void>>;
    /**
     * Internal: re-evaluate the function, refresh the dependency set, and cache the
     * result.
     *
     * **The dependency-set refresh is deliberately written in a peculiar way.** It
     * unsubscribes from every previous dependency, then resubscribes to every current
     * one — even ones that didn't change. You might expect a Set/Map difference to be
     * faster, but in practice this loop is so much cheaper per iteration that it wins
     * for typical computed sizes (small N). Don't "optimize" it without benchmarking.
     */
    _get(): T;
    /**
     * Alt version of _get for performance testing. Slower
     * @returns
     */
    /**
     * Stop listening to dependencies and prevent future re-evaluation. Call `_get()`
     * to undo this. Use when you know a Computed is no longer needed and want to
     * free its dependency edges immediately rather than waiting for GC.
     */
    destroy(): void;
}
