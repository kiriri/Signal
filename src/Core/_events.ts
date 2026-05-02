import type Subscribable from "./Subscribable";

/**
 * Process-wide coordinator for the dependency graph and microtask-deferred emission.
 *
 * Two responsibilities:
 *
 * 1. **Dependency tracking** via `global_listeners`. While a `Computed` (or any
 *    similar custom subscribable) is evaluating its function, it sets
 *    `global_listeners` to an array. Any other subscribable's `get()` should push
 *    itself onto that array. After evaluation finishes, the computed knows exactly
 *    which signals it depends on.
 *
 * 2. **Coalesced emission** via `register_async_emit`. Stateful subscribables
 *    register their emit callback as a microtask, which means many synchronous
 *    `set(...)` calls during the same tick collapse into a single emission. The
 *    subscribable is responsible for not registering itself again before its
 *    previous registration has been processed (typically via a `queued` flag).
 *
 * Implemented as a class with static fields rather than module-level lets purely so
 * consumers can write `EventManager.global_listeners` without an extra import.
 */
export default class EventManager
{
    /**
     * The "currently evaluating Computed's listener bucket". `null` outside of any
     * computed evaluation. While set, every `get()` on a stateful subscribable should
     * push itself here so the enclosing computed can wire up its dependencies.
     */
    static readonly global_listeners: Subscribable<any, any>[] = [undefined];
    static global_listener_length = 0; // virtual length, we want to never contract global_listeners.
    static real_length = 1; // virtual length, we want to never contract global_listeners.
    static global_listen = 0; // how many levels down a computed or effect we are. > 0 means we must add to global_listeners. 0 means we can skip it.

    /** 
     * for a batched-emit optimization.
     * Interleaved function, context .
     * */
    static waiting_to_emit: any[] = [];
    static _is_waiting = false;

    /**
     * Register a function to be invoked once on the next microtask.
     *
     * Used to coalesce: if a signal changes 1000 times in a tick, the effect that
     * depends on it should only fire once *after* all changes have settled. The
     * caller is responsible for guarding against re-registration before the
     * microtask runs (typically with a `queued`/`_dirty` boolean).
     */
    static register_async_emit(fn: Function, context?: any)
    {

        this.waiting_to_emit.push(fn, context);

        if (!this._is_waiting)
        {
            this._is_waiting = true;
            queueMicrotask(EventManager.#process_queue);
        }
    }

    static #process_queue()
    {
        EventManager._is_waiting = false;
        const queue = EventManager.waiting_to_emit;
        EventManager.waiting_to_emit = [];

        for (let i = 0; i < queue.length; i += 2)
        {
            (queue[i] as Function)(queue[i + 1]);
        }
    }

    /**
     * Force all the functions waiting to emit to be processed.
     */
    static flush()
    {
        this.#process_queue();
    }
}

export function push_subscribable(sub: Subscribable<any, any>)
{
    if (EventManager.global_listen <= 0) return;
    if (EventManager.real_length === EventManager.global_listener_length)
    {
        EventManager.global_listeners.concat(new Array(EventManager.real_length))
        EventManager.real_length *= 2;
    }
    EventManager.global_listeners[EventManager.global_listener_length++] = sub;
}