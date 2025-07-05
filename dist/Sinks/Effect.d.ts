import type { I_Subscribable, LinkedList } from "../Core/Subscribable";
import Subscribable from "../Core/Subscribable";
type MappedSignals<Inputs extends Record<string, Subscribable<any>>> = {
    [K in keyof Inputs]: Inputs[K] extends Subscribable<infer U> ? U : Inputs[K] extends {
        get(): infer U;
    } ? U : never;
};
/**
 * An effect may reference any number of subscribables in its function, but it will only run whenever one of its sources changes.
 */
export declare class Effect<Inputs extends Record<string, Subscribable<any>>, T> {
    readonly sources: Inputs;
    fn: (v: MappedSignals<Inputs>, self: any) => T;
    _source_cache: Record<keyof Inputs, Inputs[keyof Inputs] extends Subscribable<infer U> ? U : never>;
    _updaters: {
        [x: string]: LinkedList<WeakRef<(source: I_Subscribable<any>, value: any, ref: LinkedList<T>) => any | void>>;
    };
    _dirty: boolean;
    _initialized: boolean;
    /**
     * Creates a new Computed signal with a function that computes its value.
     * @param fn - The function that computes the value of the computed signal.
     */
    constructor(sources: Inputs, fn: (v: MappedSignals<Inputs>, self: any) => T, context?: any);
    initialize(): void;
    /**
     * Instantly removes all event listener references.
     * Call this to make sure an Effect for sure no longer
     * triggers. Without this the garbage collection may
     * take seconds before it cleans up orphaned effects,
     * during which time they will still trigger!
     */
    destroy(): void;
}
export {};
