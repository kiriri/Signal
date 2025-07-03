import { Eventable } from "src/Core/Eventable";
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
        event:string;
        value:any
    }
};

export interface I_NativeCollection<T, Events extends ReqColTypes<T> = ReqColTypes<T>> extends Eventable<Events>{
    // _on_change: BufferedSubscribable<Events[keyof Events]>;
    // _on_change_instant: Subscribable<Events[keyof Events]>;
    get(): Iterable<T>;

    // _add(value:T);
    // _delete(value:T);
}
