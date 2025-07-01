import { NativeSignal } from "../Core/NativeSignal";
import { Computed } from "../Core/Computed";
// TODO : Maps need to use the same entry in every single event or else we can't store related
// state info.
/**
 *
 * @param source
 * @param identityValue
 * @param opts
 * @param merger Uses identityValue on delete! Applies relative changes based on previous and current value.
 * @param mapper Optionally map any added or updated value
 * @returns
 */
export function reduce_generic(source, identityValue, opts) {
    const output = opts.output ?? new NativeSignal(identityValue);
    const unpackSignals = opts.unpackSignals ?? false;
    const lazy = opts.lazy ?? false;
    const dependencies = opts.dependencies;
    const merger = opts.merger;
    const mapper = opts.mapper;
    const cache = new Map();
    let fully_dirty = false;
    if (dependencies && dependencies.length > 0) {
        const dependency_handler = {
            dirty: function (source) {
                fully_dirty = true;
                output.dirty();
            }
        };
        output["dependency_handler"] = dependency_handler; // Bind it so it GCs alongside the result
        for (let dependency of dependencies)
            dependency.subscribe(dependency_handler);
    }
    // Lazy Mode. Avoid duplicate mapper/merger calls for entries which change multiple times within the same async time slice.
    // This is significantly faster if you make many changes at a time.
    if (lazy) {
        let dirty = new Map();
        function lazy_apply(source, value) {
            if (fully_dirty)
                return;
            dirty.set(source, value);
            output.dirty();
        }
        function apply_all_dirty() {
            const dirty_values = (fully_dirty ? new Map([...source.get()].map(v => [v, v])) : dirty.entries());
            dirty.clear();
            for (let kv of dirty_values) {
                const key = kv[0];
                if (unpackSignals)
                    kv[1] = kv[1].get();
                const value = mapper ? mapper?.(kv[1]) : kv[1];
                let cacheItem = cache.get(key);
                let prevValue;
                if (!cacheItem) {
                    if (unpackSignals) {
                        listen(key);
                    }
                }
                else {
                    prevValue = cacheItem.prev;
                    cacheItem.prev = value;
                }
                merger(key, output, value, prevValue);
            }
        }
        const original_get = output.get.bind(output);
        output.get = (...args) => {
            if (apply_all_dirty || dirty.size > 0)
                apply_all_dirty();
            return original_get(...args);
        };
        function listen(signal) {
            cache.set(signal, {
                prev: identityValue,
                ref: signal.subscribe(lazy_apply)
            });
        }
        function unlisten(signal) {
            let ref = cache.get(signal).ref;
            signal.unsubscribe(ref);
            cache.delete(signal);
            dirty.delete(signal);
        }
        for (let initial_value of source.get()) {
            lazy_apply(initial_value, initial_value);
        }
        source.subscribe_event((_, ve) => {
            if (lazy) {
                switch (ve.event) {
                    // TODO : lazy only listens when get() is called for the first time
                    // it also only updates the value at that time, all changed entries at once. 
                    case "add":
                        lazy_apply(ve.value, ve.value);
                        break;
                    case "delete":
                        lazy_apply(ve.value, unpackSignals ? { get() { return identityValue; } } : identityValue);
                        if (unpackSignals) {
                            unlisten(ve["value"]);
                        }
                        break;
                    case "update":
                        lazy_apply(ve.value, ve.value);
                        break;
                    default: break;
                }
            }
        });
    }
    // Non Lazy Mode : As soon as a change occurs, mapper and merger get called. 
    else {
        function apply_value(sourceItem, value, unpack = unpackSignals) {
            if (unpack) {
                value = value?.get(); // can be undefined if the value was removed from the source collection and the change event triggered before the delete one did.
            }
            let state = cache.get(sourceItem);
            let prev_value = state?.prev ?? identityValue;
            if (state)
                state.prev = value;
            else {
                cache.set(sourceItem, { prev: value, ref: null });
            }
            merger(sourceItem, output, value, prev_value);
        }
        for (let initial_value of source.get()) {
            apply_value(initial_value, mapper?.(initial_value) ?? initial_value);
        }
        function listen(signal) {
            cache.set(signal, {
                prev: identityValue,
                ref: signal.subscribe(apply_value)
            });
        }
        function unlisten(signal) {
            let ref = cache.get(signal).ref;
            signal.unsubscribe(ref);
            cache.delete(signal);
        }
        source.subscribe_event((_, ve) => {
            let original_value = ve["value"];
            let value = mapper ? mapper(original_value) : original_value;
            switch (ve.event) {
                case "add":
                    apply_value(original_value, value);
                    if (unpackSignals) {
                        listen(original_value);
                    }
                    break;
                case "delete":
                    if (unpackSignals) {
                        unlisten(original_value);
                    }
                    else {
                        apply_value(original_value, identityValue, false);
                    }
                    break;
                case "update":
                    apply_value(original_value, value);
                    if (unpackSignals) {
                        throw new Error("Unpack Signals w/ update events not implemented yet! How do we unsubscribe from the old signal then?");
                        // unlisten(original_value);
                        // listen(original_value);
                    }
                    break;
                default: break;
            }
        });
    }
    return output;
}
/**
 * It doesn't matter if we map changes to a single nativeSignal or a collection.
 * Just provide the output directly, and the way that changes are merged into it.
 * @param producer
 * @param output
 */
// export function reduceGeneric<
//     const Producer extends I_NativeCollection<any, any>,
//     const Output extends Subscribable<any>,
//     const OPTS extends {
//         lazy?: boolean, // if true, override the get() function of the output to make it lazy. Default true
//         unpackSignals?: boolean, // if signal, expect all values in the target to be subscribable and rerun the reduction any time they change using a synthetic {event:"update", value} event.
//         computed?: boolean,
//         dependencies?: Subscribable<any>[], // if any of these change, recalculate all
//     },
// >(
//     producer: Producer,
//     output: Output,
//     opts: OPTS,
//     processor: (
//         event: {
//             event: "add" | "delete" | "update";
//             value: typeof producer extends I_NativeCollection<infer V, any> ? (
//                 typeof opts["unpackSignals"] extends true ? (
//                     V extends I_Subscribable<infer V2> ? V2 : never
//                 ) : V
//             ) : never;
//         }
//     ) => void
// ): Output
// {
//     const lazy = opts.lazy ?? true;
//     const unpackSignals = opts.unpackSignals ?? false;
//     const computed = opts.computed ?? false;
//     const dependencies = opts.dependencies;
//     const use_dependencies = !!dependencies;
//     if (computed && (unpackSignals || use_dependencies))
//     {
//         throw new Error("Reduce should either use a computed function, or manual dependencies + unpackSignals. Don't combine opts.computed with dependencies/unpackSignals, it only degrades performance.")
//     }
//     type InputValue = Output extends Subscribable<infer V> ? V : never;
//     type OutputValue = typeof producer extends I_NativeCollection<infer V, any> ? (
//         typeof opts["unpackSignals"] extends true ? (
//             V extends I_Subscribable<infer V2> ? V2 : never
//         ) : V
//     ) : never;
//     const dirty_entries = new Map<InputValue, Parameters<typeof processor>[0]>();
//     let fully_dirty = false;
//     // function update_all()
//     // {
//     //     let new_value = initial_value;
//     //     for (let value of producer.get())
//     //         new_value = reducer({ event: "add", value }, new_value);
//     //     result.set(new_value);
//     //     fully_dirty = false;
//     //     dirty_entries.clear();
//     // }
//     // result.get = () =>
//     // {
//     //     if (fully_dirty)
//     //         reset_value();
//     //     else
//     //     {
//     //         let new_value = result._value;
//     //         for (let value of dirty_entries.values())
//     //             new_value = reducer(value, new_value);
//     //         result.set(new_value);
//     //     }
//     //     return result._value;
//     // }
//     // if (dependends_on.length > 0)
//     // {
//     //     const dependency_handler = {
//     //         dirty: function (source?: I_Subscribable<any>)
//     //         {
//     //             fully_dirty = true;
//     //             result.dirty();
//     //         }
//     //     }
//     //     result["dependency_handler"] = dependency_handler; // Bind it so it GCs alongside the result
//     //     for (let dependency of dependends_on)
//     //         dependency.subscribe(dependency_handler);
//     // }
//     // const listeners = new Map<InputValue, Computed<OutputValue>>();
//     // function listen(v: InputValue)
//     // {
//     //     let computed: Computed<OutputValue>;
//     //     let state = {};
//     //     computed = new Computed<OutputValue>(() =>
//     //     {
//     //         let prev_value = result._value;
//     //         let new_value = reducer(v, prev_value, state);
//     //         result.set(new_value);
//     //         return new_value;
//     //     }, true);
//     //     listeners.set(v, computed);
//     // }
//     // function unlisten(v: InputValue)
//     // {
//     //     listeners.get(v).destroy();
//     //     listeners.delete(v);
//     // }
//     // const values = [...producer.get()];
//     // for (let i = 0; i < values.length; i++)
//     //     listen(values[i]);
//     producer._on_change_instant.subscribe((_, ve) =>
//     {
//         let { event, value } = ve;
//         if (lazy)
//         {
//             if (dirty_entries.has(value))
//                 dirty_entries.delete(value);
//             else
//                 dirty_entries.set(value, ve);
//         }
//         else
//         {
//             processor(ve)
//         }
//     });
//     return output;
// }
// Reduce can be done much more efficiently without Computed, 
// but it won't work if the reduce function contains any signals.
// This will completely recalculate the reduced value whenever any of the dependencies changes.
// Otherwise it will partially update the value whenever something is added or removed.
export function reduce_fast(initial_value, producer, reducer, dependends_on) {
    // type ProdValue = Producer extends I_NativeCollection<infer V, infer E> ? V : never;
    const result = new NativeSignal(initial_value);
    const dirty_entries = new Map();
    let fully_dirty = false;
    function reset_value() {
        let new_value = initial_value;
        for (let value of producer.get())
            new_value = reducer({ event: "add", value }, new_value);
        result.set(new_value);
        fully_dirty = false;
        dirty_entries.clear();
    }
    result.get = () => {
        if (fully_dirty)
            reset_value();
        else {
            let new_value = result._value;
            for (let value of dirty_entries.values())
                new_value = reducer(value, new_value);
            result.set(new_value);
        }
        return result._value;
    };
    if (dependends_on.length > 0) {
        const dependency_handler = {
            dirty: function (source) {
                fully_dirty = true;
                result.dirty();
            }
        };
        result["dependency_handler"] = dependency_handler; // Bind it so it GCs alongside the result
        for (let dependency of dependends_on)
            dependency.subscribe(dependency_handler);
    }
    producer.subscribe_event((_, ve) => {
        // fully dirty will calculate all entries from scratch the next time
        // the result's get() function is called.
        if (fully_dirty)
            return;
        if (!["add", "delete"].includes(ve.event))
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
export function count_fast(collection, counter, depends_on) {
    return reduce_fast(0, collection, (event, prev) => prev + counter(event), depends_on);
}
export function reduce(producer, reducer, initial_value) {
    // TODO : Replace Native Signal with one which on get forcefully pulls all dirty Computed values
    const result = new NativeSignal(initial_value);
    const listeners = new Map();
    function listen(v) {
        // BUG : Computed is late, and result does not force update computed on get
        let computed;
        let state = {};
        computed = new Computed(() => {
            let prev_value = result._value;
            let new_value = reducer(v, prev_value, state);
            result.set(new_value);
            return new_value;
        }, true);
        listeners.set(v, computed);
    }
    function unlisten(v) {
        listeners.get(v).destroy();
        listeners.delete(v);
    }
    const values = [...producer.get()];
    for (let i = 0; i < values.length; i++)
        listen(values[i]);
    producer.subscribe_event((_, ve) => {
        if (ve['event'] === "add")
            listen(ve['value']);
        else if (ve['event'] === "delete")
            unlisten(ve['value']);
    });
    return result;
}
export function count(producer, counter) {
    return reduce(producer, (v, prev, state) => {
        let count = counter(v);
        let old_value = state.prev_value ?? 0;
        state.prev_value = count;
        return prev + count - old_value;
    }, 0);
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
//# sourceMappingURL=transformations.js.map