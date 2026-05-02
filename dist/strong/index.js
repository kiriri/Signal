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
    EventManager.global_listen <= 0 || (EventManager.real_length === EventManager.global_listener_length && (EventManager.global_listeners.concat(new Array(EventManager.real_length)), 
    EventManager.real_length *= 2), EventManager.global_listeners[EventManager.global_listener_length++] = sub);
}

class Subscribable {
    subscribers;
    dependants;
    events;
    any_events;
    subscribe_event(fn, event) {
        let previous_first_item = void 0 === event ? this.any_events : (this.events ??= {})[event];
        const new_item = {
            next: previous_first_item,
            value: fn,
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
        for (;void 0 !== events; ) events.value(this, event, events), events = events.next;
        let events2 = this.any_events;
        for (;void 0 !== events2; ) events2.value(this, event, events2), events2 = events2.next;
        return this;
    }
    subscribe(fn) {
        const previous_first_item = this.subscribers, new_item = this.subscribers = {
            next: previous_first_item,
            value: fn
        };
        return void 0 !== previous_first_item && (previous_first_item.prev = new_item), 
        new_item;
    }
    depend(subscribable) {
        const previous_first_item = this.dependants, new_item = this.dependants = {
            next: previous_first_item,
            value: subscribable
        };
        return void 0 !== previous_first_item && (previous_first_item.prev = new_item), 
        new_item;
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
    promise() {
        let resolve, reference;
        return reference = this.subscribe((source, v) => {
            this.unsubscribe(reference), resolve(v);
        }), new Promise(_resolve => {
            resolve = _resolve;
        });
    }
}

class Computed {
    subscribed_to=[];
    fn;
    context;
    _dirty=!0;
    _cache;
    _eager;
    on_emit(context) {
        context.emit(context.get());
    }
    dirty(source, ref) {
        this._dirty || (this._dirty = !0, this.__base_dirty(source, ref), (void 0 !== this.subscribers || this._eager) && EventManager.register_async_emit(this.on_emit, this));
    }
    get() {
        return push_subscribable(this), this._dirty ? this._get() : this._cache;
    }
    subscribe(fn) {
        return "first" === this._dirty && this._get(), this.__base_subscribe(fn);
    }
    _get() {
        this._dirty = !1, EventManager.global_listen++;
        let value, global_listener_index = EventManager.global_listener_length;
        try {
            value = this.fn(this.context);
        } finally {
            EventManager.global_listen--;
        }
        let subscribed_to = this.subscribed_to;
        const fresh_dependency_length = EventManager.global_listener_length - global_listener_index;
        if (subscribed_to.length <= 1 && fresh_dependency_length === subscribed_to.length) ; else {
            const l1 = subscribed_to.length;
            for (let i = 0; i < l1; i++) {
                let {ref: ref, signal: signal} = subscribed_to[i];
                signal.unsubscribe(ref);
            }
            const length = EventManager.global_listener_length;
            for (let i = global_listener_index; i < length; i++) {
                const sub = EventManager.global_listeners[i];
                if (i < l1) {
                    let existing = subscribed_to[i];
                    existing.ref = sub.depend(this), existing.signal = sub;
                } else subscribed_to.push({
                    signal: sub,
                    ref: sub.depend(this)
                });
            }
            length < l1 && (subscribed_to.length = length);
        }
        return this._cache = value, EventManager.global_listener_length = global_listener_index, 
        value;
    }
    destroy() {
        this._dirty = !1;
        for (const {signal: signal, ref: ref} of this.subscribed_to) signal.unsubscribe(ref);
        this.subscribed_to.length = 0;
    }
    subscribers;
    dependants;
    events;
    any_events;
    subscribe_event(fn, event) {
        let previous_first_item = void 0 === event ? this.any_events : (this.events ??= {})[event];
        const new_item = {
            next: previous_first_item,
            value: fn,
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
        for (;void 0 !== events; ) events.value(this, event, events), events = events.next;
        let events2 = this.any_events;
        for (;void 0 !== events2; ) events2.value(this, event, events2), events2 = events2.next;
        return this;
    }
    __base_subscribe(fn) {
        const previous_first_item = this.subscribers, new_item = this.subscribers = {
            next: previous_first_item,
            value: fn
        };
        return void 0 !== previous_first_item && (previous_first_item.prev = new_item), 
        new_item;
    }
    depend(subscribable) {
        const previous_first_item = this.dependants, new_item = this.dependants = {
            next: previous_first_item,
            value: subscribable
        };
        void 0 !== previous_first_item && (previous_first_item.prev = new_item);
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
    promise() {
        let resolve, reference;
        return reference = this.subscribe((source, v) => {
            this.unsubscribe(reference), resolve(v);
        }), new Promise(_resolve => {
            resolve = _resolve;
        });
    }
    constructor(fn, context, eager = !1) {
        this.fn = fn, this.context = context, this._eager = eager, eager ? this._cache = this._get() : this._dirty = "first";
    }
}

class NativeSignal {
    _value;
    queued;
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
    dirty(source, ref, value) {
        return this.queued || (void 0 !== this.subscribers && (this.queued = !0, EventManager.register_async_emit(this.on_emit, this)), 
        this.__base_dirty(source, ref)), this;
    }
    on_emit(context) {
        context.queued = !1, context.emit(context._value);
    }
    subscribers;
    dependants;
    events;
    any_events;
    subscribe_event(fn, event) {
        let previous_first_item = void 0 === event ? this.any_events : (this.events ??= {})[event];
        const new_item = {
            next: previous_first_item,
            value: fn,
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
        for (;void 0 !== events; ) events.value(this, event, events), events = events.next;
        let events2 = this.any_events;
        for (;void 0 !== events2; ) events2.value(this, event, events2), events2 = events2.next;
        return this;
    }
    subscribe(fn) {
        const previous_first_item = this.subscribers, new_item = this.subscribers = {
            next: previous_first_item,
            value: fn
        };
        return void 0 !== previous_first_item && (previous_first_item.prev = new_item), 
        new_item;
    }
    depend(subscribable) {
        const previous_first_item = this.dependants, new_item = this.dependants = {
            next: previous_first_item,
            value: subscribable
        };
        return void 0 !== previous_first_item && (previous_first_item.prev = new_item), 
        new_item;
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
    promise() {
        let resolve, reference;
        return reference = this.subscribe((source, v) => {
            this.unsubscribe(reference), resolve(v);
        }), new Promise(_resolve => {
            resolve = _resolve;
        });
    }
    constructor(value) {
        this._value = value;
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
        return this._insert_after(node), this.order.emit_event({
            event: "add",
            value: this.value,
            node: this
        }), this.order.emit(this.order.first), node;
    }
    insert_before(value) {
        let node = this.order._create_node(value);
        return this._insert_before(node), this.order.emit_event({
            event: "add",
            value: this.value,
            node: this
        }), this.order.emit(this.order.first), node;
    }
    move_after(reference) {
        let prev_next = this.next, prev_prev = this.prev;
        return this.next && (this.next.prev = this.prev), this.prev && (this.prev.next = this.next), 
        this.prev = reference, this.next = reference.next, reference.next = this, this.order.emit_event({
            event: "move",
            value: this,
            prev_next: prev_next,
            prev_prev: prev_prev
        }), this.order.emit(this.order.first), this;
    }
    delete() {
        this.prev ? this.prev.next = this.next : this.order.first = this.next, this.next ? this.next.prev = this.prev : this.order.last = this.prev, 
        this.next = null, this.prev = null, this.order.nodes.delete(this.value), this.order.emit_event({
            event: "delete",
            value: this.value,
            node: this
        }), this.order.emit(this.order.first), this.order = null;
    }
    * [Symbol.iterator]() {
        let node = this;
        for (;node; ) yield node.value, node = node.next;
    }
}

class Order extends Subscribable {
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
        return this.last !== node && this.last._insert_after(node), this.emit_event({
            event: "add",
            value: node.value,
            node: node
        }), this.emit(this.first), node;
    }
    unshift(value) {
        let node = this._create_node(value);
        return this.first !== node && this.first._insert_before(node), this.emit_event({
            event: "add",
            value: node.value,
            node: node
        }), this.emit(this.first), node;
    }
    get_node(value) {
        return this.nodes.get(value);
    }
    size() {
        return this.nodes.size;
    }
    clear() {
        let nodes = this.nodes;
        this.nodes = new Map, this.first = null, this.last = null;
        for (let node of nodes.values()) this.emit_event({
            event: "delete",
            value: node.value,
            node: node
        });
        this.emit(this.first);
    }
    * [Symbol.iterator]() {
        let node = this.first;
        for (;node; ) yield node, node = node.next;
    }
}

class SignalMap extends Subscribable {
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
        let exists = this._internal.get(key);
        if (exists !== value) {
            const kv = [ key, value ];
            this._internal.set(key, value), this._signals?.get(key)?.set(value), void 0 === exists && this.emit_event({
                event: "add",
                value: kv
            }), this.dirty();
        }
    }
    _delete(value) {
        this.delete(value[0]);
    }
    delete(key) {
        let v = this._internal.get(key);
        if (this._internal.delete(key)) {
            const kv = [ key, v ];
            let signal = this._signals?.get(key);
            void 0 !== signal?.get() && signal?.set(void 0), this.emit_event({
                event: "delete",
                value: kv
            }), this.dirty();
        }
    }
    clear() {
        const entries = this._internal.entries();
        this._internal.clear();
        for (let kv of entries) {
            const reference = this._signals?.get(kv[0]);
            reference && reference.set(void 0), this.emit_event({
                event: "delete",
                value: kv
            });
        }
        this.dirty();
    }
    has(key) {
        return this._internal.has(key);
    }
    queued=!1;
    dirty(source, ref) {
        return this.queued ? this : (this.subscribers && (this.queued = !0, EventManager.register_async_emit(() => this.emit())), 
        super.dirty(source, ref));
    }
    emit(value = this._internal) {
        return super.emit(value);
    }
}

class SignalSet extends Subscribable {
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
        let exists = this._internal.has(value);
        if (this._internal.add(value), !exists) {
            const event = {
                event: "add",
                value: value
            };
            this.emit_event(event), this.dirty();
        }
    }
    _delete(value) {
        this.delete(value);
    }
    delete(value) {
        this._internal.delete(value) && (this.emit_event({
            event: "delete",
            value: value
        }), this.dirty());
    }
    clear() {
        let values = [ ...this._internal.values() ];
        this._internal.clear();
        for (let value of values) this.emit_event({
            event: "delete",
            value: value
        });
        this.dirty();
    }
    queued=!1;
    dirty(source, ref) {
        return this.queued ? this : (this.subscribers && (this.queued = !0, EventManager.register_async_emit(() => this.emit())), 
        super.dirty(source, ref));
    }
    emit(value = this._internal) {
        return super.emit(value);
    }
    has(value) {
        return this._internal.has(value);
    }
}

class SignalHeap extends Subscribable {
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
        void 0 !== prev ? prev.prev = ref : this.items = ref;
        const event = {
            event: "add",
            value: value,
            ref: ref
        };
        return this.emit_event(event), this.dirty(), ref;
    }
    delete(value) {
        void 0 !== value.next && (value.next.prev = value.prev), void 0 !== value.prev ? value.prev.next = value.next : this.items === value && (this.items = this.items.next), 
        this.emit_event({
            event: "delete",
            value: value.value,
            ref: value
        }), this.dirty();
    }
    clear() {
        let values = this.items;
        for (this.items = void 0; void 0 !== values; ) this.emit_event({
            event: "delete",
            value: values.value,
            ref: values
        }), values = values.next;
        this.dirty();
    }
    queued=!1;
    dirty(source, ref) {
        return this.queued ? this : (this.subscribers && (this.queued = !0, EventManager.register_async_emit(() => this.emit())), 
        super.dirty(source, ref));
    }
    emit(value = this.get()) {
        return super.emit(value);
    }
}

class Reducer extends Subscribable {
    identity_value;
    merger;
    _value;
    _dirty=!0;
    set(value) {
        this._value = value, super.dirty(this);
    }
    get() {
        return this._value;
    }
    dirty(source, ref) {}
    constructor(identity_value, merger, value) {
        super(), this.identity_value = identity_value, this.merger = merger, this._value = value;
    }
    register_collection(source, mapped) {
        const ref = source.subscribe_event(this.on_collection_change);
        ref.reducer = this, ref.map = mapped ? new Map : void 0;
        for (let item of source.get()) this.on_collection_change(source, {
            event: "add",
            value: item
        }, ref);
        return ref;
    }
    on_collection_change(source, event, ref) {
        const reducer = ref.reducer, map = ref.map, mapped = void 0 !== map;
        if (console.log("Collection changed"), mapped) switch (event.event) {
          case "add":
            let inner_ref = reducer.register_source(event.value);
            map.set(event.value, inner_ref);
            break;

          case "delete":
            map.delete(event.value) && reducer.unregister_source(map.get(event.value));
        } else switch (event.event) {
          case "add":
            reducer.set(reducer.merger(event.value, reducer.identity_value, reducer._value, source, ref, reducer));
            break;

          case "delete":
            reducer.set(reducer.merger(reducer.identity_value, event.value, reducer._value, source, ref, reducer));
        }
    }
    _self;
    register_source(source) {
        const ref = source.subscribe(this.on_change);
        return ref.last = this.identity_value, ref.reducer = this, ref.source = source, 
        this.on_change(source, source.get?.(), ref), ref;
    }
    unregister_source(ref) {
        ref.source.unsubscribe(ref), this.on_change(ref.source, this.identity_value, ref);
    }
    on_change(source, value, ref) {
        let last_value = ref.last, self = ref.reducer.deref();
        self.set(self.merger(value, last_value, self._value, source, ref, self)), ref.last = value;
    }
}

function reduce_generic(source, identity_value, opts) {
    const output = opts.output ?? new NativeSignal(identity_value), unpack_signals = opts.unpackSignals ?? !1, lazy = opts.lazy ?? !1, dependencies = opts.dependencies, merger = opts.merger, mapper = opts.mapper, cache = new Map;
    let fully_dirty = !1;
    if (dependencies && dependencies.length > 0) {
        const dependency_handler = {
            dirty: function(source, ref, value) {
                fully_dirty = !0, output.dirty(source, ref, value);
            }
        };
        output.dependency_handler = dependency_handler;
        for (let dependency of dependencies) dependency.subscribe(dependency_handler);
    }
    if (lazy) {
        let dirty = new Map;
        function lazy_apply(source, value) {
            fully_dirty || (dirty.set(source, value), output.dirty(source, void 0, value));
        }
        function apply_all_dirty() {
            const dirty_values = fully_dirty ? new Map([ ...source.get() ].map(v => [ v, v ])) : dirty.entries();
            dirty.clear();
            for (let kv of dirty_values) {
                const key = kv[0];
                unpack_signals && (kv[1] = kv[1].get());
                const value = mapper ? mapper?.(kv[1]) : kv[1];
                let prev_value, cache_item = cache.get(key);
                cache_item ? (prev_value = cache_item.prev, cache_item.prev = value) : unpack_signals && listen(key), 
                merger(key, output, value, prev_value);
            }
        }
        const original_get = output.get.bind(output);
        function listen(signal) {
            cache.set(signal, {
                prev: identity_value,
                ref: signal.subscribe(lazy_apply)
            });
        }
        function unlisten(signal) {
            let ref = cache.get(signal).ref;
            signal.unsubscribe(ref), cache.delete(signal), dirty.delete(signal);
        }
        output.get = (...args) => ((apply_all_dirty || dirty.size > 0) && apply_all_dirty(), 
        original_get(...args));
        for (let initial_value of source.get()) lazy_apply(initial_value, initial_value);
        source.subscribe_event((_, ve) => {
            if (lazy) switch (ve.event) {
              case "add":
              case "update":
                lazy_apply(ve.value, ve.value);
                break;

              case "delete":
                lazy_apply(ve.value, unpack_signals ? {
                    get: () => identity_value
                } : identity_value), unpack_signals && unlisten(ve.value);
            }
        });
    } else {
        function apply_value(source_item, value, ref, unpack = unpack_signals) {
            unpack && (value = value?.get());
            let state = cache.get(source_item), prev_value = state?.prev ?? identity_value;
            state ? state.prev = value : cache.set(source_item, {
                prev: value,
                ref: null
            }), merger(source_item, output, value, prev_value);
        }
        for (let initial_value of source.get()) apply_value(initial_value, mapper?.(initial_value) ?? initial_value);
        function unlisten(signal) {
            let ref = cache.get(signal).ref;
            signal.unsubscribe(ref), cache.delete(signal);
        }
        source.subscribe_event((_, ve) => {
            let original_value = ve.value, value = mapper ? mapper(original_value) : original_value;
            switch (ve.event) {
              case "add":
                apply_value(original_value, value), unpack_signals && (signal = original_value, 
                cache.set(signal, {
                    prev: identity_value,
                    ref: signal.subscribe(apply_value)
                }));
                break;

              case "delete":
                unpack_signals ? unlisten(original_value) : apply_value(original_value, identity_value, 0, !1);
                break;

              case "update":
                if (apply_value(original_value, value), unpack_signals) throw new Error("Unpack Signals w/ update events not implemented yet! How do we unsubscribe from the old signal then?");
            }
            var signal;
        });
    }
    return output;
}

function reduce_fast(initial_value, producer, reducer, depends_on) {
    const result = new NativeSignal(initial_value), dirty_entries = new Map;
    let fully_dirty = !1;
    function reset_value() {
        let new_value = initial_value;
        for (let value of producer.get()) new_value = reducer({
            event: "add",
            value: value
        }, new_value);
        result.set(new_value), fully_dirty = !1, dirty_entries.clear();
    }
    if (result.get = () => {
        if (fully_dirty) reset_value(); else {
            let new_value = result._value;
            for (let value of dirty_entries.values()) new_value = reducer(value, new_value);
            result.set(new_value);
        }
        return result._value;
    }, depends_on.length > 0) {
        const dependency_handler = {
            dirty: function(source, ref, value) {
                fully_dirty = !0, result.dirty(source, ref, value);
            }
        };
        result.dependency_handler = dependency_handler;
        for (let dependency of depends_on) dependency.subscribe(dependency_handler);
    }
    return producer.subscribe_event((_, ve) => {
        fully_dirty || [ "add", "delete" ].includes(ve.event) && (dirty_entries.has(ve.value) ? dirty_entries.delete(ve.value) : dirty_entries.set(ve.value, ve));
    }), reset_value(), result;
}

function count_fast(collection, counter, depends_on) {
    return reduce_fast(0, collection, (event, prev) => prev + counter(event), depends_on);
}

function reduce(producer, reducer, initial_value) {
    const result = new NativeSignal(initial_value), listeners = new Map;
    function listen(v) {
        let computed, state = {};
        computed = new Computed(() => {
            let prev_value = result._value, new_value = reducer(v, prev_value, state);
            return result.set(new_value), new_value;
        }, !0), listeners.set(v, computed);
    }
    const values = [ ...producer.get() ];
    for (let i = 0; i < values.length; i++) listen(values[i]);
    return producer.subscribe_event((_, ve) => {
        var v;
        "add" === ve.event ? listen(ve.value) : "delete" === ve.event && (v = ve.value, 
        listeners.get(v).destroy(), listeners.delete(v));
    }), result;
}

function count(producer, counter) {
    return reduce(producer, (v, prev, state) => {
        let count = counter(v), old_value = state.prev_value ?? 0;
        return state.prev_value = count, prev + count - old_value;
    }, 0);
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

export { BufferedSubscribable, Computed, Effect, NativeSignal, Order, OrderNode, QuantizedQueue, Reducer, SignalHeap, SignalMap, SignalSet, Subscribable, count, count_fast, fixed_array, interval, local, reduce, reduce_fast, reduce_generic };
//# sourceMappingURL=index.js.map
