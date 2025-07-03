import { LinkedList, StatefulSubscribable, Subscribable } from "./Subscribable";
/**
 * Represents a real Subscribable value that is stored in this Signal.
 */
export declare class NativeSignal<T> extends Subscribable<T> implements StatefulSubscribable<T> {
    _value: T;
    queued: boolean;
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
}
export type ReadonlySignal<T> = Omit<NativeSignal<T>, "set">;
