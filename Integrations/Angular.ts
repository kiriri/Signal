import { StatefulSubscribable, Subscribable } from '../Subscribable';
import { signal, Signal as AngularSignal } from '@angular/core';

export function AngularSignal<T>(subscribable:StatefulSubscribable<T>) : AngularSignal<T>;
export function AngularSignal<T>(subscribable:Subscribable<T>) : AngularSignal<T|null>
{
    if(subscribable["$angular"])
        return subscribable["$angular"];

    // try to initialize it with the current value if it exists, otherwise null
    const result = signal<T>((subscribable as StatefulSubscribable<T>).get?.() ?? null); 
    subscribable.subscribe(v=>{
        result.set(v);
    });

    subscribable["$angular"] = result;

    return result;
}