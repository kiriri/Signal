import { NativeSignal } from "../Core/NativeSignal.js";
import { I_NativeCollection } from "./Collection.js";
import { SignalSet } from "./SignalSet.js";
import { StatefulSubscribable } from "../Core/Subscribable.js";
/**
 * The "absent" sentinel. A single value standing in for both **NEW** (there was no
 * previous value — an addition) and **DELETED** (there is no next value — a removal).
 *
 * Every change a {@link Reduce} sees is expressed as a `(prev, next)` pair:
 *  - collection **add**   → `(NONE, value)`
 *  - collection **delete**→ `(value, NONE)`
 *  - signal **initial**   → `(NONE, value)`
 *  - signal **change**    → `(old,  new)`
 *  - source **removed**   → `(last, NONE)`
 *
 * A merger that treats `NONE` as "contributes nothing" therefore works uniformly as a
 * filter, a map, or a fold, over both signals and collections.
 */
export declare const NONE: unique symbol;
export type NONE = typeof NONE;
/** Anything a {@link Reduce} can fold over: a readable signal or a collection. */
export type ReduceSource<IN> = StatefulSubscribable<IN> | I_NativeCollection<IN, any>;
/**
 * The user-supplied fold. Called once per change with the previous and next value
 * (either may be {@link NONE}), the originating source, and the output `target` to
 * mutate. It is the merger's job to act like a filter / map / reducer by mutating
 * `target` accordingly.
 */
export type Merger<IN, TARGET> = (prev: IN | NONE, next: IN | NONE, source: ReduceSource<IN>, target: TARGET) => void;
/**
 * Derives a single signal **or** a collection from one or more sources
 * (`NativeSignal` / `Computed` / `SignalSet` / `SignalMap` / `Order` / `SignalHeap`).
 *
 * **Two source channels.** Signals are folded through their value channel
 * (`subscribe`) the same way `Computed`/`Effect` listen; collections are folded
 * through their event channel (`subscribe_event` — `add`/`delete`). Either way the
 * merger only ever sees `(prev, next, source, target)`.
 *
 * **Laziness mirrors the rest of the framework.** Changes are accumulated in
 * `pending` and the actual merger calls are deferred: `target.get()` is wrapped to
 * flush first, so a scalar reduction over a collection does **no work at all** until
 * something reads it. The moment the target has listeners (value subscribers, or — for
 * collection targets — event subscribers), changes are instead flushed on a coalesced
 * microtask, exactly like `NativeSignal`/`SignalSet` emit. Collection targets are
 * always treated as listened-to-eager, since their whole purpose is to feed downstream
 * via events.
 *
 * **GC.** `target.get` closes over the `Reduce`, the `Reduce` holds its sources and
 * handlers strongly, and sources hold the handlers weakly — so the graph lives exactly
 * as long as the caller keeps the `target`, and is collected once the target is dropped.
 */
export declare class Reduce<IN, TARGET extends StatefulSubscribable<any>> {
    readonly target: TARGET;
    readonly merger: Merger<IN, TARGET>;
    /**
     * Pending changes as a flat `[prev, next, source, ...]` log. A plain array (rather
     * than a value-keyed `Map` of `{prev,next,source}` objects) avoids an allocation and
     * a hash per change on the hot path. The trade-off: same-tick churn on one value is
     * replayed instead of collapsed — still correct, since mergers are delta-based.
     */
    private pending;
    /** When set, the next flush rebuilds from scratch over every current source value. */
    private fully_dirty;
    /** Re-entrancy guard so a merger may freely call `target.get()`. */
    private flushing;
    /** True while a flush is queued on the microtask (the eager path). */
    private scheduled;
    /** Whether `target` can defer work until read (a scalar `NativeSignal`). */
    private readonly lazy_capable;
    /** Resets the target before a fully-dirty replay (clear collection / set scalar to initial). */
    private readonly reset;
    /** Live source registrations. Keeps handlers alive (sources hold them weakly). */
    private sources;
    /** Dependency-handler registrations, kept alive but never replayed as values. */
    private deps;
    /**
     * @param target The output to mutate — a `NativeSignal` (scalar fold) or a collection.
     * @param merger The fold (see {@link Merger}).
     * @param opts.dependencies Extra signals that, when any changes, invalidate the whole
     *        reduction so the next flush rebuilds it from scratch.
     */
    constructor(target: TARGET, merger: Merger<IN, TARGET>, opts?: {
        dependencies?: StatefulSubscribable<any>[];
    });
    /** Subscribe a single signal source via its value channel. Seeds with `(NONE, value)`. */
    register_signal(signal: StatefulSubscribable<IN>): any;
    /** Subscribe a whole collection via its event channel. Seeds one `(NONE, value)` per item. */
    register_collection(collection: I_NativeCollection<IN, any>): any;
    /** Wire up dependency signals: any change marks the whole reduction fully dirty. */
    private register_dependencies;
    /** Record a pending change and (if listened-to) schedule a flush. */
    private mark;
    /** Queue a coalesced flush when the target is listened-to; otherwise stay lazy. */
    private schedule;
    private static run_flush;
    /** Returns true if anyone is observing the target (value channel or event channel). */
    private target_listened;
    /** Apply all pending changes (or rebuild from scratch when fully dirty). */
    private flush;
}
/**
 * Fold one or more sources into a target you provide, using a single {@link Merger}.
 *
 * @example
 * // Sum of a set, lazily maintained:
 * const total = reduce(set, (prev, next, _s, t) =>
 *     t.set(t.get() + (next === NONE ? 0 : next) - (prev === NONE ? 0 : prev)),
 *     new NativeSignal(0));
 */
export declare function reduce<IN, TARGET extends StatefulSubscribable<any>>(source: ReduceSource<IN> | ReduceSource<IN>[], merger: Merger<IN, TARGET>, target: TARGET, opts?: {
    dependencies?: StatefulSubscribable<any>[];
}): TARGET;
/**
 * Count (or weighted-sum) the items of a collection into a `NativeSignal<number>`.
 *
 * Lazy by default — the sum is only computed when read or when a subscriber exists.
 *
 * @param weight   Maps each value to its numeric contribution. Defaults to `1` (a plain count).
 * @param opts.reactive When true, each item's `weight` runs inside an eager `Computed`,
 *        so if `weight` reads other signals, that item is re-counted when they change.
 *        Reactive entries are eager (not lazy). Mutually exclusive with `dependencies`.
 */
export declare function count<IN>(collection: I_NativeCollection<IN, any>, weight?: (value: IN) => number, opts?: {
    dependencies?: StatefulSubscribable<any>[];
    reactive?: boolean;
}): NativeSignal<number>;
/**
 * Derive a filtered collection: items satisfying `predicate` are mirrored into the
 * output, tracking the source through add/delete.
 *
 * @param opts.into Optional output collection to fill (defaults to a new `SignalSet`).
 */
export declare function filter<IN>(collection: I_NativeCollection<IN, any>, predicate: (value: IN) => boolean, opts?: {
    into?: SignalSet<IN>;
}): SignalSet<IN>;
/**
 * Derive a mapped collection: each source item is transformed by `fn` and mirrored
 * into the output, tracking the source through add/delete.
 *
 * @param opts.into Optional output collection to fill (defaults to a new `SignalSet`).
 */
export declare function map<IN, OUT>(collection: I_NativeCollection<IN, any>, fn: (value: IN) => OUT, opts?: {
    into?: SignalSet<OUT>;
}): SignalSet<OUT>;
