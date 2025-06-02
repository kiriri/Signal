import { StatefulSubscribable } from '../Core/Subscribable';
import { type Signal as AngularSignal } from "@angular/core";
/**
 * Convert a Native Subscribable into an Angular Signal.
 * @param subscribable
 */
export declare function NativeToAngular<T>(subscribable: StatefulSubscribable<T>): AngularSignal<T>;
export declare function AngularToNative<T>(signal: AngularSignal<T>): StatefulSubscribable<T>;
