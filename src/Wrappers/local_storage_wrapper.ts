import { NativeSignal } from "../Core/NativeSignal";
import { StatefulSubscribable } from "../Core/Subscribable";

/**
 * Bind a stateful signal to `localStorage` under `key`.
 *
 * On call:
 *   - Subscribes to the signal so every change is JSON-stringified into localStorage.
 *   - If `key` already has a value in localStorage, parses it and `set`s the signal
 *     to it (only if the signal supports `set`).
 *   - If `key` is empty, seeds localStorage with the signal's current `get()` value.
 *
 * Returns the same signal you passed in.
 *
 * **Caveats.**
 *  - JSON only — values that don't round-trip through JSON.stringify/parse will misbehave.
 *  - The subscriber callback is anonymous, so per the framework's GC model it lives only
 *    as long as the signal does. Keep a reference to the signal if you want persistence
 *    to keep working.
 *  - Browser-only: this throws in any environment without `localStorage`.
 */
export function local<T extends NativeSignal<any> | StatefulSubscribable<any>>(key: string, signal: T): T
{

    const initial_value = localStorage.getItem(key);
    if (initial_value !== null)
    {
        if ("set" in signal)
        {
            signal.set(JSON.parse(initial_value));
        }
    }

    signal.subscribe((s, v) =>
    {
        localStorage.setItem(key, JSON.stringify(v));
    });
    
    if(initial_value === null)
    {
        localStorage.setItem(key, JSON.stringify(signal.get()))
    }

    return signal;
}