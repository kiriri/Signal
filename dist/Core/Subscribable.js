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
    subscribe(fn) {
        if (Subscribable.global_listeners)
            Subscribable.global_listeners.push(this);
        if (typeof fn === "function") {
            if (!this.subscribers)
                this.subscribers = new Set();
            let weak_entry;
            weak_entry = fn["$weakRef"] ??= new WeakRef(fn);
            // if(function_owns_signal)
            // {
            //     weak_entry = new WeakRef(entry);
            //     (fn as any)["$weakRef"]??=new WeakRef(entry);
            //     (fn as any)[this.uid] = this; // Don't remove the weak ref until this is removed as well
            // }
            // else if(function_owns_signal === false)
            // {
            //     this.subscribers.add((fn as any)["$fweakRef"]??=new FakeWeakRef(entry))
            // }
            // else
            // {
            //     this.subscribers.add((fn as any)["$weakRef"]??=new WeakRef(entry))
            // }
            this.subscribers.add(weak_entry);
        }
        else {
            if (!this.dependants)
                this.dependants = new Set();
            this.dependants.add(fn["$weakRef"] ??= new WeakRef(fn));
        }
        return this;
    }
    unsubscribe(fn) {
        if (typeof fn === "function") {
            if (this.subscribers) {
                if (fn["$weakRef"])
                    this.subscribers.delete(fn["$weakRef"]);
                if (fn["$fweakRef"])
                    this.subscribers.delete(fn["$fweakRef"]);
                // delete (fn as any)[this.uid];
            }
        }
        else {
            this.dependants?.delete(fn["$weakRef"]);
            delete fn["$weakRef"];
        }
        return this;
    }
    /**
     * Call this whenever this subscribable or any of its dependencies have changed.
     * This should propagate all the way through all subscribable which depend on this.
     */
    dirty(source) {
        // Propagate dirty state to all dependent subscribables.
        if (this.dependants) {
            const values = this.dependants.values();
            for (const ref of values) {
                const deref = ref.deref();
                if (!deref)
                    this.dependants.delete(ref);
                else {
                    deref.dirty(this);
                }
            }
        }
        return this;
    }
    /**
     * Emits a new value and notifies all subscribers immediately
     * @param value - The new value to emit.
     */
    emit(value) {
        if (this.subscribers) {
            const values = this.subscribers.values();
            for (const ref of values) {
                const deref = ref.deref();
                if (!deref)
                    this.subscribers.delete(ref);
                else {
                    deref(this, value);
                }
            }
        }
        return this;
    }
    promise() {
        let resolve;
        const subscriber = (source, v) => {
            this.unsubscribe(subscriber);
            resolve(v);
        };
        this.subscribe(subscriber);
        return new Promise((_resolve) => {
            resolve = _resolve;
        });
    }
}
//# sourceMappingURL=Subscribable.js.map