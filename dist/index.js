/**
 * Process-wide coordinator for the dependency graph and microtask-deferred emission.
 *
 * Two responsibilities:
 *
 * 1. **Dependency tracking** via `global_listeners`. While a `Computed` (or any
 *    similar custom subscribable) is evaluating its function, it sets
 *    `global_listeners` to an array. Any other subscribable's `get()` should push
 *    itself onto that array. After evaluation finishes, the computed knows exactly
 *    which signals it depends on.
 *
 * 2. **Coalesced emission** via `register_async_emit`. Stateful subscribables
 *    register their emit callback as a microtask, which means many synchronous
 *    `set(...)` calls during the same tick collapse into a single emission. The
 *    subscribable is responsible for not registering itself again before its
 *    previous registration has been processed (typically via a `queued` flag).
 *
 * Implemented as a class with static fields rather than module-level lets purely so
 * consumers can write `EventManager.global_listeners` without an extra import.
 */
class EventManager {
    /**
     * The "currently evaluating Computed's listener bucket". `null` outside of any
     * computed evaluation. While set, every `get()` on a stateful subscribable should
     * push itself here so the enclosing computed can wire up its dependencies.
     */
    static global_listeners = null;
    /** Reserved for a future batched-emit optimization. Not currently used. */
    static waiting_to_emit = [];
    /**
     * Register a function to be invoked once on the next microtask.
     *
     * Used to coalesce: if a signal changes 1000 times in a tick, the effect that
     * depends on it should only fire once *after* all changes have settled. The
     * caller is responsible for guarding against re-registration before the
     * microtask runs (typically with a `queued`/`_dirty` boolean).
     */
    static register_async_emit(fn, context) {
        function a() {
            fn(context);
        }
        queueMicrotask(a);
    }
}

// import { Eventable } from "./Eventable";
/**
 * A stand-in for the real `WeakRef`. We do **not** want to use a real `WeakRef` here.
 *
 * The reason: real WeakRefs are weak in both directions. We want a subscribed function
 * to disappear from a Subscribable's subscriber list when nobody else references that
 * function, but we do *not* want the Subscribable itself to disappear out from under
 * an active subscriber. We therefore need to hold the source strongly from the listener
 * side ("is listening to") just to keep the source alive while it is being listened to.
 *
 * Currently unused, kept here in case we want to swap it back in for a particular path.
 */
/**
 * The core base class of the framework: a value (or stream of events) that other
 * objects can observe for changes.
 *
 * `Subscribable` supports two distinct notification mechanisms:
 *
 * 1. **Value subscribers** (`subscribe` / `emit` / `dirty`): standard observer pattern.
 *    Subscribers are stored as `WeakRef`s so that orphaned subscribers can be garbage
 *    collected. Dependants (other Subscribables, like `Computed`) are notified via
 *    `dirty` and propagate transitively.
 * 2. **Named events** (`subscribe_event` / `emit_event`): a separate channel for typed
 *    events with names (e.g. `"add"`, `"delete"` on collections). Unlike value
 *    subscribers, event subscribers fire *synchronously* — there is no async/dirty
 *    coalescing for events.
 *
 * **Memory model.** Both subscribers and event subscribers are held weakly. This means
 * the caller is responsible for keeping a reference to any callback they want to keep
 * receiving notifications. This is intentional: it lets garbage collection clean up
 * orphaned listeners automatically, at the cost of needing the caller to "own" the
 * callback.
 */
class Subscribable {
    /**
     * Linked list of value subscribers. Held weakly so they can be GC'd if nobody else
     * references the function. The list head is `undefined` when there are no subscribers.
     */
    subscribers;
    /**
     * Linked list of dependants — other Subscribables (typically `Computed`/`Effect`)
     * that need to be marked dirty when this one changes. Also held weakly.
     */
    dependants;
    /** Named event subscribers, keyed by event name. */
    events;
    /** Subscribers that fire on *every* named event regardless of name. */
    any_events;
    /**
     * Subscribe to a named event, or to *any* named event if `event` is undefined.
     *
     * Unlike value subscriptions, event notifications propagate **instantly** — there is
     * no microtask deferral or coalescing.
     *
     * @param fn The callback. Held weakly: keep your own reference if you want to keep receiving events.
     * @param event Optional event name. If omitted, the callback fires for every event.
     * @returns A reference token used to unsubscribe later.
     */
    subscribe_event(fn, event) {
        let previous_first_item = event === undefined ? this.any_events : (this.events ??= {})[event];
        const new_item = {
            next: previous_first_item,
            // Held weakly so that the next subscription doesn't end up referencing this one
            // (it's a linked list after all), which would create a chain of strong references
            // and prevent GC from cleaning up orphaned subscribers.
            value: new WeakRef(fn),
            event: event
        };
        if (previous_first_item === undefined) {
            if (event === undefined)
                this.any_events = new_item;
            else
                this.events[event] = new_item;
        }
        if (previous_first_item !== undefined)
            previous_first_item.prev = new_item;
        return new_item;
    }
    /**
     * Force unsubscribe from a named event.
     *
     * Generally not recommended — garbage collection will do the same thing automatically
     * once the callback has no other references. Use this only when you need to stop
     * receiving events *immediately* and cannot wait for a GC pass.
     */
    unsubscribe_event(reference) {
        let event_name = reference["event"];
        if (reference.next !== undefined)
            reference.next.prev = reference.prev;
        if (reference.prev !== undefined)
            reference.prev.next = reference.next;
        else {
            if (event_name === undefined)
                if (this.any_events === reference)
                    this.any_events = reference.next;
                else if (this.events?.[event_name] === reference)
                    this.events[event_name] = reference.next;
        }
        return this;
    }
    /**
     * Returns true if there is at least one subscriber that would receive the given event.
     *
     * Why this exists: `emit_event` will not be inlined by V8 (too large), but `can_emit`
     * is small enough to inline. So `if (can_emit(e)) emit_event(e)` can paradoxically
     * outperform an unconditional `emit_event(e)` call when the common case is "no
     * subscribers", because the inlined fast-path skips the function call entirely.
     */
    can_emit(event) {
        return (this.any_events ?? this.events?.[event.event]) !== undefined;
    }
    /**
     * Synchronously notify every subscriber of the given named event, plus every
     * `any_events` subscriber. Dead `WeakRef`s are pruned along the way.
     */
    emit_event(event) {
        let events = this.events?.[event.event];
        while (events !== undefined) {
            const deref = events.value.deref();
            if (deref === undefined)
                this.unsubscribe_event(events);
            else
                deref(this, event, events);
            events = events.next;
        }
        let events2 = this.any_events;
        while (events2 !== undefined) {
            const deref = events2.value.deref();
            if (deref === undefined)
                this.unsubscribe_event(events2);
            else
                deref(this, event, events2);
            events2 = events2.next;
        }
        return this;
    }
    /**
     * Subscribe a function to be called when the value of this Subscribable changes.
     *
     * The returned reference token can be passed to `unsubscribe`. Note that `fn` is
     * stored as a `WeakRef`, so **you must keep a strong reference to `fn` yourself** —
     * otherwise it will be garbage collected and silently stop receiving notifications.
     *
     * @param fn Callback invoked with `(source, value, ref)` whenever this subscribable emits.
     */
    subscribe(fn) {
        const previous_first_item = this.subscribers;
        const new_item = this.subscribers = {
            next: previous_first_item,
            value: new WeakRef(fn)
        };
        if (previous_first_item !== undefined)
            previous_first_item.prev = new_item;
        return new_item;
    }
    /**
     * Register another Subscribable as a dependant of this one. When this one changes
     * (`dirty`/`emit`), every dependant's `dirty(...)` method is invoked. This is the
     * mechanism `Computed` uses to propagate invalidation through the graph.
     */
    depend(subscribable) {
        const previous_first_item = this.dependants;
        const new_item = this.dependants = {
            next: previous_first_item,
            value: new WeakRef(subscribable)
        };
        if (previous_first_item !== undefined)
            previous_first_item.prev = new_item;
        return new_item;
    }
    /**
     * Force unsubscribe from the value/dependant lists.
     *
     * Generally not recommended — garbage collection handles this automatically once the
     * callback or dependant has no other references. Use this only when you need to stop
     * receiving notifications *immediately*.
     */
    unsubscribe(reference) {
        if (reference.next !== undefined)
            reference.next.prev = reference.prev;
        if (reference.prev !== undefined)
            reference.prev.next = reference.next;
        else {
            if (this.dependants === reference)
                this.dependants = this.dependants.next;
            else if (this.subscribers === reference)
                this.subscribers = this.subscribers.next;
        }
        return this;
    }
    /**
     * Mark this subscribable (and transitively all of its dependants) as dirty.
     *
     * This is the right call for **stateful** subscribables (like `NativeSignal` and
     * `Computed`) when their value has changed. It propagates invalidation through the
     * dependency graph but does *not* directly notify value subscribers — they are
     * notified later via `emit`, typically queued as a microtask so multiple
     * synchronous changes coalesce into a single emission.
     */
    dirty(source, ref) {
        let dependant = this.dependants;
        while (dependant !== undefined) {
            const deref = dependant.value.deref();
            if (deref === undefined)
                this.unsubscribe(dependant);
            else
                deref.dirty(this, dependant);
            dependant = dependant.next;
        }
    }
    /**
     * Synchronously notify every value subscriber with the given value.
     *
     * Use this for **stateless** subscribables, or to flush a pending change after
     * a `dirty` propagation. Dead `WeakRef`s are pruned along the way.
     */
    emit(value) {
        let subscriber = this.subscribers;
        while (subscriber !== undefined) {
            const deref = subscriber.value.deref();
            if (deref === undefined) {
                console.log("Deref undefined ", subscriber);
                this.unsubscribe(subscriber);
            }
            else
                deref(this, value, subscriber);
            subscriber = subscriber.next;
        }
        return this;
    }
    /**
     * Resolve the next time this subscribable emits, then unsubscribe.
     *
     * Useful for awaiting a single event in async code:
     * `const next_value = await some_signal.promise();`
     */
    promise() {
        let resolve;
        let reference;
        const subscriber = (source, v) => {
            this.unsubscribe(reference);
            resolve(v);
        };
        reference = this.subscribe(subscriber);
        return new Promise((_resolve) => {
            resolve = _resolve;
        });
    }
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
class Computed {
    /**
     * Currently-tracked dependencies, paired with the linked-list reference returned
     * by `depend()`. We store them in an array (not a Set/Map) because the array is
     * recycled across recomputations — this is significantly faster than recomputing
     * a difference between old and new dependency sets each time. See `_get`.
     */
    subscribed_to = [];
    /** The user-provided function. The dependencies are captured by closure inside `fn`. */
    fn;
    /** Optional `this`-like context object passed to `fn` on each evaluation. */
    context;
    /**
     * Tri-state dirty flag:
     *   - `"first"` — never run yet, will subscribe to dependencies on first `get`/`subscribe`.
     *   - `true`    — known stale, recompute on next `get`.
     *   - `false`   — `_cache` is current.
     */
    _dirty = true;
    /** Last computed value. Defined after the first evaluation. */
    _cache;
    /** Whether this computed re-runs whenever a dependency changes (vs lazily on `get`). */
    _eager;
    /**
     * Mark this computed dirty and propagate through the dependency graph.
     *
     * The early return on `_dirty === true` is a perf measure: if we're already known
     * stale, downstream dependants are already marked stale too — no need to walk the
     * graph again.
     */
    dirty(source, ref) {
        if (this._dirty)
            return;
        this._dirty = true;
        this.__base_dirty(source, ref);
        // Recalculate and propagate when we can be sure that all dependencies have
        // updated for this tick. Eager computeds always do this; lazy ones only do it
        // if someone is subscribed (otherwise nobody would receive the emission).
        if (this.subscribers !== undefined || this._eager) {
            EventManager.register_async_emit(() => this.emit(this.get()));
        }
    }
    ;
    /**
     * Read the current value. If a parent `Computed` is currently evaluating, this
     * computed registers itself as a dependency of the parent. If the cache is stale,
     * the function is re-run.
     */
    get() {
        // If this computed is being read inside another computed's evaluation:
        // register ourselves with the enclosing tracker.
        if (EventManager.global_listeners !== null) {
            EventManager.global_listeners.push(this);
        }
        if (this._dirty)
            return this._get();
        return this._cache;
    }
    subscribe(fn) {
        if (this._dirty === "first") {
            // First subscriber forces an initial evaluation so that the subscription
            // is meaningful (we now know what to listen to).
            this._get();
        }
        return this.__base_subscribe(arguments[0]);
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
    _get() {
        this._dirty = false;
        // Stash the parent tracker (if any) so nested computeds work correctly.
        let parent_listeners = EventManager.global_listeners;
        const global_listeners = EventManager.global_listeners = [];
        EventManager.global_listeners = global_listeners;
        let value = this.fn(this.context);
        let subscribed_to = this.subscribed_to;
        // Drop all previous dependency subscriptions.
        const l1 = subscribed_to.length;
        for (let i = 0; i < l1; i++) {
            let { ref, signal } = subscribed_to[i];
            signal.unsubscribe(ref);
        }
        // Reuse the existing array slots where possible (avoid push() growing the array
        // when N is stable across runs), append where not.
        const length = global_listeners.length;
        for (let i = 0; i < length; i++) {
            const sub = global_listeners[i];
            if (i < l1) {
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
        // Restore the parent tracker for any enclosing computed.
        EventManager.global_listeners = parent_listeners;
        this._cache = value;
        return value;
    }
    /**
     * Stop listening to dependencies and prevent future re-evaluation. Call `_get()`
     * to undo this. Use when you know a Computed is no longer needed and want to
     * free its dependency edges immediately rather than waiting for GC.
     */
    destroy() {
        this._dirty = false;
        for (let sub of this.subscribed_to) {
            sub[0].unsubscribe(sub[1].ref);
        }
        this.subscribed_to.length = 0;
    }
    subscribers;
    dependants;
    events // register ourselves with the enclosing tracker.
    ;
    any_events;
    subscribe_event(fn, event) { let previous_first_item 
    // is meaningful (we now know what to listen to).
    = event // is meaningful (we now know what to listen to).
        === // is meaningful (we now know what to listen to).
            undefined ? this.any_events : (this.events ??= {})[event]; const new_item = {
        next: previous_first_item, value: new WeakRef(fn), event: event
    }; if (previous_first_item === undefined) {
        if (event === undefined)
            this.any_events = new_item;
        else
            this.events[event]
                = new_item;
    } if (previous_first_item // Stash the parent tracker (if any) so nested computeds work correctly.
        !== undefined)
        previous_first_item.prev = new_item; return new_item; }
    unsubscribe_event(reference) {
        let event_name = reference["event"];
        if (reference.next !== undefined)
            reference.next.prev = reference.prev;
        if (reference // Reuse the existing array slots where possible (avoid push() growing the array
            // when N is stable across runs), append where not.
            .
                // when N is stable across runs), append where not.
                prev !== undefined)
            reference.prev.next = reference.next;
        else 
        // when N is stable across runs), append where not.
        {
            if (event_name === undefined)
                if (this.any_events === reference)
                    this.any_events = reference.next;
                else if (this.events?.[event_name] === reference)
                    this.events[event_name] = reference.next;
        }
        return this;
    }
    can_emit(event) { 
    /**
     * Stop listening to dependencies and prevent future re-evaluation. Call `_get()`
     * to undo this. Use when you know a Computed is no longer needed and want to
     * free its dependency edges immediately rather than waiting for GC.
     */
    return (this.any_events ?? this.events?.[event.event]) !== undefined; }
    emit_event(event) { let events = this.events?.[event
        .event]; while (events !== undefined) {
        const deref = events.value
            .deref();
        if (deref === undefined)
            this.unsubscribe_event(events);
        else
            deref(this, event, events);
        events = events.next;
    } let events2 = this.any_events; while (events2 !== undefined) {
        const deref = events2.value.deref();
        if (deref === undefined)
            this.unsubscribe_event(events2);
        else
            deref(this, event, events2);
        events2 = events2.next;
    } return this; }
    __base_subscribe(fn) { const previous_first_item = this.subscribers; const new_item = this.subscribers = {
        next: previous_first_item, value: new WeakRef(fn)
    }; if (previous_first_item !== undefined)
        previous_first_item.prev = new_item; return new_item; }
    depend(subscribable) { const previous_first_item = this.dependants; const new_item = this.dependants = {
        next: previous_first_item, value: new WeakRef(subscribable)
    }; if (previous_first_item !== undefined)
        previous_first_item.prev = new_item; return new_item; }
    unsubscribe(reference) { if (reference.next !== undefined)
        reference.next.prev = reference.prev; if (reference.prev !== undefined)
        reference.prev.next = reference.next;
    else {
        if (this.dependants === reference)
            this.dependants = this.dependants.next;
        else if (this.subscribers === reference)
            this.subscribers = this.subscribers.next;
    } return this; }
    __base_dirty(source, ref) { let dependant = this.dependants; while (dependant !== undefined) {
        const deref = dependant.value.deref();
        if (deref === undefined)
            this.unsubscribe(dependant);
        else
            deref.dirty(this, dependant);
        dependant = dependant.next;
    } }
    emit(value) { let subscriber = this.subscribers; while (subscriber !== undefined) {
        const deref = subscriber.value.deref();
        if (deref === undefined) {
            console.log("Deref undefined ", subscriber);
            this.unsubscribe(subscriber);
        }
        else
            deref(this, value, subscriber);
        subscriber = subscriber.next;
    } return this; }
    promise() { let resolve; let reference; const subscriber = (source, v) => {
        this.unsubscribe(reference);
        resolve(v);
    }; reference = this.subscribe(subscriber); return new Promise((_resolve) => {
        resolve = _resolve;
    }); }
    constructor(fn, context, eager = false) {
        this.fn = fn;
        this.context = context;
        this._eager = eager;
        if (eager) {
            // Run immediately to wire up dependencies.
            this._cache = this._get();
        }
        else {
            // Don't subscribe until someone shows interest by calling get() or subscribe().
            this._dirty = "first";
        }
    }
}

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
 *
 * The `@Flatten()` decorator is a build-time hint to flatten the prototype chain
 * (Subscribable → NativeSignal becomes a single-level class). This roughly 5xs
 * construction speed on Node.js and is a deliberate microoptimization for hot-path
 * code that creates many signals. Do not "clean up" this inheritance pattern without
 * understanding the perf implications.
 */
class NativeSignal {
    /**
     * The internal value. Reading this directly bypasses dependency tracking — useful
     * if you want to observe the value without making the surrounding `Computed`
     * subscribe to it. In normal code, prefer `get()`.
     */
    _value;
    /**
     * `true` when an emission has already been scheduled for the next microtask.
     * Prevents duplicate microtask registrations when `set(...)` is called many times
     * in a tick.
     */
    queued;
    /**
     * Get the current value of the signal.
     *
     * If called while a `Computed` is evaluating, registers this signal as a dependency
     * of that computed.
     */
    get() {
        if (EventManager.global_listeners)
            EventManager.global_listeners.push(this);
        return this._value;
    }
    /**
     * Set a new value. If the new value is `===` the current one, this is a no-op
     * (no dirty propagation, no emission). Otherwise dependants are marked dirty
     * synchronously and an emission is queued for the next microtask.
     */
    set(value) {
        if (value === this._value)
            return;
        this._value = value;
        this.dirty(this, undefined, value);
    }
    /**
     * Update the value by applying a function to the current value. Equivalent to
     * `signal.set(fn(signal._value))` but skips the extra method call.
     */
    update(fn) {
        const value = fn(this._value);
        if (value === this._value)
            return;
        this._value = value;
        this.dirty(this, undefined, value);
    }
    /**
     * Mark this signal and all of its dependants dirty, and queue a microtask emission
     * if there are any value subscribers.
     *
     * The `queued` early-return is important: if an emission is already scheduled,
     * dirty propagation has already happened, so we don't need to walk the dependant
     * graph again.
     */
    dirty(source, ref, value) {
        // If it's queued for emit(), then it stands to reason that it has already
        // propagated dirty as well.
        if (this.queued)
            return this;
        if (this.subscribers !== undefined) {
            this.queued = true;
            EventManager.register_async_emit(this.on_emit, this);
        }
        this.__base_dirty(source, ref);
        return this;
    }
    /**
     * Microtask callback used by `dirty`. Resets the `queued` flag and fires the
     * value to all subscribers. Defined as a method (not an arrow on the instance)
     * so it can be shared on the prototype; `context` is passed explicitly to avoid
     * needing a bound `this`.
     */
    on_emit(context) {
        context.queued = false;
        context.emit(context._value);
    }
    subscribers;
    dependants;
    events;
    any_events;
    subscribe_event(fn, event) { let previous_first_item = event === undefined ? this.any_events : (this.events ??= {})[event]; const new_item = {
        next: previous_first_item, value: new WeakRef(fn), event: event
    }; if (previous_first_item === undefined) {
        if (event === undefined)
            this.any_events = new_item;
        else
            this.events[event] = new_item;
    } if (previous_first_item !== undefined)
        previous_first_item.prev = new_item; return new_item; }
    unsubscribe_event(reference) { let event_name = reference["event"]; if (reference.next !== undefined)
        reference.next.prev = reference.prev; if (reference.prev !== undefined)
        reference.prev.next = reference.next;
    else {
        if (event_name === undefined)
            if (this.any_events === reference)
                this.any_events = reference.next;
            else if (this.events?.[event_name] === reference)
                this.events[event_name] = reference.next;
    } return this; }
    can_emit(event) { return (this.any_events ?? this.events?.[event.event]) !== undefined; }
    emit_event(event) { let events = this.events?.[event.event]; while (events !== undefined) {
        const deref = events.value.deref();
        if (deref === undefined)
            this.unsubscribe_event(events);
        else
            deref(this, event, events);
        events = events.next;
    } let events2 = this.any_events; while (events2 !== undefined) {
        const deref = events2.value.deref();
        if (deref === undefined)
            this.unsubscribe_event(events2);
        else
            deref(this, event, events2);
        events2 = events2.next;
    } return this; }
    subscribe(fn) { const previous_first_item = this.subscribers; const new_item = this.subscribers = {
        next: previous_first_item, value: new WeakRef(fn)
    }; if (previous_first_item !== undefined)
        previous_first_item.prev = new_item; return new_item; }
    depend(subscribable) { const previous_first_item = this.dependants; const new_item = this.dependants = {
        next: previous_first_item, value: new WeakRef(subscribable)
    }; if (previous_first_item !== undefined)
        previous_first_item.prev = new_item; return new_item; }
    unsubscribe(reference) { if (reference.next !== undefined)
        reference.next.prev = reference.prev; if (reference.prev !== undefined)
        reference.prev.next = reference.next;
    else {
        if (this.dependants === reference)
            this.dependants = this.dependants.next;
        else if (this.subscribers === reference)
            this.subscribers = this.subscribers.next;
    } return this; }
    __base_dirty(source, ref) { let dependant = this.dependants; while (dependant !== undefined) {
        const deref = dependant.value.deref();
        if (deref === undefined)
            this.unsubscribe(dependant);
        else
            deref.dirty(this, dependant);
        dependant = dependant.next;
    } }
    emit(value) { let subscriber = this.subscribers; while (subscriber !== undefined) {
        const deref = subscriber.value.deref();
        if (deref === undefined) {
            console.log("Deref undefined ", subscriber);
            this.unsubscribe(subscriber);
        }
        else
            deref(this, value, subscriber);
        subscriber = subscriber.next;
    } return this; }
    promise() { let resolve; let reference; const subscriber = (source, v) => {
        this.unsubscribe(reference);
        resolve(v);
    }; reference = this.subscribe(subscriber); return new Promise((_resolve) => {
        resolve = _resolve;
    }); }
    constructor(value) {
        this._value = value;
    }
}

/**
 * A node in an `Order`. Holds a value plus links to neighboring nodes and a
 * back-reference to the owning `Order` (so the node can implement `delete()` /
 * `insert_after()` / etc. directly).
 *
 * Returned to the caller from `Order.push` / `Order.shift` / `Order.insert_after`
 * / `Order.insert_before`. Hold onto it if you want to remove this entry later in
 * O(1).
 */
class OrderNode {
    value;
    order;
    next = null;
    prev = null;
    constructor(value, order) {
        this.value = value;
        this.order = order;
    }
    /** Internal: splice `value` into the list after `this`, no events fired. */
    _insert_after(value) {
        if (this.next === null) {
            this.order.last = value;
        }
        value.next = this.next;
        value.prev = this;
        this.next = value;
    }
    /** Internal: splice `value` into the list before `this`, no events fired. */
    _insert_before(value) {
        if (this.prev === null)
            this.order.first = value;
        value.prev = this.prev;
        value.next = this;
        this.prev = value;
    }
    /** Insert a new node with `value` immediately after this one. */
    insert_after(value) {
        let node = this.order._create_node(value);
        this._insert_after(node);
        this.order.emit_event({
            event: "add",
            value: this.value,
            node: this
        });
        this.order.emit(this.order.first);
        return node;
    }
    /** Insert a new node with `value` immediately before this one. */
    insert_before(value) {
        let node = this.order._create_node(value);
        this._insert_before(node);
        this.order.emit_event({
            event: "add",
            value: this.value,
            node: this
        });
        this.order.emit(this.order.first);
        return node;
    }
    /**
     * Move this node to be the immediate successor of `reference`. Fires a `move`
     * event with the previous neighbors so subscribers can compute the delta.
     */
    move_after(reference) {
        let prev_next = this.next;
        let prev_prev = this.prev;
        if (this.next)
            this.next.prev = this.prev;
        if (this.prev)
            this.prev.next = this.next;
        this.prev = reference;
        this.next = reference.next;
        reference.next = this;
        this.order.emit_event({
            event: "move",
            value: this,
            prev_next: prev_next,
            prev_prev: prev_prev
        });
        this.order.emit(this.order.first);
        return this;
    }
    /**
     * Remove this node from the order.
     *
     * **Do not reuse the node afterwards.** There are no guardrails for performance
     * reasons — calling methods on a deleted node will read stale links and corrupt
     * the list.
     */
    delete() {
        if (this.prev)
            this.prev.next = this.next;
        else
            this.order.first = this.next;
        if (this.next)
            this.next.prev = this.prev;
        else
            this.order.last = this.prev;
        this.next = null;
        this.prev = null;
        this.order.nodes.delete(this.value);
        this.order.emit_event({
            event: "delete",
            value: this.value,
            node: this
        });
        this.order.emit(this.order.first);
        this.order = null;
    }
    *[Symbol.iterator]() {
        let node = this;
        while (node) {
            yield node.value;
            node = node.next;
        }
    }
}
/**
 * An ordered, doubly-linked list of unique values, wrapped as a Subscribable.
 *
 * Like the other collections, exposes both whole-collection emission (via
 * `subscribe`) and per-change events (via `subscribe_event` — `add`/`delete`/`move`).
 *
 * **Order semantics.** Insertion order is preserved. Each value can appear at most
 * once (uniqueness is enforced via the internal `nodes` map keyed by value). Use
 * `push` to append, `shift` to prepend (note: this matches the array-method names by
 * shape, not by meaning — `Array.prototype.shift` removes from the head, but here
 * `shift` *inserts* at the head).
 *
 * `push`, `shift`, and the `OrderNode.insert_*` methods all return the new
 * `OrderNode<T>`. Hold onto it if you want O(1) deletion or movement later.
 */
class Order extends Subscribable {
    /** Map from value → its node. Enforces uniqueness and provides O(1) lookup. */
    nodes = new Map();
    /** Head of the list. `null` when empty. */
    first = null;
    /** Tail of the list. `null` when empty. */
    last = null;
    constructor(values) {
        super();
        if (values)
            for (let value of values)
                this._add(value);
    }
    /**
     * Returns a snapshot array of the current values, in order.
     *
     * **TODO:** cache this and invalidate on change.
     */
    get() {
        return [...this].map(v => v.value);
    }
    /**
     * Internal: allocate a node, register it in `nodes`, and if the order was empty,
     * set it as both `first` and `last`. Caller is responsible for any further
     * splicing.
     */
    _create_node(value) {
        let node = new OrderNode(value, this);
        this.nodes.set(value, node);
        if (!this.first)
            return this.first = this.last = node;
        return node;
    }
    /** I_NativeCollection adapter for delete-by-value. */
    _delete(value) {
        const node = this.nodes.get(value);
        node?.delete();
    }
    /** I_NativeCollection adapter for `push`. */
    _add(value) {
        this.push(value);
    }
    /** Append `value` to the tail. Returns the new node. */
    push(value) {
        let node = this._create_node(value);
        if (this.last !== node)
            this.last._insert_after(node);
        this.emit_event({
            event: "add",
            value: node.value,
            node
        });
        this.emit(this.first);
        return node;
    }
    /**
     * Prepend `value` to the head. Returns the new node.
     */
    unshift(value) {
        let node = this._create_node(value);
        if (this.first !== node)
            this.first._insert_before(node);
        this.emit_event({
            event: "add",
            value: node.value,
            node
        });
        this.emit(this.first);
        return node;
    }
    /** Look up the node holding `value`, or `undefined` if not present. */
    get_node(value) {
        return this.nodes.get(value);
    }
    /** Number of values in the order. */
    size() {
        return this.nodes.size;
    }
    /**
     * Remove every value. Fires a `delete` event per removed entry, then queues a
     * whole-collection emission.
     */
    clear() {
        let nodes = this.nodes;
        this.nodes = new Map();
        this.first = null;
        this.last = null;
        for (let node of nodes.values()) {
            this.emit_event({
                event: "delete",
                value: node.value,
                node
            });
        }
        this.emit(this.first);
    }
    *[Symbol.iterator]() {
        let node = this.first;
        while (node) {
            yield node;
            node = node.next;
        }
    }
}

/**
 * A `Map<K, V>` wrapped as a Subscribable, with optional per-key reactive references.
 *
 * Two channels of notification (same as `SignalSet`):
 *
 * 1. **Whole-collection emission** via `subscribe(...)`: receives the entire map
 *    after a microtask coalesces a tick's worth of changes.
 * 2. **Per-change events** via `subscribe_event(...)`: receives `{event, value:[K,V]}`
 *    synchronously, one per add/delete.
 *
 * **Per-key signals via `ref(key)`.** Returns a `NativeSignal<V|undefined>` that
 * tracks the value at that key. Setting the signal to `undefined` deletes the entry;
 * setting it to a non-undefined value sets the entry. The signal stays alive across
 * the existence of the entry, so a Computed can subscribe to a single key without
 * caring about the rest of the map.
 */
class SignalMap extends Subscribable {
    /** The underlying native `Map`. Reading directly bypasses dependency tracking. */
    _internal;
    /**
     * Lazily-allocated cache of per-key reactive references handed out by `ref()`.
     * Created on first call to `ref()` and reused thereafter.
     */
    _signals = undefined;
    constructor(items) {
        super();
        this._internal = new Map();
        if (items) {
            // Cheaper for few items; for very large counts the constructor copy may win.
            for (let item of items)
                this._internal.set(item[0], item[1]);
        }
    }
    get(key) {
        if (key) {
            return this._internal.get(key);
        }
        if (EventManager.global_listeners)
            EventManager.global_listeners.push(this);
        return this._internal;
    }
    /**
     * Returns a `NativeSignal<V|undefined>` representing the value at `key`. Created
     * on first call for a given key, then cached. The signal updates when the map
     * entry changes; setting the signal updates the map.
     *
     * Setting the signal to `undefined` deletes the entry; setting it to a value
     * adds/updates the entry.
     */
    ref(key) {
        if (!this._signals)
            this._signals = new Map();
        let result = this._signals.get(key);
        if (!result) {
            let value = this.get(key);
            result = new NativeSignal(value);
            // Capture the original `set` *before* we override it on the instance, so
            // we can still mutate the signal value internally without recursing.
            const original_set = result.set.bind(result);
            this._signals.set(key, result);
            const fn = (v) => {
                original_set(v);
                if (v === undefined) {
                    this.delete(key);
                }
                else {
                    this.set(key, v);
                }
            };
            result.set = fn;
        }
        return result;
    }
    /** I_NativeCollection adapter for `set`. */
    _add(value) {
        this.set(...value);
    }
    /**
     * Set `key` to `value`. No-op if the value at the key is already `===` to the new
     * one. Re-keying with a different value fires no `add` event (only the first
     * insertion does); but always queues a whole-collection emission and updates
     * any existing per-key `ref` signal.
     */
    set(key, value) {
        if (value === undefined) {
            console.error("Cannot set Signal Map's value to undefined, using null instead!");
            value = null;
        }
        let exists = this._internal.get(key);
        if (exists !== value) {
            const kv = [key, value];
            this._internal.set(key, value);
            this._signals?.get(key)?.set(value);
            if (exists === undefined) {
                this.emit_event({ event: "add", value: kv });
            }
            this.dirty();
        }
    }
    /** I_NativeCollection adapter for `delete`. */
    _delete(value) {
        this.delete(value[0]);
    }
    /**
     * Delete a key. No-op if the key isn't present. Otherwise fires `delete`
     * synchronously, sets any per-key ref signal to `undefined`, and queues a
     * whole-collection emission.
     */
    delete(key) {
        let v = this._internal.get(key);
        if (this._internal.delete(key)) {
            const kv = [key, v];
            let signal = this._signals?.get(key);
            if (signal?.get() !== undefined)
                signal?.set(undefined);
            this.emit_event({ event: "delete", value: kv });
            this.dirty();
        }
    }
    /**
     * Remove every entry. Each removed entry fires its own `delete` event, then a
     * single whole-collection emission is queued.
     *
     * **NOTE — likely bug.** The original implementation captures `this._internal.entries()`
     * (a *live* iterator) *before* calling `clear()`, then iterates after the clear.
     * Once `clear()` runs the iterator is empty, so no events fire and no per-key
     * signals get reset. The fix would be to materialize the entries first
     * (`[...this._internal.entries()]`) — left as-is here so you can confirm the
     * intended behaviour before changing it.
     */
    clear() {
        const entries = this._internal.entries();
        this._internal.clear();
        for (let kv of entries) {
            const reference = this._signals?.get(kv[0]);
            if (reference)
                reference.set(undefined);
            this.emit_event({ event: "delete", value: kv });
        }
        this.dirty();
    }
    has(key) {
        return this._internal.has(key);
    }
    /** True when an emission is already scheduled for the next microtask. */
    queued = false;
    dirty(source, ref) {
        // If queued for emit, dirty has already been propagated.
        if (this.queued)
            return this;
        if (this.subscribers) {
            this.queued = true;
            EventManager.register_async_emit(() => this.emit());
        }
        return super.dirty(source, ref);
    }
    emit(value = this._internal) {
        return super.emit(value);
    }
}

/**
 * A `Set<T>` wrapped as a Subscribable.
 *
 * Two channels of notification:
 *
 * 1. **Whole-collection emission.** Subscribers via `subscribe(...)` receive the
 *    entire `Set<T>` after a microtask coalesces all changes from the current tick.
 *    Use this when you want "the set changed, here's the current state" semantics.
 * 2. **Per-change events.** Subscribers via `subscribe_event(...)` receive
 *    `{event: "add" | "delete", value}` synchronously, one per change. Use this
 *    when you want to react to individual operations rather than reading the whole
 *    set each time.
 *
 * Mutations preserve `Set` semantics: re-adding an existing value or deleting a
 * missing value is a no-op (no event, no dirty propagation).
 *
 */
class SignalSet extends Subscribable {
    /** The underlying native `Set`. Reading this directly bypasses dependency tracking. */
    _internal;
    /**
     * @param items Optional iterable of initial values. Each is added without firing events.
     */
    constructor(items) {
        super();
        this._internal = new Set();
        if (items) {
            for (let item of items) {
                this._internal.add(item);
            }
        }
    }
    /**
     * Get the underlying `Set<T>`.
     *
     * If called inside a Computed evaluation, registers this set as a dependency.
     */
    get() {
        if (EventManager.global_listeners)
            EventManager.global_listeners.push(this);
        return this._internal;
    }
    /** I_NativeCollection adapter for `add`. */
    _add(value) {
        this.add(value);
    }
    /**
     * Add a value. No-op if already present (no event, no dirty). Otherwise fires
     * `{event: "add", value}` synchronously and queues a whole-collection emission.
     */
    add(value) {
        let exists = this._internal.has(value);
        this._internal.add(value);
        if (!exists) {
            const event = { event: "add", value };
            // Inlining this directly (rather than guarding with can_emit + emit_event)
            // saves around 20% in the no-subscriber case.
            this.emit_event(event);
            this.dirty();
        }
    }
    /** I_NativeCollection adapter for `delete`. */
    _delete(value) {
        this.delete(value);
    }
    /**
     * Delete a value. No-op if not present. Otherwise fires `{event: "delete", value}`
     * synchronously and queues a whole-collection emission.
     */
    delete(value) {
        if (this._internal.delete(value)) {
            this.emit_event({ event: "delete", value });
            this.dirty();
        }
    }
    /**
     * Remove every value. Each removed value fires its own `delete` event (so per-change
     * listeners see them all), then a single whole-collection emission is queued.
     */
    clear() {
        let values = [...this._internal.values()];
        this._internal.clear();
        for (let value of values) {
            this.emit_event({ event: "delete", value });
        }
        this.dirty();
    }
    /** True when an emission is already scheduled for the next microtask. */
    queued = false;
    dirty(source, ref) {
        // If queued for emit, dirty has already been propagated.
        if (this.queued)
            return this;
        if (this.subscribers) {
            this.queued = true;
            EventManager.register_async_emit(() => this.emit());
        }
        return super.dirty(source, ref);
    }
    emit(value = this._internal) {
        return super.emit(value);
    }
    has(value) {
        return this._internal.has(value);
    }
}

/**
 * An unordered linked-list collection wrapped as a Subscribable.
 *
 * Despite the name, this is **not** a heap in the priority-queue sense — it's just a
 * doubly-linked list with O(1) insert (at head) and O(1) delete-by-reference. The
 * "heap" name reflects that order is not part of its semantics; values pile up.
 *
 * **Why a linked list and not an array?** `add` returns the linked-list node, which
 * the caller can hold and pass back to `delete(...)` later for O(1) removal. With
 * an array you'd need either an index (which shifts on delete) or a separate id map.
 *
 * **WIP.** Per the project README, collections are subject to change.
 */
class SignalHeap extends Subscribable {
    /** Head of the doubly-linked list. `undefined` when the heap is empty. */
    items;
    constructor(items) {
        super();
        if (items) {
            // Build the list head-first by walking the iterable and prepending each
            // item in front of the previous head.
            let prev = this.items;
            for (let item of items) {
                let entry = {
                    next: prev,
                    value: item,
                    prev: undefined
                };
                if (prev) {
                    prev.prev = entry;
                }
                prev = entry;
            }
            this.items = prev;
        }
    }
    /**
     * Returns an iterable over the current values. The iterator captures the linked
     * list at iteration time, so concurrent mutation behaves like a snapshot of the
     * structure at that moment (advancing through `next` pointers).
     */
    get() {
        let self = this;
        if (EventManager.global_listeners)
            EventManager.global_listeners.push(this);
        return (function* iterator() {
            let item = self.items;
            while (item) {
                yield item.value;
                item = item.next;
            }
        })();
    }
    /**
     * Insert a value at the head and return its linked-list node. Hold onto the
     * returned node if you might want to delete it later in O(1).
     */
    add(value) {
        const prev = this.items;
        const ref = {
            value: value,
            next: prev
        };
        if (prev !== undefined)
            prev.prev = ref;
        else
            this.items = ref;
        const event = { event: "add", value, ref };
        this.emit_event(event);
        this.dirty();
        return ref;
    }
    /**
     * Remove a node by reference. Pass the node returned by `add(...)`. O(1).
     */
    delete(value) {
        if (value.next !== undefined)
            value.next.prev = value.prev;
        if (value.prev !== undefined)
            value.prev.next = value.next;
        else {
            // No `prev` means this was the head — promote `next` to the new head.
            if (this.items === value)
                this.items = this.items.next;
        }
        this.emit_event({ event: "delete", value: value.value, ref: value });
        this.dirty();
    }
    /**
     * Remove all values. Each removed value fires its own `delete` event, then a
     * single whole-collection emission is queued.
     */
    clear() {
        let values = this.items;
        this.items = undefined;
        while (values !== undefined) {
            this.emit_event({ event: "delete", value: values.value, ref: values });
            values = values.next;
        }
        this.dirty();
    }
    /** True when an emission is already scheduled for the next microtask. */
    queued = false;
    dirty(source, ref) {
        // If queued for emit, dirty has already been propagated.
        if (this.queued)
            return this;
        if (this.subscribers) {
            this.queued = true;
            EventManager.register_async_emit(() => this.emit());
        }
        return super.dirty(source, ref);
    }
    emit(value = this.get()) {
        return super.emit(value);
    }
}

/**
 * A streaming fold over one or more sources.
 *
 * **What it is.** A `Reducer` accumulates values from any number of subscribed
 * sources by calling a user-provided `merger` function with the new value, the
 * previous value seen for that source, and the current accumulator. Sources can
 * be individual signals (`register_source`) or whole collections (`register_collection`).
 *
 * **Identity value.** When a source emits for the first time, `last_value` is the
 * `identity_value` you provided. When a source is removed (deletion or unregistration),
 * the merger is called once more with `value === identity_value` so the reducer can
 * "subtract out" that source's contribution.
 *
 * **Why a class instead of a function.** Lifetime and source-set are observable —
 * you can dynamically register and unregister sources, and the merger sees a stable
 * reducer object via the `target` parameter.
 */
class Reducer extends Subscribable {
    /** The "neutral" input value used when a source is being added or removed. */
    identity_value;
    /**
     * The merger function. Called with the new value, the previous value seen for
     * the same source, the current accumulator, the source itself, the subscription
     * reference, and the reducer instance. Returns the new accumulator.
     */
    merger;
    /** Current accumulator. */
    _value;
    /** Reserved for a future lazy-evaluation path; not currently consulted on the hot path. */
    _dirty = true;
    /** Update the accumulator and propagate dirty downstream. */
    set(value) {
        this._value = value;
        super.dirty(this);
    }
    /** Get the current accumulator. */
    get() {
        return this._value;
    }
    /**
     * Override of `Subscribable.dirty` that intentionally does nothing.
     *
     * Reducers don't propagate dirty *upstream* — they only propagate downstream when
     * `set` is called from inside a merger. Dirty events from sources are absorbed
     * here and turned into merger calls instead.
     */
    dirty(source, ref) { }
    /**
     * @param identity_value The "empty" input — used when a source enters or leaves the reducer.
     * @param merger         Folds new values into the accumulator (see class docs).
     * @param value          The initial accumulator value.
     */
    constructor(identity_value, merger, value) {
        super();
        this.identity_value = identity_value;
        this.merger = merger;
        this._value = value;
    }
    /**
     * Subscribe to a whole collection. Every existing item triggers a synthetic
     * `add` event so the reducer's accumulator reflects them; subsequent collection
     * events are routed through `on_collection_change`.
     *
     * @param mapped When true, each value in the collection is itself a Subscribable;
     *               the reducer registers each as its own source. When false, the
     *               value itself is folded directly.
     */
    register_collection(source, mapped) {
        const ref = source.subscribe_event(this.on_collection_change);
        ref["reducer"] = this;
        ref["map"] = mapped ? new Map() : undefined;
        // Seed: emit one synthetic "add" per existing item.
        for (let item of source.get()) {
            (this).on_collection_change(source, {
                event: "add",
                value: item
            }, ref);
        }
        return ref;
    }
    /**
     * Handler for collection events (`add`/`delete`). Branches on whether the
     * collection holds Subscribables (mapped mode — register/unregister per item) or
     * raw values (fold the value directly using the merger).
     */
    on_collection_change(source, event, ref) {
        const reducer = ref["reducer"];
        const map = ref["map"];
        const mapped = map !== undefined;
        console.log("Collection changed");
        if (mapped) {
            switch (event.event) {
                case "add":
                    let inner_ref = reducer.register_source(event.value);
                    map.set(event.value, inner_ref);
                    break;
                case "delete":
                    if (map.delete(event.value))
                        reducer.unregister_source(map.get(event.value));
                    break;
            }
        }
        else {
            switch (event.event) {
                case "add":
                    reducer.set(reducer.merger(event.value, reducer.identity_value, reducer._value, source, ref, reducer));
                    break;
                case "delete":
                    reducer.set(reducer.merger(reducer.identity_value, event.value, reducer._value, source, ref, reducer));
                    break;
            }
        }
    }
    /**
     * Lazily-allocated `WeakRef` to `this`, stored on subscription refs so the
     * shared `on_change` handler can recover its owning reducer without holding
     * a strong reference (which would prevent reducer GC while sources still exist).
     */
    _self;
    /**
     * Subscribe to a single source signal. Returns a tagged subscription reference
     * holding the reducer's identity_value as `last`, the source itself, and a
     * weak ref to the reducer.
     *
     * Why we use one shared `on_change` function instead of per-source closures:
     * a single shared function on the prototype is much cheaper than instantiating
     * a bound closure per source. The trade-off is a `WeakRef` per reducer (reused
     * across all sources), which is required because we can't hold the reducer
     * strongly from the source side without breaking GC.
     */
    register_source(source) {
        const ref = source.subscribe(this.on_change);
        ref["last"] = this.identity_value;
        ref["reducer"] = this._self ??= new WeakRef(this);
        ref["source"] = source;
        this.on_change(source, source.get?.(), ref);
        return ref;
    }
    /**
     * Inverse of `register_source`. Unsubscribes from the source and folds an
     * `identity_value` through the merger so the reducer "forgets" this source's
     * contribution.
     */
    unregister_source(ref) {
        ref.source.unsubscribe(ref);
        this.on_change(ref["source"], this.identity_value, ref);
    }
    /**
     * Shared subscriber callback used by every registered source. Recovers the
     * reducer via the `WeakRef` stored on `ref`, calls the merger, and updates the
     * accumulator.
     *
     * Note the `this: undefined` parameter — this function is intentionally not
     * called with a `this` context. The reducer instance is recovered from `ref`
     * rather than being bound on `this`.
     */
    on_change(source, value, ref) {
        let last_value = ref["last"];
        let self = ref["reducer"].deref();
        self.set(self.merger(value, last_value, self._value, source, ref, self));
        ref["last"] = value;
    }
}
/**
 * Generic reduction over a collection with optional unwrapping of Subscribable items
 * and optional lazy mode.
 *
 * @param source         The source collection.
 * @param identity_value Neutral value used as the initial accumulator and on item removal.
 * @param opts.merger        Called with `(source_item, output, value, prev_value)` to
 *                           fold a value into the output. Uses identityValue on delete!
 *                           Applies relative changes based on previous and current value.
 * @param opts.mapper        Optional pre-transform on each added/updated value.
 * @param opts.unpackSignals If true, treat each collection item as a Subscribable and
 *                           fold its `.get()` value (re-folding when it changes).
 * @param opts.lazy          If true, defer merger calls until `output.get()` is read,
 *                           so multiple changes to the same source within a tick
 *                           collapse into a single merger call.
 * @param opts.dependencies  Extra signals; if any of them change, the entire reduction
 *                           is invalidated and recomputed from scratch.
 * @param opts.output        Optionally provide your own output Subscribable.
 */
function reduce_generic(source, identity_value, opts) {
    const output = opts.output ?? new NativeSignal(identity_value);
    const unpack_signals = opts.unpackSignals ?? false;
    const lazy = opts.lazy ?? false;
    const dependencies = opts.dependencies;
    const merger = opts.merger;
    const mapper = opts.mapper;
    const cache = new Map();
    let fully_dirty = false;
    if (dependencies && dependencies.length > 0) {
        const dependency_handler = {
            dirty: function (source, ref, value) {
                fully_dirty = true;
                output.dirty(source, ref, value);
            }
        };
        // Bind it onto the output so it GCs alongside.
        output["dependency_handler"] = dependency_handler;
        for (let dependency of dependencies)
            dependency.subscribe(dependency_handler);
    }
    // Lazy mode: avoid duplicate mapper/merger calls for entries that change multiple
    // times within the same async time slice. Significantly faster for batched changes.
    if (lazy) {
        let dirty = new Map();
        function lazy_apply(source, value) {
            if (fully_dirty)
                return;
            dirty.set(source, value);
            output.dirty(source, undefined, value);
        }
        function apply_all_dirty() {
            const dirty_values = (fully_dirty ? new Map([...source.get()].map(v => [v, v])) : dirty.entries());
            dirty.clear();
            for (let kv of dirty_values) {
                const key = kv[0];
                if (unpack_signals)
                    kv[1] = kv[1].get();
                const value = mapper ? mapper?.(kv[1]) : kv[1];
                let cache_item = cache.get(key);
                let prev_value;
                if (!cache_item) {
                    if (unpack_signals) {
                        listen(key);
                    }
                }
                else {
                    prev_value = cache_item.prev;
                    cache_item.prev = value;
                }
                merger(key, output, value, prev_value);
            }
        }
        const original_get = output.get.bind(output);
        output.get = (...args) => {
            if (apply_all_dirty || dirty.size > 0)
                apply_all_dirty();
            return original_get(...args);
        };
        function listen(signal) {
            cache.set(signal, {
                prev: identity_value,
                ref: signal.subscribe(lazy_apply)
            });
        }
        function unlisten(signal) {
            let ref = cache.get(signal).ref;
            signal.unsubscribe(ref);
            cache.delete(signal);
            dirty.delete(signal);
        }
        for (let initial_value of source.get()) {
            lazy_apply(initial_value, initial_value);
        }
        source.subscribe_event((_, ve) => {
            if (lazy) {
                switch (ve.event) {
                    // TODO : lazy only listens when get() is called for the first time
                    // it also only updates the value at that time, all changed entries at once.
                    case "add":
                        lazy_apply(ve.value, ve.value);
                        break;
                    case "delete":
                        lazy_apply(ve.value, unpack_signals ? { get() { return identity_value; } } : identity_value);
                        if (unpack_signals) {
                            unlisten(ve["value"]);
                        }
                        break;
                    case "update":
                        lazy_apply(ve.value, ve.value);
                        break;
                }
            }
        });
    }
    // Non-lazy mode: as soon as a change occurs, mapper and merger get called.
    else {
        function apply_value(source_item, value, ref, unpack = unpack_signals) {
            if (unpack) {
                // Can be undefined if the value was removed from the source collection
                // and the change event triggered before the delete one did.
                value = value?.get();
            }
            let state = cache.get(source_item);
            let prev_value = state?.prev ?? identity_value;
            if (state)
                state.prev = value;
            else {
                cache.set(source_item, { prev: value, ref: null });
            }
            merger(source_item, output, value, prev_value);
        }
        for (let initial_value of source.get()) {
            apply_value(initial_value, mapper?.(initial_value) ?? initial_value);
        }
        function listen(signal) {
            cache.set(signal, {
                prev: identity_value,
                ref: signal.subscribe(apply_value)
            });
        }
        function unlisten(signal) {
            let ref = cache.get(signal).ref;
            signal.unsubscribe(ref);
            cache.delete(signal);
        }
        source.subscribe_event((_, ve) => {
            let original_value = ve["value"];
            let value = mapper ? mapper(original_value) : original_value;
            switch (ve.event) {
                case "add":
                    apply_value(original_value, value);
                    if (unpack_signals) {
                        listen(original_value);
                    }
                    break;
                case "delete":
                    if (unpack_signals) {
                        unlisten(original_value);
                    }
                    else {
                        apply_value(original_value, identity_value, undefined, false);
                    }
                    break;
                case "update":
                    apply_value(original_value, value);
                    if (unpack_signals) {
                        throw new Error("Unpack Signals w/ update events not implemented yet! How do we unsubscribe from the old signal then?");
                    }
                    break;
            }
        });
    }
    return output;
}
// =============================================================================
// REFERENCE / FUTURE WORK — alternative reducer designs preserved for reference.
//
// `reduceGeneric` (camelCase) was an earlier exploration of a heavily-typed,
// const-generic reducer that depended on a `_on_change_instant` channel which
// has since been merged into the main subscriber path. The skeleton is preserved
// here in case the type-level design becomes useful again.
// =============================================================================
// /**
//  * It doesn't matter if we map changes to a single nativeSignal or a collection.
//  * Just provide the output directly, and the way that changes are merged into it.
//  * @param producer
//  * @param output
//  */
// export function reduceGeneric<
//     const Producer extends I_NativeCollection<any, any>,
//     const Output extends Subscribable<any>,
//     const OPTS extends {
//         lazy?: boolean, // if true, override the get() function of the output to make it lazy. Default true
//         unpackSignals?: boolean, // if signal, expect all values in the target to be subscribable and rerun the reduction any time they change using a synthetic {event:"update", value} event.
//         computed?: boolean,
//         dependencies?: Subscribable<any>[], // if any of these change, recalculate all
//     },
// >(
//     producer: Producer,
//     output: Output,
//     opts: OPTS,
//     processor: (
//         event: {
//             event: "add" | "delete" | "update";
//             value: typeof producer extends I_NativeCollection<infer V, any> ? (
//                 typeof opts["unpackSignals"] extends true ? (
//                     V extends I_Subscribable<infer V2> ? V2 : never
//                 ) : V
//             ) : never;
//         }
//     ) => void
// ): Output
// {
//
//     const lazy = opts.lazy ?? true;
//     const unpackSignals = opts.unpackSignals ?? false;
//     const computed = opts.computed ?? false;
//     const dependencies = opts.dependencies;
//     const use_dependencies = !!dependencies;
//
//     if (computed && (unpackSignals || use_dependencies))
//     {
//         throw new Error("Reduce should either use a computed function, or manual dependencies + unpackSignals. Don't combine opts.computed with dependencies/unpackSignals, it only degrades performance.")
//     }
//
//     type InputValue = Output extends Subscribable<infer V> ? V : never;
//     type OutputValue = typeof producer extends I_NativeCollection<infer V, any> ? (
//         typeof opts["unpackSignals"] extends true ? (
//             V extends I_Subscribable<infer V2> ? V2 : never
//         ) : V
//     ) : never;
//
//     const dirty_entries = new Map<InputValue, Parameters<typeof processor>[0]>();
//     let fully_dirty = false;
//
//     producer._on_change_instant.subscribe((_, ve) =>
//     {
//         let { event, value } = ve;
//
//         if (lazy)
//         {
//             if (dirty_entries.has(value))
//                 dirty_entries.delete(value);
//             else
//                 dirty_entries.set(value, ve);
//         }
//         else
//         {
//             processor(ve)
//         }
//     });
//
//     return output;
// }
/**
 * A specialized reducer that does not support inner Computed but is significantly
 * faster than `reduce` / `reduce_generic` for the common case.
 *
 * Use this when:
 *   - your reducer function does *not* read other signals (no inner Computeds)
 *   - you have an explicit list of `depends_on` signals that, when any change,
 *     mean the entire reduction must be recomputed from scratch.
 *
 * For the common case (no extra dependencies, no signal reads), it incrementally
 * applies adds and deletes — much cheaper than the Computed-based path.
 */
function reduce_fast(initial_value, producer, reducer, depends_on) {
    const result = new NativeSignal(initial_value);
    const dirty_entries = new Map();
    let fully_dirty = false;
    function reset_value() {
        let new_value = initial_value;
        for (let value of producer.get())
            new_value = reducer({ event: "add", value }, new_value);
        result.set(new_value);
        fully_dirty = false;
        dirty_entries.clear();
    }
    result.get = () => {
        if (fully_dirty)
            reset_value();
        else {
            let new_value = result._value;
            for (let value of dirty_entries.values())
                new_value = reducer(value, new_value);
            result.set(new_value);
        }
        return result._value;
    };
    if (depends_on.length > 0) {
        const dependency_handler = {
            dirty: function (source, ref, value) {
                fully_dirty = true;
                result.dirty(source, ref, value);
            }
        };
        // Bind it so it GCs alongside the result.
        result["dependency_handler"] = dependency_handler;
        for (let dependency of depends_on)
            dependency.subscribe(dependency_handler);
    }
    producer.subscribe_event((_, ve) => {
        // fully_dirty will calculate all entries from scratch the next time
        // the result's get() function is called.
        if (fully_dirty)
            return;
        if (!["add", "delete"].includes(ve.event))
            return;
        // Either it has added and then deleted, or vice versa.
        // Either way, skip updating the value altogether.
        if (dirty_entries.has(ve["value"]))
            dirty_entries.delete(ve["value"]);
        else
            dirty_entries.set(ve["value"], ve);
    });
    reset_value();
    return result;
}
/**
 * Convenience: count items by mapping each event to a number contribution.
 *
 * @param counter Maps each `add`/`delete` event to a number; the sum is the count.
 */
function count_fast(collection, counter, depends_on) {
    return reduce_fast(0, collection, (event, prev) => prev + counter(event), depends_on);
}
/**
 * The general reduce: each item gets its own `Computed` so the reducer function can
 * itself read other signals.
 *
 * Slower than `reduce_fast` because of the per-item Computed overhead, but
 * necessary if your reducer function depends on signal values.
 */
function reduce(producer, reducer, initial_value) {
    // TODO : Replace Native Signal with one which on get forcefully pulls all dirty Computed values
    const result = new NativeSignal(initial_value);
    const listeners = new Map();
    function listen(v) {
        // BUG : Computed is late, and result does not force update computed on get
        let computed;
        let state = {};
        computed = new Computed(() => {
            let prev_value = result._value;
            let new_value = reducer(v, prev_value, state);
            result.set(new_value);
            return new_value;
        }, true);
        listeners.set(v, computed);
    }
    function unlisten(v) {
        listeners.get(v).destroy();
        listeners.delete(v);
    }
    const values = [...producer.get()];
    for (let i = 0; i < values.length; i++)
        listen(values[i]);
    producer.subscribe_event((_, ve) => {
        if (ve['event'] === "add")
            listen(ve['value']);
        else if (ve['event'] === "delete")
            unlisten(ve['value']);
    });
    return result;
}
/** Convenience built on `reduce`: count items by mapping each item to a number contribution. */
function count(producer, counter) {
    return reduce(producer, (v, prev, state) => {
        let count = counter(v);
        let old_value = state.prev_value ?? 0;
        state.prev_value = count;
        return prev + count - old_value;
    }, 0);
}
// =============================================================================
// REFERENCE / FUTURE WORK — map_fast skeleton and producer/consumer pattern sketch.
// Preserved as design notes; not currently functional.
// =============================================================================
// Map/Filter
// export function map_fast<
//     ProdValue,
//     ProdEvents extends ReqColTypes<ProdValue>,
//     Producer extends I_NativeCollection<ProdValue, ProdEvents>,
//     ConsValue,
// >(
//     producer: Producer,
//     constructor: {new():I_NativeCollection<ConsValue,any>},
//     handler: (event: ReqColTypes<ProdValue>["add" | "delete"], prev_value: ConsValue) => ConsValue,
//     dependends_on: StatefulSubscribable<any>[],
// ): I_NativeCollection<ConsValue,any>
// {
//     const result = new constructor();
//     const dirty_entries = new Map<ProdValue, ReqColTypes<ProdValue>["add" | "delete"]>();
//     let fully_dirty = false;
//
//     function reset_value() { /* ...same shape as reduce_fast... */ }
//
//     result.get = () => { /* ...lazy fold... */ }
//
//     if (dependends_on.length > 0) { /* ...attach dependency handler... */ }
//
//     producer._on_change_instant.subscribe((_, ve) =>
//     {
//         if (fully_dirty) return;
//         if (dirty_entries.has(ve["value"])) dirty_entries.delete(ve["value"]);
//         else dirty_entries.set(ve["value"], ve);
//     });
//
//     reset_value();
//     return result;
// }
// function transform<
//     ProdValue,
//     ProdEvents extends ReqColTypes<ProdValue>,
//     Producer extends I_NativeCollection<ProdValue, ProdEvents>,
//     ConsValue,
//     ConsEvents extends ReqColTypes<ProdValue>,
//     Consumer extends I_NativeCollection<ProdValue, ProdEvents>,
// >(
//     producer: Producer
// )
// {
//     // consumer + producer pattern
//
//     // Map uses
//     let mapExample : (value:ProdValue) => ConsValue;
//     // Filter uses (Plus requires ConsValue === ProdValue)
//     let filterExample : (value:ProdValue) => boolean;
//     // Reduce uses (Plus result is single NativeSignal)
//     let reduceExample : (value:ProdValue) => ConsValue;
// }

/**
 * Process-wide cache: one shared signal per `delta`. WeakRef so the signal can be
 * GC'd if nobody holds it; the FinalizationRegistry below reaps the underlying
 * `setInterval` when that happens.
 */
let intervals = new Map();
const registry = new FinalizationRegistry((interval_id) => {
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
function interval(delta) {
    let signal = intervals.get(delta)?.deref();
    if (!signal) {
        signal = new NativeSignal(0);
        const interval_id = setInterval(() => {
            // Don't reference the signal directly — that would pin it via the closure
            // held by setInterval (a global reference), preventing GC. Look it up via
            // the WeakRef cache instead.
            const signal = intervals.get(delta)?.deref();
            signal?.set(signal._value + 1);
        }, delta);
        // Clean up the timer once the signal becomes unreachable.
        registry.register(signal, interval_id);
        intervals.set(delta, new WeakRef(signal));
    }
    return signal;
}

// Bins are sized as 2^bin_log_length entries. With bin_log_length = 8, each level
// holds 256 buckets, and we have 5 levels — covering up to 256^5 ticks of lookahead
// before we have to reschedule.
const bin_log_length = 8;
const bin_log_length_log = 3;
const bin_length = 1 << bin_log_length;
const bin_mask = bin_length - 1;
const bin_log_lengths = [0, bin_log_length, bin_log_length * 2, bin_log_length * 3, bin_log_length * 4];
/**
 * Allocate a fixed-size array of `length` slots, each `undefined`.
 *
 * Various alternative implementations are kept commented inline as a record of what
 * we tried (object-as-array, push loop, hardcoded literal of 256 undefineds). The
 * `new Array(length).fill(undefined)` form was the winner across V8/Bun.
 */
function fixed_array(length) {
    return new Array(length).fill(undefined);
}
/**
 * **A timing-wheel scheduler with five hierarchical levels.**
 *
 * The intuition: instead of one giant sorted heap of "things to do at tick N", each
 * action is dropped into a bucket whose granularity matches how far in the future
 * it is. Things scheduled in the next 256 ticks live in `bins_0` — one bucket per
 * tick. Things 256–65535 ticks out live in `bins_1` — one bucket per 256 ticks.
 * And so on through five levels.
 *
 * Adding an item is O(1): compute log2(delta), pick the right level, drop into the
 * appropriate bucket. Ticking is O(1) for the per-tick work; once every 256 ticks
 * we "rebin" — pull the contents of the next higher-level bucket down and spread
 * them across `bin_length` lower-level buckets.
 *
 * **Why this shape.** Standard heap-based timer wheels are O(log n) per insert and
 * O(log n) per fire. Hierarchical timing wheels are O(1) for both, at the cost of
 * occasional rebinning that's amortized across the level transitions. Worst-case
 * latency at the top level is bounded by `bin_length^5` ticks — for delta = 8 that's
 * over a trillion ticks of horizon.
 *
 * The wheel as implemented covers up to 256^5 = 1,099,511,627,776 ticks. Anything
 * scheduled further out than that will need its own external rescheduling logic
 * (TODO: not yet implemented).
 */
class QuantizedQueue {
    /** Level 0: one slot per upcoming tick (256 ticks of horizon). */
    bins_0 = fixed_array(bin_length);
    /** Level 1: each slot covers `bin_length` ticks (256² = 65,536 ticks of horizon). */
    bins_1 = fixed_array(bin_length);
    /** Level 2: each slot covers `bin_length²` ticks. */
    bins_2 = fixed_array(bin_length);
    /** Level 3: each slot covers `bin_length³` ticks. */
    bins_3 = fixed_array(bin_length);
    /** Level 4: each slot covers `bin_length⁴` ticks; topmost level. */
    bins_4 = fixed_array(bin_length);
    /** Convenience array so `rebin` can iterate level numbers. */
    bins = [this.bins_0, this.bins_1, this.bins_2, this.bins_3, this.bins_4];
    /** Logical clock. Incremented by every `tick`/`tick_long`. */
    current_tick = 0;
    /**
     * Advance the clock by one tick. Fires every action in the bottom-level bucket for
     * the current tick, then maybe rebins higher-level buckets down (if the new tick
     * is divisible by `bin_length`, we've crossed a level-1 boundary; if also by
     * `bin_length²`, a level-2 boundary; etc.).
     */
    tick() {
        const tick = this.current_tick;
        const bin_index = tick & bin_mask;
        let entry = this.bins_0[bin_index];
        while (entry !== undefined) {
            entry.value(entry);
            entry = entry.next;
        }
        this.bins_0[bin_index] = undefined;
        this.current_tick += 1;
        this.rebin();
    }
    /**
     * Advance by `ticks` ticks at once. This is much cheaper than calling `tick()`
     * `ticks` times because it avoids the per-tick rebin overhead and inlines the
     * fire-bucket loop.
     *
     * Implementation strategy:
     *   1. If we're mid-bucket (current tick not aligned to `bin_length`), finish out
     *      the current low-level bin first.
     *   2. Process every fully-contained low-level bin via the inline `process` loop.
     *   3. Process whatever ticks remain after the last full-bin boundary.
     */
    tick_long(ticks) {
        let bin = this.bins_0;
        function _tick_long_process(relative_from, relative_to) {
            for (let i = relative_from; i <= relative_to; i++) {
                let _bin = bin[i];
                while (_bin !== undefined) {
                    _bin.value(_bin);
                    _bin = _bin.next;
                }
                bin[i] = undefined;
            }
        }
        let current_relative_tick = this.current_tick & bin_mask;
        // Step 1: finish the current bucket if we're not aligned.
        if (current_relative_tick !== 0) {
            _tick_long_process(current_relative_tick, bin_length - 1);
            this.current_tick += bin_length - current_relative_tick;
            this.rebin();
            ticks -= bin_length - current_relative_tick;
        }
        // Step 2: process whole buckets at a time.
        const full_bins = ~~(ticks / bin_length);
        for (let i = 0; i < full_bins; i++) {
            _tick_long_process(0, bin_length - 1);
            this.current_tick += bin_length;
            this.rebin();
        }
        ticks -= bin_length * full_bins;
        // Step 3: leftover partial bucket.
        if (ticks > 0) {
            _tick_long_process(0, ticks);
            this.current_tick += ticks;
            this.rebin();
        }
    }
    /**
     * Cascade scheduled items down from higher levels to lower ones whenever the
     * clock crosses a level boundary.
     *
     * For example, when `current_tick` becomes divisible by `bin_length`, all the
     * items in the relevant level-1 bucket need to be redistributed into level-0
     * buckets according to their precise `end_time`. Same logic recursively applies
     * for level-2 → level-1, level-3 → level-2, etc.
     */
    rebin(bin_index = 0) {
        let lower_bin_index = (this.current_tick >> (bin_log_length * bin_index)) & bin_mask;
        // If the current tick isn't on a boundary at this level, no rebinning needed.
        if (lower_bin_index)
            return false;
        let higher_bin_index = (this.current_tick >> (bin_log_length * (bin_index + 1))) & bin_mask;
        // Try rebinning the next higher level too.
        this.rebin(bin_index + 1);
        // Splice items from the higher-level bucket into the appropriate lower-level
        // buckets.
        const lower_level_bins = this.bins[bin_index];
        let higher_level_entry = this.bins[bin_index + 1][higher_bin_index];
        while (higher_level_entry !== undefined) {
            let next_entry = higher_level_entry.next;
            const lower_bin_index = (higher_level_entry.end_time >> (bin_log_length * bin_index)) & bin_mask;
            const lower_bin = lower_level_bins[lower_bin_index];
            higher_level_entry.next = lower_bin;
            higher_level_entry.prev = undefined;
            if (lower_bin !== undefined) {
                lower_bin.prev = higher_level_entry;
            }
            lower_level_bins[lower_bin_index] = higher_level_entry;
            higher_level_entry = next_entry;
        }
        this.bins[bin_index + 1][higher_bin_index] = undefined;
        return true;
    }
    /**
     * Schedule a callback to fire when the clock reaches `end_time`. If `end_time`
     * is already in the past, the callback fires immediately (synchronously).
     *
     * Returns the action node — hold onto it if you might need to cancel via `remove`.
     *
     * **Microoptimized log2.** Rather than calling `Math.log2(delta)` (a function call
     * and float math), we use a tight bit-shift loop. This was meaningfully faster
     * when first written; worth re-benchmarking on modern V8 someday.
     */
    add(value, end_time) {
        const action = {
            value,
            end_time,
            prev: undefined,
            next: undefined
        };
        const current_tick = this.current_tick;
        // Should the action run this tick or in the past?
        if (end_time <= current_tick) {
            // Run instantly.
            value(action);
            return action;
        }
        const delta = end_time - current_tick;
        // Microoptimized log2: function calls (even Math.log2) are expensive in this
        // hot path. The loop terminates when `_delta` shifts to zero. TODO: re-benchmark
        // — modern engines may have made Math.log2 faster than this.
        let log_delta = 0;
        let _delta = delta;
        while (_delta >>= 1)
            log_delta++;
        const bin_index = (log_delta >> bin_log_length_log); // divide by 8 (bucket's log)
        const bin = this.bins[bin_index];
        const bucket_index = (action.end_time >> bin_log_lengths[bin_index]) & bin_mask;
        let bucket_entry = bin[bucket_index];
        bin[bucket_index] = action;
        if (bucket_entry !== undefined) {
            bucket_entry.prev = action;
            action.next = bucket_entry;
        }
        return action;
    }
    /**
     * Cancel a previously-added action. Pass the node returned by `add(...)`.
     *
     * If the action is still the head of its bucket, we have to find the bucket and
     * promote the next entry to the head. If it has a `prev`, simple linked-list
     * removal suffices.
     */
    remove(action) {
        if (action.prev === undefined) {
            // Find the correct bin: since this action has no `prev`, it must be the
            // head of its bucket. We need to move the bucket's head to `action.next`.
            const delta = action.end_time - this.current_tick;
            // Microoptimized log2 — same as in `add`. TODO: check if this is still
            // faster than Math.log2 5+ years on.
            let log_delta = 0;
            let _delta = delta;
            while (_delta >>= 1)
                log_delta++;
            const bucket = (log_delta >> bin_log_length_log);
            const bucket_index = (action.end_time >> bin_log_lengths[bucket]) & bin_mask;
            let bucket_entry = this.bins[bucket][bucket_index];
            if (bucket_entry !== action) {
                console.warn("Tried to remove an action which was not registered in the queue.");
                return;
            }
            this.bins[bucket][bucket_index] = action.next;
        }
        else {
            if (action.prev !== undefined)
                action.prev.next = action.next;
            if (action.next !== undefined)
                action.next.prev = action.prev;
        }
    }
}

const EMPTY = {};
/**
 * A subscribable that batches values from its source.
 *
 * **Use case.** Some subscribables emit per individual change (a stateless output, a
 * collection's add/delete events). If you want to react to "what happened during a
 * tick" instead of being woken for each individual change, attach a
 * `BufferedSubscribable`: it accumulates values into an array and emits the array
 * once on the next microtask.
 *
 * **Transactional behavior.** When the source emits many times during a synchronous
 * block, the buffer collects every value, and a single emission delivers the whole
 * array. This makes it useful for replaying the history of a transaction.
 *
 * **Implementation note.** Internally delegates to a private `Subscribable<T[]>` proxy
 * for subscribe/unsubscribe/dirty so that the public surface is `I_Subscribable<T[]>`.
 */
class BufferedSubscribable {
    /** True between "got a value" and "emitted the buffer". Prevents duplicate microtasks. */
    _dirty = false;
    /** Accumulated values waiting to be emitted on the next microtask. */
    buffer = [];
    /**
     * Inner Subscribable that handles the actual subscriber/emit machinery. We
     * delegate rather than extend so that our public type is `I_Subscribable<T[]>`
     * even though the values flowing in are individual `T`s.
     */
    proxy = new Subscribable();
    /**
     * Pipe all values from the given subscribable into this buffer. Returns an
     * unsubscribe function that, when invoked, detaches the source.
     */
    attach(target) {
        const ref = target.subscribe(this.on_target_change);
        return () => target.unsubscribe(ref);
    }
    /**
     * Subscriber function used for both `attach` and direct `emit` calls. Held as
     * an instance arrow so it has a stable identity (and so the `WeakRef` GC story
     * survives — one strong reference per BufferedSubscribable, not per push).
     */
    on_target_change = (source, value) => {
        this.buffer.push(value);
        if (this._dirty)
            return;
        this._dirty = true;
        EventManager.register_async_emit(() => {
            this._dirty = false;
            const buffer = this.buffer;
            this.buffer = [];
            this.proxy.emit(buffer);
        });
    };
    subscribe = this.proxy.subscribe.bind(this.proxy);
    unsubscribe = this.proxy.unsubscribe.bind(this.proxy);
    dirty = this.proxy.dirty.bind(this.proxy);
    /**
     * Push a value into the buffer manually.
     *
     * Note: like all BufferedSubscribable inputs, this does **not** emit synchronously.
     * The value lands in the buffer and the buffered array is emitted on the next
     * microtask.
     */
    emit(value = EMPTY) {
        this.on_target_change(undefined, value);
    }
    /**
     * Returns the current buffer and resets it internally.
     *
     * **Conflict warning.** Calling `consume()` while subscribers are also attached
     * means those subscribers will *not* see the values you consumed — you've already
     * cleared the buffer. Pick one consumer pattern.
     *
     * Also performs Computed-style dependency tracking: if called inside a Computed,
     * the Computed will subscribe to this buffer's emissions.
     */
    consume() {
        const result = this.buffer;
        this.buffer = [];
        this._dirty = false;
        if (EventManager.global_listeners)
            EventManager.global_listeners.push(this.proxy);
        return result;
    }
}

/**
 * Microtask body for an Effect's deferred run. Defined at module scope so it can
 * be reused across all Effects without allocating a new closure per registration.
 */
function async_caller(self) {
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
class Effect {
    sources;
    fn;
    /**
     * Most-recent value seen from each source, keyed by the same names as `sources`.
     * Built up as sources emit; populated lazily on first run for sources that haven't
     * emitted yet (see `initialize`).
     */
    _source_cache = {};
    /** Per-source subscription handles, used for `destroy()`. */
    _updaters = {};
    /** True between "a source changed" and "we ran fn". Prevents duplicate microtask scheduling. */
    _dirty = false;
    /** True after the first run, where we pull initial values from any source that hadn't emitted. */
    _initialized = false;
    /**
     * @param sources Record of source subscribables. Keys are arbitrary; the same keys
     *                appear on the `values` argument passed to `fn`.
     * @param fn      The side-effect function. Receives `(values, self)`.
     */
    constructor(sources, fn) {
        this.sources = sources;
        this.fn = fn;
        // Subscribe to each source. We tag every subscription ref with its key so the
        // shared `update_key_function` below can write to the right slot in the cache
        // without allocating a per-source closure.
        for (let key in sources) {
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
    update_key_function = (signal, value, ref) => {
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
    initialize() {
        const sources = this.sources;
        for (let key in sources) {
            if (!(key in this._source_cache))
                this._source_cache[key] = sources[key]["get"]?.() ?? null;
        }
        this._initialized = true;
    }
    /**
     * Immediately remove all source subscriptions.
     *
     * Call this to make sure an Effect for sure no longer triggers. Without this,
     * garbage collection may take seconds before it cleans up an orphaned Effect,
     * during which time it will still fire whenever its sources change.
     */
    destroy() {
        for (let key in this.sources) {
            const source = this.sources[key];
            source.unsubscribe(this._updaters[key]);
        }
    }
}

/**
 * Bind a stateful signal to `localStorage` under `key`.
 *
 * On call:
 *   - Subscribes to the signal so every change is JSON-stringified into localStorage.
 *   - If `key` already has a value in localStorage, parses it and `set`s the signal
 *     to it (only if the signal supports `set`).
 *   - If `key` is empty, seeds localStorage with the signal's current `get()` value.
 *
 * Returns the same signal you passed in.
 *
 * **Caveats.**
 *  - JSON only — values that don't round-trip through JSON.stringify/parse will misbehave.
 *  - The subscriber callback is anonymous, so per the framework's GC model it lives only
 *    as long as the signal does. Keep a reference to the signal if you want persistence
 *    to keep working.
 *  - Browser-only: this throws in any environment without `localStorage`.
 */
function local(key, signal) {
    const initial_value = localStorage.getItem(key);
    if (initial_value !== null) {
        if ("set" in signal) {
            signal.set(JSON.parse(initial_value));
        }
    }
    signal.subscribe((s, v) => {
        localStorage.setItem(key, JSON.stringify(v));
    });
    if (initial_value === null) {
        localStorage.setItem(key, JSON.stringify(signal.get()));
    }
    return signal;
}

export { BufferedSubscribable, Computed, Effect, NativeSignal, Order, OrderNode, QuantizedQueue, Reducer, SignalHeap, SignalMap, SignalSet, Subscribable, count, count_fast, fixed_array, interval, local, reduce, reduce_fast, reduce_generic };
//# sourceMappingURL=index.js.map
