// This is a fake WeakRef. Using the real one results in bugs:
// We want subscribers to disappear from the subscribers array when they are no longer used. But we don't want this subscribable,
// which active subscribers listen to, to be removed. WeakRefs are weak in both directions! Therefore we need to store "Is listening to"
// just to keep the source alive!
class FakeWeakRef {
    value;
    constructor(value) {
        this.value = value;
    }
    deref() {
        return this.value;
    }
}
/**
 * Represents a subscribable value that can be observed for changes.
 */
export class Subscribable {
    // This is set or replaced whenever a computed type ( or a similar custom Subscribable )
    // runs its .get() function. While it is open, any other subscribable's get() function
    // should add itself to this set. This way the computed signal knows which signals it
    // depends on.
    static global_listeners = null;
    // 
    static waiting_to_emit = [];
    // To avoid updating say an effect every time its dependency changes while the same function
    // is processing, it will register its callback with an async delay, 
    // which in reality should wait until whatever sync function is running is done.
    // This means the effect only triggers once after all dependencies were set, instead of once
    // for each dependency that changed.
    static register_async_emit(fn) {
        if (this.waiting_to_emit.length <= 0) {
            const a = () => {
                const emits = this.waiting_to_emit;
                this.waiting_to_emit = [];
                for (let f of emits) {
                    f();
                }
            };
            // setImmediate is faster but only works reliably in node
            if (typeof process === 'object')
                setImmediate(a);
            else // firefox breaks terribly if setImmediate is used.
                setTimeout(a, 0);
        }
        this.waiting_to_emit.push(fn);
    }
    // These functions want to be called when this Subscribable's value changes.
    // We store them as WeakRefs so they get GCed when nobody uses the object anymore.
    subscribers;
    dependants;
    // event subscribers
    events;
    events2;
    // events: Record< string, ((event:Events[keyof Events]) => any)[] > | undefined;
    subscribe_event(fn, event) {
        if (event) {
            let events = this.events;
            if (!events)
                events = this.events = {};
            let fns = events[event];
            if (!fns)
                events[event] = [fn];
            else
                fns.push(fn);
        }
        else {
            let events = this.events2;
            if (!events)
                this.events2 = [new WeakRef(fn)];
            else
                events.push(new WeakRef(fn));
        }
        return this;
    }
    emit_event(event) {
        const events = this.events?.[event.event];
        if (events) {
            for (let fn of events) {
                fn(this, event);
            }
        }
        if (this.events2) {
            for (let fn of this.events2) {
                fn.deref()?.(this, event);
            }
        }
        return this;
    }
    subscribe(fn) {
        if (typeof fn === "function") {
            const previous_first_item = this.subscribers;
            const new_item = this.subscribers = {
                next: this.subscribers,
                value: new WeakRef(fn)
            };
            if (previous_first_item)
                previous_first_item.prev = new_item;
            return new_item;
        }
        const previous_first_item = this.dependants;
        const new_item = this.dependants = {
            next: this.dependants,
            value: new WeakRef(fn)
        };
        if (previous_first_item)
            previous_first_item.prev = new_item;
        return new_item;
    }
    /**
     * Force unsubscribe. This is generally not recommended, as garbage collection
     * does the same thing automatically.
     * @param reference
     */
    unsubscribe(reference) {
        if (reference.next)
            reference.next.prev = reference.prev;
        if (reference.prev)
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
     * This should propagate all the way through all subscribable which depend on this.
     */
    dirty(source) {
        let dependant = this.dependants;
        // Propagate dirty state to all dependent subscribables.
        while (dependant) {
            const deref = dependant.value.deref();
            if (!deref)
                this.unsubscribe(dependant);
            else {
                deref.dirty(this);
            }
            dependant = dependant.next;
        }
        return this;
    }
    /**
     * Emits a new value and notifies all subscribers immediately
     * @param value - The new value to emit.
     */
    emit(value) {
        let dependant = this.subscribers;
        // Propagate dirty state to all dependent subscribables.
        while (dependant) {
            const deref = dependant.value.deref();
            if (!deref)
                this.unsubscribe(dependant);
            else {
                deref(this, value);
            }
            dependant = dependant.next;
        }
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
//# sourceMappingURL=Subscribable.js.map