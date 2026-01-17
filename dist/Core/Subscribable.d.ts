export type StatefulSubscribable<T> = I_Subscribable<T> & {
    get(): T;
};
/**
 * An object which can be marked as dirty.
 * This may imply that it lazily computes a value, like Compute,
 * or that it defers triggering a function like Effect.
 */
export interface Dirtyable {
    dirty(source: I_Subscribable<any>, ref?: LinkedList<any>, value?: any): void;
}
export type LinkedList<T> = {
    next?: LinkedList<T>;
    prev?: LinkedList<T>;
    value: T;
};
export interface I_Subscribable<T> {
    depend(subscribable: Dirtyable): LinkedList<WeakRef<Dirtyable>>;
    subscribe(subscribable: (source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void): LinkedList<WeakRef<(source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void>>;
    unsubscribe(reference: LinkedList<WeakRef<Dirtyable | ((source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void)>>): this;
    dirty(source: I_Subscribable<any>, ref?: LinkedList<any>, value?: any): any;
}
export interface I_GettableSubscribable<T> extends I_Subscribable<T> {
    get(): T;
}
export type EventRef<Event> = LinkedList<WeakRef<(source: Subscribable<any, any>, event: Event, ref: EventRef<Event>) => any>> & {
    event?: string;
};
/**
 * Represents a subscribable value that can be observed for changes.
 */
export declare class Subscribable<T, Events extends Record<string, {
    event: string;
    value: any;
}> = {}> implements I_Subscribable<T> {
    subscribers: LinkedList<WeakRef<(source: I_Subscribable<T>, value: any, ref: LinkedList<any>) => any>> | undefined;
    dependants: LinkedList<WeakRef<Dirtyable>> | undefined;
    events: Record<string, EventRef<Events[keyof Events]> | undefined>;
    any_events: EventRef<undefined> | undefined;
    /**
     * Subscribe to a named event, or to any named event if event parameter is left undefined.
     * Please note that unlike regular value subscribe() hooks, event subscriptions propagate *instantly*.
     * @param fn
     * @param event
     * @returns
     */
    subscribe_event<K extends keyof Events>(fn: (source: Subscribable<any, any>, event: Events[K], ref: EventRef<any>) => any, event?: K): EventRef<Events[K]>;
    /**
 * Force unsubscribe. This is generally not recommended, as garbage collection
 * does the same thing automatically.
 * @param reference
 */
    unsubscribe_event(reference: EventRef<any>): this;
    /**
     * emit_event will not be inlined, but this function will.
     * Which makes if(can_emit(e)) emit_event(e) paradoxically faster some of the time than using just emit_event(e).
     * @param event
     * @returns
     */
    can_emit<K extends keyof Events>(event: Events[K]): boolean;
    emit_event<K extends keyof Events>(event: Events[K]): this;
    /**
     * Subscribes a function to be called when the value of this Subscribable changes.
     * @param fn - The function to subscribe.
     * @param function_owns_signal - If true, this subscribable will not GC while the function is being held. If false, the function will not GC while the signal is held.
     * @param subscribable If set, instantly sets the target subscribable to dirty when this subscribable emits.
     */
    subscribe(fn: (source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void): LinkedList<WeakRef<(source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void>>;
    depend(subscribable: Dirtyable): LinkedList<WeakRef<Dirtyable>>;
    /**
     * Force unsubscribe. This is generally not recommended, as garbage collection
     * does the same thing automatically.
     * @param reference
     */
    unsubscribe(reference: NonNullable<typeof this["subscribers"] | typeof this["dependants"]>): this;
    /**
     * Call this whenever this subscribable or any of its dependencies have changed.
     * This is only used for stateful subscribables.
     * This should propagate all the way through all subscribables which depend on this.
     */
    dirty(source?: I_Subscribable<any>, ref?: LinkedList<any>): void;
    /**
     * Emits a new value and notifies all subscribers immediately
     * Use this function instead of dirty if your subscribable is stateless.
     * @param value - The new value to emit.
     */
    emit(value: T): this;
    promise(): Promise<T>;
}
export default Subscribable;
