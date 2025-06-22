import { Subscribable } from "../Core/Subscribable";
import { BufferedSubscribable } from "../Sinks/BufferedSubscribable";


export type ReqColTypes<T> =  {
    add:{
        event: "add"; 
        value: T;
    },
    delete:{
        event: "delete"; 
        value: T;
    },
    [K:Exclude<string,"add"|"delete">]:{
        event:string
    }
};

export interface I_NativeCollection<T, Events extends ReqColTypes<T> = ReqColTypes<T>>{
    // _on_change: BufferedSubscribable<Events[keyof Events]>;
    // _on_change_instant: Subscribable<Events[keyof Events]>;
    get(): Iterable<T>;

    _add(value:T);
    _delete(value:T);

    subscribe_event<K extends keyof Event>(fn:(source:Subscribable<any,any>,event:Events[K])=>any, event?:K);
    emit_event<K extends keyof Event>(event:Events[K]);
}
