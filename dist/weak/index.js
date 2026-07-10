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
            value: new WeakRef(fn)
        };
        return void 0 !== previous_first_item && (previous_first_item.prev = new_item), 
        0 === this.version && (this.version = 1), new_item;
    }
    depend(subscribable) {
        const previous_first_item = this.dependants, new_item = this.dependants = {
            next: previous_first_item,
            value: new WeakRef(subscribable)
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
            const deref = dependant.value.deref();
            void 0 === deref ? this.unsubscribe(dependant) : deref.dirty(this, dependant), dependant = dependant.next;
        }
    }
    emit(value) {
        let subscriber = this.subscribers;
        for (;void 0 !== subscriber; ) {
            const deref = subscriber.value.deref();
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
                entry.last = entry.signal.version, global_listeners[global_listener_index] = void 0;
            }
        } else {
            const l1 = subscribed_to.length;
            for (let i = 0; i < l1; i++) {
                let {ref: ref, signal: signal} = subscribed_to[i];
                signal.unsubscribe(ref);
            }
            const length = EventManager.global_listener_length;
            for (let i = global_listener_index; i < length; i++) {
                const sub = global_listeners[i];
                global_listeners[i] = void 0;
                const last = sub.version;
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
            value: new WeakRef(fn)
        };
        return void 0 !== previous_first_item && (previous_first_item.prev = new_item), 
        0 === this.version && (this.version = 1), new_item;
    }
    depend(subscribable) {
        const previous_first_item = this.dependants, new_item = this.dependants = {
            next: previous_first_item,
            value: new WeakRef(subscribable)
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
            const deref = dependant.value.deref();
            void 0 === deref ? this.unsubscribe(dependant) : deref.dirty(this, dependant), dependant = dependant.next;
        }
    }
    emit(value) {
        let subscriber = this.subscribers;
        for (;void 0 !== subscriber; ) {
            const deref = subscriber.value.deref();
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
            value: new WeakRef(fn)
        };
        return void 0 !== previous_first_item && (previous_first_item.prev = new_item), 
        0 === this.version && (this.version = 1), new_item;
    }
    depend(subscribable) {
        const previous_first_item = this.dependants, new_item = this.dependants = {
            next: previous_first_item,
            value: new WeakRef(subscribable)
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
            const deref = dependant.value.deref();
            void 0 === deref ? this.unsubscribe(dependant) : deref.dirty(this, dependant), dependant = dependant.next;
        }
    }
    emit(value) {
        let subscriber = this.subscribers;
        for (;void 0 !== subscriber; ) {
            const deref = subscriber.value.deref();
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

class Collection {
    events;
    any_events;
    queued=!1;
    subscribe_event(fn, event) {
        let previous_first_item = void 0 === event ? this.any_events : (this.events ??= {})[event];
        const new_item = {
            next: previous_first_item,
            value: new WeakRef(fn),
            event: event
        };
        return void 0 === previous_first_item && (void 0 === event ? this.any_events = new_item : this.events[event] = new_item), 
        void 0 !== previous_first_item && (previous_first_item.prev = new_item), new_item;
    }
    unsubscribe_event(reference) {
        let event_name = reference.event;
        return void 0 !== reference.next && (reference.next.prev = reference.prev), void 0 !== reference.prev ? reference.prev.next = reference.next : void 0 === event_name && (this.any_events === reference ? this.any_events = reference.next : this.events?.[event_name] === reference && (this.events[event_name] = reference.next)), 
        this;
    }
    can_emit(event) {
        return void 0 !== (this.any_events ?? this.events?.[event.event]);
    }
    emit_event(event) {
        let events = this.events?.[event.event];
        for (;void 0 !== events; ) {
            const deref = events.value.deref();
            void 0 === deref ? this.unsubscribe_event(events) : deref(this, event, events), 
            events = events.next;
        }
        let events2 = this.any_events;
        for (;void 0 !== events2; ) {
            const deref = events2.value.deref();
            void 0 === deref ? this.unsubscribe_event(events2) : deref(this, event, events2), 
            events2 = events2.next;
        }
        return this;
    }
    dirty(source, ref) {
        return this.queued || (void 0 !== this.subscribers && (this.queued = !0, EventManager.register_async_emit(this.on_emit, this)), 
        this.__base_dirty(source, ref)), this;
    }
    on_emit(context) {
        context.queued = !1, context.emit();
    }
    emit(value = this.get()) {
        return this.__base_emit(value);
    }
    subscribers;
    dependants;
    version=0;
    subscribe(fn) {
        const previous_first_item = this.subscribers, new_item = this.subscribers = {
            next: previous_first_item,
            value: new WeakRef(fn)
        };
        return void 0 !== previous_first_item && (previous_first_item.prev = new_item), 
        0 === this.version && (this.version = 1), new_item;
    }
    depend(subscribable) {
        const previous_first_item = this.dependants, new_item = this.dependants = {
            next: previous_first_item,
            value: new WeakRef(subscribable)
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
            const deref = dependant.value.deref();
            void 0 === deref ? this.unsubscribe(dependant) : deref.dirty(this, dependant), dependant = dependant.next;
        }
    }
    __base_emit(value) {
        let subscriber = this.subscribers;
        for (;void 0 !== subscriber; ) {
            const deref = subscriber.value.deref();
            void 0 === deref ? this.unsubscribe(subscriber) : deref(this, value, subscriber), 
            subscriber = subscriber.next;
        }
        return this;
    }
}

class OrderNode {
    value;
    order;
    next=null;
    prev=null;
    constructor(value, order) {
        this.value = value, this.order = order;
    }
    _insert_after(value) {
        null === this.next && (this.order.last = value), value.next = this.next, value.prev = this, 
        this.next = value;
    }
    _insert_before(value) {
        null === this.prev && (this.order.first = value), value.prev = this.prev, value.next = this, 
        this.prev = value;
    }
    insert_after(value) {
        let node = this.order._create_node(value);
        this._insert_after(node);
        const order = this.order;
        return void 0 === order.events && void 0 === order.any_events || order.emit_event({
            event: "add",
            value: this.value,
            node: this
        }), void 0 === order.subscribers && void 0 === order.dependants || order.dirty(), 
        node;
    }
    insert_before(value) {
        let node = this.order._create_node(value);
        this._insert_before(node);
        const order = this.order;
        return void 0 === order.events && void 0 === order.any_events || order.emit_event({
            event: "add",
            value: this.value,
            node: this
        }), void 0 === order.subscribers && void 0 === order.dependants || order.dirty(), 
        node;
    }
    move_after(reference) {
        let prev_next = this.next, prev_prev = this.prev;
        this.next && (this.next.prev = this.prev), this.prev && (this.prev.next = this.next), 
        this.prev = reference, this.next = reference.next, reference.next = this;
        const order = this.order;
        return void 0 === order.events && void 0 === order.any_events || order.emit_event({
            event: "move",
            value: this,
            prev_next: prev_next,
            prev_prev: prev_prev
        }), void 0 === order.subscribers && void 0 === order.dependants || order.dirty(), 
        this;
    }
    delete() {
        this.prev ? this.prev.next = this.next : this.order.first = this.next, this.next ? this.next.prev = this.prev : this.order.last = this.prev, 
        this.next = null, this.prev = null;
        const order = this.order;
        order.nodes.delete(this.value), void 0 === order.events && void 0 === order.any_events || order.emit_event({
            event: "delete",
            value: this.value,
            node: this
        }), void 0 === order.subscribers && void 0 === order.dependants || order.dirty(), 
        this.order = null;
    }
    * [Symbol.iterator]() {
        let node = this;
        for (;node; ) yield node.value, node = node.next;
    }
}

class Order extends Collection {
    nodes=new Map;
    first=null;
    last=null;
    constructor(values) {
        if (super(), values) for (let value of values) this._add(value);
    }
    get() {
        return [ ...this ].map(v => v.value);
    }
    _create_node(value) {
        let node = new OrderNode(value, this);
        return this.nodes.set(value, node), this.first ? node : this.first = this.last = node;
    }
    _delete(value) {
        const node = this.nodes.get(value);
        node?.delete();
    }
    _add(value) {
        this.push(value);
    }
    push(value) {
        let node = this._create_node(value);
        return this.last !== node && this.last._insert_after(node), void 0 === this.events && void 0 === this.any_events || this.emit_event({
            event: "add",
            value: node.value,
            node: node
        }), void 0 === this.subscribers && void 0 === this.dependants || this.dirty(), node;
    }
    unshift(value) {
        let node = this._create_node(value);
        return this.first !== node && this.first._insert_before(node), void 0 === this.events && void 0 === this.any_events || this.emit_event({
            event: "add",
            value: node.value,
            node: node
        }), void 0 === this.subscribers && void 0 === this.dependants || this.dirty(), node;
    }
    get_node(value) {
        return this.nodes.get(value);
    }
    size() {
        return this.nodes.size;
    }
    clear() {
        let nodes = this.nodes;
        if (this.nodes = new Map, this.first = null, this.last = null, void 0 !== this.events || void 0 !== this.any_events) for (let node of nodes.values()) this.emit_event({
            event: "delete",
            value: node.value,
            node: node
        });
        this.dirty();
    }
    * [Symbol.iterator]() {
        let node = this.first;
        for (;node; ) yield node, node = node.next;
    }
}

class SignalMap extends Collection {
    _internal;
    _signals=void 0;
    constructor(items) {
        if (super(), this._internal = new Map, items) for (let item of items) this._internal.set(item[0], item[1]);
    }
    get(key) {
        return key ? this._internal.get(key) : (push_subscribable(this), this._internal);
    }
    ref(key) {
        this._signals || (this._signals = new Map);
        let result = this._signals.get(key);
        if (!result) {
            let value = this.get(key);
            result = new NativeSignal(value);
            const original_set = result.set.bind(result);
            this._signals.set(key, result);
            const fn = v => {
                original_set(v), void 0 === v ? this.delete(key) : this.set(key, v);
            };
            result.set = fn;
        }
        return result;
    }
    _add(value) {
        this.set(...value);
    }
    set(key, value) {
        void 0 === value && (console.error("Cannot set Signal Map's value to undefined, using null instead!"), 
        value = null);
        const internal = this._internal;
        let exists = internal.get(key);
        exists !== value && (internal.set(key, value), void 0 !== this._signals && this._signals.get(key)?.set(value), 
        void 0 !== exists || void 0 === this.events && void 0 === this.any_events || this.emit_event({
            event: "add",
            value: [ key, value ]
        }), void 0 === this.subscribers && void 0 === this.dependants || this.dirty());
    }
    _delete(value) {
        this.delete(value[0]);
    }
    delete(key) {
        const internal = this._internal, v = internal.get(key);
        if (internal.delete(key)) {
            if (void 0 !== this._signals) {
                const signal = this._signals.get(key);
                void 0 !== signal && void 0 !== signal.get() && signal.set(void 0);
            }
            void 0 === this.events && void 0 === this.any_events || this.emit_event({
                event: "delete",
                value: [ key, v ]
            }), void 0 === this.subscribers && void 0 === this.dependants || this.dirty();
        }
    }
    clear() {
        const entries = [ ...this._internal.entries() ];
        this._internal.clear();
        const has_listeners = void 0 !== this.events || void 0 !== this.any_events;
        for (let kv of entries) void 0 !== this._signals && this._signals.get(kv[0])?.set(void 0), 
        has_listeners && this.emit_event({
            event: "delete",
            value: kv
        });
        this.dirty();
    }
    has(key) {
        return this._internal.has(key);
    }
}

class SignalSet extends Collection {
    _internal;
    constructor(items) {
        if (super(), this._internal = new Set, items) for (let item of items) this._internal.add(item);
    }
    get() {
        return push_subscribable(this), this._internal;
    }
    _add(value) {
        this.add(value);
    }
    add(value) {
        const internal = this._internal, size = internal.size;
        internal.add(value), internal.size !== size && (void 0 === this.events && void 0 === this.any_events || this.emit_event({
            event: "add",
            value: value
        }), void 0 === this.subscribers && void 0 === this.dependants || this.dirty());
    }
    _delete(value) {
        this.delete(value);
    }
    delete(value) {
        this._internal.delete(value) && (void 0 === this.events && void 0 === this.any_events || this.emit_event({
            event: "delete",
            value: value
        }), void 0 === this.subscribers && void 0 === this.dependants || this.dirty());
    }
    clear() {
        let values = [ ...this._internal.values() ];
        if (this._internal.clear(), void 0 !== this.events || void 0 !== this.any_events) for (let value of values) this.emit_event({
            event: "delete",
            value: value
        });
        this.dirty();
    }
    has(value) {
        return this._internal.has(value);
    }
}

class SignalHeap extends Collection {
    items;
    constructor(items) {
        if (super(), items) {
            let prev = this.items;
            for (let item of items) {
                let entry = {
                    next: prev,
                    value: item,
                    prev: void 0
                };
                prev && (prev.prev = entry), prev = entry;
            }
            this.items = prev;
        }
    }
    get() {
        let self = this;
        return push_subscribable(this), function*() {
            let item = self.items;
            for (;item; ) yield item.value, item = item.next;
        }();
    }
    add(value) {
        const prev = this.items, ref = {
            value: value,
            next: prev
        };
        return void 0 !== prev && (prev.prev = ref), this.items = ref, void 0 === this.events && void 0 === this.any_events || this.emit_event({
            event: "add",
            value: value,
            ref: ref
        }), void 0 === this.subscribers && void 0 === this.dependants || this.dirty(), ref;
    }
    delete(value) {
        void 0 !== value.next && (value.next.prev = value.prev), void 0 !== value.prev ? value.prev.next = value.next : this.items === value && (this.items = value.next), 
        void 0 === this.events && void 0 === this.any_events || this.emit_event({
            event: "delete",
            value: value.value,
            ref: value
        }), void 0 === this.subscribers && void 0 === this.dependants || this.dirty();
    }
    clear() {
        let values = this.items;
        if (this.items = void 0, void 0 !== this.events || void 0 !== this.any_events) for (;void 0 !== values; ) this.emit_event({
            event: "delete",
            value: values.value,
            ref: values
        }), values = values.next;
        this.dirty();
    }
}

const NONE = Symbol("native-signal/NONE");

function is_collection(source) {
    return "function" == typeof source.subscribe_event;
}

class Reduce {
    target;
    merger;
    pending=[];
    fully_dirty=!1;
    flushing=!1;
    scheduled=!1;
    lazy_capable;
    reset;
    sources=[];
    deps=[];
    constructor(target, merger, opts) {
        this.target = target, this.merger = merger;
        const t = target;
        this.lazy_capable = "function" == typeof t.set && "_value" in t && "function" != typeof t.clear;
        const initial = this.lazy_capable ? t._value : void 0;
        this.reset = "function" == typeof t.clear ? () => t.clear() : () => t.set(initial);
        const original_get = t.get.bind(t);
        t.get = (...args) => (this.flush(), original_get(...args)), opts?.dependencies?.length && this.register_dependencies(opts.dependencies);
    }
    register_signal(signal) {
        const reduce = this, handler = function(source, value, ref) {
            reduce.mark(ref.last, value, source), ref.last = value;
        }, ref = signal.subscribe(handler);
        ref.last = NONE, this.sources.push({
            source: signal,
            ref: ref,
            handler: handler
        });
        const current = signal.get();
        return this.mark(NONE, current, signal), ref.last = current, ref;
    }
    register_collection(collection) {
        const reduce = this, handler = function(source, event, _ref) {
            "add" === event.event ? reduce.mark(NONE, event.value, source) : "delete" === event.event && reduce.mark(event.value, NONE, source);
        }, ref = collection.subscribe_event(handler);
        this.sources.push({
            source: collection,
            ref: ref,
            handler: handler
        });
        for (const value of collection.get()) this.mark(NONE, value, collection);
        return ref;
    }
    register_dependencies(dependencies) {
        const reduce = this, handler = function() {
            reduce.fully_dirty = !0, reduce.schedule();
        };
        for (const dependency of dependencies) {
            const ref = dependency.subscribe(handler);
            this.deps.push({
                ref: ref,
                handler: handler
            });
        }
    }
    mark(prev, next, source) {
        this.fully_dirty || this.pending.push(prev, next, source), this.schedule();
    }
    schedule() {
        this.scheduled || this.lazy_capable && !this.target_listened() || (this.scheduled = !0, 
        EventManager.register_async_emit(Reduce.run_flush, this));
    }
    static run_flush(self) {
        self.scheduled = !1, self.flush();
    }
    target_listened() {
        return void 0 !== this.target.subscribers;
    }
    flush() {
        if (!this.flushing) {
            if (this.flushing = !0, this.fully_dirty) {
                this.fully_dirty = !1, this.pending.length = 0, this.reset();
                for (const {source: source} of this.sources) if (is_collection(source)) for (const value of source.get()) this.merger(NONE, value, source, this.target); else this.merger(NONE, source.get(), source, this.target);
            } else if (this.pending.length) {
                const pending = this.pending;
                this.pending = [];
                for (let i = 0; i < pending.length; i += 3) this.merger(pending[i], pending[i + 1], pending[i + 2], this.target);
            }
            this.flushing = !1;
        }
    }
}

function reduce(source, merger, target, opts) {
    const r = new Reduce(target, merger, opts), sources = Array.isArray(source) ? source : [ source ];
    for (const s of sources) is_collection(s) ? r.register_collection(s) : r.register_signal(s);
    return target;
}

function count(collection, weight = () => 1, opts) {
    if (opts?.reactive) return function(collection, weight) {
        const target = new NativeSignal(0), entries = new Map;
        function listen(value) {
            const state = {
                prev: 0
            }, computed = new Computed(() => {
                const next = weight(value), delta = next - state.prev;
                state.prev = next, 0 !== delta && target.set(target._value + delta);
            }, void 0, !0);
            entries.set(value, {
                computed: computed,
                state: state
            });
        }
        function unlisten(value) {
            const entry = entries.get(value);
            entry && (entry.computed.destroy(), entries.delete(value), 0 !== entry.state.prev && target.set(target._value - entry.state.prev));
        }
        for (const value of collection.get()) listen(value);
        const handler = (_source, event) => {
            "add" === event.event ? listen(event.value) : "delete" === event.event && unlisten(event.value);
        };
        return collection.subscribe_event(handler), target._reactive_handler = handler, 
        target._reactive_entries = entries, target;
    }(collection, weight);
    const target = new NativeSignal(0), w = v => v === NONE ? 0 : weight(v);
    return reduce(collection, (prev, next, _source, t) => {
        const delta = w(next) - w(prev);
        0 !== delta && t.set(t._value + delta);
    }, target, {
        dependencies: opts?.dependencies
    }), target;
}

function filter(collection, predicate, opts) {
    const target = opts?.into ?? new SignalSet;
    return reduce(collection, (prev, next, _source, t) => {
        prev !== NONE && t.delete(prev), next !== NONE && predicate(next) && t.add(next);
    }, target), target;
}

function map(collection, fn, opts) {
    const target = opts?.into ?? new SignalSet;
    return reduce(collection, (prev, next, _source, t) => {
        prev !== NONE && t.delete(fn(prev)), next !== NONE && t.add(fn(next));
    }, target), target;
}

let intervals = new Map;

const registry = new FinalizationRegistry(interval_id => {
    clearInterval(interval_id);
});

function interval(delta) {
    let signal = intervals.get(delta)?.deref();
    if (!signal) {
        signal = new NativeSignal(0);
        const interval_id = setInterval(() => {
            const signal = intervals.get(delta)?.deref();
            signal?.set(signal._value + 1);
        }, delta);
        registry.register(signal, interval_id), intervals.set(delta, new WeakRef(signal));
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

function local(key, signal) {
    const initial_value = localStorage.getItem(key);
    return null !== initial_value && "set" in signal && signal.set(JSON.parse(initial_value)), 
    signal.subscribe((s, v) => {
        localStorage.setItem(key, JSON.stringify(v));
    }), null === initial_value && localStorage.setItem(key, JSON.stringify(signal.get())), 
    signal;
}

export { BufferedSubscribable, Collection, Computed, Effect, EventManager, NONE, NativeSignal, Order, OrderNode, QuantizedQueue, Reduce, SignalHeap, SignalMap, SignalSet, Subscribable, count, detached, filter, fixed_array, interval, local, map, reduce };
//# sourceMappingURL=index.js.map
