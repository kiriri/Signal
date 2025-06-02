import { BufferedSubscribable } from "../Sinks/BufferedSubscribable";
import { ReadonlySignal } from "../Core/Signal";
import { I_Subscribable, StatefulSubscribable, Subscribable } from "../Core/Subscribable";
import type { I_NativeCollection } from "./Collection";
export type SetEvents<T> = {
    add: {
        event: "add";
        value: T;
    };
    delete: {
        event: "delete";
        value: T;
    };
};
export declare class SignalSet<T> extends Subscribable<Set<T>> implements StatefulSubscribable<Set<T>>, I_NativeCollection<T, SetEvents<T>> {
    readonly _internal: Set<T>;
    on_change: BufferedSubscribable<{
        event: "add";
        value: T;
    } | {
        event: "delete";
        value: T;
    }>;
    _on_change_instant: Subscribable<{
        event: "add";
        value: T;
    } | {
        event: "delete";
        value: T;
    }>;
    constructor(items?: Iterable<T> | null | undefined);
    get(): Set<T>;
    _add(value: T): void;
    add(value: T): void;
    _delete(value: T): void;
    delete(value: T): void;
    clear(): void;
    queued: boolean;
    dirty(source?: I_Subscribable<any>): this;
    emit(value?: Set<T>): this;
    has(value: T): boolean;
    count(fn: (v: T) => number, subscribe?: boolean): ReadonlySignal<number>;
}
/**
 * Create what is essentially a very smart reduce() compute.
 * This kind of signal is somewhat expensive to initialize, but it hooks directly into change events
 * of the set so it updates much faster,especially for large sets with sporadic point changes.
 * @param set
 * @param operation
 */
