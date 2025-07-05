/**
 * Represents a real Subscribable value that is stored in this Signal.
 */
export declare class NativeSignalFlattened<T> implements StatefulSubscribable<T> {
    _value: T;
    queued?: boolean;
    /**
     * Creates a new Signal with an initial value.
     * @param value - The initial value of the signal.
     */
    constructor(value: T);
    /**
     * Gets the current value of the signal.
     * If called inside another computed signal, it will add itself to the list of listeners.
     * @returns The current value of the signal.
     */
    get(): T;
    /**
     * Sets a new value for the signal and emits it to all subscribers.
     * @param value - The new value to set.
     */
    set(value: T): void;
    update(fn: (v: T) => T): void;
    dirty(source: this, ref?: LinkedList<T>, value?: T): this;
    on_emit(context: this): void;
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
    subscribe_event<K extends keyof Event>(fn: (source: Subscribable<any, any>, event: Events[K], ref: EventRef<any>) => any, event?: K): EventRef<Events>;
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
    can_emit<K extends keyof Event>(event: Events[K]): boolean;
    emit_event<K extends keyof Event>(event: Events[K]): this;
    /**
     * Subscribes a function to be called when the value of this Subscribable changes.
     * @param fn - The function to subscribe.
     * @param function_owns_signal - If true, this subscribable will not GC while the function is being held. If false, the function will not GC while the signal is held.
     * @param subscribable If set, instantly sets the target subscribable to dirty when this subscribable emits.
     */
    subscribe(subscribable: Dirtyable): LinkedList<WeakRef<Dirtyable>>;
    subscribe(subscribable: (source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void): LinkedList<WeakRef<(source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void>>;
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
    _dirty(source?: I_Subscribable<any>, ref?: LinkedList<any>): void;
    /**
     * Emits a new value and notifies all subscribers immediately
     * Use this function instead of dirty if your subscribable is stateless.
     * @param value - The new value to emit.
     */
    emit(value: T): this;
    promise(): Promise<T>;
}
