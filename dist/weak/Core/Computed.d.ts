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
     * by `depend()` and the last-seen value at the time of the last evaluation. We
     * store them in an array (not a Set/Map) because the array is recycled across
     * recomputations — this is significantly faster than recomputing a difference
     * between old and new dependency sets each time. See `_get`.
     *
     * `last` is read via `signal.peek()` and is used by `_validate()` to determine
     * whether any dependency actually changed value (vs merely propagating a
     * "maybe-stale" flag from upstream).
     */
    subscribed_to: {
        signal: Subscribable<any>;
        ref: any;
        last: number;
    }[];
    /** The user-provided function. The dependencies are captured by closure inside `fn`. */
    readonly fn: (self: CONTEXT) => T;
    /** Optional `this`-like context object passed to `fn` on each evaluation. */
    readonly context: CONTEXT;
    /**
     * Dirty flag with three states:
     *   - -1 — never run yet, will subscribe to dependencies on first `get`/`subscribe`.
     *   - -N — upstream reported a change, but we have not verified whether any
     *                 dependency's value actually differs from what we last saw. Validation
     *                 happens lazily in `get()` via `_validate()`. This is the key state
     *                 that lets us avoid recomputing (and re-emitting) when an upstream
     *                 "change" turns out to produce the same value downstream.
     *   - +N  — `_cache` is current.
     */
    /** Last computed value. Defined after the first evaluation. */
    _value: T;
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
    /**
     * Microtask callback used by `dirty`. Resolves the "maybe-stale" state (recomputes
     * if necessary) and emits **only** if the resolved value differs from what
     * subscribers last saw. This is what cuts the dependency graph: a change upstream
     * that doesn't actually alter our output stops propagating here.
     *
     * `prev` captures `_cache` before `get()`. After `get()` returns, `_cache` is
     * either unchanged (validation walk found no real change → no emit) or updated
     * to the new value (compare and emit if different). `Object.is` handles `NaN`
     * correctly without the cost of a separate branch.
     */
    on_emit(context: Computed<T, CONTEXT>): void;
    /**
     * Mark this computed as **maybe** stale and propagate through the dependency graph.
     *
     * "Maybe" rather than "definitely" because an upstream signal reporting a change
     * does not imply *our* function will produce a different output. Verification is
     * deferred until `get()` is called (or `on_emit` fires on the microtask), at which
     * point `_validate()` walks our deps and checks whether any of their values actually
     * differ from what we last saw.
     *
     * The early return on a non-`false` `_dirty` is a perf measure: if we're already
     * known maybe-stale (or never-run), downstream dependants have already been marked
     * too — no need to walk the graph again.
     */
    dirty(source?: I_Subscribable<any>, ref?: LinkedList<any>): void;
    /**
     * Read the current value. If a parent `Computed` is currently evaluating, this
     * computed registers itself as a dependency of the parent. If the cache is stale,
     * the function is re-run.
     *
     * When `_dirty === "maybe"` we first run `_validate()`, which walks our deps
     * (calling `peek()` on each) and compares against the values we last recorded.
     * If nothing changed, we keep `_cache` and skip the (potentially expensive) `fn`.
     */
    get(): T;
    /**
     * Untracked read of the current cached value. Used by an enclosing Computed's
     * `_get()` to snapshot dep values into `subscribed_to[i].last` without
     * re-triggering dependency tracking. The value may be stale if `_dirty !== false`,
     * but `_get()` only calls this immediately after the dep was just read via its
     * own `get()`, so the cache is fresh at that moment.
     */
    peek(): T;
    /**
     * Walk `subscribed_to` and check whether any dep's current value differs from
     * the value we recorded the last time we evaluated. Returns `true` as soon as a
     * change is found (early-out). Returns `false` only if every dep matches.
     *
     * We call `dep.get()` rather than `dep.peek()` so that a dep which is itself a
     * `Computed` in `"maybe"` state recursively resolves its own validation. A chain
     * of computeds where the upstream change cancels out at some point will collapse
     * top-down, paying at most one walk per node per tick (since each node settles
     * to `false` or recomputes once and caches the result).
     *
     * Critical perf detail: we must not let these recursive `get()` calls re-register
     * the deps with any *outer* computed evaluation. We temporarily set `global_listen`
     * to 0 to suppress tracking during the walk.
     */
    _validate(): boolean;
    subscribe(fn: (source: this, value: T, ref: LinkedList<any>) => any | void): LinkedList<WEAK_REF<(source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void>>;
    /**
     * Internal: re-evaluate the function, refresh the dependency set, snapshot the
     * `last` value of each dep, and cache the result.
     *
     * **The dependency-set refresh is deliberately written in a peculiar way.** It
     * unsubscribes from every previous dependency, then resubscribes to every current
     * one — even ones that didn't change. You might expect a Set/Map difference to be
     * faster, but in practice this loop is so much cheaper per iteration that it wins
     * for typical computed sizes (small N). Don't "optimize" it without benchmarking.
     *
     * `last` is recorded via `sub.peek()` (untracked read) AFTER `fn()` has finished
     * but BEFORE we re-enable dep tracking. It must reflect the dep's value at the
     * moment we last evaluated, so that `_validate()` can later detect changes.
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
