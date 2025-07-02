import { NativeSignal } from "../Core/NativeSignal";
import { I_Subscribable, StatefulSubscribable, Subscribable } from "../Core/Subscribable";
import { I_NativeCollection } from "./Collection";
export type MapEvents<K, T> = {
    add: {
        event: "add";
        value: [K, T];
    };
    delete: {
        event: "delete";
        value: [K, T];
    };
};
export declare class SignalMap<K, V> extends Subscribable<Map<K, V>, MapEvents<K, V>> implements StatefulSubscribable<Map<K, V>>, I_NativeCollection<[K, V], MapEvents<K, V>> {
    readonly _internal: Map<K, V>;
    _signals: Map<K, NativeSignal<V | undefined>> | undefined;
    constructor(items?: Iterable<[K, V]> | null | undefined);
    /**
     * Get the underlying Map object according to the StatefulSubscribable Syntax.
     */
    get(): Map<K, V>;
    /**
     * Get a value in the map according to the Map Syntax.
     * @param key
     */
    get(key: K): V;
    /**
     * This will return a signal containing the value of the entry at the given key.
     * This works even if no value has been assigned yet.
     * The signal will automatically update when the entry changes.
     * Changing the signal to undefined removes the value from this map.
     * Changing it from undefined to something else adds the value to the map under the given key.
     * @param key
     */
    ref(key: K): NativeSignal<V | undefined>;
    _add(value: [K, V]): void;
    set(key: K, value: V): void;
    _delete(value: [K, V]): void;
    delete(key: K): void;
    clear(): void;
    has(key: K): boolean;
    queued: boolean;
    dirty(source?: I_Subscribable<any>, ref?: any): void | this;
    emit(value?: Map<K, V>): this;
}
