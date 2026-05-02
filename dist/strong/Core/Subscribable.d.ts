export type StatefulSubscribable<T> = I_Subscribable<T> & {
    get(): T;
};
/**
 * An object which can be marked as dirty.
 *
 * Implementing `dirty` lets a subscribable be inserted into the dependency graph as
 * something that *defers* work until later — like a `Computed` (lazy recomputation) or
 * an `Effect` (deferred trigger). Compare to a plain subscriber function, which runs
 * synchronously when the source emits.
 */
export interface Dirtyable {
    dirty(source: I_Subscribable<any>, ref?: LinkedList<any>, value?: any): void;
}
/**
 * Doubly-linked list node. Used everywhere the framework needs O(1) insert/remove on a
 * list of subscribers, dependants, or queued events.
 */
export type LinkedList<T> = {
    next?: LinkedList<T>;
    prev?: LinkedList<T>;
    value: T;
};
export interface I_Subscribable<T> {
    depend(subscribable: Dirtyable): LinkedList<WEAK_REF<Dirtyable>>;
    subscribe(subscribable: (source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void): LinkedList<WEAK_REF<(source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void>>;
    unsubscribe(reference: LinkedList<WEAK_REF<Dirtyable | ((source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void)>>): this;
    dirty(source: I_Subscribable<any>, ref?: LinkedList<any>, value?: any): any;
}
export interface I_Eventable<Events extends Record<string, {
    event: string;
    value: any;
}>> {
    subscribe_event<K extends keyof Events>(fn: (source: Subscribable<any, any>, event: Events[K], ref: EventRef<any>) => any, event?: K): any;
    unsubscribe_event(reference: EventRef<any>): any;
    can_emit<K extends keyof Events>(event: Events[K]): any;
    emit_event<K extends keyof Events>(event: Events[K]): any;
}
export interface I_GettableSubscribable<T> extends I_Subscribable<T> {
    get(): T;
}
export type EventRef<Event> = LinkedList<WEAK_REF<(source: Subscribable<any, any>, event: Event, ref: EventRef<Event>) => any>> & {
    event?: string;
};
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
export declare class Subscribable<T, Events extends Record<string, {
    event: string;
    value: any;
}> = {}> implements I_Subscribable<T>, I_Eventable<Events> {
    /**
     * Linked list of value subscribers. Held weakly so they can be GC'd if nobody else
     * references the function. The list head is `undefined` when there are no subscribers.
     */
    subscribers: LinkedList<WEAK_REF<(source: I_Subscribable<T>, value: any, ref: LinkedList<any>) => any>> | undefined;
    /**
     * Linked list of dependants — other Subscribables (typically `Computed`/`Effect`)
     * that need to be marked dirty when this one changes. Also held weakly.
     */
    dependants: LinkedList<WEAK_REF<Dirtyable>> | undefined;
    /** Named event subscribers, keyed by event name. */
    events: Record<string, EventRef<Events[keyof Events]> | undefined>;
    /** Subscribers that fire on *every* named event regardless of name. */
    any_events: EventRef<undefined> | undefined;
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
    subscribe_event<K extends keyof Events>(fn: (source: Subscribable<any, any>, event: Events[K], ref: EventRef<any>) => any, event?: K): EventRef<Events[K]>;
    /**
     * Force unsubscribe from a named event.
     *
     * Generally not recommended — garbage collection will do the same thing automatically
     * once the callback has no other references. Use this only when you need to stop
     * receiving events *immediately* and cannot wait for a GC pass.
     */
    unsubscribe_event(reference: EventRef<any>): this;
    /**
     * Returns true if there is at least one subscriber that would receive the given event.
     *
     * Why this exists: `emit_event` will not be inlined by V8 (too large), but `can_emit`
     * is small enough to inline. So `if (can_emit(e)) emit_event(e)` can paradoxically
     * outperform an unconditional `emit_event(e)` call when the common case is "no
     * subscribers", because the inlined fast-path skips the function call entirely.
     */
    can_emit<K extends keyof Events>(event: Events[K]): boolean;
    /**
     * Synchronously notify every subscriber of the given named event, plus every
     * `any_events` subscriber. Dead `WeakRef`s are pruned along the way.
     */
    emit_event<K extends keyof Events>(event: Events[K]): this;
    /**
     * Subscribe a function to be called when the value of this Subscribable changes.
     *
     * The returned reference token can be passed to `unsubscribe`. Note that `fn` is
     * stored as a `WeakRef`, so **you must keep a strong reference to `fn` yourself** —
     * otherwise it will be garbage collected and silently stop receiving notifications.
     *
     * @param fn Callback invoked with `(source, value, ref)` whenever this subscribable emits.
     */
    subscribe(fn: (source: this, value: T, ref: LinkedList<any>) => any | void): LinkedList<WEAK_REF<(source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void>>;
    /**
     * Register another Subscribable as a dependant of this one. When this one changes
     * (`dirty`/`emit`), every dependant's `dirty(...)` method is invoked. This is the
     * mechanism `Computed` uses to propagate invalidation through the graph.
     */
    depend(subscribable: Dirtyable): LinkedList<WEAK_REF<Dirtyable>>;
    /**
     * Force unsubscribe from the value/dependant lists.
     *
     * Generally not recommended — garbage collection handles this automatically once the
     * callback or dependant has no other references. Use this only when you need to stop
     * receiving notifications *immediately*.
     */
    unsubscribe(reference: NonNullable<typeof this["subscribers"] | typeof this["dependants"]>): this;
    /**
     * Mark this subscribable (and transitively all of its dependants) as dirty.
     *
     * This is the right call for **stateful** subscribables (like `NativeSignal` and
     * `Computed`) when their value has changed. It propagates invalidation through the
     * dependency graph but does *not* directly notify value subscribers — they are
     * notified later via `emit`, typically queued as a microtask so multiple
     * synchronous changes coalesce into a single emission.
     */
    dirty(source?: I_Subscribable<any>, ref?: LinkedList<any>): void;
    /**
     * Synchronously notify every value subscriber with the given value.
     *
     * Use this for **stateless** subscribables, or to flush a pending change after
     * a `dirty` propagation. Dead `WeakRef`s are pruned along the way.
     */
    emit(value: T): this;
    /**
     * Resolve the next time this subscribable emits, then unsubscribe.
     *
     * Useful for awaiting a single event in async code:
     * `const next_value = await some_signal.promise();`
     */
    promise(): Promise<T>;
}
export default Subscribable;
