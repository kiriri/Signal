

// import { NativeSignal } from '../Core/Signal';
// import { I_Subscribable, StatefulSubscribable, Subscribable } from '../Core/Subscribable';
// import {signal, effect, type Signal as AngularSignal} from "@angular/core";

// function equal() { return false }

// /**
//  * Convert a Native Subscribable into an Angular Signal.
//  * @param subscribable 
//  */
// export function NativeToAngular<T>(subscribable: StatefulSubscribable<T>): AngularSignal<T>;
// export function NativeToAngular<T>(subscribable: I_Subscribable<T>): AngularSignal<T | null>
// {
//     if ("$angular" in subscribable)
//         return subscribable["$angular"] as AngularSignal<T>;

//     // try to initialize it with the current value if it exists, otherwise null
//     const result = signal<T>(
//         (subscribable as StatefulSubscribable<T>).get?.() ?? null,
//         {
//             equal
//         }
//     );

//     const listener = (signal, v) =>
//     {
//         result.set(v);
//     };

//     // Make sure the listener does not GC while the angular signal is held.
//     result["$listener"] = listener;

//     subscribable.subscribe(listener);

//     // Adding or removing items in a native signal collection needs to trigger the emission
//     // events for the entire angular signal of the collection (Because Angular has no partial mechanisms).
//     // if(subscribable instanceof SignalSet || subscribable instanceof SignalMap)
//     // {
//     //     (subscribable as SignalSet<any>).on_change.subscribe(()=>result.set(subscribable._internal))
//     // }

//     // Cache the angular signal so repeated calls of NativeToAngular return the same angular signal.
//     subscribable["$angular"] = result;

//     return result;
// }



// export function AngularToNative<T>(signal: AngularSignal<T>): StatefulSubscribable<T>
// {
//     if (signal["$native-signal"])
//         return signal["$native-signal"];

//     // try to initialize it with the current value if it exists, otherwise null

//     let result: NativeSignal<T>;
//     try
//     {
//         result = new NativeSignal<T>(signal());
//     }
//     catch (e)
//     {
//         result = new NativeSignal<T>(null);
//     }

//     effect(() =>
//     {
//         result.set(signal());
//     });

//     signal["$native-signal"] = result;

//     return result;
// }
