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
Object.defineProperty(exports, "__esModule", { value: true });
exports.NativeSignal = void 0;
var Subscribable_1 = require("./Subscribable");
/**
 * Represents a real Subscribable value that is stored in this Signal.
 */
var NativeSignal = /** @class */ (function (_super) {
    __extends(NativeSignal, _super);
    /**
     * Creates a new Signal with an initial value.
     * @param value - The initial value of the signal.
     */
    function NativeSignal(value) {
        var _this = _super.call(this) || this;
        _this.queued = false;
        _this._value = value;
        return _this;
    }
    /**
     * Gets the current value of the signal.
     * If called inside another computed signal, it will add itself to the list of listeners.
     * @returns The current value of the signal.
     */
    NativeSignal.prototype.get = function () {
        if (Subscribable_1.Subscribable.global_listeners)
            Subscribable_1.Subscribable.global_listeners.push(this);
        return this._value;
    };
    /**
     * Sets a new value for the signal and emits it to all subscribers.
     * @param value - The new value to set.
     */
    NativeSignal.prototype.set = function (value) {
        if (value === this._value)
            return;
        this._value = value;
        this.dirty();
    };
    NativeSignal.prototype.update = function (fn) {
        // this.set(fn(this._value));
        var value = fn(this._value);
        if (value === this._value)
            return;
        this._value = value;
        this.dirty();
    };
    NativeSignal.prototype.dirty = function (source) {
        var _this = this;
        // If it's queued for emit(), 
        // then it stands to reason that it has propagated dirty as well.
        if (this.queued)
            return this;
        if (this.subscribers) {
            this.queued = true;
            Subscribable_1.Subscribable.register_async_emit(function () { return _this.emit(); });
        }
        _super.prototype.dirty.call(this, source);
        return this;
    };
    NativeSignal.prototype.emit = function (value) {
        if (value === void 0) { value = this._value; }
        return _super.prototype.emit.call(this, value);
    };
    return NativeSignal;
}(Subscribable_1.Subscribable));
exports.NativeSignal = NativeSignal;
