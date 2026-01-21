const IS_NODE = typeof process === 'object';
class EventManager {
    // This is set or replaced whenever a computed type ( or a similar custom Subscribable )
    // runs its .get() function. While it is open, any other subscribable's get() function
    // should add itself to this set. This way the computed signal knows which signals it
    // depends on.
    static global_listeners = null;
    // 
    static waiting_to_emit = [];
    // To avoid updating say an effect every time its dependency changes while the same function
    // is processing, it will register its callback with an async delay, 
    // which in reality should wait only until whatever sync function is running is done.
    // This means the effect only triggers once after all dependencies were set, instead of once
    // for each dependency that changed.
    // The effect is responsible for making sure it doesn't register itself again before the previous
    // registration has been processed.
    static register_async_emit(fn, context) {
        // if (this.waiting_to_emit.length <= 0)
        // {
        function a() {
            fn(context);
        }
        // setImmediate is faster but only works reliably in node
        if (IS_NODE)
            setImmediate(a);
        else // firefox breaks terribly if setImmediate is used.
            setTimeout(a, 0);
        // }
        // this.waiting_to_emit.push(fn);
    }
}

// import { Eventable } from "./Eventable";
// This is a fake WeakRef. Using the real one results in bugs:
// We want subscribers to disappear from the subscribers array when they are no longer used. But we don't want this subscribable,
// which active subscribers listen to, to be removed. WeakRefs are weak in both directions! Therefore we need to store "Is listening to"
// just to keep the source alive!
/**
 * Represents a subscribable value that can be observed for changes.
 */
class Subscribable {
    // These functions want to be called when this Subscribable's value changes.
    // We store them as WeakRefs so they get GCed when nobody uses the object anymore.
    subscribers;
    dependants;
    // named event subscribers.
    events;
    // these event subscribers get triggered for each and every event that is fired.
    any_events;
    // events: Record< string, ((event:Events[keyof Events]) => any)[] > | undefined;
    /**
     * Subscribe to a named event, or to any named event if event parameter is left undefined.
     * Please note that unlike regular value subscribe() hooks, event subscriptions propagate *instantly*.
     * @param fn
     * @param event
     * @returns
     */
    subscribe_event(fn, event) {
        let previous_first_item = event === undefined ? this.any_events : (this.events ??= {})[event];
        const new_item = {
            next: previous_first_item,
            value: new WeakRef(fn), // needs to be held weakly, otherwise the next subscription references this 
            // (it's a linked list afterall), which causes a mess of interdependencies.
            event: event
        };
        if (previous_first_item === undefined) {
            if (event === undefined)
                this.any_events = new_item;
            else
                this.events[event] = new_item;
        }
        if (previous_first_item !== undefined)
            previous_first_item.prev = new_item;
        return new_item;
    }
    /**
 * Force unsubscribe. This is generally not recommended, as garbage collection
 * does the same thing automatically.
 * @param reference
 */
    unsubscribe_event(reference) {
        let event_name = reference["event"];
        if (reference.next !== undefined)
            reference.next.prev = reference.prev;
        if (reference.prev !== undefined)
            reference.prev.next = reference.next;
        else {
            if (event_name === undefined)
                if (this.any_events === reference)
                    this.any_events = reference.next;
                else if (this.events?.[event_name] === reference)
                    this.events[event_name] = reference.next;
        }
        return this;
    }
    /**
     * emit_event will not be inlined, but this function will.
     * Which makes if(can_emit(e)) emit_event(e) paradoxically faster some of the time than using just emit_event(e).
     * @param event
     * @returns
     */
    can_emit(event) {
        return (this.any_events ?? this.events?.[event.event]) !== undefined;
    }
    emit_event(event) {
        let events = this.events?.[event.event];
        while (events !== undefined) {
            const deref = events.value.deref();
            if (deref === undefined)
                this.unsubscribe_event(events);
            else
                deref(this, event, events);
            events = events.next;
        }
        let events2 = this.any_events;
        while (events2 !== undefined) {
            const deref = events2.value.deref();
            if (deref === undefined)
                this.unsubscribe_event(events2);
            else
                deref(this, event, events2);
            events2 = events2.next;
        }
        return this;
    }
    // readonly uid = uid();
    /**
     * Subscribes a function to be called when the value of this Subscribable changes.
     * @param fn - The function to subscribe.
     * @param function_owns_signal - If true, this subscribable will not GC while the function is being held. If false, the function will not GC while the signal is held.
     * @param subscribable If set, instantly sets the target subscribable to dirty when this subscribable emits.
     */
    subscribe(fn) {
        // Is Function ?
        const previous_first_item = this.subscribers;
        const new_item = this.subscribers = {
            next: previous_first_item,
            value: new WeakRef(fn)
        };
        if (previous_first_item !== undefined)
            previous_first_item.prev = new_item;
        return new_item;
    }
    depend(subscribable) {
        const previous_first_item = this.dependants;
        const new_item = this.dependants = {
            next: previous_first_item,
            value: new WeakRef(subscribable)
        };
        if (previous_first_item !== undefined)
            previous_first_item.prev = new_item;
        return new_item;
    }
    /**
     * Force unsubscribe. This is generally not recommended, as garbage collection
     * does the same thing automatically.
     * @param reference
     */
    unsubscribe(reference) {
        if (reference.next !== undefined)
            reference.next.prev = reference.prev;
        if (reference.prev !== undefined)
            reference.prev.next = reference.next;
        else {
            if (this.dependants === reference)
                this.dependants = this.dependants.next;
            else if (this.subscribers === reference)
                this.subscribers = this.subscribers.next;
        }
        return this;
    }
    /**
     * Call this whenever this subscribable or any of its dependencies have changed.
     * This is only used for stateful subscribables.
     * This should propagate all the way through all subscribables which depend on this.
     */
    dirty(source, ref) {
        let dependant = this.dependants;
        // Propagate dirty state to all dependent subscribables.
        while (dependant !== undefined) {
            const deref = dependant.value.deref();
            if (deref === undefined)
                this.unsubscribe(dependant);
            else
                deref.dirty(this, dependant);
            dependant = dependant.next;
        }
    }
    /**
     * Emits a new value and notifies all subscribers immediately
     * Use this function instead of dirty if your subscribable is stateless.
     * @param value - The new value to emit.
     */
    emit(value) {
        let subscriber = this.subscribers;
        // Propagate dirty state to all dependent subscribables.
        while (subscriber !== undefined) {
            const deref = subscriber.value.deref();
            if (deref === undefined) {
                console.log("Deref undefined ", subscriber);
                this.unsubscribe(subscriber);
            }
            else
                deref(this, value, subscriber);
            subscriber = subscriber.next;
        }
        // let dependant = this.dependants;
        // // Propagate dirty state to all dependent subscribables.
        // while (dependant !== undefined)
        // {
        //     const deref = dependant.value.deref();
        //     if (deref === undefined)
        //         this.unsubscribe(dependant)
        //     else
        //         deref.dirty(this as any, dependant, value)
        //     dependant = dependant.next;
        // }
        return this;
    }
    promise() {
        let resolve;
        let reference;
        const subscriber = (source, v) => {
            this.unsubscribe(reference);
            resolve(v);
        };
        reference = this.subscribe(subscriber);
        return new Promise((_resolve) => {
            resolve = _resolve;
        });
    }
}

// Computed signals will add a set to this when they get their value.
// Any other signal whose value is used will automatically add itself to the last array.
/**
 * Represents a computed signal that dynamically computes its value based on other signals.
 */
class Computed {
    // This computed signal is currently listening to any change in any of these subscribables.
    // These subscribables are bound up in fn, so we don't have to worry about weakly referencing them here either.
    subscribed_to = [];
    // The function that is called to compute the current value of this Subscribable.
    fn;
    context;
    _dirty = true;
    _cache;
    _eager;
    /**
     * Only propagates dirty state when its not already propagated
     * ( ie no dependent signal has bothered to get this computed since )
     * This is a performance saving measure.
     * @param source
     * @returns
     */
    dirty(source, ref) {
        if (this._dirty)
            return;
        this._dirty = true;
        // Propagate the dirty state.
        this.__base_dirty(source, ref);
        // recalculate and propagate when we can be sure that all dependencies updated.
        if (this.subscribers !== undefined || this._eager) {
            EventManager.register_async_emit(() => this.emit(this.get()));
        }
        // return this;
    }
    ;
    get() {
        // If this computed type is called inside of another computed type:
        // store the parent listener and replace it with its own for a bit.
        if (EventManager.global_listeners !== null) {
            EventManager.global_listeners.push(this);
        }
        // if it's dirty, or if its in a transaction which delayed the dirty signal, recalculate the value
        if (this._dirty)
            return this._get();
        return this._cache;
    }
    subscribe(fn) {
        if (this._dirty === "first") {
            this._get(); // initialize subscribers 
        }
        return this.__base_subscribe(arguments[0]);
    }
    /**
     * Computes the current value of the computed signal and subscribes to any signals it depends on.
     * @returns The current value of the computed signal.
     */
    _get() {
        this._dirty = false;
        let parent_listeners = EventManager.global_listeners;
        const global_listeners = EventManager.global_listeners = [];
        EventManager.global_listeners = global_listeners;
        let value = this.fn(this.context);
        // subscribing and unsubscribing is *really* optimized, making it faster
        // than any Set/Map difference we could possibly come up with here.
        // And yes, just unsubscribing and resubscribing again and again looks 0 IQ,
        // but I tested this quite thoroughly.
        let subscribed_to = this.subscribed_to;
        const l1 = subscribed_to.length;
        for (let i = 0; i < l1; i++) {
            let { ref, signal } = subscribed_to[i];
            signal.unsubscribe(ref);
        }
        const length = global_listeners.length;
        for (let i = 0; i < length; i++) {
            const sub = global_listeners[i];
            // Avoid push if the array is already sufficiently sized
            if (i < l1) {
                // we'll reuse
                let existing = subscribed_to[i];
                existing.ref = sub.depend(this);
                existing.signal = sub;
            }
            else
                subscribed_to.push({
                    signal: sub,
                    ref: sub.depend(this)
                });
        }
        // Shrink the array if the number of subscribed to signals decreased.
        if (length < l1)
            subscribed_to.length = length;
        // If this was called inside another computed signal, switch back to that ones listeners so it can continue on.
        // If it was not inside another listener, set listeners to undefined!
        EventManager.global_listeners = parent_listeners;
        this._cache = value;
        // this.emit(this._cache)
        return value;
    }
    /**
     * Stop any future update of this computed.
     * Call _get() to undo this.
     */
    destroy() {
        this._dirty = false;
        for (let sub of this.subscribed_to) {
            sub[0].unsubscribe(sub[1].ref);
        }
        this.subscribed_to.length = 0;
    }
    subscribers;
    dependants;
    events;
    any_events;
    subscribe_event(fn, event) { let previous_first_item = event === undefined ? this.any_events
        : (this.events ??= {})[event]; const new_item = {
        next: previous_first_item, value: new WeakRef(fn), event: event
    }; if (previous_first_item === undefined) {
        if (event === undefined)
            this.any_events = new_item;
        else
            this // subscribing and unsubscribing is *really* optimized, making it faster
                // than any Set/Map difference we could possibly come up with here.
                // And yes, just unsubscribing and resubscribing again and again looks 0 IQ,
                // but I tested this quite thoroughly.
                .
                    // than any Set/Map difference we could possibly come up with here.
                    // And yes, just unsubscribing and resubscribing again and again looks 0 IQ,
                    // but I tested this quite thoroughly.
                    events[event] = new_item;
    } if (previous_first_item // than any Set/Map difference we could possibly come up with here.
        // And yes, just unsubscribing and resubscribing again and again looks 0 IQ,
        // but I tested this quite thoroughly.
        !== // than any Set/Map difference we could possibly come up with here.
            // And yes, just unsubscribing and resubscribing again and again looks 0 IQ,
            // but I tested this quite thoroughly.
            undefined)
        previous_first_item.prev = new_item; return 
 }
    unsubscribe_event(reference) { let event_name = reference["event"]; if (reference.next !== undefined)
        reference.next.prev = reference.prev; if (reference.prev !== undefined)
        reference.prev.next = reference.next;
    else {
        if (event_name === undefined // Avoid push if the array is already sufficiently sized
        )
            if (this.any_events === reference)
                this.any_events
                    = reference.next // we'll reuse
                ; // we'll reuse
            else if (this.events?.[event_name] === reference)
                this.events[event_name] = reference.next;
    } return this; }
    can_emit(event) { 
    // If this was called inside another computed signal, switch back to that ones listeners so it can continue on.
    // If it was not inside another listener, set listeners to undefined!
    return (this.any_events ?? this.events?.[event.event]) !== undefined; }
    emit_event(// If it was not inside another listener, set listeners to undefined!
    event // If it was not inside another listener, set listeners to undefined!
    ) { let events = this.events?.[event.event]; while (events !== undefined) {
        const deref = events.value.deref // this.emit(this._cache)
        ( // this.emit(this._cache)
        ) // this.emit(this._cache)
        ; // this.emit(this._cache)
        if (deref === undefined)
            this.
                /**
                 * Stop any future update of this computed.
                 * Call _get() to undo this.
                 */
                unsubscribe_event(events);
        else
            deref(this, event, events);
        events = events.next;
    } let events2 = this.any_events; while (events2
        !== undefined) {
        const deref = events2.value.deref();
        if (deref === undefined)
            this.unsubscribe_event(events2);
        else
            deref(this, event, events2);
        events2 = events2.next;
    } return this; }
    __base_subscribe(fn) { const previous_first_item = this.subscribers; const new_item = this.subscribers = {
        next: previous_first_item, value: new WeakRef(fn)
    }; if (previous_first_item !== undefined)
        previous_first_item.prev = new_item; return new_item; }
    depend(subscribable) { const previous_first_item = this.dependants; const new_item = this.dependants = {
        next: previous_first_item, value: new WeakRef(subscribable)
    }; if (previous_first_item !== undefined)
        previous_first_item.prev = new_item; return new_item; }
    unsubscribe(reference) { if (reference.next !== undefined)
        reference.next.prev = reference.prev; if (reference.prev !== undefined)
        reference.prev.next = reference.next;
    else {
        if (this.dependants === reference)
            this.dependants = this.dependants.next;
        else if (this.subscribers === reference)
            this.subscribers = this.subscribers.next;
    } return this; }
    __base_dirty(source, ref) { let dependant = this.dependants; while (dependant !== undefined) {
        const deref = dependant.value.deref();
        if (deref === undefined)
            this.unsubscribe(dependant);
        else
            deref.dirty(this, dependant);
        dependant = dependant.next;
    } }
    emit(value) { let subscriber = this.subscribers; while (subscriber !== undefined) {
        const deref = subscriber.value.deref();
        if (deref === undefined) {
            console.log("Deref undefined ", subscriber);
            this.unsubscribe(subscriber);
        }
        else
            deref(this, value, subscriber);
        subscriber = subscriber.next;
    } return this; }
    promise() { let resolve; let reference; const subscriber = (source, v) => {
        this.unsubscribe(reference);
        resolve(v);
    }; reference = this.subscribe(subscriber); return new Promise((_resolve) => {
        resolve = _resolve;
    }); }
    constructor(fn, context, eager = false) {
        this.fn = fn;
        this.context = context;
        this._eager = eager;
        // Instantly run the function to subscribe to the relevant dependencies.
        if (eager) {
            this._cache = this._get();
        }
        // don't subscribe unless someone shows interest by calling get() or subscribe()
        else {
            this._dirty = "first";
        }
    }
}

/**
 * Represents a real Subscribable value that is stored in this Signal.
 */
class NativeSignal {
    // The internal value. Only get it directly if you want to make sure no computed type subscribes to it.
    _value;
    queued;
    /**
     * Gets the current value of the signal.
     * If called inside another computed signal, it will add itself to the list of listeners.
     * @returns The current value of the signal.
     */
    get() {
        if (EventManager.global_listeners)
            EventManager.global_listeners.push(this);
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
        this.dirty(this, undefined, value);
    }
    update(fn) {
        // this.set(fn(this._value));
        const value = fn(this._value);
        if (value === this._value)
            return;
        this._value = value;
        this.dirty(this, undefined, value);
    }
    dirty(source, ref, value) {
        // If it's queued for emit(), 
        // then it stands to reason that it has propagated dirty as well.
        if (this.queued)
            return this;
        if (this.subscribers !== undefined) {
            this.queued = true;
            EventManager.register_async_emit(this.on_emit, this);
        }
        this.__base_dirty(source, ref);
        return this;
    }
    on_emit(context) {
        context.queued = false;
        context.emit(context._value);
    }
    subscribers;
    dependants;
    events;
    any_events;
    subscribe_event(fn, event) { let previous_first_item = event === undefined ? this.any_events : (this.events ??= {})[event]; const new_item = {
        next: previous_first_item, value: new WeakRef(fn), event: event
    }; if (previous_first_item === undefined) {
        if (event === undefined)
            this.any_events = new_item;
        else
            this.events[event] = new_item;
    } if (previous_first_item !== undefined)
        previous_first_item.prev = new_item; return new_item; }
    unsubscribe_event(reference) { let event_name = reference["event"]; if (reference.next !== undefined)
        reference.next.prev = reference.prev; if (reference.prev !== undefined)
        reference.prev.next = reference.next;
    else {
        if (event_name === undefined)
            if (this.any_events === reference)
                this.any_events = reference.next;
            else if (this.events?.[event_name] === reference)
                this.events[event_name] = reference.next;
    } return this; }
    can_emit(event) { return (this.any_events ?? this.events?.[event.event]) !== undefined; }
    emit_event(event) { let events = this.events?.[event.event]; while (events !== undefined) {
        const deref = events.value.deref();
        if (deref === undefined)
            this.unsubscribe_event(events);
        else
            deref(this, event, events);
        events = events.next;
    } let events2 = this.any_events; while (events2 !== undefined) {
        const deref = events2.value.deref();
        if (deref === undefined)
            this.unsubscribe_event(events2);
        else
            deref(this, event, events2);
        events2 = events2.next;
    } return this; }
    subscribe(fn) { const previous_first_item = this.subscribers; const new_item = this.subscribers = {
        next: previous_first_item, value: new WeakRef(fn)
    }; if (previous_first_item !== undefined)
        previous_first_item.prev = new_item; return new_item; }
    depend(subscribable) { const previous_first_item = this.dependants; const new_item = this.dependants = {
        next: previous_first_item, value: new WeakRef(subscribable)
    }; if (previous_first_item !== undefined)
        previous_first_item.prev = new_item; return new_item; }
    unsubscribe(reference) { if (reference.next !== undefined)
        reference.next.prev = reference.prev; if (reference.prev !== undefined)
        reference.prev.next = reference.next;
    else {
        if (this.dependants === reference)
            this.dependants = this.dependants.next;
        else if (this.subscribers === reference)
            this.subscribers = this.subscribers.next;
    } return this; }
    __base_dirty(source, ref) { let dependant = this.dependants; while (dependant !== undefined) {
        const deref = dependant.value.deref();
        if (deref === undefined)
            this.unsubscribe(dependant);
        else
            deref.dirty(this, dependant);
        dependant = dependant.next;
    } }
    emit(value) { let subscriber = this.subscribers; while (subscriber !== undefined) {
        const deref = subscriber.value.deref();
        if (deref === undefined) {
            console.log("Deref undefined ", subscriber);
            this.unsubscribe(subscriber);
        }
        else
            deref(this, value, subscriber);
        subscriber = subscriber.next;
    } return this; }
    promise() { let resolve; let reference; const subscriber = (source, v) => {
        this.unsubscribe(reference);
        resolve(v);
    }; reference = this.subscribe(subscriber); return new Promise((_resolve) => {
        resolve = _resolve;
    }); }
    constructor(value) {
        this._value = value;
    }
}

class OrderNode {
    value;
    order;
    next = null;
    prev = null;
    constructor(value, order) {
        this.value = value;
        this.order = order;
    }
    _insertAfter(value) {
        if (this.next === null) {
            this.order.last = value;
        }
        value.next = this.next;
        value.prev = this;
        this.next = value;
    }
    _insertBefore(value) {
        if (this.prev === null)
            this.order.first = value;
        value.prev = this.prev;
        value.next = this;
        this.prev = value;
    }
    insertAfter(value) {
        let node = this.order._createNode(value);
        this._insertAfter(node);
        this.order.emit_event({
            event: "add",
            value: this.value,
            node: this
        });
        this.order.emit(this.order.first);
        return node;
    }
    insertBefore(value) {
        let node = this.order._createNode(value);
        this._insertBefore(node);
        this.order.emit_event({
            event: "add",
            value: this.value,
            node: this
        });
        this.order.emit(this.order.first);
        return node;
    }
    /**
     * Move this node such that it is the next node after the reference node.
     * @param value
     */
    moveAfter(reference) {
        let prevNext = this.next;
        let prevPrev = this.prev;
        if (this.next)
            this.next.prev = this.prev;
        if (this.prev)
            this.prev.next = this.next;
        this.prev = reference;
        this.next = reference.next;
        reference.next = this;
        this.order.emit_event({
            event: "move",
            value: this,
            prevNext,
            prevPrev
        });
        this.order.emit(this.order.first);
        return this;
    }
    /**
     * Deletes the node from the order.
     * DO NOT REUSE THE NODE AFTERWARDS!
     * (There are no guardrails for performance reasons)
     */
    delete() {
        if (this.prev)
            this.prev.next = this.next;
        else
            this.order.first = this.next;
        if (this.next)
            this.next.prev = this.prev;
        else
            this.order.last = this.prev;
        this.next = null;
        this.prev = null;
        this.order.nodes.delete(this.value);
        this.order.emit_event({
            event: "delete",
            value: this.value,
            node: this
        });
        this.order.emit(this.order.first);
        this.order = null;
    }
    *[Symbol.iterator]() {
        let node = this;
        while (node) {
            yield node.value;
            node = node.next;
        }
    }
}
class Order extends Subscribable {
    nodes = new Map();
    first = null;
    last = null;
    get() {
        // TODO : Cache this! Clear cache on change.
        return [...this].map(v => v.value);
    }
    _createNode(value) {
        let node = new OrderNode(value, this);
        this.nodes.set(value, node);
        if (!this.first)
            return this.first = this.last = node;
        return node;
    }
    _delete(value) {
        const node = this.nodes.get(value);
        node?.delete();
    }
    _add(value) {
        this.push(value);
    }
    push(value) {
        let node = this._createNode(value);
        if (this.last !== node)
            this.last._insertAfter(node);
        this.emit_event({
            event: "add",
            value: node.value,
            node
        });
        this.emit(this.first);
        return node;
    }
    shift(value) {
        let node = this._createNode(value);
        if (this.first !== node)
            this.first._insertBefore(node);
        this.emit_event({
            event: "add",
            value: node.value,
            node
        });
        this.emit(this.first);
        return node;
    }
    getNode(value) {
        return this.nodes.get(value);
    }
    size() {
        return this.nodes.size;
    }
    clear() {
        let nodes = this.nodes;
        this.nodes = new Map();
        this.first = null;
        this.last = null;
        for (let node of nodes.values()) {
            this.emit_event({
                event: "delete",
                value: node.value,
                node
            });
        }
        this.emit(this.first);
    }
    *[Symbol.iterator]() {
        let node = this.first;
        while (node) {
            yield node;
            node = node.next;
        }
    }
}

class SignalMap extends Subscribable {
    _internal;
    // readonly _entries: Map<K, [K,V]>;
    _signals = undefined;
    // TODO : This is unnecessarily expensive.
    // _on_change = new BufferedSubscribable<MapEvents<K,V>[keyof MapEvents<K,V>]>();
    // _on_change_instant = new Subscribable<MapEvents<K,V>[keyof MapEvents<K,V>]>();
    constructor(items) {
        super();
        this._internal = new Map();
        if (items) {
            // cheaper for few items, unknown for large counts.
            for (let item of items)
                this._internal.set(item[0], item[1]);
        }
    }
    get(key) {
        if (key) {
            return this._internal.get(key);
        }
        if (EventManager.global_listeners)
            EventManager.global_listeners.push(this);
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
            // this._entries.set(key,kv);
            this._signals?.get(key)?.set(value);
            if (exists === undefined) {
                this.emit_event({ event: "add", value: kv });
                // this._on_change_instant.emit({ event: "add", value:kv });
            }
            this.dirty();
        }
    }
    _delete(value) {
        this.delete(value[0]);
    }
    delete(key) {
        let v = this._internal.get(key);
        if (this._internal.delete(key)) {
            const kv = [key, v];
            let signal = this._signals?.get(key);
            if (signal?.get() !== undefined)
                signal?.set(undefined);
            this.emit_event({ event: "delete", value: kv });
            // this._on_change_instant.emit({ event: "delete", value:kv });
            this.dirty();
        }
    }
    clear() {
        const entries = this._internal.entries();
        this._internal.clear();
        for (let kv of entries) {
            const reference = this._signals?.get(kv[0]);
            if (reference)
                reference.set(undefined);
            this.emit_event({ event: "delete", value: kv });
            // this._on_change_instant.emit({ event: "delete", value:kv });
        }
        this.dirty();
    }
    has(key) {
        return this._internal.has(key);
    }
    queued = false;
    dirty(source, ref) {
        // If it's queued for emit(),
        // then it stands to reason that it has propagated dirty as well.
        if (this.queued)
            return this;
        if (this.subscribers) {
            this.queued = true;
            EventManager.register_async_emit(() => this.emit());
        }
        return super.dirty(source, ref);
    }
    emit(value = this._internal) {
        return super.emit(value);
    }
}

class SignalSet extends Subscribable {
    _internal;
    constructor(items) {
        super();
        this._internal = new Set();
        if (items) {
            for (let item of items) {
                this._internal.add(item);
            }
        }
    }
    get() {
        if (EventManager.global_listeners)
            EventManager.global_listeners.push(this);
        return this._internal;
    }
    _add(value) {
        this.add(value);
    }
    add(value) {
        let exists = this._internal.has(value);
        this._internal.add(value);
        if (!exists) {
            const event = { event: "add", value };
            // if(this.can_emit(event))
            // {
            // Inlining this will save around 20% performance 
            this.emit_event(event);
            // }
            this.dirty();
        }
    }
    _delete(value) {
        this.delete(value);
    }
    delete(value) {
        if (this._internal.delete(value)) {
            this.emit_event({ event: "delete", value });
            // this._on_change_instant.emit({ event: "delete", value })
            this.dirty();
        }
    }
    clear() {
        let values = [...this._internal.values()];
        this._internal.clear();
        for (let value of values) {
            this.emit_event({ event: "delete", value });
            // this._on_change_instant.emit({ event: "delete", value })
        }
        this.dirty();
    }
    queued = false;
    dirty(source, ref) {
        // If it's queued for emit(),
        // then it stands to reason that it has propagated dirty as well.
        if (this.queued)
            return this;
        if (this.subscribers) {
            this.queued = true;
            EventManager.register_async_emit(() => this.emit());
        }
        return super.dirty(source, ref);
    }
    emit(value = this._internal) {
        return super.emit(value);
    }
    has(value) {
        return this._internal.has(value);
    }
}
// let test : StatefulSubscribable<Iterable<number>> = new SignalSet<number>()

class SignalHeap extends Subscribable {
    items;
    constructor(items) {
        super();
        if (items) {
            let prev = this.items;
            for (let item of items) {
                let entry = {
                    next: prev,
                    value: item,
                    prev: undefined
                };
                if (prev) {
                    prev.prev = entry;
                }
                prev = entry;
            }
            this.items = prev;
        }
    }
    get() {
        let self = this;
        if (EventManager.global_listeners)
            EventManager.global_listeners.push(this);
        return (function* iterator() {
            let item = self.items;
            while (item) {
                yield item.value;
                item = item.next;
            }
        })();
    }
    add(value) {
        const prev = this.items;
        const ref = {
            value: value,
            next: prev
        };
        if (prev !== undefined)
            prev.prev = ref;
        const event = { event: "add", value, ref };
        this.emit_event(event);
        this.dirty();
        return ref;
    }
    delete(value) {
        if (value.next !== undefined)
            value.next.prev = value.prev;
        if (value.prev !== undefined)
            value.prev.next = value.next;
        else {
            if (this.items === value)
                this.items = this.items.next;
        }
        this.emit_event({ event: "delete", value: value.value, ref: value });
        this.dirty();
    }
    clear() {
        let values = this.items;
        this.items = undefined;
        while (values !== undefined) {
            this.emit_event({ event: "delete", value: values.value, ref: values });
            values = values.next;
        }
        this.dirty();
    }
    queued = false;
    dirty(source, ref) {
        // If it's queued for emit(),
        // then it stands to reason that it has propagated dirty as well.
        if (this.queued)
            return this;
        if (this.subscribers) {
            this.queued = true;
            EventManager.register_async_emit(() => this.emit());
        }
        return super.dirty(source, ref);
    }
    emit(value = this.get()) {
        return super.emit(value);
    }
}

class Reducer extends Subscribable {
    identityValue;
    merger;
    _value;
    _dirty = true;
    set(value) {
        this._value = value;
        super.dirty(this);
    }
    get() {
        return this._value;
    }
    dirty(source, ref) {
    }
    constructor(identityValue, merger, value) {
        super();
        this.identityValue = identityValue;
        this.merger = merger;
        this._value = value;
        // this.eager = eager;
    }
    register_collection(source, mapped) {
        const ref = source.subscribe_event(this.on_collection_change);
        ref["reducer"] = this;
        ref["map"] = mapped ? new Map() : undefined;
        for (let item of source.get()) {
            (this).on_collection_change(source, {
                event: "add",
                value: item
            }, ref);
        }
        return ref;
    }
    on_collection_change(source, event, ref) {
        const reducer = ref["reducer"];
        const map = ref["map"];
        const mapped = map !== undefined;
        console.log("Collection changed");
        if (mapped) {
            switch (event.event) {
                case "add":
                    let ref = reducer.register_source(event.value);
                    map.set(event.value, ref);
                    break;
                case "delete":
                    if (map.delete(event.value))
                        reducer.unregister_source(map.get(event.value));
                    break;
            }
        }
        else {
            switch (event.event) {
                case "add":
                    reducer.set(reducer.merger(event.value, reducer.identityValue, reducer._value, source, ref, reducer));
                    break;
                case "delete":
                    reducer.set(reducer.merger(reducer.identityValue, event.value, reducer._value, source, ref, reducer));
                    break;
            }
        }
    }
    _self;
    register_source(source) {
        const ref = source.subscribe(this.on_change);
        ref["last"] = this.identityValue;
        // putting the reducer in the ref and using one global function is cheapter than instantiating a new on_change function for each Reducer.
        // BUG : Except this wil stop Reducer from being GCed while its sources still exist. So we have to add a WeakRef. Which is somewhat expensive. But we can reuse it at least.
        ref["reducer"] = this._self ??= new WeakRef(this);
        ref["source"] = source;
        this.on_change(source, source.get?.(), ref);
        return ref;
    }
    unregister_source(ref) {
        ref.source.unsubscribe(ref);
        this.on_change(ref["source"], this.identityValue, ref);
    }
    // dirty(source: I_Subscribable<INPUT>, ref:LinkedList<INPUT>, value?:INPUT): void
    // {
    //     const real_ref = ref as (typeof ref) & {last:INPUT};
    //     // eager for now
    //     // this.merger(source,real_ref,this);
    //     ref["last"] = source["get"]?.() ?? this.identityValue;
    //     // How does this work
    //     // Dirty does not actually contain the value most of the time.
    //     // dirty does not get called in situation like Subscribable.emit()
    // }
    on_change(source, value, ref) {
        let last_value = ref["last"];
        // TODO : There's a tipping point where creating a bound on_change function outweighs the costs of deref(). But it's in the 100s of calls. See if counting + replacing listeners is worth it. We could add the bound function to ref and check for it in the unbound on_change function. Or unsubscribe + resubscribe (might be cheaper).
        let self = ref["reducer"].deref();
        self.set(self.merger(value, last_value, self._value, source, ref, self));
        ref["last"] = value;
    }
}
/**
 *
 * @param source
 * @param identityValue
 * @param opts
 * @param merger Uses identityValue on delete! Applies relative changes based on previous and current value.
 * @param mapper Optionally map any added or updated value
 * @returns
 */
function reduce_generic(source, identityValue, opts) {
    const output = opts.output ?? new NativeSignal(identityValue);
    const unpackSignals = opts.unpackSignals ?? false;
    const lazy = opts.lazy ?? false;
    const dependencies = opts.dependencies;
    const merger = opts.merger;
    const mapper = opts.mapper;
    const cache = new Map();
    let fully_dirty = false;
    if (dependencies && dependencies.length > 0) {
        const dependency_handler = {
            dirty: function (source, ref, value) {
                fully_dirty = true;
                output.dirty(source, ref, value);
            }
        };
        output["dependency_handler"] = dependency_handler; // Bind it so it GCs alongside the result
        for (let dependency of dependencies)
            dependency.subscribe(dependency_handler);
    }
    // Lazy Mode. Avoid duplicate mapper/merger calls for entries which change multiple times within the same async time slice.
    // This is significantly faster if you make many changes at a time.
    if (lazy) {
        let dirty = new Map();
        function lazy_apply(source, value) {
            if (fully_dirty)
                return;
            dirty.set(source, value);
            output.dirty(source, undefined, value);
        }
        function apply_all_dirty() {
            const dirty_values = (fully_dirty ? new Map([...source.get()].map(v => [v, v])) : dirty.entries());
            dirty.clear();
            for (let kv of dirty_values) {
                const key = kv[0];
                if (unpackSignals)
                    kv[1] = kv[1].get();
                const value = mapper ? mapper?.(kv[1]) : kv[1];
                let cacheItem = cache.get(key);
                let prevValue;
                if (!cacheItem) {
                    if (unpackSignals) {
                        listen(key);
                    }
                }
                else {
                    prevValue = cacheItem.prev;
                    cacheItem.prev = value;
                }
                merger(key, output, value, prevValue);
            }
        }
        const original_get = output.get.bind(output);
        output.get = (...args) => {
            if (apply_all_dirty || dirty.size > 0)
                apply_all_dirty();
            return original_get(...args);
        };
        function listen(signal) {
            cache.set(signal, {
                prev: identityValue,
                ref: signal.subscribe(lazy_apply)
            });
        }
        function unlisten(signal) {
            let ref = cache.get(signal).ref;
            signal.unsubscribe(ref);
            cache.delete(signal);
            dirty.delete(signal);
        }
        for (let initial_value of source.get()) {
            lazy_apply(initial_value, initial_value);
        }
        source.subscribe_event((_, ve) => {
            if (lazy) {
                switch (ve.event) {
                    // TODO : lazy only listens when get() is called for the first time
                    // it also only updates the value at that time, all changed entries at once. 
                    case "add":
                        lazy_apply(ve.value, ve.value);
                        break;
                    case "delete":
                        lazy_apply(ve.value, unpackSignals ? { get() { return identityValue; } } : identityValue);
                        if (unpackSignals) {
                            unlisten(ve["value"]);
                        }
                        break;
                    case "update":
                        lazy_apply(ve.value, ve.value);
                        break;
                }
            }
        });
    }
    // Non Lazy Mode : As soon as a change occurs, mapper and merger get called. 
    else {
        function apply_value(sourceItem, value, ref, unpack = unpackSignals) {
            if (unpack) {
                value = value?.get(); // can be undefined if the value was removed from the source collection and the change event triggered before the delete one did.
            }
            let state = cache.get(sourceItem);
            let prev_value = state?.prev ?? identityValue;
            if (state)
                state.prev = value;
            else {
                cache.set(sourceItem, { prev: value, ref: null });
            }
            merger(sourceItem, output, value, prev_value);
        }
        for (let initial_value of source.get()) {
            apply_value(initial_value, mapper?.(initial_value) ?? initial_value);
        }
        function listen(signal) {
            cache.set(signal, {
                prev: identityValue,
                ref: signal.subscribe(apply_value)
            });
        }
        function unlisten(signal) {
            let ref = cache.get(signal).ref;
            signal.unsubscribe(ref);
            cache.delete(signal);
        }
        source.subscribe_event((_, ve) => {
            let original_value = ve["value"];
            let value = mapper ? mapper(original_value) : original_value;
            switch (ve.event) {
                case "add":
                    apply_value(original_value, value);
                    if (unpackSignals) {
                        listen(original_value);
                    }
                    break;
                case "delete":
                    if (unpackSignals) {
                        unlisten(original_value);
                    }
                    else {
                        apply_value(original_value, identityValue, undefined, false);
                    }
                    break;
                case "update":
                    apply_value(original_value, value);
                    if (unpackSignals) {
                        throw new Error("Unpack Signals w/ update events not implemented yet! How do we unsubscribe from the old signal then?");
                        // unlisten(original_value);
                        // listen(original_value);
                    }
                    break;
            }
        });
    }
    return output;
}
/**
 * It doesn't matter if we map changes to a single nativeSignal or a collection.
 * Just provide the output directly, and the way that changes are merged into it.
 * @param producer
 * @param output
 */
// export function reduceGeneric<
//     const Producer extends I_NativeCollection<any, any>,
//     const Output extends Subscribable<any>,
//     const OPTS extends {
//         lazy?: boolean, // if true, override the get() function of the output to make it lazy. Default true
//         unpackSignals?: boolean, // if signal, expect all values in the target to be subscribable and rerun the reduction any time they change using a synthetic {event:"update", value} event.
//         computed?: boolean,
//         dependencies?: Subscribable<any>[], // if any of these change, recalculate all
//     },
// >(
//     producer: Producer,
//     output: Output,
//     opts: OPTS,
//     processor: (
//         event: {
//             event: "add" | "delete" | "update";
//             value: typeof producer extends I_NativeCollection<infer V, any> ? (
//                 typeof opts["unpackSignals"] extends true ? (
//                     V extends I_Subscribable<infer V2> ? V2 : never
//                 ) : V
//             ) : never;
//         }
//     ) => void
// ): Output
// {
//     const lazy = opts.lazy ?? true;
//     const unpackSignals = opts.unpackSignals ?? false;
//     const computed = opts.computed ?? false;
//     const dependencies = opts.dependencies;
//     const use_dependencies = !!dependencies;
//     if (computed && (unpackSignals || use_dependencies))
//     {
//         throw new Error("Reduce should either use a computed function, or manual dependencies + unpackSignals. Don't combine opts.computed with dependencies/unpackSignals, it only degrades performance.")
//     }
//     type InputValue = Output extends Subscribable<infer V> ? V : never;
//     type OutputValue = typeof producer extends I_NativeCollection<infer V, any> ? (
//         typeof opts["unpackSignals"] extends true ? (
//             V extends I_Subscribable<infer V2> ? V2 : never
//         ) : V
//     ) : never;
//     const dirty_entries = new Map<InputValue, Parameters<typeof processor>[0]>();
//     let fully_dirty = false;
//     // function update_all()
//     // {
//     //     let new_value = initial_value;
//     //     for (let value of producer.get())
//     //         new_value = reducer({ event: "add", value }, new_value);
//     //     result.set(new_value);
//     //     fully_dirty = false;
//     //     dirty_entries.clear();
//     // }
//     // result.get = () =>
//     // {
//     //     if (fully_dirty)
//     //         reset_value();
//     //     else
//     //     {
//     //         let new_value = result._value;
//     //         for (let value of dirty_entries.values())
//     //             new_value = reducer(value, new_value);
//     //         result.set(new_value);
//     //     }
//     //     return result._value;
//     // }
//     // if (dependends_on.length > 0)
//     // {
//     //     const dependency_handler = {
//     //         dirty: function (source?: I_Subscribable<any>)
//     //         {
//     //             fully_dirty = true;
//     //             result.dirty();
//     //         }
//     //     }
//     //     result["dependency_handler"] = dependency_handler; // Bind it so it GCs alongside the result
//     //     for (let dependency of dependends_on)
//     //         dependency.subscribe(dependency_handler);
//     // }
//     // const listeners = new Map<InputValue, Computed<OutputValue>>();
//     // function listen(v: InputValue)
//     // {
//     //     let computed: Computed<OutputValue>;
//     //     let state = {};
//     //     computed = new Computed<OutputValue>(() =>
//     //     {
//     //         let prev_value = result._value;
//     //         let new_value = reducer(v, prev_value, state);
//     //         result.set(new_value);
//     //         return new_value;
//     //     }, true);
//     //     listeners.set(v, computed);
//     // }
//     // function unlisten(v: InputValue)
//     // {
//     //     listeners.get(v).destroy();
//     //     listeners.delete(v);
//     // }
//     // const values = [...producer.get()];
//     // for (let i = 0; i < values.length; i++)
//     //     listen(values[i]);
//     producer._on_change_instant.subscribe((_, ve) =>
//     {
//         let { event, value } = ve;
//         if (lazy)
//         {
//             if (dirty_entries.has(value))
//                 dirty_entries.delete(value);
//             else
//                 dirty_entries.set(value, ve);
//         }
//         else
//         {
//             processor(ve)
//         }
//     });
//     return output;
// }
// Reduce can be done much more efficiently without Computed, 
// but it won't work if the reduce function contains any signals.
// This will completely recalculate the reduced value whenever any of the dependencies changes.
// Otherwise it will partially update the value whenever something is added or removed.
function reduce_fast(initial_value, producer, reducer, dependends_on) {
    // type ProdValue = Producer extends I_NativeCollection<infer V, infer E> ? V : never;
    const result = new NativeSignal(initial_value);
    const dirty_entries = new Map();
    let fully_dirty = false;
    function reset_value() {
        let new_value = initial_value;
        for (let value of producer.get())
            new_value = reducer({ event: "add", value }, new_value);
        result.set(new_value);
        fully_dirty = false;
        dirty_entries.clear();
    }
    result.get = () => {
        if (fully_dirty)
            reset_value();
        else {
            let new_value = result._value;
            for (let value of dirty_entries.values())
                new_value = reducer(value, new_value);
            result.set(new_value);
        }
        return result._value;
    };
    if (dependends_on.length > 0) {
        const dependency_handler = {
            dirty: function (source, ref, value) {
                fully_dirty = true;
                result.dirty(source, ref, value);
            }
        };
        result["dependency_handler"] = dependency_handler; // Bind it so it GCs alongside the result
        for (let dependency of dependends_on)
            dependency.subscribe(dependency_handler);
    }
    producer.subscribe_event((_, ve) => {
        // fully dirty will calculate all entries from scratch the next time
        // the result's get() function is called.
        if (fully_dirty)
            return;
        if (!["add", "delete"].includes(ve.event))
            return;
        // Either it has added and then deleted, or vice versa. 
        // Either way, skip updating the value altogether
        if (dirty_entries.has(ve["value"]))
            dirty_entries.delete(ve["value"]);
        else
            dirty_entries.set(ve["value"], ve);
    });
    reset_value();
    return result;
}
function count_fast(collection, counter, depends_on) {
    return reduce_fast(0, collection, (event, prev) => prev + counter(event), depends_on);
}
function reduce(producer, reducer, initial_value) {
    // TODO : Replace Native Signal with one which on get forcefully pulls all dirty Computed values
    const result = new NativeSignal(initial_value);
    const listeners = new Map();
    function listen(v) {
        // BUG : Computed is late, and result does not force update computed on get
        let computed;
        let state = {};
        computed = new Computed(() => {
            let prev_value = result._value;
            let new_value = reducer(v, prev_value, state);
            result.set(new_value);
            return new_value;
        }, true);
        listeners.set(v, computed);
    }
    function unlisten(v) {
        listeners.get(v).destroy();
        listeners.delete(v);
    }
    const values = [...producer.get()];
    for (let i = 0; i < values.length; i++)
        listen(values[i]);
    producer.subscribe_event((_, ve) => {
        if (ve['event'] === "add")
            listen(ve['value']);
        else if (ve['event'] === "delete")
            unlisten(ve['value']);
    });
    return result;
}
function count(producer, counter) {
    return reduce(producer, (v, prev, state) => {
        let count = counter(v);
        let old_value = state.prev_value ?? 0;
        state.prev_value = count;
        return prev + count - old_value;
    }, 0);
}
// Map/Filter
// export function map_fast<
//     ProdValue,
//     ProdEvents extends ReqColTypes<ProdValue>,
//     Producer extends I_NativeCollection<ProdValue, ProdEvents>,
//     ConsValue,
// >(
//     producer: Producer,
//     constructor: {new():I_NativeCollection<ConsValue,any>},
//     handler: (event: ReqColTypes<ProdValue>["add" | "delete"], prev_value: ConsValue) => ConsValue,
//     dependends_on: StatefulSubscribable<any>[],
// ): I_NativeCollection<ConsValue,any>
// {
//     const result = new constructor();
//     const dirty_entries = new Map<ProdValue, ReqColTypes<ProdValue>["add" | "delete"]>();
//     let fully_dirty = false;
//     function reset_value()
//     {
//         let new_value = initial_value;
//         for (let value of producer.get())
//             new_value = handler({ event: "add", value }, new_value);
//         result.set(new_value);
//         fully_dirty = false;
//         dirty_entries.clear();
//     }
//     result.get = () =>
//     {
//         if (fully_dirty)
//             reset_value();
//         else
//         {
//             let new_value = result._value;
//             for (let value of dirty_entries.values())
//                 new_value = handler(value, new_value);
//             result.set(new_value);
//         }
//         return result._value;
//     }
//     if (dependends_on.length > 0)
//     {
//         const dependency_handler = {
//             dirty: function (source?: I_Subscribable<any>)
//             {
//                 fully_dirty = true;
//                 result.dirty();
//             }
//         }
//         result["dependency_handler"] = dependency_handler; // Bind it so it GCs alongside the result
//         for (let dependency of dependends_on)
//             dependency.subscribe(dependency_handler);
//     }
//     producer._on_change_instant.subscribe((_, ve) =>
//     {
//         // fully dirty will calculate all entries from scratch the next time
//         // the result's get() function is called.
//         if (fully_dirty)
//             return;
//         // Either it has added and then deleted, or vice versa. 
//         // Either way, skip updating the value altogether
//         if (dirty_entries.has(ve["value"]))
//             dirty_entries.delete(ve["value"]);
//         else
//             dirty_entries.set(ve["value"], ve);
//     });
//     reset_value();
//     return result;
// }
// function transform<
// ProdValue, 
// ProdEvents extends ReqColTypes<ProdValue>, 
// Producer extends I_NativeCollection<ProdValue,ProdEvents>,
// ConsValue, 
// ConsEvents extends ReqColTypes<ProdValue>, 
// Consumer extends I_NativeCollection<ProdValue,ProdEvents>,
// >(
//     producer:Producer
// )
// {
//     // consumer + producer pattern
//     // Map uses
//     let mapExample : (value:ProdValue)=>ConsValue;
//     // Filter uses (Plus requires ConsValue === ProdValue)
//     let filterExample : (value:ProdValue)=>boolean
//     // Reduce uses (Plus result is single NativeSignal)
//     let reduceExample : (value:ProdValue)=>ConsValue
// }

let intervals = new Map();
const registry = new FinalizationRegistry((intervalId) => {
    clearInterval(intervalId);
    console.log('Interval cleared because nobody used its signal any longer.');
});
// Get an event which fires every delta ms. 
// Events are shared and reused if they have common delta.
// That means events don't fire instantly.
// Events get GCed when they are no longer held.
function Interval(delta) {
    if (!intervals.has(delta)) {
        let signal = new NativeSignal(0);
        // Set up the interval
        const intervalId = setInterval(() => {
            // Don't reference the signal directly, else it won't be able to get GCed because setInterval holds a reference to a function which references the signal. (Which means its permanently pinned in global space).
            const signal = intervals.get(delta)?.deref();
            signal?.set(signal._value + 1);
        }, delta);
        // Register the interval ID for cleanup when the signal is garbage collected
        registry.register(signal, intervalId);
        intervals.set(delta, new WeakRef(signal));
    }
    const signal = intervals.get(delta).deref();
    // Has the signal since been GCed?
    if (!signal) {
        intervals.delete(delta);
        return Interval(delta); // try again from the top.
    }
    return signal;
}

const bin_log_length = 8;
const bin_log_length_log = 3;
const bin_length = 1 << bin_log_length;
const bin_mask = bin_length - 1;
const bin_log_lengths = [0, bin_log_length, bin_log_length * 2, bin_log_length * 3, bin_log_length * 4];
function FixedArray(length) {
    // let result = {};
    // for(let i = 0; i < length; i++)
    // {
    //     result[i] = undefined;
    // }
    // return result as any as T[];
    // let arr = [];
    // for(let i = 0; i < length; i++)
    //     arr.push(undefined);
    // return arr;
    return new Array(length).fill(undefined);
    // return [
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    //     undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,
    // ]
}
/**
 * For performance reasons, all actions will be assigned to buckets relative to how far in the future they are.
 * So everything in bins_0 will be done in the next {bin_length} ticks. And every tick will get the bin in bins_0[tick % bin_length].
 * When enough ticks pass, a higher order bin will be merged into the lower order bin corresponding to the delta time left for all actions in that bin.
 * It's hard to explain. Sorry. Just remember that the time in a single array in a higher order bin fills the entire bin in the
 * next lower level bin. Eg the single array bins_1[20] will when the time comes split into bins_0[0] all the
 * way to bins_0[bin_length], populating all arrays in bins_0. Same for all the higher order bins.
 */
/**
 * A quantized queue lets you register an event at a given time.
 * You can occasionally advance the time and events will emit
 * when they are due.
 */
class QuantizedQueue {
    bins_0 = FixedArray(bin_length); // The next {bin_length} ticks have individual action bins
    bins_1 = FixedArray(bin_length); // Each array in here contains the combined values of the next {1<<bin_length} buckets. Meaning this bin contains the next {bin_length^2} buckets total, over {bin_length} individual bins.
    bins_2 = FixedArray(bin_length); // same drill, but {bin_length} larger than the previous bin.
    bins_3 = FixedArray(bin_length); // same drill
    bins_4 = FixedArray(bin_length); // same drill. Everything further in the future will have to reschedule every 1<<40 ticks. (TODO)
    bins = [this.bins_0, this.bins_1, this.bins_2, this.bins_3, this.bins_4];
    current_tick = 0;
    tick() {
        // TODO : Process bins
        const tick = this.current_tick;
        const bin_index = tick & bin_mask;
        let entry = this.bins_0[bin_index];
        while (entry !== undefined) {
            entry.value(entry);
            entry = entry.next;
        }
        this.bins_0[bin_index] = undefined;
        this.current_tick += 1;
        this.rebin();
    }
    tick_long(ticks) {
        let bin = this.bins_0;
        function _tick_long_process(relative_from, relative_to) {
            for (let i = relative_from; i <= relative_to; i++) {
                let _bin = bin[i];
                while (_bin !== undefined) {
                    _bin.value(_bin);
                    _bin = _bin.next;
                }
                bin[i] = undefined;
            }
        }
        let current_relative_tick = this.current_tick & bin_mask;
        if (current_relative_tick !== 0) {
            _tick_long_process(current_relative_tick, bin_length - 1);
            this.current_tick += bin_length - current_relative_tick;
            this.rebin();
            ticks -= bin_length - current_relative_tick;
        }
        const full_bins = ~~(ticks / bin_length);
        for (let i = 0; i < full_bins; i++) {
            _tick_long_process(0, bin_length - 1);
            this.current_tick += bin_length;
            this.rebin();
        }
        ticks -= bin_length * full_bins;
        if (ticks > 0) {
            _tick_long_process(0, ticks);
            this.current_tick += ticks;
            this.rebin();
        }
    }
    rebin(bin_index = 0) {
        // const _bin_length = 1 << (bin_log_length + bin_index);
        let lower_bin_index = (this.current_tick >> (bin_log_length * bin_index)) & bin_mask;
        // If the current tick is not neatly divisible by the bin's size, no rebin is in order  
        if (lower_bin_index)
            return false;
        let higher_bin_index = (this.current_tick >> (bin_log_length * (bin_index + 1))) & bin_mask;
        // Try rebinning the next higher level too
        this.rebin(bin_index + 1);
        // Now merge the current higher order bin into the bins below it
        const lower_level_bins = this.bins[bin_index];
        let higher_level_entry = this.bins[bin_index + 1][higher_bin_index];
        while (higher_level_entry !== undefined) {
            let next_entry = higher_level_entry.next;
            const lower_bin_index = (higher_level_entry.end_time >> (bin_log_length * bin_index)) & bin_mask;
            const lower_bin = lower_level_bins[lower_bin_index];
            higher_level_entry.next = lower_bin;
            higher_level_entry.prev = undefined;
            if (lower_bin !== undefined) {
                lower_bin.prev = higher_level_entry;
            }
            lower_level_bins[lower_bin_index] = higher_level_entry;
            higher_level_entry = next_entry;
        }
        this.bins[bin_index + 1][higher_bin_index] = undefined;
        return true;
    }
    add(value, end_time) {
        const action = {
            value,
            end_time,
            prev: undefined,
            next: undefined
        };
        const current_tick = this.current_tick;
        if (end_time <= current_tick) {
            // Run instantly
            value(action);
            return action;
        }
        // const log_time = Math.log2(delta);
        const delta = end_time - current_tick;
        // Some microoptimized log2 calculations ( Because function calls are expensive, even builtin ones like Math.log2 )
        let log_delta = 0;
        let _delta = delta;
        while (_delta >>= 1)
            log_delta++;
        const bin_index = (log_delta >> bin_log_length_log); // divide by 8 because that's the bucket's log
        const bin = this.bins[bin_index];
        const bucket_index = (action.end_time >> bin_log_lengths[bin_index]) & bin_mask;
        let bucket_entry = bin[bucket_index];
        bin[bucket_index] = action;
        if (bucket_entry !== undefined) {
            bucket_entry.prev = action;
            action.next = bucket_entry;
        }
        return action;
    }
    remove(action) {
        if (action.prev === undefined) {
            // find the correct bin; Because this action has no previous item, it should be first in that bin.
            // We will need to replace it with the next one in line.
            // const log_time = Math.log2(delta);
            const delta = action.end_time - this.current_tick;
            // Some microoptimized log2 calculations ( Because function calls are expensive, even builtin ones like Math.log2 )
            // TODO : Check if this is still the case 5 years later!
            let log_delta = 0;
            let _delta = delta;
            while (_delta >>= 1)
                log_delta++;
            const bucket = (log_delta >> bin_log_length_log); // divide by 8 because that's the bucket's log
            const bucket_index = (action.end_time >> bin_log_lengths[bucket]) & bin_mask;
            let bucket_entry = this.bins[bucket][bucket_index];
            if (bucket_entry !== action) {
                console.warn("Tried to remove an action which was not registered in the queue.");
                return;
            }
            this.bins[bucket][bucket_index] = action.next;
        }
        else {
            if (action.prev !== undefined)
                action.prev.next = action.next;
            if (action.next !== undefined)
                action.next.prev = action.prev;
        }
    }
}
// export const queue = new ActionQueue();
// export const queue_first = new ActionQueue();

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
class BufferedSubscribable {
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

function async_caller(self) {
    self._dirty = false;
    if (self._initialized === false)
        self.initialize();
    self.fn(self._source_cache, self);
}
/**
 * An effect may reference any number of subscribables in its function, but it will only run whenever one of its sources changes.
 */
class Effect {
    sources;
    fn;
    _source_cache = {};
    _updaters = {};
    // Dirty in this case just means that it has registered the deferred emit function.
    _dirty = false;
    _initialized = false;
    /**
     * Creates a new Computed signal with a function that computes its value.
     * @param fn - The function that computes the value of the computed signal.
     */
    constructor(sources, 
    // The function that is called to compute the current value of this Subscribable.
    fn) {
        this.sources = sources;
        this.fn = fn;
        for (let key in sources) {
            let ref = this._updaters[key] = sources[key].subscribe(this.update_key_function);
            // @ts-ignore
            ref.key = key;
        }
    }
    update_key_function = (signal, value, ref) => {
        // @ts-ignore
        this._source_cache[ref.key] = value;
        if (this._dirty)
            return;
        this._dirty = true;
        EventManager.register_async_emit(async_caller, this);
    };
    initialize() {
        const sources = this.sources;
        for (let key in sources) {
            // Not all subscribables have a value at all times.
            if (!(key in this._source_cache))
                this._source_cache[key] = sources[key]["get"]?.() ?? null;
        }
        this._initialized = true;
    }
    /**
     * Instantly removes all event listener references.
     * Call this to make sure an Effect for sure no longer
     * triggers. Without this the garbage collection may
     * take seconds before it cleans up orphaned effects,
     * during which time they will still trigger!
     */
    destroy() {
        for (let key in this.sources) {
            const source = this.sources[key];
            source.unsubscribe(this._updaters[key]);
        }
    }
}

function local(key, signal) {
    signal.subscribe((s, v) => {
        localStorage.setItem(key, JSON.stringify(v));
    });
    const initial_value = localStorage.getItem(key);
    if (initial_value !== null) {
        if ("set" in signal) {
            signal.set(JSON.parse(initial_value));
        }
    }
    else {
        localStorage.setItem(key, JSON.stringify(signal.get()));
    }
    return signal;
}

export { BufferedSubscribable, Computed, Effect, FixedArray, Interval, NativeSignal, Order, OrderNode, QuantizedQueue, Reducer, SignalHeap, SignalMap, SignalSet, Subscribable, count, count_fast, local, reduce, reduce_fast, reduce_generic };
//# sourceMappingURL=index.js.map
