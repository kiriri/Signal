import { Computed } from "../Core/Computed.js";
import { NativeSignal } from "../Core/NativeSignal.js";

export type OrSignal<T> = T | Computed<T> | NativeSignal<T>;

export function to_signal<T>(v: Computed<T> | NativeSignal<T> | undefined | T, fallback: T): Computed<T> | NativeSignal<T>
{
    if (v instanceof NativeSignal || v instanceof Computed) return v;
    return new NativeSignal<T>((v !== undefined ? v : fallback)! as T);
}

export function read<T, F>(v: OrSignal<T> | undefined, fallback ?: F): T | F
{
    return v && typeof (v as any).get === "function" ? (v as any).get() : (v as T);
}