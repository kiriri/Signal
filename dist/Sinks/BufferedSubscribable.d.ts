import { Subscribable, I_Subscribable } from "../Core/Subscribable";
/**
 * Represents a subscribable value that can be observed for changes.
 * Eg an output can be wrapped inside a buffered subscribable to always
 * store the last emitted value, even though outputs themselves are not
 * stateful.
 * That is why when used in a transaction, BufferedSubscribable
 * will emit the history of all changes during the
 * transaction right after.
 */
export declare class BufferedSubscribable<T> implements I_Subscribable<T[]> {
    _dirty: boolean;
    protected buffer: T[];
    protected readonly proxy: Subscribable<T[]>;
    attach(target: Subscribable<T>): this;
    detach(target: Subscribable<T>): this;
    on_target_change: (source: Subscribable<T>, value: T) => void;
    readonly subscribe: any;
    readonly unsubscribe: any;
    readonly dirty: any;
    /**
     * Please note that Buffered Subscribables by design defers emissions.
     * @param value
     */
    emit(value?: T): void;
    /**
     * Returns the current buffer and resets it internally.
     * Note that this conflicts with attached subscribables, which will
     * not receive the full buffer anymore.
     * @returns
     */
    consume(): T[];
}
