import { Eventable } from "./Eventable";
export type StatefulSubscribable<T> = I_Subscribable<T> & {
    get(): T;
};
/**
 * An object which can be marked as dirty.
 * This may imply that it lazily computes a value, like Compute,
 * or that it defers triggering a function like Effect.
 */
export interface Dirtyable {
    dirty(source?: I_Subscribable<any>): void;
}
export type LinkedList<T> = {
    next?: LinkedList<T>;
    prev?: LinkedList<T>;
    value: T;
};
export interface I_Subscribable<T> {
    subscribe(subscribable: Dirtyable): LinkedList<WeakRef<Dirtyable>>;
    subscribe(subscribable: (source: I_Subscribable<T>, value: T) => any | void): LinkedList<WeakRef<(source: I_Subscribable<T>, value: T) => any | void>>;
    subscribe(fn: ((source: I_Subscribable<T>, value: any) => any) | Dirtyable): LinkedList<WeakRef<Dirtyable | ((source: I_Subscribable<T>, value: T) => any | void)>>;
    unsubscribe(reference: LinkedList<WeakRef<Dirtyable | ((source: I_Subscribable<T>, value: T) => any | void)>>): this;
    dirty(source?: I_Subscribable<any>): any;
}
/**
 * Represents a subscribable value that can be observed for changes.
 */
export declare class Subscribable<T, Events extends Record<string, {
    event: string;
    value: any;
}> = {}> implements I_Subscribable<T>, Eventable<Events> {
    static global_listeners: Subscribable<any, any>[];
    static waiting_to_emit: Function[];
    static register_async_emit(fn: Function): void;
    subscribers: LinkedList<WeakRef<(source: I_Subscribable<T>, value: any) => any>> | undefined;
    dependants: LinkedList<WeakRef<Dirtyable>> | undefined;
    events: Record<string, ((source: Subscribable<any, any>, event: Events[keyof Events]) => any)[]> | undefined;
    events2: (WeakRef<(source: Subscribable<any, any>, event: Events[keyof Events]) => any>)[] | undefined;
    subscribe_event<K extends keyof Event>(fn: (source: Subscribable<any, any>, event: Events[K]) => any, event?: K): this;
    emit_event<K extends keyof Event>(event: Events[K]): this;
    /**
     * Subscribes a function to be called when the value of this Subscribable changes.
     * @param fn - The function to subscribe.
     * @param function_owns_signal - If true, this subscribable will not GC while the function is being held. If false, the function will not GC while the signal is held.
     * @param subscribable If set, instantly sets the target subscribable to dirty when this subscribable emits.
     */
    subscribe(subscribable: Dirtyable): LinkedList<WeakRef<Dirtyable>>;
    subscribe(subscribable: (source: I_Subscribable<T>, value: T) => any | void): LinkedList<WeakRef<(source: I_Subscribable<T>, value: T) => any | void>>;
    /**
     * Force unsubscribe. This is generally not recommended, as garbage collection
     * does the same thing automatically.
     * @param reference
     */
    unsubscribe(reference: NonNullable<typeof this["subscribers"] | typeof this["dependants"]>): this;
    /**
     * Call this whenever this subscribable or any of its dependencies have changed.
     * This should propagate all the way through all subscribable which depend on this.
     */
    dirty(source?: I_Subscribable<any>): void;
    /**
     * Emits a new value and notifies all subscribers immediately
     * @param value - The new value to emit.
     */
    emit(value: T): this;
    promise(): Promise<T>;
}
