import { Computed as Computed$1 } from "src/Core/Computed";

import { NativeSignal as NativeSignal$1 } from "src/Core/NativeSignal";

class EventManager {
    static global_listeners=[ void 0 ];
    static global_listener_length=0;
    static real_length=1;
    static global_listen=0;
    static waiting_to_emit=[];
    static _is_waiting=!1;
    static register_async_emit(fn, context) {
        this.waiting_to_emit.push(fn, context), this._is_waiting || (this._is_waiting = !0, 
        queueMicrotask(EventManager.#process_queue));
    }
    static #process_queue() {
        EventManager._is_waiting = !1;
        const queue = EventManager.waiting_to_emit;
        EventManager.waiting_to_emit = [];
        for (let i = 0; i < queue.length; i += 2) queue[i](queue[i + 1]);
    }
    static flush() {
        this.#process_queue();
    }
}

function push_subscribable(sub) {
    EventManager.global_listen > 0 && (EventManager.real_length === EventManager.global_listener_length && (EventManager.global_listeners = EventManager.global_listeners.concat(new Array(EventManager.real_length)), 
    EventManager.real_length *= 2), EventManager.global_listeners[EventManager.global_listener_length++] = sub);
}

class Subscribable {
    subscribers;
    dependants;
    version=0;
    subscribe(fn) {
        const previous_first_item = this.subscribers, new_item = this.subscribers = {
            next: previous_first_item,
            value: fn
        };
        return void 0 !== previous_first_item && (previous_first_item.prev = new_item), 
        0 === this.version && (this.version = 1), new_item;
    }
    depend(subscribable) {
        const previous_first_item = this.dependants, new_item = this.dependants = {
            next: previous_first_item,
            value: subscribable
        };
        return void 0 !== previous_first_item && (previous_first_item.prev = new_item), 
        0 === this.version && (this.version = 1), new_item;
    }
    unsubscribe(reference) {
        return void 0 !== reference.next && (reference.next.prev = reference.prev), void 0 !== reference.prev ? reference.prev.next = reference.next : this.dependants === reference ? this.dependants = this.dependants.next : this.subscribers === reference && (this.subscribers = this.subscribers.next), 
        this;
    }
    dirty(source, ref) {
        let dependant = this.dependants;
        for (;void 0 !== dependant; ) {
            const deref = dependant.value;
            void 0 === deref ? this.unsubscribe(dependant) : deref.dirty(this, dependant), dependant = dependant.next;
        }
    }
    emit(value) {
        let subscriber = this.subscribers;
        for (;void 0 !== subscriber; ) {
            const deref = subscriber.value;
            void 0 === deref ? this.unsubscribe(subscriber) : deref(this, value, subscriber), 
            subscriber = subscriber.next;
        }
        return this;
    }
}

class Computed {
    subscribed_to=[];
    fn;
    context;
    _value;
    _eager;
    on_emit(context) {
        if (context.version > 0) return;
        const prev = context._value;
        context.get(), prev !== context._value && context.emit(context._value);
    }
    dirty(source, ref) {
        this.version < 0 || (this.version = -this.version, this.__base_dirty(source, ref), 
        (void 0 !== this.subscribers || this._eager) && EventManager.register_async_emit(this.on_emit, this));
    }
    get() {
        return push_subscribable(this), this.version > 0 ? this._value : this.version < 0 && !this._validate() ? (this.version = -this.version, 
        this._value) : this._get();
    }
    _validate() {
        const subscribed_to = this.subscribed_to, len = subscribed_to.length, saved_listen = EventManager.global_listen;
        EventManager.global_listen = 0;
        for (let i = 0; i < len; i++) {
            const entry = subscribed_to[i];
            if (entry.signal.version !== entry.last) return EventManager.global_listen = saved_listen, 
            !0;
        }
        return EventManager.global_listen = saved_listen, !1;
    }
    subscribe(fn) {
        return 0 == this.version && this._get(), this.__base_subscribe(fn);
    }
    _get() {
        EventManager.global_listen++;
        let value, global_listener_index = EventManager.global_listener_length;
        try {
            value = this.fn(this.context);
        } catch (e) {
            throw EventManager.global_listener_length = global_listener_index, e;
        } finally {
            EventManager.global_listen--;
        }
        let subscribed_to = this.subscribed_to;
        const global_listeners = EventManager.global_listeners, fresh_dependency_length = EventManager.global_listener_length - global_listener_index;
        if (subscribed_to.length <= 1 && fresh_dependency_length === subscribed_to.length) {
            if (1 === fresh_dependency_length) {
                const entry = subscribed_to[0];
                entry.last = entry.signal.version;
            }
        } else {
            const l1 = subscribed_to.length;
            for (let i = 0; i < l1; i++) {
                let {ref: ref, signal: signal} = subscribed_to[i];
                signal.unsubscribe(ref);
            }
            const length = EventManager.global_listener_length;
            for (let i = global_listener_index; i < length; i++) {
                const sub = global_listeners[i], last = sub.version;
                if (i < l1) {
                    let existing = subscribed_to[i];
                    existing.ref = sub.depend(this), existing.signal = sub, existing.last = last;
                } else subscribed_to.push({
                    signal: sub,
                    ref: sub.depend(this),
                    last: last
                });
            }
            length < l1 && (subscribed_to.length = length);
        }
        return this._value = value, this.version = 1 - this.version, EventManager.global_listener_length = global_listener_index, 
        value;
    }
    destroy() {
        this.version = 0;
        for (const {signal: signal, ref: ref} of this.subscribed_to) signal.unsubscribe(ref);
        this.subscribed_to.length = 0;
    }
    subscribers;
    dependants;
    version=0;
    __base_subscribe(fn) {
        const previous_first_item = this.subscribers, new_item = this.subscribers = {
            next: previous_first_item,
            value: fn
        };
        return void 0 !== previous_first_item && (previous_first_item.prev = new_item), 
        0 === this.version && (this.version = 1), new_item;
    }
    depend(subscribable) {
        const previous_first_item = this.dependants, new_item = this.dependants = {
            next: previous_first_item,
            value: subscribable
        };
        return void 0 !== previous_first_item && (previous_first_item.prev = new_item), 
        0 === this.version && (this.version = 1), new_item;
    }
    unsubscribe(reference) {
        return void 0 !== reference.next && (reference.next.prev = reference.prev), void 0 !== reference.prev ? reference.prev.next = reference.next : this.dependants === reference ? this.dependants = this.dependants.next : this.subscribers === reference && (this.subscribers = this.subscribers.next), 
        this;
    }
    __base_dirty(source, ref) {
        let dependant = this.dependants;
        for (;void 0 !== dependant; ) {
            const deref = dependant.value;
            void 0 === deref ? this.unsubscribe(dependant) : deref.dirty(this, dependant), dependant = dependant.next;
        }
    }
    emit(value) {
        let subscriber = this.subscribers;
        for (;void 0 !== subscriber; ) {
            const deref = subscriber.value;
            void 0 === deref ? this.unsubscribe(subscriber) : deref(this, value, subscriber), 
            subscriber = subscriber.next;
        }
    }
    constructor(fn, context, eager = !1) {
        this.fn = fn, this.context = context, this._eager = eager, eager && (this._value = this._get());
    }
}

class NativeSignal {
    _value;
    get() {
        return push_subscribable(this), this._value;
    }
    set(value) {
        value !== this._value && (this._value = value, this.dirty(this, void 0, value));
    }
    update(fn) {
        const value = fn(this._value);
        value !== this._value && (this._value = value, this.dirty(this, void 0, value));
    }
    dirty(source = this, ref, value) {
        return this.version < 0 || (void 0 !== this.subscribers ? (this.version = -this.version - 1, 
        EventManager.register_async_emit(this.on_emit, this), this.__base_dirty(source, ref)) : this.dependants && (this.version++, 
        this.__base_dirty(source, ref))), this;
    }
    on_emit(context) {
        context.version = -context.version, context.emit(context._value);
    }
    subscribers;
    dependants;
    version=0;
    subscribe(fn) {
        const previous_first_item = this.subscribers, new_item = this.subscribers = {
            next: previous_first_item,
            value: fn
        };
        return void 0 !== previous_first_item && (previous_first_item.prev = new_item), 
        0 === this.version && (this.version = 1), new_item;
    }
    depend(subscribable) {
        const previous_first_item = this.dependants, new_item = this.dependants = {
            next: previous_first_item,
            value: subscribable
        };
        return void 0 !== previous_first_item && (previous_first_item.prev = new_item), 
        0 === this.version && (this.version = 1), new_item;
    }
    unsubscribe(reference) {
        return void 0 !== reference.next && (reference.next.prev = reference.prev), void 0 !== reference.prev ? reference.prev.next = reference.next : this.dependants === reference ? this.dependants = this.dependants.next : this.subscribers === reference && (this.subscribers = this.subscribers.next), 
        this;
    }
    __base_dirty(source, ref) {
        let dependant = this.dependants;
        for (;void 0 !== dependant; ) {
            const deref = dependant.value;
            void 0 === deref ? this.unsubscribe(dependant) : deref.dirty(this, dependant), dependant = dependant.next;
        }
    }
    emit(value) {
        let subscriber = this.subscribers;
        for (;void 0 !== subscriber; ) {
            const deref = subscriber.value;
            void 0 === deref ? this.unsubscribe(subscriber) : deref(this, value, subscriber), 
            subscriber = subscriber.next;
        }
        return this;
    }
    constructor(value) {
        this._value = value;
    }
}

function detached(fn) {
    let real_listener_count = EventManager.global_listen;
    EventManager.global_listen = 0;
    const res = fn();
    return EventManager.global_listen = real_listener_count, res;
}

let intervals = new Map;

const registry = new FinalizationRegistry(interval_id => {
    clearInterval(interval_id);
});

function interval(delta) {
    let signal = intervals.get(delta);
    if (!signal) {
        signal = new NativeSignal(0);
        const interval_id = setInterval(() => {
            const signal = intervals.get(delta);
            signal?.set(signal._value + 1);
        }, delta);
        registry.register(signal, interval_id), intervals.set(delta, signal);
    }
    return signal;
}

const bin_log_lengths = [ 0, 8, 16, 24, 32 ];

function fixed_array(length) {
    return new Array(length).fill(void 0);
}

class QuantizedQueue {
    bins_0=fixed_array(256);
    bins_1=fixed_array(256);
    bins_2=fixed_array(256);
    bins_3=fixed_array(256);
    bins_4=fixed_array(256);
    bins=[ this.bins_0, this.bins_1, this.bins_2, this.bins_3, this.bins_4 ];
    current_tick=0;
    tick() {
        const bin_index = 255 & this.current_tick;
        let entry = this.bins_0[bin_index];
        for (;void 0 !== entry; ) entry.value(entry), entry = entry.next;
        this.bins_0[bin_index] = void 0, this.current_tick += 1, this.rebin();
    }
    tick_long(ticks) {
        let bin = this.bins_0;
        function _tick_long_process(relative_from, relative_to) {
            for (let i = relative_from; i <= relative_to; i++) {
                let _bin = bin[i];
                for (;void 0 !== _bin; ) _bin.value(_bin), _bin = _bin.next;
                bin[i] = void 0;
            }
        }
        let current_relative_tick = 255 & this.current_tick;
        0 !== current_relative_tick && (_tick_long_process(current_relative_tick, 255), 
        this.current_tick += 256 - current_relative_tick, this.rebin(), ticks -= 256 - current_relative_tick);
        const full_bins = ~~(ticks / 256);
        for (let i = 0; i < full_bins; i++) _tick_long_process(0, 255), this.current_tick += 256, 
        this.rebin();
        (ticks -= 256 * full_bins) > 0 && (_tick_long_process(0, ticks), this.current_tick += ticks, 
        this.rebin());
    }
    rebin(bin_index = 0) {
        if (this.current_tick >> 8 * bin_index & 255) return !1;
        let higher_bin_index = this.current_tick >> 8 * (bin_index + 1) & 255;
        this.rebin(bin_index + 1);
        const lower_level_bins = this.bins[bin_index];
        let higher_level_entry = this.bins[bin_index + 1][higher_bin_index];
        for (;void 0 !== higher_level_entry; ) {
            let next_entry = higher_level_entry.next;
            const lower_bin_index = higher_level_entry.end_time >> 8 * bin_index & 255, lower_bin = lower_level_bins[lower_bin_index];
            higher_level_entry.next = lower_bin, higher_level_entry.prev = void 0, void 0 !== lower_bin && (lower_bin.prev = higher_level_entry), 
            lower_level_bins[lower_bin_index] = higher_level_entry, higher_level_entry = next_entry;
        }
        return this.bins[bin_index + 1][higher_bin_index] = void 0, !0;
    }
    add(value, end_time) {
        const action = {
            value: value,
            end_time: end_time,
            prev: void 0,
            next: void 0
        }, current_tick = this.current_tick;
        if (end_time <= current_tick) return value(action), action;
        let log_delta = 0, _delta = end_time - current_tick;
        for (;_delta >>= 1; ) log_delta++;
        const bin_index = log_delta >> 3, bin = this.bins[bin_index], bucket_index = action.end_time >> bin_log_lengths[bin_index] & 255;
        let bucket_entry = bin[bucket_index];
        return bin[bucket_index] = action, void 0 !== bucket_entry && (bucket_entry.prev = action, 
        action.next = bucket_entry), action;
    }
    remove(action) {
        if (void 0 === action.prev) {
            let log_delta = 0, _delta = action.end_time - this.current_tick;
            for (;_delta >>= 1; ) log_delta++;
            const bucket = log_delta >> 3, bucket_index = action.end_time >> bin_log_lengths[bucket] & 255;
            if (this.bins[bucket][bucket_index] !== action) return void console.warn("Tried to remove an action which was not registered in the queue.");
            this.bins[bucket][bucket_index] = action.next;
        } else void 0 !== action.prev && (action.prev.next = action.next), void 0 !== action.next && (action.next.prev = action.prev);
    }
}

const EMPTY = {};

class BufferedSubscribable {
    _dirty=!1;
    buffer=[];
    proxy=new Subscribable;
    attach(target) {
        const ref = target.subscribe(this.on_target_change);
        return () => target.unsubscribe(ref);
    }
    on_target_change=(source, value) => {
        this.buffer.push(value), this._dirty || (this._dirty = !0, EventManager.register_async_emit(() => {
            this._dirty = !1;
            const buffer = this.buffer;
            this.buffer = [], this.proxy.emit(buffer);
        }));
    };
    subscribe=this.proxy.subscribe.bind(this.proxy);
    unsubscribe=this.proxy.unsubscribe.bind(this.proxy);
    dirty=this.proxy.dirty.bind(this.proxy);
    depend=this.proxy.depend.bind(this.proxy);
    emit(value = EMPTY) {
        this.on_target_change(void 0, value);
    }
    consume() {
        const result = this.buffer;
        return this.buffer = [], this._dirty = !1, EventManager.global_listeners?.push(this.proxy), 
        result;
    }
}

function async_caller(self) {
    self._dirty = !1, !1 === self._initialized && self.initialize(), self.fn(self._source_cache, self);
}

class Effect {
    sources;
    fn;
    _source_cache={};
    _updaters={};
    _dirty=!1;
    _initialized=!1;
    constructor(sources, fn) {
        this.sources = sources, this.fn = fn;
        for (let key in sources) {
            (this._updaters[key] = sources[key].subscribe(this.update_key_function)).key = key;
        }
    }
    update_key_function=(signal, value, ref) => {
        this._source_cache[ref.key] = value, this._dirty || (this._dirty = !0, EventManager.register_async_emit(async_caller, this));
    };
    initialize() {
        const sources = this.sources;
        for (let key in sources) key in this._source_cache || (this._source_cache[key] = sources[key].get?.() ?? null);
        this._initialized = !0;
    }
    add_listener(key, source) {
        const ref = this._updaters[key] = (this.sources[key] = source).subscribe(this.update_key_function);
        return ref.key = key, this._source_cache[key] = source.get?.() ?? null, ref;
    }
    destroy() {
        for (let key in this.sources) {
            this.sources[key].unsubscribe(this._updaters[key]);
        }
    }
}

function to_signal(v, fallback) {
    return v instanceof NativeSignal$1 || v instanceof Computed$1 ? v : new NativeSignal$1(void 0 !== v ? v : fallback);
}

function read(v, fallback) {
    return v && "function" == typeof v.get ? v.get() : v;
}

function local(key, signal) {
    const initial_value = localStorage.getItem(key);
    return null !== initial_value && "set" in signal && signal.set(JSON.parse(initial_value)), 
    signal.subscribe((s, v) => {
        localStorage.setItem(key, JSON.stringify(v));
    }), null === initial_value && localStorage.setItem(key, JSON.stringify(signal.get())), 
    signal;
}

export { BufferedSubscribable, Computed, Effect, EventManager, NativeSignal, QuantizedQueue, Subscribable, detached, fixed_array, interval, local, read, to_signal };
//# sourceMappingURL=index.js.map
