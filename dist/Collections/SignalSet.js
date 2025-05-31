"use strict";
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
exports.SignalSet = void 0;
var BufferedSubscribable_1 = require("../Sinks/BufferedSubscribable");
var Computed_1 = require("../Core/Computed");
var Signal_1 = require("../Core/Signal");
var Subscribable_1 = require("../Core/Subscribable");
var SignalSet = /** @class */ (function (_super) {
    __extends(SignalSet, _super);
    function SignalSet(items) {
        var _this = _super.call(this) || this;
        // We're using on_change instead of on_add + on_delete so transactions which
        // add and delete the same value in a short time can be historialized in sequence in one buffer.
        _this.on_change = new BufferedSubscribable_1.BufferedSubscribable();
        _this._on_change_instant = new Subscribable_1.Subscribable();
        _this.queued = false;
        _this._internal = new Set(items);
        return _this;
    }
    SignalSet.prototype.get = function () {
        if (Subscribable_1.Subscribable.global_listeners)
            Subscribable_1.Subscribable.global_listeners.push(this);
        return this._internal;
    };
    SignalSet.prototype._add = function (value) {
        this.add(value);
    };
    SignalSet.prototype.add = function (value) {
        var exists = this._internal.has(value);
        if (!exists) {
            this._internal.add(value);
            this.on_change.emit({ event: "add", value: value });
            this._on_change_instant.emit({ event: "add", value: value });
            this.dirty();
        }
    };
    SignalSet.prototype._delete = function (value) {
        this.delete(value);
    };
    SignalSet.prototype.delete = function (value) {
        if (this._internal.delete(value)) {
            this.on_change.emit({ event: "delete", value: value });
            this._on_change_instant.emit({ event: "delete", value: value });
            this.dirty();
        }
    };
    SignalSet.prototype.clear = function () {
        var values = __spreadArray([], this._internal.values(), true);
        this._internal.clear();
        for (var _i = 0, values_1 = values; _i < values_1.length; _i++) {
            var value = values_1[_i];
            this.on_change.emit({ event: "delete", value: value });
            this._on_change_instant.emit({ event: "delete", value: value });
        }
        this.dirty();
    };
    SignalSet.prototype.dirty = function (source) {
        var _this = this;
        // If it's queued for emit(),
        // then it stands to reason that it has propagated dirty as well.
        if (this.queued)
            return this;
        if (this.subscribers) {
            this.queued = true;
            Subscribable_1.Subscribable.register_async_emit(function () { return _this.emit(); });
        }
        return _super.prototype.dirty.call(this, source);
    };
    SignalSet.prototype.emit = function (value) {
        if (value === void 0) { value = this._internal; }
        return _super.prototype.emit.call(this, value);
    };
    SignalSet.prototype.has = function (value) {
        return this._internal.has(value);
    };
    SignalSet.prototype.count = function (fn, subscribe) {
        if (subscribe === void 0) { subscribe = true; }
        var result = new Signal_1.NativeSignal(0);
        var listeners = new Map();
        // This is very inefficient. Like 
        function listen(v) {
            var computed;
            computed = new Computed_1.Computed(function () {
                var _a;
                var old_value = (_a = computed === null || computed === void 0 ? void 0 : computed._cache) !== null && _a !== void 0 ? _a : 0;
                var new_value = fn(v);
                result.set(result._value + new_value - old_value);
                return new_value;
            }, true);
            listeners.set(v, computed);
        }
        function unlisten(v) {
            listeners.get(v).destroy();
            listeners.delete(v);
        }
        var values = __spreadArray([], this.get().values(), true);
        for (var i = 0; i < values.length; i++) {
            listen(values[i]);
        }
        this._on_change_instant.subscribe(function (_, ve) {
            var value = ve.value, event = ve.event;
            if (event === "add") {
                listen(value);
            }
            else if (event === "delete") {
                unlisten(value);
            }
        });
        return result;
    };
    return SignalSet;
}(Subscribable_1.Subscribable));
exports.SignalSet = SignalSet;
/**
 * Create what is essentially a very smart reduce() compute.
 * This kind of signal is somewhat expensive to initialize, but it hooks directly into change events
 * of the set so it updates much faster,especially for large sets with sporadic point changes.
 * @param set
 * @param operation
 */
// export function SignalSetOperation(set: SignalSet<number>, operation: "sum" | "product"): StatefulSubscribable<number>;
// export function SignalSetOperation(set: SignalSet<StatefulSubscribable<number>>, operation: "sum" | "product", use_states: true): StatefulSubscribable<number>;
// export function SignalSetOperation(set: SignalSet<number> | SignalSet<StatefulSubscribable<number>>, operation: "sum" | "product", use_states?: boolean): StatefulSubscribable<number>
// {
//     if (use_states)
//     {
//         // type hinting
//         const _set = set as SignalSet<StatefulSubscribable<number>>;
//         // the last stored value for each subscribable.
//         const _cache = new Map<StatefulSubscribable<number>, number>();
//         // a list of subscription functions for use in unsubscribing.
//         const _cached_subscribers = new Map<StatefulSubscribable<number>, (source:Subscribable<number>,v: number) => any>();
//         const result = new NativeSignal(0);
//         if (operation === "sum")
//         {
//             result._value = [..._set.get().values()].reduce((prev, v) => prev + v.get(), 0);
//         }
//         else
//         {
//             result._value = [..._set.get().values()].reduce((prev, v) => prev * v.get(), 1);
//         }
//         const listen_to_item = operation === "sum" ?
//             function listen_to_item_sum(item: StatefulSubscribable<number>)
//             {
//                 function on_change(source:Subscribable<number>,new_value: number)
//                 {
//                     const old_value = _cache.get(item) ?? 1;
//                     if (old_value === new_value)
//                         return;
//                     result.update(product => product + new_value - old_value)
//                     _cache.set(item, new_value);
//                 }
//                 item.subscribe(on_change, false);
//                 _cached_subscribers.set(item, on_change);
//             } :
//             function listen_to_item_product(item: StatefulSubscribable<number>)
//             {
//                 function on_change(source:Subscribable<number>,new_value: number)
//                 {
//                     const old_value = _cache.get(item) ?? 1;
//                     if (old_value === new_value)
//                         return;
//                     result.update(product => product * new_value / old_value)
//                     _cache.set(item, new_value);
//                 }
//                 item.subscribe(on_change, false);
//                 _cached_subscribers.set(item, on_change);
//             }
//         const handle_set_change = operation === "sum" ?
//             function on_add_sum(source:Subscribable<{ value: StatefulSubscribable<number>, event: "add" | "delete" }[]>, values: { value: StatefulSubscribable<number>, event: "add" | "delete" }[])
//             {
//                 for (let { value, event } of values)
//                 {
//                     if (event === "add")
//                     {
//                         result.set(result._value + value.get());
//                         listen_to_item(value);
//                     }
//                     else
//                     {
//                         result.set(result._value - value.get());
//                         value.unsubscribe(_cached_subscribers.get(value)!)
//                     }
//                 }
//             } :
//             function on_add_product(source:Subscribable<{ value: StatefulSubscribable<number>, event: "add" | "delete" }[]>,values: { value: StatefulSubscribable<number>, event: "add" | "delete" }[])
//             {
//                 for (let { value, event } of values)
//                 {
//                     if (event === "add")
//                     {
//                         result.set(result._value * value.get());
//                         listen_to_item(value);
//                     }
//                     else
//                     {
//                         result.set(result._value / value.get());
//                         value.unsubscribe(_cached_subscribers.get(value)!)
//                     }
//                 }
//             }
//         const initial_values = [..._set.get().values()];
//         for (const v of initial_values)
//         {
//             listen_to_item(v);
//         }
//         _set.on_change.subscribe(handle_set_change);
//         return result;
//     }
//     switch (operation)
//     {
//         //    const result = new Signal([..._set.get().values()].reduce((prev,v)=>prev * v.get(), 1));
//         case "sum":
//             return new Computed(() =>
//             {
//                 return [...(set as SignalSet<number>).get().values()].reduce((prev, v) => prev + v, 0);
//             })
//         case "product":
//             return new Computed(() =>
//             {
//                 return [...(set as SignalSet<number>).get().values()].reduce((prev, v) => prev * v, 1);
//             })
//     }
// }
