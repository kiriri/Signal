"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BufferedSubscribable = void 0;
var Subscribable_1 = require("../Core/Subscribable");
var EMPTY = {};
/**
 * Represents a subscribable value that can be observed for changes.
 * Eg an output can be wrapped inside a buffered subscribable to always
 * store the last emitted value, even though outputs themselves are not
 * stateful.
 * That is why when used in a transaction, BufferedSubscribable
 * will emit the history of all changes during the
 * transaction right after.
 */
var BufferedSubscribable = /** @class */ (function () {
    function BufferedSubscribable() {
        var _this = this;
        // Dirty in this case just means that it has registered the deferred emit function.
        this._dirty = false;
        this.buffer = [];
        this.proxy = new Subscribable_1.Subscribable();
        this.on_target_change = function (source, value) {
            _this.buffer.push(value);
            if (_this._dirty)
                return;
            _this._dirty = true;
            Subscribable_1.Subscribable.register_async_emit(function () {
                _this._dirty = false;
                var buffer = _this.buffer;
                _this.buffer = [];
                _this.proxy.emit(buffer);
            });
        };
        this.subscribe = this.proxy.subscribe.bind(this.proxy);
        this.unsubscribe = this.proxy.unsubscribe.bind(this.proxy);
        this.dirty = this.proxy.dirty.bind(this.proxy);
    }
    BufferedSubscribable.prototype.attach = function (target) {
        target.subscribe(this.on_target_change);
        return this;
    };
    BufferedSubscribable.prototype.detach = function (target) {
        target.unsubscribe(this.on_target_change);
        return this;
    };
    /**
     * Please note that Buffered Subscribables by design defers emissions.
     * @param value
     */
    BufferedSubscribable.prototype.emit = function (value) {
        if (value === void 0) { value = EMPTY; }
        this.on_target_change(undefined, value);
    };
    /**
     * Returns the current buffer and resets it internally.
     * Note that this conflicts with attached subscribables, which will
     * not receive the full buffer anymore.
     * @returns
     */
    BufferedSubscribable.prototype.consume = function () {
        var result = this.buffer;
        this.buffer = [];
        this._dirty = false;
        if (Subscribable_1.Subscribable.global_listeners)
            Subscribable_1.Subscribable.global_listeners.push(this.proxy);
        return result;
    };
    return BufferedSubscribable;
}());
exports.BufferedSubscribable = BufferedSubscribable;
