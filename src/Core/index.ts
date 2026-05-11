import EventManager from "./_events.js";

export { Computed } from "./Computed.js";
export { default as EventManager } from "./_events.js";
export { NativeSignal, type ReadonlySignal } from "./NativeSignal.js";
export { type Dirtyable, type I_Subscribable, type StatefulSubscribable, Subscribable } from "./Subscribable.js";


/**
 * Run this code inside a computed scope without subscribing to what is happening.
 * @param fn 
 */
export function detached<T>(fn: () => T): T
{
    // We don't actually touch the listener array.
    // It has its own relative offset which will keep working.
    // But global_listen is the only variable we only assert for when checking if
    // we need to register our getter with the EventManager.
    let real_listener_count = EventManager.global_listen;
    EventManager.global_listen = 0;
    const res = fn();
    EventManager.global_listen = real_listener_count;
    return res;
}