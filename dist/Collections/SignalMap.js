import { BufferedSubscribable } from "../Sinks/BufferedSubscribable";
import { NativeSignal } from "../Core/NativeSignal";
import { Subscribable } from "../Core/Subscribable";
export class SignalMap extends Subscribable {
    _internal;
    _entries;
    _signals = undefined;
    on_change = new BufferedSubscribable();
    _on_change_instant = new Subscribable();
    // TODO : return a signal which, using an external predicate function, 
    // tracks the number of entries which are true. (computed deeply)
    // This should use the on_add/delete subscribables to stay up to date. 
    constructor(items) {
        super();
        this._internal = new Map(items);
        this._entries = new Map(items ? [...items].map(kv => [kv[0], kv]) : []);
    }
    get(key) {
        if (key) {
            return this._internal.get(key);
        }
        if (Subscribable.global_listeners)
            Subscribable.global_listeners.push(this);
        return this._internal;
    }
    /**
     * This will return a signal containing the value of the entry at the given key.
     * This works even if no value has been assigned yet.
     * The signal will automatically update when the entry changes.
     * Changing the signal to undefined removes the value from this map.
     * Changing it from undefined to something else adds the value to the map under the given key.
     * @param key
     */
    ref(key) {
        if (!this._signals)
            this._signals = new Map();
        let result = this._signals.get(key);
        if (!result) {
            let value = this.get(key);
            result = new NativeSignal(value);
            const original_set = result.set.bind(result);
            this._signals.set(key, result);
            const fn = (v) => {
                original_set(v);
                if (v === undefined) {
                    this.delete(key);
                }
                else {
                    this.set(key, v);
                }
            };
            result.set = fn;
        }
        return result;
    }
    _add(value) {
        this.set(...value);
    }
    set(key, value) {
        if (value === undefined) {
            console.error("Cannot set Signal Map's value to undefined, using null instead!");
            value = null;
        }
        let exists = this._internal.get(key);
        if (exists !== value) {
            const kv = [key, value];
            this._internal.set(key, value);
            this._entries.set(key, kv);
            this._signals?.get(key)?.set(value);
            if (exists === undefined) {
                this.on_change.emit({ event: "add", value: kv });
                this._on_change_instant.emit({ event: "add", value: kv });
            }
            this.dirty();
        }
    }
    _delete(value) {
        this.delete(value[0]);
    }
    delete(key) {
        if (this._internal.delete(key)) {
            let kv = this._entries.get(key);
            this._entries.delete(key);
            let signal = this._signals?.get(key);
            if (signal?.get() !== undefined)
                signal?.set(undefined);
            this.on_change.emit({ event: "delete", value: kv });
            this._on_change_instant.emit({ event: "delete", value: kv });
            this.dirty();
        }
    }
    clear() {
        this._internal.clear();
        const entries = this._entries.values();
        this._entries.clear();
        for (let kv of entries) {
            const reference = this._signals?.get(kv[0]);
            if (reference)
                reference.set(undefined);
            this.on_change.emit({ event: "delete", value: kv });
            this._on_change_instant.emit({ event: "delete", value: kv });
        }
        this.dirty();
    }
    has(key) {
        return this._internal.has(key);
    }
    queued = false;
    dirty(source) {
        // If it's queued for emit(),
        // then it stands to reason that it has propagated dirty as well.
        if (this.queued)
            return this;
        if (this.subscribers) {
            this.queued = true;
            Subscribable.register_async_emit(() => this.emit());
        }
        return super.dirty(source);
    }
    emit(value = this._internal) {
        return super.emit(value);
    }
}
//# sourceMappingURL=SignalMap.js.map