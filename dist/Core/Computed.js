"use strict";
// Computed signals will add a set to this when they get their value.
// Any other signal whose value is used will automatically add itself to the last array.
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Computed = void 0;
var Subscribable_1 = require("./Subscribable");
/**
 * Represents a computed signal that dynamically computes its value based on other signals.
 */
var Computed = /** @class */ (function (_super) {
    __extends(Computed, _super);
    /**
     * Creates a new Computed signal with a function that computes its value.
     * @param fn - The function that computes the value of the computed signal.
     * @param [eager=false] If true, acts like a sink/effect, as in it does not wait to run the function until get() is called. Default false.
     */
    function Computed(fn, eager) {
        if (eager === void 0) { eager = false; }
        var _this = _super.call(this) || this;
        // This computed signal is currently listening to any change in any of these subscribables.
        // These subscribables are bound up in fn, so we don't have to worry about weakly referencing them here either.
        _this.subscribed_to = new Map();
        _this._dirty = true;
        _this.fn = fn;
        _this._eager = eager;
        // Instantly run the function to subscribe to the relevant dependencies.
        _this._cache = _this._get();
        return _this;
    }
    /**
     * Only propagates dirty state when its not already propagated
     * ( ie no dependent signal has bothered to get this computed since )
     * This is a performance saving measure.
     * @param source
     * @returns
     */
    Computed.prototype.dirty = function (source) {
        var _this = this;
        if (this._dirty)
            return this;
        this._dirty = true;
        // Propagate the dirty state.
        _super.prototype.dirty.call(this, source);
        // recalculate and propagate when we can be sure that all dependencies updated.
        if (this.subscribers || this._eager) {
            Subscribable_1.Subscribable.register_async_emit(function () { return _this.emit(_this.get()); });
        }
        return this;
    };
    ;
    Computed.prototype.get = function () {
        // If this computed type is called inside of another computed type:
        // store the parent listener and replace it with its own for a bit.
        if (Subscribable_1.Subscribable.global_listeners) {
            Subscribable_1.Subscribable.global_listeners.push(this);
        }
        // if it's dirty, or if its in a transaction which delayed the dirty signal, recalculate the value
        if (this._dirty)
            return this._get();
        return this._cache;
    };
    /**
     * Computes the current value of the computed signal and subscribes to any signals it depends on.
     * @returns The current value of the computed signal.
     */
    Computed.prototype._get = function () {
        this._dirty = false;
        var parent_listeners = Subscribable_1.Subscribable.global_listeners;
        var global_listeners = Subscribable_1.Subscribable.global_listeners = [];
        Subscribable_1.Subscribable.global_listeners = global_listeners;
        var value = this.fn();
        // Set all states to 0.
        for (var _i = 0, _a = this.subscribed_to; _i < _a.length; _i++) {
            var sub = _a[_i][0];
            this.subscribed_to.set(sub, 0);
        }
        for (var _b = 0, global_listeners_1 = global_listeners; _b < global_listeners_1.length; _b++) {
            var sub = global_listeners_1[_b];
            if (this.subscribed_to.has(sub)) {
                // mark it as unchanged
                if (this.subscribed_to.get(sub) === 0)
                    this.subscribed_to.set(sub, 1);
            }
            else {
                // specially mark it as new.
                this.subscribed_to.set(sub, -1);
            }
        }
        for (var _c = 0, _d = this.subscribed_to; _c < _d.length; _c++) {
            var _e = _d[_c], signal = _e[0], status_1 = _e[1];
            switch (status_1) {
                // Newly added
                case -1:
                    signal.subscribe(this);
                    break;
                // Status 0 means it's no longer used
                case 0:
                    signal.unsubscribe(this);
                    break;
                // We can ignore 1 (same old)
            }
        }
        // let unique_subscription: Subscribable<any>[] = [];
        // const set = new Set(this.subscribed_to);
        // const new_set = new Set(global_listeners);
        // for (let i = 0; i < this.subscribed_to.length; i++)
        // {
        //     const signal = this.subscribed_to[i];
        //     if (!new_set.has(signal))
        //     {
        //         signal.unsubscribe(this)
        //     }
        //     else
        //     {
        //         unique_subscription.push(signal);
        //     }
        // }
        // for (let i = 0; i < global_listeners.length; i++)
        // {
        //     const signal = global_listeners[i];
        //     if (!set.has(signal))
        //     {
        //         signal.subscribe(this);
        //         set.add(signal);
        //         unique_subscription.push(signal);
        //     }
        // }
        // this.subscribed_to = unique_subscription;
        // If this was called inside another computed signal, switch back to that ones listeners so it can continue on.
        // If it was not inside another listener, set listeners to undefined!
        Subscribable_1.Subscribable.global_listeners = parent_listeners;
        this._cache = value;
        // this.emit(this._cache)
        return value;
    };
    /**
     * Stop any future update of this computed.
     * Call _get() to undo this.
     */
    Computed.prototype.destroy = function () {
        this._dirty = false;
        for (var _i = 0, _a = __spreadArray([], this.subscribed_to.keys(), true); _i < _a.length; _i++) {
            var sub = _a[_i];
            sub.unsubscribe(this);
        }
        this.subscribed_to.clear();
    };
    return Computed;
}(Subscribable_1.Subscribable));
exports.Computed = Computed;
