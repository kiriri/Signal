import { Flatten } from "src/_decorators/flatten.js";
import EventManager, { push_subscribable } from "./_events.js";
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
@Flatten()
export class Computed<T, CONTEXT = any> extends Subscribable<T> implements StatefulSubscribable<T>, Dirtyable
{
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
    subscribed_to: { signal: Subscribable<any>, ref: any, last: number }[] = [];

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
    // version: number = -1;

    /** Last computed value. Defined after the first evaluation. */
    _value!: T;

    /** Whether this computed re-runs whenever a dependency changes (vs lazily on `get`). 
     * An eager computed behaves more like an 'Effect' .
    */
    _eager!: boolean;

    /**
     * @param fn       The function that computes the value.
     * @param context  Optional context object passed to `fn`.
     * @param eager    If true, behaves like a sink: runs immediately and on every dep change.
     *                 Default false (lazy: only runs when someone reads it).
     */
    constructor(fn: (self: CONTEXT) => T, context?: CONTEXT, eager = false)
    {
        super();

        this.fn = fn;
        this.context = context;
        this._eager = eager;

        if (eager)
        {
            // Run immediately to wire up dependencies.
            this._value = this._get();
        }
    }

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
    on_emit(context: Computed<T, CONTEXT>)
    {
        if (context.version > 0)
            return;

        const prev = context._value;
        context.get();
        // `===` matches NativeSignal.set's equality semantics. NaN-in / NaN-out
        // produces an emit either way, consistent with NativeSignal treating any
        // set(NaN) as a change.
        if (prev !== context._value)
            context.emit(context._value);
    }

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
    override dirty(source?: I_Subscribable<any>, ref?: LinkedList<any>)
    {
        // Already maybe dirty.
        if (this.version < 0)
        {
            return;
        }
        this.version = -this.version;

        super.dirty(source, ref);

        // Recalculate and propagate when we can be sure that all dependencies have
        // updated for this tick. Eager computeds always do this; lazy ones only do it
        // if someone is subscribed (otherwise nobody would receive the emission).
        if (this.subscribers !== undefined || this._eager)
        {
            EventManager.register_async_emit(this.on_emit, this)
        }
    };

    /**
     * Read the current value. If a parent `Computed` is currently evaluating, this
     * computed registers itself as a dependency of the parent. If the cache is stale,
     * the function is re-run.
     *
     * When `_dirty === "maybe"` we first run `_validate()`, which walks our deps
     * (calling `peek()` on each) and compares against the values we last recorded.
     * If nothing changed, we keep `_cache` and skip the (potentially expensive) `fn`.
     */
    get()
    {
        // If this computed is being read inside another computed's evaluation:
        // register ourselves with the enclosing tracker.
        push_subscribable(this);

        if (this.version > 0) // not dirty
            return this._value;

        else if (this.version < 0 && !this._validate())
        {
            // No dep actually changed — cache is still good. Clear the flag.
            this.version = -this.version;
            return this._value;
        }

        return this._get();
    }

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
    _validate(): boolean
    {
        const subscribed_to = this.subscribed_to;
        const len = subscribed_to.length;

        // Suppress dep-tracking during the walk so recursive get()s don't pollute
        // any enclosing computed's listener bucket. No try/finally: the walk only
        // calls framework code on already-subscribed signals, none of which throws.
        const saved_listen = EventManager.global_listen;
        EventManager.global_listen = 0;


        for (let i = 0; i < len; i++)
        {
            const entry = subscribed_to[i];
            // For "maybe"-state Computeds, get() resolves recursively. For
            // NativeSignals, get() is a single field read (push_subscribable is a
            // no-op when global_listen === 0).
            const current = entry.signal.version;

            if (current !== entry.last)
            {
                EventManager.global_listen = saved_listen;
                return true;
            }
        }

        EventManager.global_listen = saved_listen;
        return false;
    }

    override subscribe(
        fn: (source: this, value: T, ref: LinkedList<any>) => any | void
    ): LinkedList<WEAK_REF<(source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void>>
    {
        if (this.version == 0)
        {
            // First subscriber forces an initial evaluation so that the subscription
            // is meaningful (we now know what to listen to).
            this._get();
        }

        return super.subscribe(fn);
    }

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
    _get()
    {

        EventManager.global_listen++;
        let global_listener_index = EventManager.global_listener_length;

        let value: T;
        try
        {
            value = this.fn(this.context);
        }
        catch (e)
        {
            // Restore global listeners to their previous length (internal length should not contract)
            EventManager.global_listener_length = global_listener_index;
            throw e;
        }
        finally
        {
            // Restore the parent tracker for any enclosing computed.
            EventManager.global_listen--;
        }

        let subscribed_to = this.subscribed_to;
        const global_listeners = EventManager.global_listeners;

        // If there's just one source, then nothing can have changed.
        // Exception : Untracked side effect. 
        const fresh_dependency_length = EventManager.global_listener_length - global_listener_index;
        if (subscribed_to.length <= 1 && fresh_dependency_length === subscribed_to.length)
        {
            // Fast path: dep identity unchanged. Still must refresh `last` so the next
            // validation walk has an accurate baseline. For an empty dep set, this loop
            // runs zero times.
            if (fresh_dependency_length === 1)
            {
                const entry = subscribed_to[0];
                entry.last = entry.signal.version;
                if ($USE_WEAK_REFS$)
                    global_listeners[global_listener_index] = undefined;
            }
        }
        else
        {
            // Drop all previous dependency subscriptions.
            const l1 = subscribed_to.length;
            for (let i = 0; i < l1; i++)
            {
                let { ref, signal } = subscribed_to[i];
                signal.unsubscribe(ref);
            }

            // Reuse the existing array slots where possible (avoid push() growing the array
            // when N is stable across runs), append where not.
            const length = EventManager.global_listener_length;
            for (let i = global_listener_index; i < length; i++)
            {
                const sub = global_listeners[i];

                // Make sure to release all the unused potential listeners so GC can kick in.
                if ($USE_WEAK_REFS$)
                    global_listeners[i] = undefined;

                const last = sub.version;

                if (i < l1)
                {
                    let existing = subscribed_to[i];
                    existing.ref = sub.depend(this);
                    existing.signal = sub;
                    existing.last = last;
                }
                else
                    subscribed_to.push({
                        signal: sub,
                        ref: sub.depend(this),
                        last: last
                    });
            }

            // Shrink if we have fewer dependencies this time around.
            if (length < l1)
                subscribed_to.length = length;

        }

        this._value = value;

        this.version = (-this.version) + 1;

        // Restore global listeners to their previous length (internal length should not contract)
        EventManager.global_listener_length = global_listener_index;


        return value;
    }

    /**
     * Alt version of _get for performance testing. Slower
     * @returns 
     */
    // _get2()
    // {
    //     this._dirty = false;

    //     // Stash the parent tracker so nested computeds work correctly.
    //     const parent_listeners = EventManager.global_listeners;
    //     const global_listeners = EventManager.global_listeners = <Subscribable<any>[]>[];

    //     let value: T;
    //     try
    //     {
    //         value = this.fn(this.context);
    //     }
    //     finally
    //     {
    //         EventManager.global_listeners = parent_listeners;
    //     }

    //     const subscribed_to = this.subscribed_to;
    //     const prev_len = subscribed_to.length;
    //     const next_len = global_listeners.length;

    //     // Fast path: single stable dependency (common case for simple computeds).
    //     if (prev_len === 1 && next_len === 1 && subscribed_to[0].signal === global_listeners[0])
    //     {
    //         // Dependency unchanged — nothing to do.
    //     }
    //     else if (prev_len !== 0 || next_len !== 0)
    //     {
    //         // Build a Set of incoming signals for O(1) lookup during the diff.
    //         // Only allocated when the fast path doesn't apply.
    //         const next_set = next_len > 1 ? new Set(global_listeners) : null;

    //         // --- Unsubscribe signals that dropped out ---
    //         for (let i = 0; i < prev_len; i++)
    //         {
    //             const { signal, ref } = subscribed_to[i];
    //             // Skip if this signal is still present in the new set.
    //             if (next_set ? next_set.has(signal) : signal === global_listeners[0])
    //                 continue;
    //             signal.unsubscribe(ref);
    //         }

    //         // Build a Set of OLD signals for O(1) lookup when subscribing new ones.
    //         const prev_set = prev_len > 1
    //             ? new Set(subscribed_to.map(s => s.signal))
    //             : null;

    //         // --- Subscribe to signals that are newly added; reuse slots ---
    //         for (let i = 0; i < next_len; i++)
    //         {
    //             const sig = global_listeners[i];
    //             const is_new = prev_set ? !prev_set.has(sig) : (prev_len === 0 || sig !== subscribed_to[0]?.signal);

    //             if (i < prev_len)
    //             {
    //                 const existing = subscribed_to[i];
    //                 if (is_new)
    //                 {
    //                     // Slot used to hold a different signal — subscribe to the new one.
    //                     existing.ref = sig.depend(this);
    //                     existing.signal = sig;
    //                 }
    //                 else
    //                 {
    //                     // Same signal, just update the slot to point at it correctly.
    //                     existing.signal = sig;
    //                     // ref is still valid — no need to re-subscribe.
    //                 }
    //             }
    //             else
    //             {
    //                 // Grew beyond previous length — append.
    //                 subscribed_to.push({ signal: sig, ref: sig.depend(this) });
    //             }
    //         }

    //         // Shrink array if dependency count fell.
    //         if (next_len < prev_len)
    //             subscribed_to.length = next_len;
    //     }

    //     this._cache = value;
    //     return value;
    // }

    /**
     * Stop listening to dependencies and prevent future re-evaluation. Call `_get()`
     * to undo this. Use when you know a Computed is no longer needed and want to
     * free its dependency edges immediately rather than waiting for GC.
     */
    destroy()
    {
        this.version = 0;
        for (const { signal, ref } of this.subscribed_to)
        {
            signal.unsubscribe(ref);
        }

        this.subscribed_to.length = 0;
    }
}