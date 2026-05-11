import { I_Eventable } from "../Core/Subscribable.js";

/**
 * Helper type that constrains a collection's event map to (at minimum) `add` and
 * `delete` events with values of type `T`, while still allowing the collection to
 * declare additional named events (like `Order`'s `move`).
 */
export type ReqColTypes<T> = {
    add: {
        event: "add";
        value: T;
    },
    delete: {
        event: "delete";
        value: T;
    },
    [K: Exclude<string, "add" | "delete">]: {
        event: string;
        value: any
    }
};

/**
 * The shared interface for every collection in the framework (`SignalSet`,
 * `SignalMap`, `SignalHeap`, `Order`).
 *
 * What it guarantees:
 *  - `get()` returns an iterable of the current contents.
 *  - The collection is `I_Eventable` with at least `add` and `delete` events.
 *
 * Concrete collections add their own methods (e.g. `add`/`delete`/`set`/`push`/`shift`)
 * and may add additional named events (e.g. `move` on `Order`).
 */
export interface I_NativeCollection<T, Events extends ReqColTypes<T> = ReqColTypes<T>> extends I_Eventable<Events>
{
    get(): Iterable<T>;

    // _add(value:T);
    // _delete(value:T);
}
