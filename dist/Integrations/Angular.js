import { NativeSignal } from '../Core/Signal';
import { signal, effect } from "@angular/core";
function equal() { return false; }
export function NativeToAngular(subscribable) {
    if (subscribable["$angular"])
        return subscribable["$angular"];
    // try to initialize it with the current value if it exists, otherwise null
    const result = signal(subscribable.get?.() ?? null, {
        equal
    });
    const listener = (signal, v) => {
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
export function AngularToNative(signal) {
    if (signal["$native-signal"])
        return signal["$native-signal"];
    // try to initialize it with the current value if it exists, otherwise null
    let result;
    try {
        result = new NativeSignal(signal());
    }
    catch (e) {
        result = new NativeSignal(null);
    }
    effect(() => {
        result.set(signal());
    });
    signal["$native-signal"] = result;
    return result;
}
//# sourceMappingURL=Angular.js.map