import { NativeSignal } from "../Core/NativeSignal.js";
import { Computed } from "../Core/Computed.js";
import { I_NativeCollection } from "./Collection.js";
import { SignalSet } from "./SignalSet.js";
import { StatefulSubscribable } from "../Core/Subscribable.js";
import EventManager from "../Core/_events.js";

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
export const NONE: unique symbol = Symbol("native-signal/NONE");
export type NONE = typeof NONE;

/** Anything a {@link Reduce} can fold over: a readable signal or a collection. */
export type ReduceSource<IN> = StatefulSubscribable<IN> | I_NativeCollection<IN, any>;

/**
 * The user-supplied fold. Called once per change with the previous and next value
 * (either may be {@link NONE}), the originating source, and the output `target` to
 * mutate. It is the merger's job to act like a filter / map / reducer by mutating
 * `target` accordingly.
 */
export type Merger<IN, TARGET> = (
    prev: IN | NONE,
    next: IN | NONE,
    source: ReduceSource<IN>,
    target: TARGET,
) => void;

type PendingEntry<IN> = { prev: IN | NONE; next: IN | NONE; source: ReduceSource<IN> };

/** A signal/collection looks like a collection iff it exposes the named-event channel. */
function is_collection(source: any): source is I_NativeCollection<any, any>
{
    return typeof source.subscribe_event === "function";
}

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
export class Reduce<IN, TARGET extends StatefulSubscribable<any>>
{
    readonly target: TARGET;
    readonly merger: Merger<IN, TARGET>;

    /** Pending changes, keyed by signal-ref or collection-value so churn collapses. */
    private pending = new Map<any, PendingEntry<IN>>();
    /** When set, the next flush rebuilds from scratch over every current source value. */
    private fully_dirty = false;
    /** Re-entrancy guard so a merger may freely call `target.get()`. */
    private flushing = false;
    /** True while a flush is queued on the microtask (the eager path). */
    private scheduled = false;

    /** Whether `target` can defer work until read (a scalar `NativeSignal`). */
    private readonly lazy_capable: boolean;
    /** Resets the target before a fully-dirty replay (clear collection / set scalar to initial). */
    private readonly reset: () => void;

    /** Live source registrations. Keeps handlers alive (sources hold them weakly). */
    private sources: { source: ReduceSource<IN>; ref: any; handler: Function }[] = [];
    /** Dependency-handler registrations, kept alive but never replayed as values. */
    private deps: { ref: any; handler: Function }[] = [];

    /**
     * @param target The output to mutate — a `NativeSignal` (scalar fold) or a collection.
     * @param merger The fold (see {@link Merger}).
     * @param opts.dependencies Extra signals that, when any changes, invalidate the whole
     *        reduction so the next flush rebuilds it from scratch.
     */
    constructor(
        target: TARGET,
        merger: Merger<IN, TARGET>,
        opts?: { dependencies?: StatefulSubscribable<any>[] }
    )
    {
        this.target = target;
        this.merger = merger;

        const t = target as any;
        // Scalar = has set()+_value but is not a collection (collections expose clear()).
        this.lazy_capable = typeof t.set === "function" && "_value" in t && typeof t.clear !== "function";
        const initial = this.lazy_capable ? t._value : undefined;
        this.reset = typeof t.clear === "function" ? () => t.clear() : () => t.set(initial);

        // Reads flush pending work first — this is what makes the scalar path lazy.
        const original_get = t.get.bind(t);
        t.get = (...args: any[]) =>
        {
            this.flush();
            return original_get(...args);
        };

        if (opts?.dependencies?.length)
            this.register_dependencies(opts.dependencies);
    }

    /** Subscribe a single signal source via its value channel. Seeds with `(NONE, value)`. */
    register_signal(signal: StatefulSubscribable<IN>)
    {
        const reduce = this;
        const handler = function (source: any, value: IN, ref: any)
        {
            reduce.mark(ref, ref.last, value, source);
            ref.last = value;
        };

        const ref: any = signal.subscribe(handler as any);
        ref.last = NONE;
        this.sources.push({ source: signal, ref, handler });

        // Seed the current value as an addition, then remember it as `last`.
        const current = signal.get();
        this.mark(ref, NONE, current, signal);
        ref.last = current;

        return ref;
    }

    /** Subscribe a whole collection via its event channel. Seeds one `(NONE, value)` per item. */
    register_collection(collection: I_NativeCollection<IN, any>)
    {
        const reduce = this;
        const handler = function (source: any, event: { event: string; value: IN }, _ref: any)
        {
            if (event.event === "add")
                reduce.mark(event.value, NONE, event.value, source);
            else if (event.event === "delete")
                reduce.mark(event.value, event.value, NONE, source);
        };

        const ref = collection.subscribe_event(handler as any);
        this.sources.push({ source: collection, ref, handler });

        for (const value of collection.get())
            this.mark(value, NONE, value, collection);

        return ref;
    }

    /** Wire up dependency signals: any change marks the whole reduction fully dirty. */
    private register_dependencies(dependencies: StatefulSubscribable<any>[])
    {
        const reduce = this;
        const handler = function ()
        {
            reduce.fully_dirty = true;
            reduce.schedule();
        };

        for (const dependency of dependencies)
        {
            const ref = dependency.subscribe(handler as any);
            this.deps.push({ ref, handler });
        }
    }

    /** Record a pending change and (if listened-to) schedule a flush. */
    private mark(key: any, prev: IN | NONE, next: IN | NONE, source: ReduceSource<IN>)
    {
        if (!this.fully_dirty)
        {
            const existing = this.pending.get(key);
            // Collapse repeated churn on the same key: keep the original `prev`,
            // adopt the latest `next` (so add-then-delete nets to (NONE, NONE)).
            if (existing)
                existing.next = next;
            else
                this.pending.set(key, { prev, next, source });
        }

        this.schedule();
    }

    /** Queue a coalesced flush when the target is listened-to; otherwise stay lazy. */
    private schedule()
    {
        if (this.scheduled)
            return;

        // Eager iff a collection target (always) or a scalar target with listeners.
        if (!this.lazy_capable || this.target_listened())
        {
            this.scheduled = true;
            EventManager.register_async_emit(Reduce.run_flush, this);
        }
    }

    private static run_flush(self: Reduce<any, any>)
    {
        self.scheduled = false;
        self.flush();
    }

    /** Returns true if anyone is observing the target (value channel or event channel). */
    private target_listened(): boolean
    {
        const t: any = this.target;
        if (t.subscribers !== undefined)
            return true;
        if (t.any_events !== undefined)
            return true;
        const events = t.events;
        if (events)
            for (const key in events)
                if (events[key] !== undefined)
                    return true;
        return false;
    }

    /** Apply all pending changes (or rebuild from scratch when fully dirty). */
    private flush()
    {
        if (this.flushing)
            return;
        this.flushing = true;

        if (this.fully_dirty)
        {
            this.fully_dirty = false;
            this.pending.clear();
            this.reset();
            for (const { source } of this.sources)
            {
                if (is_collection(source))
                    for (const value of source.get() as Iterable<IN>)
                        this.merger(NONE, value, source, this.target);
                else
                    this.merger(NONE, (source as StatefulSubscribable<IN>).get(), source, this.target);
            }
        }
        else if (this.pending.size)
        {
            const pending = this.pending;
            this.pending = new Map();
            for (const { prev, next, source } of pending.values())
                this.merger(prev, next, source, this.target);
        }

        this.flushing = false;
    }
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
export function reduce<IN, TARGET extends StatefulSubscribable<any>>(
    source: ReduceSource<IN> | ReduceSource<IN>[],
    merger: Merger<IN, TARGET>,
    target: TARGET,
    opts?: { dependencies?: StatefulSubscribable<any>[] }
): TARGET
{
    const r = new Reduce<IN, TARGET>(target, merger, opts);
    const sources = Array.isArray(source) ? source : [source];

    for (const s of sources)
    {
        if (is_collection(s))
            r.register_collection(s as I_NativeCollection<IN, any>);
        else
            r.register_signal(s as StatefulSubscribable<IN>);
    }

    return target;
}

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
export function count<IN>(
    collection: I_NativeCollection<IN, any>,
    weight: (value: IN) => number = () => 1,
    opts?: { dependencies?: StatefulSubscribable<any>[]; reactive?: boolean }
): NativeSignal<number>
{
    if (opts?.reactive)
        return count_reactive(collection, weight);

    const target = new NativeSignal(0);
    const w = (v: IN | NONE) => (v === NONE ? 0 : weight(v));

    reduce<IN, NativeSignal<number>>(
        collection,
        (prev, next, _source, t) =>
        {
            const delta = w(next) - w(prev);
            if (delta !== 0)
                t.set((t as any)._value + delta);
        },
        target,
        { dependencies: opts?.dependencies }
    );

    return target;
}

/**
 * Reactive `count`: each item's contribution is an eager `Computed`, so a `weight`
 * that reads signals re-counts that item when those signals change.
 */
function count_reactive<IN>(
    collection: I_NativeCollection<IN, any>,
    weight: (value: IN) => number
): NativeSignal<number>
{
    const target = new NativeSignal(0);
    const entries = new Map<IN, { computed: Computed<void>; state: { prev: number } }>();

    function listen(value: IN)
    {
        const state = { prev: 0 };
        const computed = new Computed<void>(() =>
        {
            const next = weight(value); // tracks any signals weight() reads
            const delta = next - state.prev;
            state.prev = next;
            if (delta !== 0)
                target.set((target as any)._value + delta);
        }, undefined, true); // eager: runs now and on every tracked-signal change

        entries.set(value, { computed, state });
    }

    function unlisten(value: IN)
    {
        const entry = entries.get(value);
        if (!entry)
            return;
        entry.computed.destroy();
        entries.delete(value);
        if (entry.state.prev !== 0)
            target.set((target as any)._value - entry.state.prev);
    }

    for (const value of collection.get())
        listen(value);

    const handler = (_source: any, event: { event: string; value: IN }) =>
    {
        if (event.event === "add")
            listen(event.value);
        else if (event.event === "delete")
            unlisten(event.value);
    };
    collection.subscribe_event(handler as any);

    // Keep the (weakly-held) event handler and the per-item Computeds alive for as long
    // as the caller keeps the result.
    (target as any)._reactive_handler = handler;
    (target as any)._reactive_entries = entries;

    return target;
}

/**
 * Derive a filtered collection: items satisfying `predicate` are mirrored into the
 * output, tracking the source through add/delete.
 *
 * @param opts.into Optional output collection to fill (defaults to a new `SignalSet`).
 */
export function filter<IN>(
    collection: I_NativeCollection<IN, any>,
    predicate: (value: IN) => boolean,
    opts?: { into?: SignalSet<IN> }
): SignalSet<IN>
{
    const target = opts?.into ?? new SignalSet<IN>();

    reduce<IN, SignalSet<IN>>(
        collection,
        (prev, next, _source, t) =>
        {
            if (prev !== NONE)
                t.delete(prev);
            if (next !== NONE && predicate(next))
                t.add(next);
        },
        target
    );

    return target;
}

/**
 * Derive a mapped collection: each source item is transformed by `fn` and mirrored
 * into the output, tracking the source through add/delete.
 *
 * @param opts.into Optional output collection to fill (defaults to a new `SignalSet`).
 */
export function map<IN, OUT>(
    collection: I_NativeCollection<IN, any>,
    fn: (value: IN) => OUT,
    opts?: { into?: SignalSet<OUT> }
): SignalSet<OUT>
{
    const target = opts?.into ?? new SignalSet<OUT>();

    reduce<IN, SignalSet<OUT>>(
        collection,
        (prev, next, _source, t) =>
        {
            if (prev !== NONE)
                t.delete(fn(prev));
            if (next !== NONE)
                t.add(fn(next));
        },
        target
    );

    return target;
}
