import { NativeSignal } from "../Core/NativeSignal";
import { StatefulSubscribable } from "../Core/Subscribable";
export declare function local<T extends NativeSignal<any> | StatefulSubscribable<any>>(key: string, signal: T): T;
