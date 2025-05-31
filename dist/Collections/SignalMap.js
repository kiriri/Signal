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
exports.SignalMap = void 0;
var BufferedSubscribable_1 = require("../Sinks/BufferedSubscribable");
var Signal_1 = require("../Core/Signal");
var Subscribable_1 = require("../Core/Subscribable");
var SignalMap = /** @class */ (function (_super) {
    __extends(SignalMap, _super);
    // TODO : return a signal which, using an external predicate function, 
    // tracks the number of entries which are true. (computed deeply)
    // This should use the on_add/delete subscribables to stay up to date. 
    function SignalMap(items) {
        var _this = _super.call(this) || this;
        _this._signals = undefined;
        _this.on_change = new BufferedSubscribable_1.BufferedSubscribable();
        _this._on_change_instant = new Subscribable_1.Subscribable();
        _this.queued = false;
        _this._internal = new Map(items);
        _this._entries = new Map(__spreadArray([], items, true).map(function (kv) { return [kv[0], kv]; }));
        return _this;
    }
    SignalMap.prototype.get = function (key) {
        if (key) {
            return this._internal.get(key);
        }
        if (Subscribable_1.Subscribable.global_listeners)
            Subscribable_1.Subscribable.global_listeners.push(this);
        return this._internal;
    };
    /**
     * This will return a signal containing the value of the entry at the given key.
     * This works even if no value has been assigned yet.
     * The signal will automatically update when the entry changes.
     * Changing the signal to undefined removes the value from this map.
     * Changing it from undefined to something else adds the value to the map under the given key.
     * @param key
     */
    SignalMap.prototype.ref = function (key) {
        var _this = this;
        if (!this._signals)
            this._signals = new Map();
        var result = this._signals.get(key);
        if (!result) {
            var value = this.get(key);
            this._signals.set(key, result = new Signal_1.NativeSignal(value));
            var fn = function (_, v) {
                if (v === undefined) {
                    _this.delete(key);
                }
                else {
                    _this.set(key, v);
                }
            };
            // Anchor fn to the signal, so it gets GC'ed when the signal does.
            result["$refFn"] = fn;
            result.subscribe(fn);
        }
        return result;
    };
    SignalMap.prototype._add = function (value) {
        this.set.apply(this, value);
    };
    SignalMap.prototype.set = function (key, value) {
        var _a, _b;
        if (value === undefined) {
            console.error("Cannot set Signal Map's value to undefined, using null instead!");
            value = null;
        }
        var exists = this._internal.get(key);
        if (exists !== value) {
            var kv = [key, value];
            this._internal.set(key, value);
            this._entries.set(key, kv);
            (_b = (_a = this._signals) === null || _a === void 0 ? void 0 : _a.get(key)) === null || _b === void 0 ? void 0 : _b.set(value);
            if (exists === undefined) {
                this.on_change.emit({ event: "add", value: kv });
                this._on_change_instant.emit({ event: "add", value: kv });
            }
            this.dirty();
        }
    };
    SignalMap.prototype._delete = function (value) {
        this.delete(value[0]);
    };
    SignalMap.prototype.delete = function (key) {
        var _a;
        if (this._internal.delete(key)) {
            var kv = this._entries.get(key);
            this._entries.delete(key);
            var signal = (_a = this._signals) === null || _a === void 0 ? void 0 : _a.get(key);
            if ((signal === null || signal === void 0 ? void 0 : signal.get()) !== undefined)
                signal === null || signal === void 0 ? void 0 : signal.set(undefined);
            this.on_change.emit({ event: "delete", value: kv });
            this._on_change_instant.emit({ event: "delete", value: kv });
            this.dirty();
        }
    };
    SignalMap.prototype.clear = function () {
        var _a;
        this._internal.clear();
        var entries = this._entries.values();
        this._entries.clear();
        for (var _i = 0, entries_1 = entries; _i < entries_1.length; _i++) {
            var kv = entries_1[_i];
            var reference = (_a = this._signals) === null || _a === void 0 ? void 0 : _a.get(kv[0]);
            if (reference)
                reference.set(undefined);
            this.on_change.emit({ event: "delete", value: kv });
            this._on_change_instant.emit({ event: "delete", value: kv });
        }
        this.dirty();
    };
    SignalMap.prototype.has = function (key) {
        return this._internal.has(key);
    };
    SignalMap.prototype.dirty = function (source) {
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
    SignalMap.prototype.emit = function (value) {
        if (value === void 0) { value = this._internal; }
        return _super.prototype.emit.call(this, value);
    };
    return SignalMap;
}(Subscribable_1.Subscribable));
exports.SignalMap = SignalMap;
