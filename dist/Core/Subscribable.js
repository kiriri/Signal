"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Subscribable = void 0;
// This is a fake WeakRef. Using the real one results in bugs:
// We want subscribers to disappear from the subscribers array when they are no longer used. But we don't want this subscribable,
// which active subscribers listen to, to be removed. WeakRefs are weak in both directions! Therefore we need to store "Is listening to"
// just to keep the source alive!
var FakeWeakRef = /** @class */ (function () {
    function FakeWeakRef(value) {
        this.value = value;
    }
    FakeWeakRef.prototype.deref = function () {
        return this.value;
    };
    return FakeWeakRef;
}());
/**
 * Represents a subscribable value that can be observed for changes.
 */
var Subscribable = /** @class */ (function () {
    function Subscribable() {
    }
    // To avoid updating say an effect every time its dependency changes while the same function
    // is processing, it will register its callback with an async delay, 
    // which in reality should wait until whatever sync function is running is done.
    // This means the effect only triggers once after all dependencies were set, instead of once
    // for each dependency that changed.
    Subscribable.register_async_emit = function (fn) {
        var _this = this;
        if (this.waiting_to_emit.length <= 0) {
            setImmediate(function () {
                var emits = _this.waiting_to_emit;
                _this.waiting_to_emit = [];
                for (var _i = 0, emits_1 = emits; _i < emits_1.length; _i++) {
                    var f = emits_1[_i];
                    f();
                }
            });
        }
        this.waiting_to_emit.push(fn);
    };
    Subscribable.prototype.subscribe = function (fn) {
        var _a, _b;
        var _c, _d;
        if (Subscribable.global_listeners)
            Subscribable.global_listeners.push(this);
        if (typeof fn === "function") {
            if (!this.subscribers)
                this.subscribers = new Set();
            var weak_entry = void 0;
            weak_entry = (_a = (_c = fn)["$weakRef"]) !== null && _a !== void 0 ? _a : (_c["$weakRef"] = new WeakRef(fn));
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
            this.dependants.add((_b = (_d = fn)["$weakRef"]) !== null && _b !== void 0 ? _b : (_d["$weakRef"] = new WeakRef(fn)));
        }
        return this;
    };
    Subscribable.prototype.unsubscribe = function (fn) {
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
            this.dependants.delete(fn["$weakRef"]);
            delete fn["$weakRef"];
        }
        return this;
    };
    /**
     * Call this whenever this subscribable or any of its dependencies have changed.
     * This should propagate all the way through all subscribable which depend on this.
     */
    Subscribable.prototype.dirty = function (source) {
        // Propagate dirty state to all dependent subscribables.
        if (this.dependants) {
            var values = this.dependants.values();
            for (var _i = 0, values_1 = values; _i < values_1.length; _i++) {
                var ref = values_1[_i];
                var deref = ref.deref();
                if (!deref)
                    this.dependants.delete(ref);
                else {
                    deref.dirty(this);
                }
            }
        }
        return this;
    };
    /**
     * Emits a new value and notifies all subscribers immediately
     * @param value - The new value to emit.
     */
    Subscribable.prototype.emit = function (value) {
        if (this.subscribers) {
            var values = this.subscribers.values();
            for (var _i = 0, values_2 = values; _i < values_2.length; _i++) {
                var ref = values_2[_i];
                var deref = ref.deref();
                if (!deref)
                    this.subscribers.delete(ref);
                else {
                    deref(this, value);
                }
            }
        }
        return this;
    };
    Subscribable.prototype.promise = function () {
        var _this = this;
        var resolve;
        var subscriber = function (source, v) {
            _this.unsubscribe(subscriber);
            resolve(v);
        };
        this.subscribe(subscriber);
        return new Promise(function (_resolve) {
            resolve = _resolve;
        });
    };
    // This is set or replaced whenever a computed type ( or a similar custom Subscribable )
    // runs its .get() function. While it is open, any other subscribable's get() function
    // should add itself to this set. This way the computed signal knows which signals it
    // depends on.
    Subscribable.global_listeners = null;
    // 
    Subscribable.waiting_to_emit = [];
    return Subscribable;
}());
exports.Subscribable = Subscribable;
