import { Dirtyable, I_Subscribable, LinkedList, StatefulSubscribable, Subscribable } from "./Subscribable";
/**
 * Represents a computed signal that dynamically computes its value based on other signals.
 */
export declare class Computed<T> extends Subscribable<T> implements StatefulSubscribable<T>, Dirtyable {
    subscribed_to: {
        signal: Subscribable<any>;
        ref: any;
    }[];
    readonly fn: () => T;
    _dirty: boolean | "first";
    _cache: T;
    _eager: boolean;
    /**
     * Creates a new Computed signal with a function that computes its value.
     * @param fn - The function that computes the value of the computed signal.
     * @param [eager=false] If true, acts like a sink/effect, as in it does not wait to run the function until get() is called. Default false.
     */
    constructor(fn: () => T, eager?: boolean);
    /**
     * Only propagates dirty state when its not already propagated
     * ( ie no dependent signal has bothered to get this computed since )
     * This is a performance saving measure.
     * @param source
     * @returns
     */
    dirty(source?: I_Subscribable<any>): void;
    get(): T;
    subscribe(subscribable: Dirtyable): LinkedList<WeakRef<Dirtyable>>;
    subscribe(subscribable: (source: I_Subscribable<T>, value: T) => any | void): LinkedList<WeakRef<(source: I_Subscribable<T>, value: T) => any | void>>;
    /**
     * Computes the current value of the computed signal and subscribes to any signals it depends on.
     * @returns The current value of the computed signal.
     */
    _get(): T;
    /**
     * Stop any future update of this computed.
     * Call _get() to undo this.
     */
    destroy(): void;
}
