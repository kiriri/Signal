import { NativeSignal } from "../Core/NativeSignal.js";
import { I_NativeCollection, ReqColTypes } from "./Collection.js";
import { Computed } from "../Core/Computed.js";
import { EventRef, I_GettableSubscribable, I_Subscribable, LinkedList, StatefulSubscribable, Subscribable } from "../Core/Subscribable.js";

// TODO :
// - Replace listener function with dependency.
// - Make get force all lazy loads.

/**
 * Subscription reference returned by `Reducer.register_source`. Augments a
 * standard subscriber linked-list node with the last seen value, so the merger
 * function can compute deltas without needing external state.
 */
export type ReducerRef<INPUT> = LinkedList<INPUT> & { last: INPUT };

/**
 * A streaming fold over one or more sources.
 *
 * **What it is.** A `Reducer` accumulates values from any number of subscribed
 * sources by calling a user-provided `merger` function with the new value, the
 * previous value seen for that source, and the current accumulator. Sources can
 * be individual signals (`register_source`) or whole collections (`register_collection`).
 *
 * **Identity value.** When a source emits for the first time, `last_value` is the
 * `identity_value` you provided. When a source is removed (deletion or unregistration),
 * the merger is called once more with `value === identity_value` so the reducer can
 * "subtract out" that source's contribution.
 *
 * **Why a class instead of a function.** Lifetime and source-set are observable —
 * you can dynamically register and unregister sources, and the merger sees a stable
 * reducer object via the `target` parameter.
 */
export class Reducer<INPUT, OUTPUT> extends Subscribable<OUTPUT>
{
    /** The "neutral" input value used when a source is being added or removed. */
    readonly identity_value: INPUT;

    /**
     * The merger function. Called with the new value, the previous value seen for
     * the same source, the current accumulator, the source itself, the subscription
     * reference, and the reducer instance. Returns the new accumulator.
     */
    readonly merger: (
        value: INPUT,
        last_value: INPUT,
        result: OUTPUT,
        source: I_GettableSubscribable<INPUT> | I_NativeCollection<INPUT>,
        ref: ReducerRef<INPUT>,
        target: this
    ) => OUTPUT;

    /** Current accumulator. */
    _value: OUTPUT;

    /** Reserved for a future lazy-evaluation path; not currently consulted on the hot path. */
    _dirty: boolean = true;


    /** Update the accumulator and propagate dirty downstream. */
    private set(value: OUTPUT)
    {
        this._value = value;
        super.dirty(this);
    }

    /** Get the current accumulator. */
    get()
    {
        return this._value;
    }

    /**
     * Override of `Subscribable.dirty` that intentionally does nothing.
     *
     * Reducers don't propagate dirty *upstream* — they only propagate downstream when
     * `set` is called from inside a merger. Dirty events from sources are absorbed
     * here and turned into merger calls instead.
     */
    dirty(source, ref) { }

    /**
     * @param identity_value The "empty" input — used when a source enters or leaves the reducer.
     * @param merger         Folds new values into the accumulator (see class docs).
     * @param value          The initial accumulator value.
     */
    constructor(
        identity_value: INPUT,
        merger: (
            value: INPUT,
            last_value: INPUT,
            result: OUTPUT,
            source: (I_GettableSubscribable<INPUT>) | I_NativeCollection<INPUT>,
            ref: ReducerRef<INPUT>,
            target: Reducer<INPUT, OUTPUT>
        ) => OUTPUT,
        value: OUTPUT,
    )
    {
        super();
        this.identity_value = identity_value;
        this.merger = merger;
        this._value = value;
    }

    /**
     * Subscribe to a whole collection. Every existing item triggers a synthetic
     * `add` event so the reducer's accumulator reflects them; subsequent collection
     * events are routed through `on_collection_change`.
     *
     * @param mapped When true, each value in the collection is itself a Subscribable;
     *               the reducer registers each as its own source. When false, the
     *               value itself is folded directly.
     */
    register_collection<MAPPED extends boolean>(source: I_NativeCollection<MAPPED extends true ? I_Subscribable<INPUT> : INPUT>, mapped: MAPPED)
    {
        const ref = source.subscribe_event(this.on_collection_change)

        ref["reducer"] = this;
        ref["map"] = mapped ? new Map() : undefined;

        // Seed: emit one synthetic "add" per existing item.
        for (let item of source.get())
        {
            (this).on_collection_change(
                source,
                {
                    event: "add",
                    value: item
                },
                ref
            )
        }

        return ref;
    }

    /**
     * Handler for collection events (`add`/`delete`). Branches on whether the
     * collection holds Subscribables (mapped mode — register/unregister per item) or
     * raw values (fold the value directly using the merger).
     */
    on_collection_change(
        source: I_NativeCollection<INPUT>,
        event: {
            event: string;
            value?: any
        },
        ref: EventRef<any>
    )
    {
        const reducer = ref["reducer"] as Reducer<INPUT, OUTPUT>;
        const map = ref["map"] as Map<any, any> | undefined;
        const mapped = map !== undefined;

        console.log("Collection changed")

        if (mapped)
        {
            switch (event.event)
            {
                case "add":
                    let inner_ref = reducer.register_source(event.value)
                    map.set(event.value, inner_ref);
                    break;
                case "delete":
                    if (map.delete(event.value))
                        reducer.unregister_source(map.get(event.value));
                    break;
            }
        }
        else
        {
            switch (event.event)
            {
                case "add":
                    reducer.set(reducer.merger(
                        event.value,
                        reducer.identity_value,
                        reducer._value,
                        source,
                        ref as any,
                        reducer
                    ));
                    break;
                case "delete":
                    reducer.set(reducer.merger(
                        reducer.identity_value,
                        event.value,
                        reducer._value,
                        source,
                        ref as any,
                        reducer
                    ));
                    break;
            }
        }
    }

    /**
     * Lazily-allocated `WeakRef` to `this`, stored on subscription refs so the
     * shared `on_change` handler can recover its owning reducer without holding
     * a strong reference (which would prevent reducer GC while sources still exist).
     */
    _self: WEAK_REF<this>;

    /**
     * Subscribe to a single source signal. Returns a tagged subscription reference
     * holding the reducer's identity_value as `last`, the source itself, and a
     * weak ref to the reducer.
     *
     * Why we use one shared `on_change` function instead of per-source closures:
     * a single shared function on the prototype is much cheaper than instantiating
     * a bound closure per source. The trade-off is a `WeakRef` per reducer (reused
     * across all sources), which is required because we can't hold the reducer
     * strongly from the source side without breaking GC.
     */
    register_source(source: I_Subscribable<INPUT> | NativeSignal<INPUT>)
    {
        const ref = source.subscribe(this.on_change) as LinkedList<WEAK_REF<(source: I_Subscribable<INPUT>, value: INPUT, ref: LinkedList<any>) => any | void>> & {
            last: INPUT,
            reducer: WEAK_REF<Reducer<INPUT, OUTPUT>>,
            source: typeof source
        };

        ref["last"] = this.identity_value;
        if($USE_WEAK_REFS$)
            ref["reducer"] = this._self ??= new WeakRef(this);
        else
            ref["reducer"] = this;
        
        ref["source"] = source;

        this.on_change(source, source.get?.(), ref);

        return ref;
    }

    /**
     * Inverse of `register_source`. Unsubscribes from the source and folds an
     * `identity_value` through the merger so the reducer "forgets" this source's
     * contribution.
     */
    unregister_source(ref: ReturnType<this["register_source"]>)
    {
        ref.source.unsubscribe(ref);
        this.on_change(ref["source"], this.identity_value, ref);
    }

    /**
     * Shared subscriber callback used by every registered source. Recovers the
     * reducer via the `WeakRef` stored on `ref`, calls the merger, and updates the
     * accumulator.
     *
     * Note the `this: undefined` parameter — this function is intentionally not
     * called with a `this` context. The reducer instance is recovered from `ref`
     * rather than being bound on `this`.
     */
    on_change(this: undefined, source: I_GettableSubscribable<INPUT>, value: INPUT, ref: ReducerRef<INPUT>)
    {
        let last_value = ref["last"] as INPUT;
        let self: this = ref["reducer"].deref()!;
        self.set(self.merger(value, last_value, self._value, source, ref, self));
        ref["last"] = value;
    }
}



/**
 * Generic reduction over a collection with optional unwrapping of Subscribable items
 * and optional lazy mode.
 *
 * @param source         The source collection.
 * @param identity_value Neutral value used as the initial accumulator and on item removal.
 * @param opts.merger        Called with `(source_item, output, value, prev_value)` to
 *                           fold a value into the output. Uses identityValue on delete!
 *                           Applies relative changes based on previous and current value.
 * @param opts.mapper        Optional pre-transform on each added/updated value.
 * @param opts.unpackSignals If true, treat each collection item as a Subscribable and
 *                           fold its `.get()` value (re-folding when it changes).
 * @param opts.lazy          If true, defer merger calls until `output.get()` is read,
 *                           so multiple changes to the same source within a tick
 *                           collapse into a single merger call.
 * @param opts.dependencies  Extra signals; if any of them change, the entire reduction
 *                           is invalidated and recomputed from scratch.
 * @param opts.output        Optionally provide your own output Subscribable.
 */
export function reduce_generic(
    source: I_NativeCollection<any, any>,
    identity_value,
    opts: {
        output?: StatefulSubscribable<typeof identity_value>,
        unpackSignals?: boolean,
        lazy?: boolean,
        dependencies?: Subscribable<any>[],
        merger: (source_item, output, value, prev_value) => void,
        mapper?: (source_item) => any
    }
)
{
    const output = opts.output ?? new NativeSignal(identity_value);
    const unpack_signals = opts.unpackSignals ?? false;
    const lazy = opts.lazy ?? false;
    const dependencies = opts.dependencies;
    const merger = opts.merger;
    const mapper = opts.mapper;

    const cache = new Map<typeof identity_value, {
        prev: any, // last known value
        ref: LinkedList<any> // subscription reference (needed to unsubscribe from signals)
    }>();

    let fully_dirty = false;

    if (dependencies && dependencies.length > 0)
    {
        const dependency_handler = {
            dirty: function (source: I_Subscribable<any>, ref?: LinkedList<any>, value?: any)
            {
                fully_dirty = true;
                output.dirty(source, ref, value);
            }
        }

        // Bind it onto the output so it GCs alongside.
        output["dependency_handler"] = dependency_handler;

        for (let dependency of dependencies)
            dependency.subscribe(dependency_handler);
    }

    // Lazy mode: avoid duplicate mapper/merger calls for entries that change multiple
    // times within the same async time slice. Significantly faster for batched changes.
    if (lazy)
    {
        let dirty = new Map<typeof identity_value, typeof identity_value>();

        function lazy_apply(source, value)
        {
            if (fully_dirty)
                return;
            dirty.set(source, value);
            output.dirty(source, undefined, value);
        }

        function apply_all_dirty()
        {
            const dirty_values = (fully_dirty ? new Map([...source.get()].map(v => [v, v])) : dirty.entries());
            dirty.clear();

            for (let kv of dirty_values)
            {
                const key = kv[0];
                if (unpack_signals)
                    kv[1] = kv[1].get();
                const value = mapper ? mapper?.(kv[1]) : kv[1];
                let cache_item = cache.get(key);
                let prev_value;
                if (!cache_item)
                {
                    if (unpack_signals)
                    {
                        listen(key);
                    }
                }
                else
                {
                    prev_value = cache_item.prev;
                    cache_item.prev = value;
                }

                merger(key, output, value, prev_value);
            }
        }

        const original_get = output.get.bind(output);
        output.get = (...args) =>
        {
            if (apply_all_dirty || dirty.size > 0)
                apply_all_dirty();

            return original_get(...args);
        }

        function listen(signal: Subscribable<any>)
        {
            cache.set(signal, {
                prev: identity_value,
                ref: signal.subscribe(lazy_apply)
            })
        }

        function unlisten(signal: Subscribable<any>)
        {
            let ref = cache.get(signal).ref;
            signal.unsubscribe(ref);
            cache.delete(signal);
            dirty.delete(signal);
        }

        for (let initial_value of source.get())
        {
            lazy_apply(initial_value, initial_value)
        }


        source.subscribe_event((_, ve) =>
        {
            if (lazy)
            {
                switch (ve.event)
                {
                    // TODO : lazy only listens when get() is called for the first time
                    // it also only updates the value at that time, all changed entries at once.
                    case "add":
                        lazy_apply(ve.value, ve.value)
                        break;
                    case "delete":
                        lazy_apply(ve.value, unpack_signals ? { get() { return identity_value } } : identity_value);
                        if (unpack_signals)
                        {
                            unlisten(ve["value"]);
                        }
                        break;
                    case "update":
                        lazy_apply(ve.value, ve.value);
                        break
                    default: break;
                }
            }
        });
    }
    // Non-lazy mode: as soon as a change occurs, mapper and merger get called.
    else
    {
        function apply_value(source_item, value, ref?: LinkedList<any>, unpack = unpack_signals)
        {
            if (unpack)
            {
                // Can be undefined if the value was removed from the source collection
                // and the change event triggered before the delete one did.
                value = value?.get();
            }

            let state = cache.get(source_item);
            let prev_value = state?.prev ?? identity_value;

            if (state)
                state.prev = value;
            else
            {
                cache.set(source_item, { prev: value, ref: null! });
            }


            merger(source_item, output, value, prev_value);
        }

        for (let initial_value of source.get())
        {
            apply_value(initial_value, mapper?.(initial_value) ?? initial_value)
        }

        function listen(signal: Subscribable<any>)
        {
            cache.set(signal, {
                prev: identity_value,
                ref: signal.subscribe(apply_value)
            })
        }

        function unlisten(signal: Subscribable<any>)
        {
            let ref = cache.get(signal).ref;
            signal.unsubscribe(ref);
            cache.delete(signal);
        }

        source.subscribe_event((_, ve) =>
        {
            let original_value = ve["value"];
            let value = mapper ? mapper(original_value) : original_value;
            switch (ve.event)
            {
                case "add":
                    apply_value(original_value, value);
                    if (unpack_signals)
                    {
                        listen(original_value);
                    }
                    break;
                case "delete":
                    if (unpack_signals)
                    {
                        unlisten(original_value);
                    }
                    else
                    {
                        apply_value(original_value, identity_value, undefined, false);
                    }
                    break;
                case "update":
                    apply_value(original_value, value);
                    if (unpack_signals)
                    {
                        throw new Error("Unpack Signals w/ update events not implemented yet! How do we unsubscribe from the old signal then?")
                    }
                    break
                default: break;
            }
        });
    }

    return output;
}


// =============================================================================
// REFERENCE / FUTURE WORK — alternative reducer designs preserved for reference.
//
// `reduceGeneric` (camelCase) was an earlier exploration of a heavily-typed,
// const-generic reducer that depended on a `_on_change_instant` channel which
// has since been merged into the main subscriber path. The skeleton is preserved
// here in case the type-level design becomes useful again.
// =============================================================================

// /**
//  * It doesn't matter if we map changes to a single nativeSignal or a collection.
//  * Just provide the output directly, and the way that changes are merged into it.
//  * @param producer
//  * @param output
//  */
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
//
//     const lazy = opts.lazy ?? true;
//     const unpackSignals = opts.unpackSignals ?? false;
//     const computed = opts.computed ?? false;
//     const dependencies = opts.dependencies;
//     const use_dependencies = !!dependencies;
//
//     if (computed && (unpackSignals || use_dependencies))
//     {
//         throw new Error("Reduce should either use a computed function, or manual dependencies + unpackSignals. Don't combine opts.computed with dependencies/unpackSignals, it only degrades performance.")
//     }
//
//     type InputValue = Output extends Subscribable<infer V> ? V : never;
//     type OutputValue = typeof producer extends I_NativeCollection<infer V, any> ? (
//         typeof opts["unpackSignals"] extends true ? (
//             V extends I_Subscribable<infer V2> ? V2 : never
//         ) : V
//     ) : never;
//
//     const dirty_entries = new Map<InputValue, Parameters<typeof processor>[0]>();
//     let fully_dirty = false;
//
//     producer._on_change_instant.subscribe((_, ve) =>
//     {
//         let { event, value } = ve;
//
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
//
//     return output;
// }


/**
 * A specialized reducer that does not support inner Computed but is significantly
 * faster than `reduce` / `reduce_generic` for the common case.
 *
 * Use this when:
 *   - your reducer function does *not* read other signals (no inner Computeds)
 *   - you have an explicit list of `depends_on` signals that, when any change,
 *     mean the entire reduction must be recomputed from scratch.
 *
 * For the common case (no extra dependencies, no signal reads), it incrementally
 * applies adds and deletes — much cheaper than the Computed-based path.
 */
export function reduce_fast<
    ConsValue,
    ProdValue,
    ProdEvents extends ReqColTypes<ProdValue>,
    Producer extends I_NativeCollection<ProdValue, ProdEvents>
>(
    initial_value: ConsValue,
    producer: Producer,
    reducer: (
        event: {
            event: "add" | "delete" | "update";
            value: ProdValue;
        },
        prev_value: ConsValue
    ) => ConsValue,
    depends_on: StatefulSubscribable<any>[],
): NativeSignal<ConsValue>
{
    const result = new NativeSignal(initial_value);

    const dirty_entries = new Map<ProdValue, {
        event: "add" | "delete";
        value: ProdValue;
    }>();
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

    if (depends_on.length > 0)
    {
        const dependency_handler = {
            dirty: function (source: NativeSignal<ConsValue>, ref, value)
            {
                fully_dirty = true;
                result.dirty(source, ref, value);
            }
        }

        // Bind it so it GCs alongside the result.
        result["dependency_handler"] = dependency_handler;

        for (let dependency of depends_on)
            dependency.subscribe(dependency_handler);
    }

    producer.subscribe_event((_, ve) =>
    {
        // fully_dirty will calculate all entries from scratch the next time
        // the result's get() function is called.
        if (fully_dirty)
            return;

        if (!["add", "delete"].includes(ve.event))
            return;

        // Either it has added and then deleted, or vice versa.
        // Either way, skip updating the value altogether.
        if (dirty_entries.has(ve["value"]))
            dirty_entries.delete(ve["value"]);
        else
            dirty_entries.set(ve["value"], ve as any);
    });


    reset_value();

    return result;
}

/**
 * Convenience: count items by mapping each event to a number contribution.
 *
 * @param counter Maps each `add`/`delete` event to a number; the sum is the count.
 */
export function count_fast<V>(collection: I_NativeCollection<V, any>, counter: (event: { event: "add" | "delete" | "update", value: V }) => number, depends_on: StatefulSubscribable<any>[])
{
    return reduce_fast(0, collection, (event, prev) => prev + counter(event as any), depends_on);
}


/**
 * The general reduce: each item gets its own `Computed` so the reducer function can
 * itself read other signals.
 *
 * Slower than `reduce_fast` because of the per-item Computed overhead, but
 * necessary if your reducer function depends on signal values.
 */
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

    producer.subscribe_event((_, ve) =>
    {
        if (ve['event'] === "add")
            listen(ve['value']);
        else if (ve['event'] === "delete")
            unlisten(ve['value']);
    });

    return result;
}

/** Convenience built on `reduce`: count items by mapping each item to a number contribution. */
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




// =============================================================================
// REFERENCE / FUTURE WORK — map_fast skeleton and producer/consumer pattern sketch.
// Preserved as design notes; not currently functional.
// =============================================================================

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
//
//     function reset_value() { /* ...same shape as reduce_fast... */ }
//
//     result.get = () => { /* ...lazy fold... */ }
//
//     if (dependends_on.length > 0) { /* ...attach dependency handler... */ }
//
//     producer._on_change_instant.subscribe((_, ve) =>
//     {
//         if (fully_dirty) return;
//         if (dirty_entries.has(ve["value"])) dirty_entries.delete(ve["value"]);
//         else dirty_entries.set(ve["value"], ve);
//     });
//
//     reset_value();
//     return result;
// }


// function transform<
//     ProdValue,
//     ProdEvents extends ReqColTypes<ProdValue>,
//     Producer extends I_NativeCollection<ProdValue, ProdEvents>,
//     ConsValue,
//     ConsEvents extends ReqColTypes<ProdValue>,
//     Consumer extends I_NativeCollection<ProdValue, ProdEvents>,
// >(
//     producer: Producer
// )
// {
//     // consumer + producer pattern
//
//     // Map uses
//     let mapExample : (value:ProdValue) => ConsValue;
//     // Filter uses (Plus requires ConsValue === ProdValue)
//     let filterExample : (value:ProdValue) => boolean;
//     // Reduce uses (Plus result is single NativeSignal)
//     let reduceExample : (value:ProdValue) => ConsValue;
// }