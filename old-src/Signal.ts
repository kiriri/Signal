

import { StatefulSubscribable, Subscribable } from "./Subscribable";

/**
 * Represents a real Subscribable value that is stored in this Signal. 
 */
export class NativeSignal<T> extends Subscribable<T> implements StatefulSubscribable<T>
{

    // The internal value. Only get it directly if you want to make sure no computed type subscribes to it.
    _value: T;

    /**
     * Creates a new Signal with an initial value.
     * @param value - The initial value of the signal.
     */
    constructor(value: T)
    {
        super();
        this._value = value;
    }

    // subscribe(fn: (value: T) => any): this
    // {
    //     super.subscribe(fn);

    //     fn(this.get());

    //     return this;
    // }

    /**
     * Gets the current value of the signal.
     * If called inside another computed signal, it will add itself to the list of listeners.
     * @returns The current value of the signal.
     */
    get(): T
    {
        if (Subscribable.global_listeners)
            Subscribable.global_listeners.push(this);
        return this._value;
    }

    /**
     * Sets a new value for the signal and emits it to all subscribers.
     * @param value - The new value to set.
     */
    set(value: T): void
    {
        if(value === this._value)
            return;
        this._value = value;
        this.emit(value)
    }

    update(fn:(v:T)=>T)
    {
        // this.set(fn(this._value));
        const value = fn(this._value);
        if(value === this._value)
            return;
        this._value = value;
        this.emit(value)
    }

    override emit(value: T = this._value): void
    {
        

        super.emit(value);
    }
}

// const prototype_res = {
//     subscribe(this:Signal<any>, fn: (value: any) => any)
//     {
//         if (Subscribable.global_listeners)
//             Subscribable.global_listeners.push(this);
        
//         if (!this.subscribers)
//             this.subscribers = new Set();

//         this.subscribers.add(fn);
//     },

//     /**
//      * Unsubscribes a function from being called when the value of this Subscribable changes.
//      * @param fn - The function to unsubscribe.
//      */
//     unsubscribe(this:Signal<any>, fn: (value: any) => any)
//     {
//         if (this.subscribers)
//             this.subscribers.delete(fn);
//     },
//     emit(this:Signal<any>, value)
//     {
//         if (this.subscribers)
//             this.subscribers.forEach(subscriber =>subscriber(value))
//     },
//     get(this:Signal<any>): any
//     {
//         if (Subscribable.global_listeners)
//             Subscribable.global_listeners.push(this);
//         return this._value as any;
//     },
//     set(this:Signal<any>, value: any): void
//     {
//         this._value = value;
//         this.emit(value)
//     }
// } as Signal<any>;

// const proto_function = 

// This is somehow MUCH slower. Probably the extra function creation?
// export function signal<T>(value: T)
// {
    
//     const res = {
//         _value:value,
//         subscribers:undefined,
//         emit:undefined!,
//         get:undefined!,
//         set:undefined!,
//         subscribe:undefined!,
//         unsubscribe:undefined!
//     } as Signal<T>;

//     res["emit"] = prototype_res["emit"].bind(res);
//     res["subscribe"] = prototype_res["subscribe"].bind(res);
//     res["unsubscribe"] = prototype_res["unsubscribe"].bind(res);
//     res["get"] = prototype_res["get"].bind(res);
//     res["set"] = prototype_res["set"].bind(res);
//     res["set"] = prototype_res["set"].bind(res);

//     return res;
// }