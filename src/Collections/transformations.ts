import { NativeSignal } from "../Core/Signal";
import { BufferedSubscribable } from "../Sinks/BufferedSubscribable";
import { I_NativeCollection, ReqColTypes } from "./Collection";
import { Computed } from "../Core/Computed";
import { I_Subscribable, StatefulSubscribable } from "../Core/Subscribable";

// TODO : Maps need to use the same entry in every single event or else we can't store related
// state info.

// Reduce can be done much more efficiently without Computed, 
// but it won't work if the reduce function contains any signals.
// This will completely recalculate the reduced value whenever any of the dependencies changes.
// Otherwise it will partially update the value whenever something is added or removed.
export function reduce_fast<
    ProdValue,
    ProdEvents extends ReqColTypes<ProdValue>,
    Producer extends I_NativeCollection<ProdValue, ProdEvents>,
    ConsValue,
>(
    producer: Producer,
    reducer: (event: ReqColTypes<ProdValue>["add" | "delete"], prev_value: ConsValue) => ConsValue,
    initial_value: ConsValue,
    dependends_on: StatefulSubscribable<any>[],
): NativeSignal<ConsValue>
{
    const result = new NativeSignal(initial_value);

    const dirty_entries = new Map<ProdValue, ReqColTypes<ProdValue>["add" | "delete"]>();
    let fully_dirty = false;

    function reset_value()
    {
        let new_value = initial_value;

        for (let value of producer.get())
            new_value = reducer({ event: "add", value }, new_value);

        result.set(new_value);
        fully_dirty = false;
        dirty_entries.clear();
    }

    result.get = () =>
    {
        if (fully_dirty)
            reset_value();
        else
        {
            let new_value = result._value;
            for (let value of dirty_entries.values())
                new_value = reducer(value, new_value);
            result.set(new_value);
        }

        return result._value;
    }

    if (dependends_on.length > 0)
    {
        const dependency_handler = {
            dirty: function (source?: I_Subscribable<any>)
            {
                fully_dirty = true;
                result.dirty();
            }
        }

        result["dependency_handler"] = dependency_handler; // Bind it so it GCs alongside the result

        for (let dependency of dependends_on)
            dependency.subscribe(dependency_handler);
    }

    producer._on_change_instant.subscribe((_, ve) =>
    {
        // fully dirty will calculate all entries from scratch the next time
        // the result's get() function is called.
        if (fully_dirty)
            return;

        // Either it has added and then deleted, or vice versa. 
        // Either way, skip updating the value altogether
        if (dirty_entries.has(ve["value"]))
            dirty_entries.delete(ve["value"]);
        else
            dirty_entries.set(ve["value"], ve);
    });


    reset_value();

    return result;
}

export function count_fast<V>(collection: I_NativeCollection<V, any>, counter: (event: { event: "add" | "delete", value: V }) => number, depends_on: StatefulSubscribable<any>[])
{
    return reduce_fast(collection, (event, prev) => prev + counter(event as any), 0, depends_on);
}


export function reduce<
    ProdValue,
    ProdEvents extends ReqColTypes<ProdValue>,
    Producer extends I_NativeCollection<ProdValue, ProdEvents>,
    ConsValue,
>(
    producer: Producer,
    reducer: (event: ProdValue, prev_value: ConsValue, state: object) => ConsValue,
    initial_value: ConsValue
): NativeSignal<ConsValue>
{
    // TODO : Replace Native Signal with one which on get forcefully pulls all dirty Computed values
    const result = new NativeSignal(initial_value);

    const listeners = new Map<ProdValue, Computed<ConsValue>>();

    function listen(v: ProdValue)
    {
        // BUG : Computed is late, and result does not force update computed on get
        let computed: Computed<ConsValue>;
        let state = {};
        computed = new Computed<ConsValue>(() =>
        {
            let prev_value = result._value;
            let new_value = reducer(v, prev_value, state);
            result.set(new_value);
            return new_value;
        }, true);

        listeners.set(v, computed);
    }

    function unlisten(v: ProdValue)
    {
        listeners.get(v).destroy();
        listeners.delete(v);
    }

    const values = [...producer.get()];
    for (let i = 0; i < values.length; i++)
        listen(values[i]);

    producer._on_change_instant.subscribe((_, ve) =>
    {
        if (ve['event'] === "add")
            listen(ve['value']);
        else if (ve['event'] === "delete")
            unlisten(ve['value']);
    });

    return result;
}

export function count<
    Producer extends I_NativeCollection<any, any>
>(
    producer: Producer,
    counter: (v: Producer extends I_NativeCollection<infer A, any> ? A : never) => number
)
{
    return reduce(
        producer as any,
        (v: Producer extends I_NativeCollection<infer A, any> ? A : never, prev: number, state: { prev_value?: number }) =>
        {
            let count = counter(v);
            let old_value = state.prev_value ?? 0;
            state.prev_value = count;
            return prev + count - old_value;
        },
        0
    )
}




// Map/Filter

// export function map_fast<
//     ProdValue,
//     ProdEvents extends ReqColTypes<ProdValue>,
//     Producer extends I_NativeCollection<ProdValue, ProdEvents>,
//     ConsValue,
// >(
//     producer: Producer,
//     constructor: {new():I_NativeCollection<ConsValue,any>},
//     handler: (event: ReqColTypes<ProdValue>["add" | "delete"], prev_value: ConsValue) => ConsValue,
//     dependends_on: StatefulSubscribable<any>[],
// ): I_NativeCollection<ConsValue,any>
// {
//     const result = new constructor();

//     const dirty_entries = new Map<ProdValue, ReqColTypes<ProdValue>["add" | "delete"]>();
//     let fully_dirty = false;

//     function reset_value()
//     {
//         let new_value = initial_value;

//         for (let value of producer.get())
//             new_value = handler({ event: "add", value }, new_value);

//         result.set(new_value);
//         fully_dirty = false;
//         dirty_entries.clear();
//     }

//     result.get = () =>
//     {
//         if (fully_dirty)
//             reset_value();
//         else
//         {
//             let new_value = result._value;
//             for (let value of dirty_entries.values())
//                 new_value = handler(value, new_value);
//             result.set(new_value);
//         }

//         return result._value;
//     }

//     if (dependends_on.length > 0)
//     {
//         const dependency_handler = {
//             dirty: function (source?: I_Subscribable<any>)
//             {
//                 fully_dirty = true;
//                 result.dirty();
//             }
//         }

//         result["dependency_handler"] = dependency_handler; // Bind it so it GCs alongside the result

//         for (let dependency of dependends_on)
//             dependency.subscribe(dependency_handler);
//     }

//     producer._on_change_instant.subscribe((_, ve) =>
//     {
//         // fully dirty will calculate all entries from scratch the next time
//         // the result's get() function is called.
//         if (fully_dirty)
//             return;

//         // Either it has added and then deleted, or vice versa. 
//         // Either way, skip updating the value altogether
//         if (dirty_entries.has(ve["value"]))
//             dirty_entries.delete(ve["value"]);
//         else
//             dirty_entries.set(ve["value"], ve);
//     });


//     reset_value();

//     return result;
// }



// function transform<
// ProdValue, 
// ProdEvents extends ReqColTypes<ProdValue>, 
// Producer extends I_NativeCollection<ProdValue,ProdEvents>,
// ConsValue, 
// ConsEvents extends ReqColTypes<ProdValue>, 
// Consumer extends I_NativeCollection<ProdValue,ProdEvents>,

// >(
//     producer:Producer
// )
// {
//     // consumer + producer pattern

//     // Map uses
//     let mapExample : (value:ProdValue)=>ConsValue;
//     // Filter uses (Plus requires ConsValue === ProdValue)
//     let filterExample : (value:ProdValue)=>boolean
//     // Reduce uses (Plus result is single NativeSignal)
//     let reduceExample : (value:ProdValue)=>ConsValue

// }

