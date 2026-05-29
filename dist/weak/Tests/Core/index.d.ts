export { Computed } from "./Computed.js";
export { default as EventManager } from "./_events.js";
export { NativeSignal, type ReadonlySignal } from "./NativeSignal.js";
export { type Dirtyable, type I_Subscribable, type StatefulSubscribable, Subscribable } from "./Subscribable.js";
/**
 * Run this code inside a computed scope without subscribing to what is happening.
 * @param fn
 */
export declare function detached<T>(fn: () => T): T;
