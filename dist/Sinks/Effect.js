"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Effect = void 0;
var Subscribable_1 = require("../Core/Subscribable");
/**
 * An effect may reference any number of subscribables in its function, but it will only run whenever one of its sources changes.
 */
var Effect = /** @class */ (function () {
    /**
     * Creates a new Computed signal with a function that computes its value.
     * @param fn - The function that computes the value of the computed signal.
     */
    function Effect(sources, 
    // The function that is called to compute the current value of this Subscribable.
    fn) {
        var _this = this;
        var _a, _b, _c;
        this.sources = sources;
        this.fn = fn;
        this._source_cache = {};
        this._updaters = {};
        // Dirty in this case just means that it has registered the deferred emit function.
        this._dirty = false;
        var _loop_1 = function (key) {
            var update_key_function = function (signal, value) {
                _this._source_cache[key] = value;
                if (_this._dirty)
                    return;
                _this._dirty = true;
                Subscribable_1.Subscribable.register_async_emit(function () {
                    _this._dirty = false;
                    _this.fn(_this._source_cache);
                });
            };
            this_1._updaters[key] = update_key_function;
            sources[key].subscribe(update_key_function);
            // Not all subscribables have a value at all times.
            this_1._source_cache[key] = (_c = (_b = (_a = sources[key])["get"]) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : null;
        };
        var this_1 = this;
        for (var key in sources) {
            _loop_1(key);
        }
    }
    /**
     * Instantly removes all event listener references.
     * Call this to make sure an Effect for sure no longer
     * triggers. Without this the garbage collection may
     * take seconds before it cleans up orphaned effects,
     * during which time they will still trigger!
     */
    Effect.prototype.destroy = function () {
        for (var key in this.sources) {
            var source = this.sources[key];
            source.unsubscribe(this._updaters[key]);
        }
    };
    return Effect;
}());
exports.Effect = Effect;
