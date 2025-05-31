"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NativeToAngular = NativeToAngular;
exports.AngularToNative = AngularToNative;
var Signal_1 = require("../Core/Signal");
var core_1 = require("@angular/core");
function equal() { return false; }
function NativeToAngular(subscribable) {
    var _a, _b, _c;
    if (subscribable["$angular"])
        return subscribable["$angular"];
    // try to initialize it with the current value if it exists, otherwise null
    var result = (0, core_1.signal)((_c = (_b = (_a = subscribable).get) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : null, {
        equal: equal
    });
    var listener = function (signal, v) {
        result.set(v);
    };
    // Make sure the listener does not GC while the angular signal is held.
    result["$listener"] = listener;
    subscribable.subscribe(listener);
    // Adding or removing items in a native signal collection needs to trigger the emission
    // events for the entire angular signal of the collection (Because Angular has no partial mechanisms).
    // if(subscribable instanceof SignalSet || subscribable instanceof SignalMap)
    // {
    //     (subscribable as SignalSet<any>).on_change.subscribe(()=>result.set(subscribable._internal))
    // }
    // Cache the angular signal so repeated calls of NativeToAngular return the same angular signal.
    subscribable["$angular"] = result;
    return result;
}
function AngularToNative(signal) {
    if (signal["$native-signal"])
        return signal["$native-signal"];
    // try to initialize it with the current value if it exists, otherwise null
    var result;
    try {
        result = new Signal_1.NativeSignal(signal());
    }
    catch (e) {
        result = new Signal_1.NativeSignal(null);
    }
    (0, core_1.effect)(function () {
        result.set(signal());
    });
    signal["$native-signal"] = result;
    return result;
}
