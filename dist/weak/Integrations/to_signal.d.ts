import { Computed } from "../Core/Computed.js";
import { NativeSignal } from "../Core/NativeSignal.js";
export type OrSignal<T> = T | Computed<T> | NativeSignal<T>;
export declare function to_signal<T>(v: Computed<T> | NativeSignal<T> | undefined | T, fallback: T): Computed<T> | NativeSignal<T>;
export declare function read<T, F>(v: OrSignal<T> | undefined, fallback?: F): T | F;
