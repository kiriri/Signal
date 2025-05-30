import { BufferedSubscribable } from "../Sinks/BufferedSubscribable";
import { Computed } from "../Core/Computed";
import { NativeSignal, ReadonlySignal } from "../Core/Signal";
import { I_Subscribable, StatefulSubscribable, Subscribable } from "../Core/Subscribable";
import type { I_NativeCollection } from "./Collection";

export type SetEvents<T> = {
    add:{
        event: "add"; 
        value: T;
    },
    delete:{
        event: "delete"; 
        value: T;
    }
};

export class SignalSet<T> extends Subscribable<Set<T>> implements StatefulSubscribable<Set<T>>, I_NativeCollection<T,SetEvents<T>>
{
    readonly _internal: Set<T>;

    // We're using on_change instead of on_add + on_delete so transactions which
    // add and delete the same value in a short time can be historialized in sequence in one buffer.
    on_change = new BufferedSubscribable<SetEvents<T>[keyof SetEvents<T>]>();
    _on_change_instant = new Subscribable<SetEvents<T>[keyof SetEvents<T>]>();

    constructor(items?: Iterable<T> | null | undefined)
    {
        super();
        this._internal = new Set(items);


    }

    get(): Set<T>
    {
        if (Subscribable.global_listeners)
            Subscribable.global_listeners.push(this);

        return this._internal;
    }

    add(value: T)
    {
        let exists = this._internal.has(value);
        if (!exists)
        {
            this._internal.add(value);
            this.on_change.emit({ event: "add", value })
            this._on_change_instant.emit({ event: "add", value })
            this.dirty();
        }
    }

    delete(value: T)
    {
        if (this._internal.delete(value))
        {
            this.on_change.emit({ event: "delete", value })
            this._on_change_instant.emit({ event: "delete", value })
            this.dirty();
        }
    }

    clear()
    {
        let values = [...this._internal.values()];

        this._internal.clear();

        for (let value of values)
        {
            this.on_change.emit({ event: "delete", value })
            this._on_change_instant.emit({ event: "delete", value })
        }

        this.dirty();
    }

    queued = false;
    override dirty(source?: I_Subscribable<any>)
    {
        // If it's queued for emit(),
        // then it stands to reason that it has propagated dirty as well.
        if(this.queued) 
            return this;

        if (this.subscribers)
        {
            this.queued = true;
            Subscribable.register_async_emit(() => this.emit());
        }

        return super.dirty(source);
    }

    override emit(value: Set<T> = this._internal): this
    {
        return super.emit(value);
    }

    has(value: T)
    {
        return this._internal.has(value);
    }

    count(fn:(v:T)=>number, subscribe:boolean = true):ReadonlySignal<number>
    {
        const result = new NativeSignal(0);

        const listeners = new Map<T,Computed<number>>()

        // This is very inefficient. Like 

        function listen(v:T)
        {
            let computed: Computed<number>; 
            computed = new Computed<number>(()=>{
                let old_value = computed?._cache ?? 0;
                let new_value = fn(v);
                result.set(result._value + new_value - old_value);
                return new_value;
            }, true);

            listeners.set(v,computed);
        }

        function unlisten(v:T)
        {
            listeners.get(v).destroy();
            listeners.delete(v);
        }

        const values = [...this.get().values()];
        for (let i = 0; i < values.length; i++)
        {
            listen(values[i]);
        }


        this._on_change_instant.subscribe((_,ve: { value: T, event: "add" | "delete" }) =>
        {
            let { value, event } = ve;
            if (event === "add")
            {
                listen(value);
            }
            else if (event === "delete")
            {
                unlisten(value);
            }
        });

        return result;
    }



    // count2(fn:(v:T)=>number):Omit<NativeSignal<number>,"set">
    // {
    //     // Ideally we only check for changes the moment the result's get() is called
    //     // But we still have to keep track of which  elements were added/removed and which signal elements changed.

    //     const on_change = new BufferedSubscribable<{ event: "add" | "delete", value: T }>();
    //     this.on_change_instant.subscribe(on_change);

    //     const result = new Computed<number>(()=>{
    //         let changes = on_change.consume();
    //     });


    //     const listeners = new Map<T,Computed<number>>()

    //     // This is very inefficient. Like 

    //     function listen(v:T)
    //     {
    //         let computed: Computed<number>; 
    //         computed = new Computed<number>(()=>{
    //             let old_value = computed?._cache ?? 0;
    //             let new_value = fn(v);
    //             result.set(result._value + new_value - old_value);
    //             return new_value;
    //         }, true);

    //         listeners.set(v,computed);
    //     }

    //     function unlisten(v:T)
    //     {
    //         listeners.get(v).destroy();
    //         listeners.delete(v);
    //     }

    //     const values = [...this.get().values()];
    //     for (let i = 0; i < values.length; i++)
    //     {
    //         listen(values[i]);
    //     }


    //     this.on_change_instant.subscribe((_,ve: { value: T, event: "add" | "delete" }) =>
    //     {
    //         let { value, event } = ve;
    //         if (event === "add")
    //         {
    //             listen(value);
    //         }
    //         else if (event === "delete")
    //         {
    //             unlisten(value);
    //         }
    //     });

    //     return result;
    // }


    // map<R>(fn:(v:T)=>R):Omit<SignalSet<R>,"set">
    // {

    //     return this;
    // }

    /**
     * Presuming the values in this set remain constant (or at least their evaluation of the predicate does)
     * This will return the number of entries which result in true for this predicate.
     * @param predicate 
     */
    // some_constants(predicate: (v: T) => boolean): StatefulSubscribable<number>
    // {
    //     const true_values = new Set<T>();

    //     let counter = 0;

    //     const values = [...this._internal.values()];
    //     for (let i = 0; i < values.length; i++)
    //     {
    //         const value = values[i];
    //         if (predicate(value))
    //         {
    //             true_values.add(value);
    //             counter++;
    //         }
    //     }

    //     const signal = new NativeSignal(counter);

    //     this.on_change.subscribe((_,values) =>
    //     {
    //         for (let { value, event } of values)
    //         {
    //             if (event === "add")
    //             {
    //                 if (predicate(value))
    //                 {
    //                     true_values.add(value);
    //                     counter++;
    //                 }
    //             }
    //             else if (event === "delete")
    //             {
    //                 if (true_values.has(value))
    //                 {
    //                     true_values.delete(value);
    //                     counter--;
    //                 }
    //             }
    //         }
    //         signal.set(counter);
    //     });

    //     return signal;
    // }

    
}

/**
 * Create what is essentially a very smart reduce() compute.
 * This kind of signal is somewhat expensive to initialize, but it hooks directly into change events
 * of the set so it updates much faster,especially for large sets with sporadic point changes. 
 * @param set 
 * @param operation 
 */
// export function SignalSetOperation(set: SignalSet<number>, operation: "sum" | "product"): StatefulSubscribable<number>;
// export function SignalSetOperation(set: SignalSet<StatefulSubscribable<number>>, operation: "sum" | "product", use_states: true): StatefulSubscribable<number>;
// export function SignalSetOperation(set: SignalSet<number> | SignalSet<StatefulSubscribable<number>>, operation: "sum" | "product", use_states?: boolean): StatefulSubscribable<number>
// {
//     if (use_states)
//     {
//         // type hinting
//         const _set = set as SignalSet<StatefulSubscribable<number>>;
//         // the last stored value for each subscribable.
//         const _cache = new Map<StatefulSubscribable<number>, number>();
//         // a list of subscription functions for use in unsubscribing.
//         const _cached_subscribers = new Map<StatefulSubscribable<number>, (source:Subscribable<number>,v: number) => any>();

//         const result = new NativeSignal(0);


//         if (operation === "sum")
//         {
//             result._value = [..._set.get().values()].reduce((prev, v) => prev + v.get(), 0);
//         }
//         else
//         {
//             result._value = [..._set.get().values()].reduce((prev, v) => prev * v.get(), 1);
//         }

//         const listen_to_item = operation === "sum" ?
//             function listen_to_item_sum(item: StatefulSubscribable<number>)
//             {
//                 function on_change(source:Subscribable<number>,new_value: number)
//                 {
//                     const old_value = _cache.get(item) ?? 1;

//                     if (old_value === new_value)
//                         return;

//                     result.update(product => product + new_value - old_value)

//                     _cache.set(item, new_value);
//                 }

//                 item.subscribe(on_change, false);
//                 _cached_subscribers.set(item, on_change);
//             } :
//             function listen_to_item_product(item: StatefulSubscribable<number>)
//             {
//                 function on_change(source:Subscribable<number>,new_value: number)
//                 {
//                     const old_value = _cache.get(item) ?? 1;

//                     if (old_value === new_value)
//                         return;

//                     result.update(product => product * new_value / old_value)

//                     _cache.set(item, new_value);
//                 }

//                 item.subscribe(on_change, false);
//                 _cached_subscribers.set(item, on_change);
//             }

//         const handle_set_change = operation === "sum" ?
//             function on_add_sum(source:Subscribable<{ value: StatefulSubscribable<number>, event: "add" | "delete" }[]>, values: { value: StatefulSubscribable<number>, event: "add" | "delete" }[])
//             {
//                 for (let { value, event } of values)
//                 {
//                     if (event === "add")
//                     {
//                         result.set(result._value + value.get());
//                         listen_to_item(value);
//                     }
//                     else
//                     {
//                         result.set(result._value - value.get());
//                         value.unsubscribe(_cached_subscribers.get(value)!)
//                     }
//                 }
//             } :
//             function on_add_product(source:Subscribable<{ value: StatefulSubscribable<number>, event: "add" | "delete" }[]>,values: { value: StatefulSubscribable<number>, event: "add" | "delete" }[])
//             {
//                 for (let { value, event } of values)
//                 {
//                     if (event === "add")
//                     {
//                         result.set(result._value * value.get());
//                         listen_to_item(value);
//                     }
//                     else
//                     {
//                         result.set(result._value / value.get());
//                         value.unsubscribe(_cached_subscribers.get(value)!)
//                     }
//                 }
//             }

//         const initial_values = [..._set.get().values()];
//         for (const v of initial_values)
//         {
//             listen_to_item(v);
//         }

//         _set.on_change.subscribe(handle_set_change);



//         return result;

//     }

//     switch (operation)
//     {
//         //    const result = new Signal([..._set.get().values()].reduce((prev,v)=>prev * v.get(), 1));

//         case "sum":
//             return new Computed(() =>
//             {
//                 return [...(set as SignalSet<number>).get().values()].reduce((prev, v) => prev + v, 0);
//             })
//         case "product":
//             return new Computed(() =>
//             {
//                 return [...(set as SignalSet<number>).get().values()].reduce((prev, v) => prev * v, 1);
//             })
//     }
// }
