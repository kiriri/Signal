import { NativeSignal } from "../Signal";
import { StatefulSubscribable } from "../Subscribable";

export function local<T extends NativeSignal<any> | StatefulSubscribable<any>>(key:string, signal: T) : T
{
    signal.subscribe((v)=>{
        localStorage.setItem(key, JSON.stringify(v));
    },false);

    const initial_value = localStorage.getItem(key);
    if(initial_value !== null)
    {
        if("set" in signal)
        {
            signal.set(JSON.parse(initial_value));
        }
    }
    else
    {
        localStorage.setItem(key, JSON.stringify(signal.get()))
    }

    return signal;
}
