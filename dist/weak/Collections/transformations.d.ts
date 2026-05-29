import { NativeSignal } from "../Core/NativeSignal.js";
import { I_NativeCollection, ReqColTypes } from "./Collection.js";
import { EventRef, I_GettableSubscribable, I_Subscribable, LinkedList, StatefulSubscribable, Subscribable } from "../Core/Subscribable.js";
/**
 * Subscription reference returned by `Reducer.register_source`. Augments a
 * standard subscriber linked-list node with the last seen value, so the merger
 * function can compute deltas without needing external state.
 */
export type ReducerRef<INPUT> = LinkedList<INPUT> & {
    last: INPUT;
};
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
export declare class Reducer<INPUT, OUTPUT> extends Subscribable<OUTPUT> {
    /** The "neutral" input value used when a source is being added or removed. */
    readonly identity_value: INPUT;
    /**
     * The merger function. Called with the new value, the previous value seen for
     * the same source, the current accumulator, the source itself, the subscription
     * reference, and the reducer instance. Returns the new accumulator.
     */
    readonly merger: (value: INPUT, last_value: INPUT, result: OUTPUT, source: I_GettableSubscribable<INPUT> | I_NativeCollection<INPUT>, ref: ReducerRef<INPUT>, target: this) => OUTPUT;
    /** Current accumulator. */
    _value: OUTPUT;
    /** Reserved for a future lazy-evaluation path; not currently consulted on the hot path. */
    _dirty: boolean;
    /** Update the accumulator and propagate dirty downstream. */
    private set;
    /** Get the current accumulator. */
    get(): OUTPUT;
    /**
     * Override of `Subscribable.dirty` that intentionally does nothing.
     *
     * Reducers don't propagate dirty *upstream* — they only propagate downstream when
     * `set` is called from inside a merger. Dirty events from sources are absorbed
     * here and turned into merger calls instead.
     */
    dirty(source: any, ref: any): void;
    /**
     * @param identity_value The "empty" input — used when a source enters or leaves the reducer.
     * @param merger         Folds new values into the accumulator (see class docs).
     * @param value          The initial accumulator value.
     */
    constructor(identity_value: INPUT, merger: (value: INPUT, last_value: INPUT, result: OUTPUT, source: (I_GettableSubscribable<INPUT>) | I_NativeCollection<INPUT>, ref: ReducerRef<INPUT>, target: Reducer<INPUT, OUTPUT>) => OUTPUT, value: OUTPUT);
    /**
     * Subscribe to a whole collection. Every existing item triggers a synthetic
     * `add` event so the reducer's accumulator reflects them; subsequent collection
     * events are routed through `on_collection_change`.
     *
     * @param mapped When true, each value in the collection is itself a Subscribable;
     *               the reducer registers each as its own source. When false, the
     *               value itself is folded directly.
     */
    register_collection<MAPPED extends boolean>(source: I_NativeCollection<MAPPED extends true ? I_Subscribable<INPUT> : INPUT>, mapped: MAPPED): any;
    /**
     * Handler for collection events (`add`/`delete`). Branches on whether the
     * collection holds Subscribables (mapped mode — register/unregister per item) or
     * raw values (fold the value directly using the merger).
     */
    on_collection_change(source: I_NativeCollection<INPUT>, event: {
        event: string;
        value?: any;
    }, ref: EventRef<any>): void;
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
    register_source(source: I_Subscribable<INPUT> | NativeSignal<INPUT>): LinkedList<((source: I_Subscribable<INPUT>, value: INPUT, ref: LinkedList<any>) => any | void) | WeakRef<(source: I_Subscribable<INPUT>, value: INPUT, ref: LinkedList<any>) => any | void>> & {
        last: INPUT;
        reducer: WEAK_REF<Reducer<INPUT, OUTPUT>>;
        source: typeof source;
    };
    /**
     * Inverse of `register_source`. Unsubscribes from the source and folds an
     * `identity_value` through the merger so the reducer "forgets" this source's
     * contribution.
     */
    unregister_source(ref: ReturnType<this["register_source"]>): void;
    /**
     * Shared subscriber callback used by every registered source. Recovers the
     * reducer via the `WeakRef` stored on `ref`, calls the merger, and updates the
     * accumulator.
     *
     * Note the `this: undefined` parameter — this function is intentionally not
     * called with a `this` context. The reducer instance is recovered from `ref`
     * rather than being bound on `this`.
     */
    on_change(this: undefined, source: I_GettableSubscribable<INPUT>, value: INPUT, ref: ReducerRef<INPUT>): void;
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
export declare function reduce_generic(source: I_NativeCollection<any, any>, identity_value: any, opts: {
    output?: StatefulSubscribable<typeof identity_value>;
    unpackSignals?: boolean;
    lazy?: boolean;
    dependencies?: Subscribable<any>[];
    merger: (source_item: any, output: any, value: any, prev_value: any) => void;
    mapper?: (source_item: any) => any;
}): StatefulSubscribable<any>;
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
export declare function reduce_fast<ConsValue, ProdValue, ProdEvents extends ReqColTypes<ProdValue>, Producer extends I_NativeCollection<ProdValue, ProdEvents>>(initial_value: ConsValue, producer: Producer, reducer: (event: {
    event: "add" | "delete" | "update";
    value: ProdValue;
}, prev_value: ConsValue) => ConsValue, depends_on: StatefulSubscribable<any>[]): NativeSignal<ConsValue>;
/**
 * Convenience: count items by mapping each event to a number contribution.
 *
 * @param counter Maps each `add`/`delete` event to a number; the sum is the count.
 */
export declare function count_fast<V>(collection: I_NativeCollection<V, any>, counter: (event: {
    event: "add" | "delete" | "update";
    value: V;
}) => number, depends_on: StatefulSubscribable<any>[]): NativeSignal<number>;
/**
 * The general reduce: each item gets its own `Computed` so the reducer function can
 * itself read other signals.
 *
 * Slower than `reduce_fast` because of the per-item Computed overhead, but
 * necessary if your reducer function depends on signal values.
 */
export declare function reduce<ProdValue, ProdEvents extends ReqColTypes<ProdValue>, Producer extends I_NativeCollection<ProdValue, ProdEvents>, ConsValue>(producer: Producer, reducer: (event: ProdValue, prev_value: ConsValue, state: object) => ConsValue, initial_value: ConsValue): NativeSignal<ConsValue>;
/** Convenience built on `reduce`: count items by mapping each item to a number contribution. */
export declare function count<Producer extends I_NativeCollection<any, any>>(producer: Producer, counter: (v: Producer extends I_NativeCollection<infer A, any> ? A : never) => number): NativeSignal<number>;
