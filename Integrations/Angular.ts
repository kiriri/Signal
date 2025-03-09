//@ts-nocheck

import { NativeSignal } from '../Signal';
import { SignalMap } from '../SignalMap';
import { SignalSet } from '../SignalSet';
import { StatefulSubscribable, Subscribable } from '../Subscribable';
import { signal, Signal as AngularSignal, effect } from '@angular/core';


export function AngularSignal<T>(subscribable:StatefulSubscribable<T>) : AngularSignal<T>;
export function AngularSignal<T>(subscribable:Subscribable<T>) : AngularSignal<T|null>
{
    if(subscribable["$angular"])
        return subscribable["$angular"];

    // try to initialize it with the current value if it exists, otherwise null
    const result = signal<T>((subscribable as StatefulSubscribable<T>).get?.() ?? null,{
        equal:()=>false
    }); 
    subscribable.subscribe(v=>{
        result.set(v);
    });

    if(subscribable instanceof SignalSet || subscribable instanceof SignalMap)
    {
        (subscribable as SignalSet<any>).on_change.subscribe(()=>result.set(subscribable._internal))
    }

    subscribable["$angular"] = result;

    return result;
}



export function AngularToSignal<T>(signal:AngularSignal<T>) : StatefulSubscribable<T>
{
    if(signal["$native-signal"])
        return signal["$native-signal"];

    // try to initialize it with the current value if it exists, otherwise null
    
    let result : NativeSignal<T>;
    try
    {
        result = new NativeSignal<T>(signal()); 
    }
    catch(e)
    {
        result = new NativeSignal<T>(null);
    }
    
    effect(()=>{
        result.set(signal());
    });

    signal["$native-signal"] = result;

    return result;
}








export function AdvancedState<T extends Object, O extends Object>(self:T, jit:()=>O = ()=>({}))
{
    return new Proxy(self,{

    }) as T & ReturnType<typeof jit>// & and the mapped O return values!
}