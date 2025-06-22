import { Subscribable } from "./Subscribable";
/**
 * Represents a real Subscribable value that is stored in this Signal.
 */
export class NativeSignal extends Subscribable {
    // The internal value. Only get it directly if you want to make sure no computed type subscribes to it.
    _value;
    queued = false;
    /**
     * Creates a new Signal with an initial value.
     * @param value - The initial value of the signal.
     */
    constructor(value) {
        super();
        this._value = value;
    }
    /**
     * Gets the current value of the signal.
     * If called inside another computed signal, it will add itself to the list of listeners.
     * @returns The current value of the signal.
     */
    get() {
        if (Subscribable.global_listeners)
            Subscribable.global_listeners.push(this);
        return this._value;
    }
    /**
     * Sets a new value for the signal and emits it to all subscribers.
     * @param value - The new value to set.
     */
    set(value) {
        if (value === this._value)
            return;
        this._value = value;
        this.dirty();
    }
    update(fn) {
        // this.set(fn(this._value));
        const value = fn(this._value);
        if (value === this._value)
            return;
        this._value = value;
        this.dirty();
    }
    dirty(source) {
        // If it's queued for emit(), 
        // then it stands to reason that it has propagated dirty as well.
        if (this.queued)
            return this;
        if (this.subscribers) {
            this.queued = true;
            Subscribable.register_async_emit(() => this.emit());
        }
        super.dirty(source);
        return this;
    }
    emit(value = this._value) {
        this.queued = false;
        return super.emit(value);
    }
}
//# sourceMappingURL=NativeSignal.js.map