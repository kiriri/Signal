import { EventRef, I_Eventable, I_Subscribable, LinkedList, Subscribable } from "../Core/Subscribable.js";
import EventManager from "../Core/_events.js";

/**
 * Helper type that constrains a collection's event map to (at minimum) `add` and
 * `delete` events with values of type `T`, while still allowing the collection to
 * declare additional named events (like `Order`'s `move`).
 */
export type ReqColTypes<T> = {
    add: {
        event: "add";
        value: T;
    },
    delete: {
        event: "delete";
        value: T;
    },
    [K: Exclude<string, "add" | "delete">]: {
        event: string;
        value: any
    }
};

/**
 * The shared interface for every collection in the framework (`SignalSet`,
 * `SignalMap`, `SignalHeap`, `Order`).
 *
 * What it guarantees:
 *  - `get()` returns an iterable of the current contents.
 *  - The collection is `I_Eventable` with at least `add` and `delete` events.
 *
 * Concrete collections add their own methods (e.g. `add`/`delete`/`set`/`push`/`shift`)
 * and may add additional named events (e.g. `move` on `Order`).
 */
export interface I_NativeCollection<T, Events extends ReqColTypes<T> = ReqColTypes<T>> extends I_Eventable<Events>
{
    get(): Iterable<T>;

    // _add(value:T);
    // _delete(value:T);
}

/**
 * The base class for every collection in the framework (`SignalSet`, `SignalMap`,
 * `SignalHeap`, `Order`).
 *
 * `Collection` layers a **named event channel** on top of `Subscribable`'s value
 * channel. The two channels serve different purposes:
 *
 * 1. **Whole-collection emission** (inherited from `Subscribable`: `subscribe` /
 *    `emit` / `dirty`): subscribers receive the entire container `C` after a
 *    microtask coalesces a tick's worth of changes.
 * 2. **Per-change events** (`subscribe_event` / `emit_event`): subscribers receive
 *    a typed `{event, value}` object *synchronously*, one per add/delete. There is
 *    no microtask deferral or coalescing for events.
 *
 * **Generics.**
 *  - `T` — the *iterated* element type, which is also what `add`/`delete` events
 *    carry in their `value`. A `SignalSet<V>` iterates and emits `V` directly, so
 *    `T = V`; a `SignalMap<K, V>` iterates and emits entries, so `T = [K, V]`.
 *  - `C` — the whole-collection value handed to value subscribers (e.g. `Set<T>`,
 *    `Map<K, V>`, `Iterable<T>`). Always iterable over `T`.
 *  - `Events` — the event map. Constrained to at least `add`/`delete` of `T` via
 *    {@link ReqColTypes}; collections may declare extra named events (e.g. `move`).
 *
 * **Memory model.** Event subscribers are held weakly (like value subscribers), so
 * the caller must keep a strong reference to any callback they want to keep
 * receiving events. Orphaned listeners are pruned automatically by GC.
 */
export abstract class Collection<
    T,
    C extends Iterable<T> = Iterable<T>,
    Events extends ReqColTypes<T> = ReqColTypes<T>
> extends Subscribable<C, Events> implements I_NativeCollection<T, Events>
{
    /** Named event subscribers, keyed by event name. Lazily allocated. */
    events: Record<string, EventRef<Events[keyof Events]> | undefined> | undefined;

    /** Subscribers that fire on *every* named event regardless of name. */
    any_events: EventRef<undefined> | undefined;

    /** True when a whole-collection emission is already scheduled for the next microtask. */
    queued = false;

    /** Returns an iterable over the current contents. */
    abstract get(): C;

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
    subscribe_event<K extends keyof Events>(
        fn: (
            source: Subscribable<any, any>,
            event: Events[K],
            ref: EventRef<any>
        ) => any,
        event?: K
    )
    {
        let previous_first_item = event === undefined ? this.any_events : (this.events ??= {})[event as any];

        const new_item: EventRef<Events[K]> = {
            next: previous_first_item,
            // Held weakly so that the next subscription doesn't end up referencing this one
            // (it's a linked list after all), which would create a chain of strong references
            // and prevent GC from cleaning up orphaned subscribers.
            value: $USE_WEAK_REFS$ ? new WeakRef(fn) : fn,
            event: event as string
        };

        if (previous_first_item === undefined)
        {
            if (event === undefined)
                this.any_events = new_item;
            else
                this.events[event as string] = new_item;
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
    unsubscribe_event(reference: EventRef<any>)
    {
        let event_name = reference["event"];

        if (reference.next !== undefined)
            reference.next.prev = reference.prev;

        if (reference.prev !== undefined)
            reference.prev.next = reference.next;
        else
        {
            if (event_name === undefined)
                if (this.any_events === reference)
                    this.any_events = reference.next;
                else
                    if (this.events?.[event_name] === reference)
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
    can_emit<K extends keyof Events>(event: Events[K])
    {
        return (this.any_events ?? this.events?.[event.event]) !== undefined;
    }

    /**
     * Synchronously notify every subscriber of the given named event, plus every
     * `any_events` subscriber. Dead `WeakRef`s are pruned along the way.
     */
    emit_event<K extends keyof Events>(event: Events[K])
    {
        let events = this.events?.[event.event];
        while (events !== undefined)
        {
            const deref = $USE_WEAK_REFS$ ? events.value["deref"]() : events.value;
            if (deref === undefined)
                this.unsubscribe_event(events)
            else
                deref(this as any, event, events)

            events = events.next;
        }

        let events2 = this.any_events;
        while (events2 !== undefined)
        {
            const deref = $USE_WEAK_REFS$ ? events2.value["deref"]() : events2.value;
            if (deref === undefined)
                this.unsubscribe_event(events2)
            else
                deref(this as any, event, events2)

            events2 = events2.next;
        }

        return this;
    }

    /**
     * Mark the collection changed.
     *
     * Whereas the per-change *event* channel fires synchronously from the mutators,
     * whole-collection *value* subscribers are notified asynchronously: every mutation
     * in a tick coalesces into a single emission on the next microtask. The `queued`
     * flag guards against scheduling more than one emission per tick; it is cleared by
     * {@link on_emit} when that emission fires, so the next tick's mutations schedule
     * afresh.
     *
     * Shared by every collection (`SignalSet`/`SignalMap`/`SignalHeap`/`Order`) — the
     * subclasses only differ in *what* they emit, which {@link emit} resolves via `get()`.
     */
    override dirty(source?: I_Subscribable<any>, ref?: LinkedList<any>): this
    {
        // Already scheduled — that pending emission will propagate dirty for us.
        if (this.queued)
            return this;

        if (this.subscribers !== undefined)
        {
            this.queued = true;
            EventManager.register_async_emit(this.on_emit, this);
        }

        super.dirty(source, ref);
        return this;
    }

    /**
     * Microtask callback registered by {@link dirty}. Clears `queued` (so the next
     * mutation can schedule a fresh emission) and emits the current contents. Receives
     * its target via `context` so it can live on the prototype without a bound `this`,
     * mirroring `NativeSignal.on_emit`.
     */
    on_emit(context: Collection<T, C, Events>)
    {
        context.queued = false;
        context.emit();
    }

    /**
     * Emit the whole-collection value to value subscribers. Defaults to the current
     * contents via `get()`, so subclasses don't need to special-case their backing
     * field (e.g. `SignalHeap` emits a fresh iterator, `SignalSet`/`SignalMap` emit the
     * live `Set`/`Map`).
     */
    override emit(value: C = this.get()): this
    {
        return super.emit(value) as this;
    }
}
