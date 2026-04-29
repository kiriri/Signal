import { Subscribable, I_Subscribable } from "../Core/Subscribable";
/**
 * A subscribable that batches values from its source.
 *
 * **Use case.** Some subscribables emit per individual change (a stateless output, a
 * collection's add/delete events). If you want to react to "what happened during a
 * tick" instead of being woken for each individual change, attach a
 * `BufferedSubscribable`: it accumulates values into an array and emits the array
 * once on the next microtask.
 *
 * **Transactional behavior.** When the source emits many times during a synchronous
 * block, the buffer collects every value, and a single emission delivers the whole
 * array. This makes it useful for replaying the history of a transaction.
 *
 * **Implementation note.** Internally delegates to a private `Subscribable<T[]>` proxy
 * for subscribe/unsubscribe/dirty so that the public surface is `I_Subscribable<T[]>`.
 */
export declare class BufferedSubscribable<T> implements I_Subscribable<T[]> {
    /** True between "got a value" and "emitted the buffer". Prevents duplicate microtasks. */
    _dirty: boolean;
    /** Accumulated values waiting to be emitted on the next microtask. */
    protected buffer: T[];
    /**
     * Inner Subscribable that handles the actual subscriber/emit machinery. We
     * delegate rather than extend so that our public type is `I_Subscribable<T[]>`
     * even though the values flowing in are individual `T`s.
     */
    protected readonly proxy: Subscribable<T[], {}>;
    /**
     * Pipe all values from the given subscribable into this buffer. Returns an
     * unsubscribe function that, when invoked, detaches the source.
     */
    attach(target: Subscribable<T>): () => Subscribable<T, {}>;
    /**
     * Subscriber function used for both `attach` and direct `emit` calls. Held as
     * an instance arrow so it has a stable identity (and so the `WeakRef` GC story
     * survives — one strong reference per BufferedSubscribable, not per push).
     */
    on_target_change: (source: Subscribable<T> | undefined, value: T) => void;
    readonly subscribe: any;
    readonly unsubscribe: any;
    readonly dirty: any;
    /**
     * Push a value into the buffer manually.
     *
     * Note: like all BufferedSubscribable inputs, this does **not** emit synchronously.
     * The value lands in the buffer and the buffered array is emitted on the next
     * microtask.
     */
    emit(value?: T): void;
    /**
     * Returns the current buffer and resets it internally.
     *
     * **Conflict warning.** Calling `consume()` while subscribers are also attached
     * means those subscribers will *not* see the values you consumed — you've already
     * cleared the buffer. Pick one consumer pattern.
     *
     * Also performs Computed-style dependency tracking: if called inside a Computed,
     * the Computed will subscribe to this buffer's emissions.
     */
    consume(): T[];
}
