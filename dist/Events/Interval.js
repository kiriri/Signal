"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Interval = Interval;
var Signal_1 = require("../Core/Signal");
var intervals = new Map();
var registry = new FinalizationRegistry(function (intervalId) {
    clearInterval(intervalId);
    console.log('Interval cleared because nobody used its signal any longer.');
});
// Get an event which fires every delta ms. 
// Events are shared and reused if they have common delta.
// That means events don't fire instantly.
// Events get GCed when they are no longer used.
function Interval(delta) {
    if (!intervals.has(delta)) {
        var signal_1 = new Signal_1.NativeSignal(0);
        // Set up the interval
        var intervalId = setInterval(function () {
            var _a;
            // Don't reference the signal directly, else it won't be able to get GCed because setInterval holds a reference to a function which references the signal. (Which means its permanently pinned in global space).
            var signal = (_a = intervals.get(delta)) === null || _a === void 0 ? void 0 : _a.deref();
            signal === null || signal === void 0 ? void 0 : signal.set(signal._value + 1);
        }, delta);
        // Register the interval ID for cleanup when the signal is garbage collected
        registry.register(signal_1, intervalId);
        intervals.set(delta, new WeakRef(signal_1));
    }
    var signal = intervals.get(delta).deref();
    // Has the signal since been GCed?
    if (!signal) {
        intervals.delete(delta);
        return Interval(delta); // try again from the top.
    }
    return signal;
}
