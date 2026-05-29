// import { Eventable } from "./Eventable";

export type StatefulSubscribable<T> = I_Subscribable<T> & { get(): T };


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
class FakeWeakRef<T>
{
    constructor(public value: T) { }

    deref()
    {
        return this.value;
    }
}

/**
 * An object which can be marked as dirty.
 *
 * Implementing `dirty` lets a subscribable be inserted into the dependency graph as
 * something that *defers* work until later — like a `Computed` (lazy recomputation) or
 * an `Effect` (deferred trigger). Compare to a plain subscriber function, which runs
 * synchronously when the source emits.
 */
export interface Dirtyable
{
    dirty(source: I_Subscribable<any>, ref?: LinkedList<any>, value?: any): void;
}

/**
 * Doubly-linked list node. Used everywhere the framework needs O(1) insert/remove on a
 * list of subscribers, dependants, or queued events.
 */
export type LinkedList<T> = {
    next?: LinkedList<T>;
    prev?: LinkedList<T>;
    value: T
}


export interface I_Subscribable<T>
{
    depend(
        subscribable: Dirtyable
    ): LinkedList<WEAK_REF<Dirtyable>>;

    subscribe(
        subscribable: (source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void
    ): LinkedList<WEAK_REF<(source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void>>;

    unsubscribe(reference: LinkedList<WEAK_REF<Dirtyable | ((source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void)>>): this;

    dirty(source: I_Subscribable<any>, ref?: LinkedList<any>, value?: any);
}

export interface I_Eventable<Events extends Record<string, { event: string, value: any }>>
{
    subscribe_event<K extends keyof Events>(
        fn: (
            source: Subscribable<any, any>,
            event: Events[K],
            ref: EventRef<any>
        ) => any,
        event?: K
    );

    unsubscribe_event(reference: EventRef<any>);

    can_emit<K extends keyof Events>(event: Events[K]);

    emit_event<K extends keyof Events>(event: Events[K]);
}



export interface I_GettableSubscribable<T> extends I_Subscribable<T>
{
    get(): T
}

export type EventRef<Event> = LinkedList<WEAK_REF<(source: Subscribable<any, any>, event: Event, ref: EventRef<Event>) => any>> & {
    event?: string
}

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
export class Subscribable<T, Events extends Record<string, { event: string, value: any }> = {}> implements I_Subscribable<T>, I_Eventable<Events>
{
    /**
     * Linked list of value subscribers. Held weakly so they can be GC'd if nobody else
     * references the function. The list head is `undefined` when there are no subscribers.
     */
    subscribers: LinkedList<WEAK_REF<(
        source: I_Subscribable<T>,
        value: any,
        ref: LinkedList<any>
    ) => any>> | undefined;

    /**
     * Linked list of dependants — other Subscribables (typically `Computed`/`Effect`)
     * that need to be marked dirty when this one changes. Also held weakly.
     */
    dependants: LinkedList<WEAK_REF<Dirtyable>> | undefined;


    /**
     * Negative when an emission has already been scheduled for the next microtask.
     * Prevents duplicate microtask registrations when `set(...)` is called many times
     * in a tick.
     * Manually marking this signal as dirty will increase its version.
     */
    version: number = 0;

    /** Named event subscribers, keyed by event name. */
    // events: Record<string,
    //     EventRef<Events[keyof Events]> | undefined
    // >;

    /** Subscribers that fire on *every* named event regardless of name. */
    // any_events: EventRef<undefined> | undefined;

    // /**
    //  * Subscribe to a named event, or to *any* named event if `event` is undefined.
    //  *
    //  * Unlike value subscriptions, event notifications propagate **instantly** — there is
    //  * no microtask deferral or coalescing.
    //  *
    //  * @param fn The callback. Held weakly: keep your own reference if you want to keep receiving events.
    //  * @param event Optional event name. If omitted, the callback fires for every event.
    //  * @returns A reference token used to unsubscribe later.
    //  */
    // subscribe_event<K extends keyof Events>(
    //     fn: (
    //         source: Subscribable<any, any>,
    //         event: Events[K],
    //         ref: EventRef<any>
    //     ) => any,
    //     event?: K
    // )
    // {
    //     let previous_first_item = event === undefined ? this.any_events : (this.events ??= {})[event as any];

    //     const new_item: EventRef<Events[K]> = {
    //         next: previous_first_item,
    //         // Held weakly so that the next subscription doesn't end up referencing this one
    //         // (it's a linked list after all), which would create a chain of strong references
    //         // and prevent GC from cleaning up orphaned subscribers.
    //         value: $USE_WEAK_REFS$ ? new WeakRef(fn) : fn,
    //         event: event as string
    //     };

    //     if (previous_first_item === undefined)
    //     {
    //         if (event === undefined)
    //             this.any_events = new_item;
    //         else
    //             this.events[event as string] = new_item;
    //     }

    //     if (previous_first_item !== undefined)
    //         previous_first_item.prev = new_item;

    //     return new_item;
    // }

    // /**
    //  * Force unsubscribe from a named event.
    //  *
    //  * Generally not recommended — garbage collection will do the same thing automatically
    //  * once the callback has no other references. Use this only when you need to stop
    //  * receiving events *immediately* and cannot wait for a GC pass.
    //  */
    // unsubscribe_event(reference: EventRef<any>)
    // {
    //     let event_name = reference["event"];

    //     if (reference.next !== undefined)
    //         reference.next.prev = reference.prev;

    //     if (reference.prev !== undefined)
    //         reference.prev.next = reference.next;
    //     else
    //     {
    //         if (event_name === undefined)
    //             if (this.any_events === reference)
    //                 this.any_events = reference.next;
    //             else
    //                 if (this.events?.[event_name] === reference)
    //                     this.events[event_name] = reference.next;
    //     }

    //     return this;
    // }

    // /**
    //  * Returns true if there is at least one subscriber that would receive the given event.
    //  *
    //  * Why this exists: `emit_event` will not be inlined by V8 (too large), but `can_emit`
    //  * is small enough to inline. So `if (can_emit(e)) emit_event(e)` can paradoxically
    //  * outperform an unconditional `emit_event(e)` call when the common case is "no
    //  * subscribers", because the inlined fast-path skips the function call entirely.
    //  */
    // can_emit<K extends keyof Events>(event: Events[K])
    // {
    //     return (this.any_events ?? this.events?.[event.event]) !== undefined;
    // }

    // /**
    //  * Synchronously notify every subscriber of the given named event, plus every
    //  * `any_events` subscriber. Dead `WeakRef`s are pruned along the way.
    //  */
    // emit_event<K extends keyof Events>(event: Events[K])
    // {
    //     let events = this.events?.[event.event];
    //     while (events !== undefined)
    //     {
    //         if ($USE_WEAK_REFS$)
    //         {
    //             const deref = events.value["deref"]();
    //             if (deref === undefined)
    //                 this.unsubscribe_event(events)
    //             else
    //                 deref(this as any, event, events)
    //         }
    //         else
    //         {
    //             events.value(this, event, events);
    //         }

    //         events = events.next;
    //     }

    //     let events2 = this.any_events;
    //     while (events2 !== undefined)
    //     {
    //         if ($USE_WEAK_REFS$)
    //         {
    //             const deref = events2.value["deref"]();
    //             if (deref === undefined)
    //                 this.unsubscribe_event(events2)
    //             else
    //                 deref(this as any, event, events2)
    //         }
    //         else
    //         {
    //             events2.value(this, event, events2);
    //         }

    //         events2 = events2.next;
    //     }

    //     return this;
    // }

    /**
     * Subscribe a function to be called when the value of this Subscribable changes.
     *
     * The returned reference token can be passed to `unsubscribe`. Note that `fn` is
     * stored as a `WeakRef`, so **you must keep a strong reference to `fn` yourself** —
     * otherwise it will be garbage collected and silently stop receiving notifications.
     *
     * @param fn Callback invoked with `(source, value, ref)` whenever this subscribable emits.
     */
    
    subscribe(
        fn: (source: this, value: T, ref: LinkedList<any>) => any | void
    ): LinkedList<WEAK_REF<(source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void>>
    {
        const previous_first_item = this.subscribers;

        const new_item: LinkedList<WEAK_REF<typeof fn>> = this.subscribers = {
            next: previous_first_item,
            value: $USE_WEAK_REFS$ ? new WeakRef(fn) : fn
        }

        if (previous_first_item !== undefined)
            previous_first_item.prev = new_item;

        if(this.version === 0)
            this.version = 1;

        return new_item;
    }

    /**
     * Register another Subscribable as a dependant of this one. When this one changes
     * (`dirty`/`emit`), every dependant's `dirty(...)` method is invoked. This is the
     * mechanism `Computed` uses to propagate invalidation through the graph.
     */
    depend(
        subscribable: Dirtyable
    ): LinkedList<WEAK_REF<Dirtyable>>
    {
        const previous_first_item = this.dependants;

        const new_item: LinkedList<WEAK_REF<Dirtyable>> = this.dependants = {
            next: previous_first_item,
            value: $USE_WEAK_REFS$ ? new WeakRef(subscribable) : subscribable
        }

        if (previous_first_item !== undefined)
            previous_first_item.prev = new_item;

        if(this.version === 0)
            this.version = 1;

        return new_item;
    }

    /**
     * Force unsubscribe from the value/dependant lists.
     *
     * Generally not recommended — garbage collection handles this automatically once the
     * callback or dependant has no other references. Use this only when you need to stop
     * receiving notifications *immediately*.
     */
    unsubscribe(reference: NonNullable<typeof this["subscribers"] | typeof this["dependants"]>)
    {
        if (reference.next !== undefined)
            reference.next.prev = reference.prev;

        if (reference.prev !== undefined)
            reference.prev.next = reference.next;
        else
        {
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
    dirty(source?: I_Subscribable<any>, ref?: LinkedList<any>)
    {
        let dependant = this.dependants;
        while (dependant !== undefined)
        {
            const deref = $USE_WEAK_REFS$ ? dependant.value["deref"]() : dependant.value;
            if (deref === undefined)
                this.unsubscribe(dependant)
            else
                deref.dirty(this as any, dependant)

            dependant = dependant.next;
        }
    }

    /**
     * Synchronously notify every value subscriber with the given value.
     *
     * Use this for **stateless** subscribables, or to flush a pending change after
     * a `dirty` propagation. Dead `WeakRef`s are pruned along the way.
     */
    emit(value: T)
    {
        let subscriber = this.subscribers;
        while (subscriber !== undefined)
        {
            const deref = $USE_WEAK_REFS$ ? subscriber.value["deref"]() : subscriber.value;
            if (deref === undefined)
            {
                this.unsubscribe(subscriber)
            }
            else
            {
                deref(this as any, value, subscriber)
            }


            subscriber = subscriber.next;
        }

        return this;
    }

    // /**
    //  * Resolve the next time this subscribable emits, then unsubscribe.
    //  *
    //  * Useful for awaiting a single event in async code:
    //  * `const next_value = await some_signal.promise();`
    //  */
    // promise(): Promise<T>
    // {
    //     let resolve: (arg0: T) => void;
    //     let reference;
    //     const subscriber = (source: Dirtyable, v: T) =>
    //     {
    //         this.unsubscribe(reference);
    //         resolve(v);
    //     }
    //     reference = this.subscribe(subscriber);
    //     return new Promise((_resolve) =>
    //     {
    //         resolve = _resolve
    //     })
    // }
}

export default Subscribable;