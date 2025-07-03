import { Eventable } from "./Eventable";

export type StatefulSubscribable<T> = I_Subscribable<T> & { get(): T };

// This is a fake WeakRef. Using the real one results in bugs:
// We want subscribers to disappear from the subscribers array when they are no longer used. But we don't want this subscribable,
// which active subscribers listen to, to be removed. WeakRefs are weak in both directions! Therefore we need to store "Is listening to"
// just to keep the source alive!
class FakeWeakRef<T>
{
    constructor(public value: T)
    {

    }

    deref()
    {
        return this.value;
    }
}

/**
 * An object which can be marked as dirty.
 * This may imply that it lazily computes a value, like Compute,
 * or that it defers triggering a function like Effect.
 */
export interface Dirtyable
{
    dirty(source: I_Subscribable<any>, ref?: LinkedList<any>, value?: any): void;
    // _dirty:boolean;
}

export type LinkedList<T> = {
    next?: LinkedList<T>;
    prev?: LinkedList<T>;
    value: T
}



export interface I_Subscribable<T>
{
    subscribe(
        subscribable: Dirtyable
    ): LinkedList<WeakRef<Dirtyable>>;
    subscribe(
        subscribable: (source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void
    ): LinkedList<WeakRef<(source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void>>;
    subscribe(
        fn: ((source: I_Subscribable<T>, value: any, ref: LinkedList<any>) => any) | Dirtyable
    ): LinkedList<WeakRef<Dirtyable | ((source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void)>>;

    unsubscribe(reference: LinkedList<WeakRef<Dirtyable | ((source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void)>>): this;

    dirty(source: I_Subscribable<any>, ref?: LinkedList<any>, value?: any);
}

export interface I_GettableSubscribable<T> extends I_Subscribable<T> 
{
    get():T
}

export type EventRef<Event> = LinkedList<WeakRef<(source: Subscribable<any, any>, event: Event, ref:EventRef<Event>) => any>> & {
    event?:string
}

/**
 * Represents a subscribable value that can be observed for changes.
 */
export class Subscribable<T, Events extends Record<string, { event: string, value: any }> = {}> implements I_Subscribable<T>, Eventable<Events>
{

    // This is set or replaced whenever a computed type ( or a similar custom Subscribable )
    // runs its .get() function. While it is open, any other subscribable's get() function
    // should add itself to this set. This way the computed signal knows which signals it
    // depends on.
    static global_listeners: Subscribable<any, any>[] = null!;

    // 
    static waiting_to_emit: Function[] = [];

    // To avoid updating say an effect every time its dependency changes while the same function
    // is processing, it will register its callback with an async delay, 
    // which in reality should wait until whatever sync function is running is done.
    // This means the effect only triggers once after all dependencies were set, instead of once
    // for each dependency that changed.
    static register_async_emit(fn: Function)
    {
        if (this.waiting_to_emit.length <= 0)
        {
            const a = () =>
            {
                const emits = this.waiting_to_emit;
                this.waiting_to_emit = [];
                for (let f of emits)
                {
                    f();
                }
            }
            // setImmediate is faster but only works reliably in node
            if (typeof process === 'object')
                setImmediate(a);
            else // firefox breaks terribly if setImmediate is used.
                setTimeout(a, 0);
        }
        this.waiting_to_emit.push(fn);
    }

    // These functions want to be called when this Subscribable's value changes.
    // We store them as WeakRefs so they get GCed when nobody uses the object anymore.
    subscribers: LinkedList<WeakRef<(
        source: I_Subscribable<T>,
        value: any,
        ref: LinkedList<any>
    ) => any>> | undefined;
    inst_subscribers: LinkedList<WeakRef<(
        source: I_Subscribable<T>,
        value: any,
        ref: LinkedList<any>
    ) => any>> | undefined;

    dependants: LinkedList<WeakRef<Dirtyable>> | undefined;

    // event subscribers
    events: Record<string,
        EventRef<Events[keyof Events]> | undefined
    >;

    any_events:EventRef<undefined> | undefined;
    // events: Record< string, ((event:Events[keyof Events]) => any)[] > | undefined;

    /**
     * Subscribe to a named event, or to any named event if event parameter is left undefined.
     * Please note that unlike regular value subscribe() hooks, event subscriptions propagate *instantly*.
     * @param fn 
     * @param event 
     * @returns 
     */
    subscribe_event<K extends keyof Event>(
        fn: (
            source: Subscribable<any, any>, 
            event: Events[K], 
            ref:EventRef<any>
        ) => any, 
        event?: K
    )
    {
        let previous_first_item = event === undefined ? this.any_events : (this.events ??= {})[event];

        const new_item: EventRef<Events[K]> = {
            next: previous_first_item,
            value: new WeakRef(fn),
            event
        };

        if(previous_first_item === undefined)
        {
            if(event === undefined)
                this.any_events = new_item;
            else
                this.events[event] = new_item;
        }

        if (previous_first_item !== undefined)
            previous_first_item.prev = new_item;

        return new_item;
    }

        /**
     * Force unsubscribe. This is generally not recommended, as garbage collection 
     * does the same thing automatically.
     * @param reference
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
                if(event_name === undefined)
                    if(this.any_events === reference)
                        this.any_events = reference.next;
                else 
                    if(this.events?.[event_name] === reference)
                        this.events[event_name] = reference.next;
            }
    
            return this;
        }

        /**
         * emit_event will not be inlined, but this function will.
         * Which makes if(can_emit(e)) emit_event(e) paradoxically faster some of the time than using just emit_event(e). 
         * @param event 
         * @returns 
         */
    can_emit<K extends keyof Event>(event: Events[K])
    {
        return (this.any_events ?? this.events?.[event.event]) !== undefined;
    }

    emit_event<K extends keyof Event>(event: Events[K])
    {
        let events = this.events?.[event.event];
        while (events !== undefined)
        {
            
            const deref = events.value.deref();
            if (deref === undefined)
                this.unsubscribe_event(events)
            else
                deref(this as any, event, events)


                events = events.next;
        }

        let events2 = this.any_events;
        while (events2 !== undefined)
        {
            
            const deref = events2.value.deref();
            if (deref === undefined)
                this.unsubscribe_event(events2)
            else
                deref(this as any, event, events2)


                events2 = events2.next;
        }

        return this;
    }

    // readonly uid = uid();

    /**
     * Subscribes a function to be called when the value of this Subscribable changes.
     * @param fn - The function to subscribe.
     * @param function_owns_signal - If true, this subscribable will not GC while the function is being held. If false, the function will not GC while the signal is held.
     * @param subscribable If set, instantly sets the target subscribable to dirty when this subscribable emits.
     */
    subscribe(
        subscribable: Dirtyable
    ): LinkedList<WeakRef<Dirtyable>>;
    subscribe(
        subscribable: (source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void
    ): LinkedList<WeakRef<(source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void>>;
    subscribe(
        fn: ((source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any) | Dirtyable
    ): LinkedList<WeakRef<Dirtyable | ((source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any)>>
    {


        if (typeof fn === "function")
        {
            const previous_first_item = this.subscribers;

            const new_item: LinkedList<WeakRef<typeof fn>> = this.subscribers = {
                next: this.subscribers!,
                value: new WeakRef(fn)
            }

            if (previous_first_item !== undefined)
                previous_first_item.prev = new_item;

            return new_item;
        }

        const previous_first_item = this.dependants;

        const new_item: LinkedList<WeakRef<typeof fn>> = this.dependants = {
            next: this.dependants!,
            value: new WeakRef(fn)
        }

        if (previous_first_item !== undefined)
            previous_first_item.prev = new_item;


        return new_item;
    }

    /**
     * Force unsubscribe. This is generally not recommended, as garbage collection 
     * does the same thing automatically.
     * @param reference
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
     * Call this whenever this subscribable or any of its dependencies have changed.
     * This is only used for stateful subscribables.
     * This should propagate all the way through all subscribables which depend on this.
     */
    dirty(source?: I_Subscribable<any>, ref?: LinkedList<any>)
    {
        let dependant = this.dependants;
        // Propagate dirty state to all dependent subscribables.
        while (dependant !== undefined)
        {
            const deref = dependant.value.deref();
            if (deref === undefined)
                this.unsubscribe(dependant)
            else
                deref.dirty(this as any, dependant)

            dependant = dependant.next;
        }
    }

    /**
     * Emits a new value and notifies all subscribers immediately
     * Use this function instead of dirty if your subscribable is stateless.
     * @param value - The new value to emit.
     */
    emit(value: T)
    {
        let subscriber = this.subscribers;
        // Propagate dirty state to all dependent subscribables.
        while (subscriber !== undefined)
        {
            const deref = subscriber.value.deref();
            if (deref === undefined)
                this.unsubscribe(subscriber)
            else
                deref(this as any, value, subscriber)


            subscriber = subscriber.next;
        }

        // let dependant = this.dependants;
        // // Propagate dirty state to all dependent subscribables.
        // while (dependant !== undefined)
        // {
        //     const deref = dependant.value.deref();
        //     if (deref === undefined)
        //         this.unsubscribe(dependant)
        //     else
        //         deref.dirty(this as any, dependant, value)

        //     dependant = dependant.next;
        // }

        return this;
    }

    promise(): Promise<T>
    {
        let resolve: (arg0: T) => void;
        let reference;
        const subscriber = (source: Dirtyable, v: T) =>
        {
            this.unsubscribe(reference);
            resolve(v);
        }
        reference = this.subscribe(subscriber);
        return new Promise((_resolve) =>
        {
            resolve = _resolve
        })
    }
}