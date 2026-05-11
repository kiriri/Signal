import { Flatten } from "src/_decorators/flatten.js";
import EventManager, { push_subscribable } from "./_events.js";
import { Dirtyable, I_Subscribable, LinkedList, StatefulSubscribable, Subscribable } from "./Subscribable.js";

/**
 * Run this code inside a computed scope without subscribing to what is happening.
 * @param fn 
 */
export function detached(fn:Function)
{
    // We don't actually touch the listener array.
    // It has its own relative offset which will keep working.
    // But global_listen is the only variable we only assert for when checking if
    // we need to register our getter with the EventManager.
    let real_listener_count = EventManager.global_listen ;
    EventManager.global_listen = 0;
    fn();
    EventManager.global_listen = real_listener_count;
}

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
     * by `depend()`. We store them in an array (not a Set/Map) because the array is
     * recycled across recomputations — this is significantly faster than recomputing
     * a difference between old and new dependency sets each time. See `_get`.
     */
    subscribed_to: { signal: Subscribable<any>, ref: any }[] = [];

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
    _dirty: boolean | "first" = true;

    /** Last computed value. Defined after the first evaluation. */
    _cache!: T;

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
            this._cache = this._get();
        }
        else
        {
            // Don't subscribe until someone shows interest by calling get() or subscribe().
            this._dirty = "first";
        }
    }

    on_emit(context: Computed<T, CONTEXT>)
    {
        context.emit(context.get());
    }

    /**
     * Mark this computed dirty and propagate through the dependency graph.
     *
     * The early return on `_dirty === true` is a perf measure: if we're already known
     * stale, downstream dependants are already marked stale too — no need to walk the
     * graph again.
     */
    override dirty(source?: I_Subscribable<any>, ref?: LinkedList<any>)
    {
        if (this._dirty)
            return;
        this._dirty = true;

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
     */
    get()
    {
        // If this computed is being read inside another computed's evaluation:
        // register ourselves with the enclosing tracker.
        push_subscribable(this);

        if (this._dirty)
            return this._get();

        return this._cache;
    }

    override subscribe(
        fn: (source: this, value: T, ref: LinkedList<any>) => any | void
    ): LinkedList<WEAK_REF<(source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void>>
    {
        if (this._dirty === "first")
        {
            // First subscriber forces an initial evaluation so that the subscription
            // is meaningful (we now know what to listen to).
            this._get();
        }

        return super.subscribe(fn);
    }

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
    _get()
    {
        this._dirty = false;

        EventManager.global_listen++;
        let global_listener_index = EventManager.global_listener_length;

        let value: T;
        try
        {
            value = this.fn(this.context);
        } 
        finally
        {
            // Restore the parent tracker for any enclosing computed.
            EventManager.global_listen--;
        }

        let subscribed_to = this.subscribed_to;

        // If there's just one source, then nothing can have changed.
        // Exception : Untracked side effect. 
        const fresh_dependency_length = EventManager.global_listener_length - global_listener_index;
        if (subscribed_to.length <= 1 && fresh_dependency_length === subscribed_to.length)
        {
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
                const sub = EventManager.global_listeners[i];

                // Make sure to release all the unused potential listeners so GC can kick in.
                if($USE_WEAK_REFS$)
                    EventManager.global_listeners[i] = undefined;

                if (i < l1)
                {
                    let existing = subscribed_to[i];
                    existing.ref = sub.depend(this);
                    existing.signal = sub;
                }
                else
                    subscribed_to.push({
                        signal: sub,
                        ref: sub.depend(this)
                    });
            }

            // Shrink if we have fewer dependencies this time around.
            if (length < l1)
                subscribed_to.length = length;

        }

        this._cache = value;
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
        this._dirty = false;
        for (const { signal, ref } of this.subscribed_to)
        {
            signal.unsubscribe(ref);
        }

        this.subscribed_to.length = 0;
    }
}