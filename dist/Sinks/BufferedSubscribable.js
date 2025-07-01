import { Subscribable } from "../Core/Subscribable";
const EMPTY = {};
/**
 * Represents a subscribable value that can be observed for changes.
 * Eg an output can be wrapped inside a buffered subscribable to always
 * store the last emitted value, even though outputs themselves are not
 * stateful.
 * That is why when used in a transaction, BufferedSubscribable
 * will emit the history of all changes during the
 * transaction right after.
 */
export class BufferedSubscribable {
    // Dirty in this case just means that it has registered the deferred emit function.
    _dirty = false;
    buffer = [];
    proxy = new Subscribable();
    /**
     * Pipe all changes from the subscribable into this buffered subscribable.
     * Returns an unsubscribe function.
     * @param target
     * @returns
     */
    attach(target) {
        const ref = target.subscribe(this.on_target_change);
        return () => target.unsubscribe(ref);
    }
    on_target_change = (source, value) => {
        this.buffer.push(value);
        if (this._dirty)
            return;
        this._dirty = true;
        Subscribable.register_async_emit(() => {
            this._dirty = false;
            const buffer = this.buffer;
            this.buffer = [];
            this.proxy.emit(buffer);
        });
    };
    subscribe = this.proxy.subscribe.bind(this.proxy);
    unsubscribe = this.proxy.unsubscribe.bind(this.proxy);
    dirty = this.proxy.dirty.bind(this.proxy);
    /**
     * Please note that Buffered Subscribables by design defers emissions.
     * @param value
     */
    emit(value = EMPTY) {
        this.on_target_change(undefined, value);
    }
    /**
     * Returns the current buffer and resets it internally.
     * Note that this conflicts with attached subscribables, which will
     * not receive the full buffer anymore.
     * @returns
     */
    consume() {
        const result = this.buffer;
        this.buffer = [];
        this._dirty = false;
        if (Subscribable.global_listeners)
            Subscribable.global_listeners.push(this.proxy);
        return result;
    }
}
//# sourceMappingURL=BufferedSubscribable.js.map