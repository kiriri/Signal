

# This Project is WIP
The signal/computed/effect part works. But everything related to collections is slow and may not work and prone to change. Don't use it.

This project exists in 2 modes : Weak and Strong .

# Weak (Uses WeakRefs)
In this mode any subscriber stays only around while the listener exists. So `new Signal(1).subscribe(fn)` will only work so long as you hold the fn function object.
Discard it and let the GC clean it up, and the subscription disappears alongside it. And because in this example we don't hold the signal either, that disappears too.

The same goes for effects. Everything that's not being depended upon will get GCed.

The upside is no more orphans. The downside is increasingly bad performance past ~100k signals/subscribers. I hope v8 improves it in the future, but it's what it's.

# Strong
Anything subscription needs to be manually removed again. All `Effect`s and `Computed`s will need to be `destroy()`ed for their effects to disappear.



# Documentation


/**
 * The simplest stateful subscribable: a single value that can be read with `get()`
 * and changed with `set(...)` / `update(...)`.
 *
 * **Dependency tracking.** Calling `get()` while a `Computed` is evaluating registers
 * this signal as a dependency of that computed (via `EventManager.global_listeners`).
 * That is the entire mechanism by which computeds discover what they depend on.
 *
 * **Coalesced emission.** When `set(...)` is called, dependants are marked dirty
 * synchronously, but value subscribers are notified *asynchronously* on a microtask.
 * This lets a thousand synchronous `set(...)`s in the same tick collapse into one
 * emission. The `queued` flag prevents duplicate microtask registrations.
 */
export declare class NativeSignal<T> extends Subscribable<T> implements StatefulSubscribable<T> {
    /**
     * The internal value. Reading this directly bypasses dependency tracking — useful
     * if you want to observe the value without making the surrounding `Computed`
     * subscribe to it. In normal code, prefer `get()`.
     */
    _value: T;
    /**
     * Creates a new Signal with an initial value.
     * @param value The initial value of the signal.
     */
    constructor(value: T);
    /**
     * Get the current value of the signal.
     *
     * If called while a `Computed` is evaluating, registers this signal as a dependency
     * of that computed.
     */
    get(): T;
    /**
     * Set a new value. If the new value is `===` the current one, this is a no-op
     * (no dirty propagation, no emission). Otherwise dependants are marked dirty
     * synchronously and an emission is queued for the next microtask.
     */
    set(value: T): void;
    /* Mark this signal and all of its dependants dirty, and queue a microtask emission
     * if there are any value subscribers. This lets you mutate for example collections
     * in place while still emitting changes.
     */
    override dirty(source: this);
    /**
     * Update the value by applying a function to the current value. Equivalent to
     * `signal.set(fn(signal._value))`.
     */
    update(fn: (v: T) => T): void;
}
/** A `NativeSignal` exposed without `set` — for handing out read-only views. */
export type ReadonlySignal<T> = Omit<NativeSignal<T>, "set">;


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
    /** Last computed value. Defined after the first evaluation. */
    _cache: T;
    /**
     * @param fn       The function that computes the value.
     * @param context  Optional context object passed to `fn`.
     * @param eager    If true, behaves like a sink: runs immediately and on every dep change.
     *                 Default false (lazy: only runs when someone reads it).
     */
    constructor(fn: (self: CONTEXT) => T, context?: CONTEXT, eager?: boolean);
    /**
     * Read the current value. If a parent `Computed` is currently evaluating, this
     * computed registers itself as a dependency of the parent. If the cache is stale,
     * the function is re-run.
     */
    get(): T;
    /**
     * Receive updates whenever this computed's value changes. This will turn the
     * computed essentially 'eager'. The subscription disappears when the fn is GCed.
     */
    subscribe(fn: (source: this, value: T, ref: LinkedList<any>) => any | void): LinkedList<WEAK_REF<(source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void>>;
    /**
     * Stop listening to dependencies and prevent future re-evaluation. Call `_get()`
     * to undo this. Use when you know a Computed is no longer needed and want to
     * free its dependency edges immediately rather than waiting for GC.
     */
    destroy(): void;
}

Use `detached(()=>...)` to run code inside a Computed without subscribing to what's in it. Detached code runs synchronously and detached returns the output directly.