import type { Dirtyable, I_Subscribable, LinkedList } from "./Subscribable";
import Subscribable from "./Subscribable";
/**
 * Represents a real Subscribable value that is stored in this Signal.
 */
export declare class NativeSignal<T> {
    _value: T;
    queued?: boolean;
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
    subscribe_event<K extends keyof Event>(fn: (source: Subscribable<any, any>, event: Events[K], ref: EventRef<any>) => any, event?: K): EventRef<Events>;
    unsubscribe_event(reference: EventRef<any>): this;
    can_emit<K extends keyof Event>(event: Events[K]): boolean;
    emit_event<K extends keyof Event>(event: Events[K]): this;
    subscribe(subscribable: Dirtyable): LinkedList<WeakRef<Dirtyable>>;
    subscribe(subscribable: (source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void): LinkedList<WeakRef<(source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void>>;
    unsubscribe(reference: NonNullable<typeof this[] | typeof this[]>): this;
    __base_dirty(source?: I_Subscribable<any>, ref?: LinkedList<any>): void;
    emit(value: T): this;
    promise(): Promise<T>;
    constructor(value: T);
}
export type ReadonlySignal<T> = Omit<NativeSignal<T>, "set">;
