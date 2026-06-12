import { Flatten } from "src/_decorators/flatten.js";
import EventManager, { push_subscribable } from "./_events.js";
import type { LinkedList, StatefulSubscribable } from "./Subscribable.js";
import Subscribable from "./Subscribable.js";

/**
 * The simplest stateful subscribable: a single value that can be read with `get()`
 * and changed with `set(...)` / `update(...)`.
 *
 * **Dependency tracking.** Calling `get()` while a `Computed` is evaluating registers
 * this signal as a dependency of that computed (via `EventManager.global_listeners`).
 * That is the entire mechanism by which computeds discover what they depend on.
 *
 * **Coalesced emission.** When `set(...)` is called, dependants are marked dirty
 * synchronously, but value subscribers are notified *asynchronously* on a microtask.
 * This lets a thousand synchronous `set(...)`s in the same tick collapse into one
 * emission. The `queued` flag prevents duplicate microtask registrations.
 *
 * The `@Flatten()` decorator is a build-time hint to flatten the prototype chain
 * (Subscribable → NativeSignal becomes a single-level class). This roughly 5xs
 * construction speed on Node.js and is a deliberate microoptimization for hot-path
 * code that creates many signals. Do not "clean up" this inheritance pattern without
 * understanding the perf implications.
 */
@Flatten()
export class NativeSignal<T> extends Subscribable<T> implements StatefulSubscribable<T>
{
    /**
     * The internal value. Reading this directly bypasses dependency tracking — useful
     * if you want to observe the value without making the surrounding `Computed`
     * subscribe to it. In normal code, prefer `get()`.
     */
    _value: T;


    /**
     * Creates a new Signal with an initial value.
     * @param value The initial value of the signal.
     */
    constructor(value: T)
    {
        super();
        this._value = value;
    }

    /**
     * Get the current value of the signal.
     *
     * If called while a `Computed` is evaluating, registers this signal as a dependency
     * of that computed.
     */
    get(): T
    {
        push_subscribable(this);
        return this._value;
    }

    /**
     * Set a new value. If the new value is `===` the current one, this is a no-op
     * (no dirty propagation, no emission). Otherwise dependants are marked dirty
     * synchronously and an emission is queued for the next microtask.
     */
    set(value: T): void
    {
        if (value === this._value)
            return;
        this._value = value;
        this.dirty(this, undefined, value);
    }

    /**
     * Update the value by applying a function to the current value. Equivalent to
     * `signal.set(fn(signal._value))`.
     */
    update(fn: (v: T) => T)
    {
        const value = fn(this._value);
        if (value === this._value)
            return;
        this._value = value;
        this.dirty(this, undefined, value)
    }

    /**
     * Mark this signal and all of its dependants dirty, and queue a microtask emission
     * if there are any value subscribers.
     *
     * The `queued` early-return is important: if an emission is already scheduled,
     * dirty propagation has already happened, so we don't need to walk the dependant
     * graph again.
     */
    override dirty(source: this = this, ref?: LinkedList<T>, value?: T)
    {
        // If it's queued for emit(), then it stands to reason that it has already
        // propagated dirty as well.
        if (this.version < 0)
            return this;


        // Has subscribers?
        if (this.subscribers !== undefined)
        {
            this.version = -this.version - 1;
            EventManager.register_async_emit(this.on_emit, this);
            super.dirty(source, ref);
        }
        else if(this.dependants)
        {
            this.version++;
            super.dirty(source, ref);
        }


        return this;
    }

    /**
     * Microtask callback used by `dirty`. Resets the `queued` flag and fires the
     * value to all subscribers. Defined as a method (not an arrow on the instance)
     * so it can be shared on the prototype; `context` is passed explicitly to avoid
     * needing a bound `this`.
     */
    on_emit(context: this)
    {
        context.version = -context.version; // flip back to positives.
        context.emit(context._value);
    }
}

/** A `NativeSignal` exposed without `set` — for handing out read-only views. */
export type ReadonlySignal<T> = Omit<NativeSignal<T>, "set">;