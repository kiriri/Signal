import { Collection } from "../Collections/Collection.js";
/**
 * A node in an `Order`. Holds a value plus links to neighboring nodes and a
 * back-reference to the owning `Order` (so the node can implement `delete()` /
 * `insert_after()` / etc. directly).
 *
 * Returned to the caller from `Order.push` / `Order.shift` / `Order.insert_after`
 * / `Order.insert_before`. Hold onto it if you want to remove this entry later in
 * O(1).
 */
export declare class OrderNode<T> implements OrderNode<T> {
    value: T;
    order: Order<T>;
    next: OrderNode<T> | null;
    prev: OrderNode<T> | null;
    constructor(value: T, order: Order<T>);
    /** Internal: splice `value` into the list after `this`, no events fired. */
    _insert_after(value: OrderNode<T>): void;
    /** Internal: splice `value` into the list before `this`, no events fired. */
    _insert_before(value: OrderNode<T>): void;
    /** Insert a new node with `value` immediately after this one. */
    insert_after(value: T): OrderNode<T>;
    /** Insert a new node with `value` immediately before this one. */
    insert_before(value: T): OrderNode<T>;
    /**
     * Move this node to be the immediate successor of `reference`. Fires a `move`
     * event with the previous neighbors so subscribers can compute the delta.
     */
    move_after(reference: OrderNode<T>): this;
    /**
     * Remove this node from the order.
     *
     * **Do not reuse the node afterwards.** There are no guardrails for performance
     * reasons — calling methods on a deleted node will read stale links and corrupt
     * the list.
     */
    delete(): void;
    [Symbol.iterator](): Generator<T, void, unknown>;
}
export type OrderEvents<T> = {
    add: {
        event: "add";
        node: OrderNode<T>;
        value: T;
    };
    delete: {
        event: "delete";
        node: OrderNode<T>;
        value: T;
    };
    move: {
        event: "move";
        value: T;
        prev_prev: OrderNode<T> | null;
        prev_next: OrderNode<T> | null;
    };
};
/**
 * An ordered, doubly-linked list of unique values, wrapped as a Subscribable.
 *
 * Like the other collections, exposes both whole-collection emission (via
 * `subscribe`) and per-change events (via `subscribe_event` — `add`/`delete`/`move`).
 *
 * **Order semantics.** Insertion order is preserved. Each value can appear at most
 * once (uniqueness is enforced via the internal `nodes` map keyed by value). Use
 * `push` to append, `shift` to prepend (note: this matches the array-method names by
 * shape, not by meaning — `Array.prototype.shift` removes from the head, but here
 * `shift` *inserts* at the head).
 *
 * `push`, `shift`, and the `OrderNode.insert_*` methods all return the new
 * `OrderNode<T>`. Hold onto it if you want O(1) deletion or movement later.
 */
export declare class Order<T> extends Collection<T, Iterable<T>, OrderEvents<T>> {
    /** Map from value → its node. Enforces uniqueness and provides O(1) lookup. */
    nodes: Map<T, OrderNode<T>>;
    /** Head of the list. `null` when empty. */
    first: OrderNode<T>;
    /** Tail of the list. `null` when empty. */
    last: OrderNode<T>;
    constructor(values?: Iterable<T>);
    /**
     * Returns a snapshot array of the current values, in order.
     *
     * **TODO:** cache this and invalidate on change.
     */
    get(): T[];
    /**
     * Internal: allocate a node, register it in `nodes`, and if the order was empty,
     * set it as both `first` and `last`. Caller is responsible for any further
     * splicing.
     */
    _create_node(value: T): OrderNode<T>;
    /** I_NativeCollection adapter for delete-by-value. */
    _delete(value: T): void;
    /** I_NativeCollection adapter for `push`. */
    _add(value: T): void;
    /** Append `value` to the tail. Returns the new node. */
    push(value: T): OrderNode<T>;
    /**
     * Prepend `value` to the head. Returns the new node.
     */
    unshift(value: T): OrderNode<T>;
    /** Look up the node holding `value`, or `undefined` if not present. */
    get_node(value: T): OrderNode<T>;
    /** Number of values in the order. */
    size(): number;
    /**
     * Remove every value. Fires a `delete` event per removed entry, then queues a
     * whole-collection emission.
     */
    clear(): void;
    [Symbol.iterator](): Generator<OrderNode<T>, void, unknown>;
}
