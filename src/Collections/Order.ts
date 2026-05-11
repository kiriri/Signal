import { Subscribable } from "../Core/Subscribable.js";
import type { I_NativeCollection } from "../Collections/Collection.js";

/**
 * A node in an `Order`. Holds a value plus links to neighboring nodes and a
 * back-reference to the owning `Order` (so the node can implement `delete()` /
 * `insert_after()` / etc. directly).
 *
 * Returned to the caller from `Order.push` / `Order.shift` / `Order.insert_after`
 * / `Order.insert_before`. Hold onto it if you want to remove this entry later in
 * O(1).
 */
export class OrderNode<T> implements OrderNode<T>
{
    value: T;
    order: Order<T>;
    next: OrderNode<T> | null = null;
    prev: OrderNode<T> | null = null;

    constructor(value: T, order: Order<T>)
    {
        this.value = value;
        this.order = order;
    }

    /** Internal: splice `value` into the list after `this`, no events fired. */
    _insert_after(value: OrderNode<T>)
    {
        if (this.next === null)
        {
            this.order.last = value;
        }

        value.next = this.next;
        value.prev = this;
        this.next = value;
    }

    /** Internal: splice `value` into the list before `this`, no events fired. */
    _insert_before(value: OrderNode<T>)
    {
        if (this.prev === null)
            this.order.first = value;

        value.prev = this.prev;
        value.next = this;
        this.prev = value;
    }

    /** Insert a new node with `value` immediately after this one. */
    insert_after(value: T)
    {
        let node = this.order._create_node(value);

        this._insert_after(node);

        this.order.emit_event({
            event: "add",
            value: this.value,
            node: this
        });

        this.order.emit(this.order.first);

        return node;
    }

    /** Insert a new node with `value` immediately before this one. */
    insert_before(value: T)
    {
        let node = this.order._create_node(value);

        this._insert_before(node);

        this.order.emit_event({
            event: "add",
            value: this.value,
            node: this
        });

        this.order.emit(this.order.first);

        return node;
    }

    /**
     * Move this node to be the immediate successor of `reference`. Fires a `move`
     * event with the previous neighbors so subscribers can compute the delta.
     */
    move_after(reference: OrderNode<T>)
    {
        let prev_next = this.next;
        let prev_prev = this.prev;

        if (this.next)
            this.next.prev = this.prev;
        if (this.prev)
            this.prev.next = this.next;

        this.prev = reference;
        this.next = reference.next;

        reference.next = this;

        this.order.emit_event({
            event: "move",
            value: this as any,
            prev_next: prev_next,
            prev_prev: prev_prev
        });
        this.order.emit(this.order.first);

        return this;
    }

    /**
     * Remove this node from the order.
     *
     * **Do not reuse the node afterwards.** There are no guardrails for performance
     * reasons — calling methods on a deleted node will read stale links and corrupt
     * the list.
     */
    delete()
    {
        if (this.prev)
            this.prev.next = this.next;
        else
            this.order.first = this.next;
        if (this.next)
            this.next.prev = this.prev;
        else
            this.order.last = this.prev;

        this.next = null;
        this.prev = null;

        this.order.nodes.delete(this.value);

        this.order.emit_event({
            event: "delete",
            value: this.value,
            node: this
        });

        this.order.emit(this.order.first);
        this.order = null;
    }

    *[Symbol.iterator]()
    {
        let node = this as OrderNode<T>;
        while (node)
        {
            yield node.value;
            node = node.next;
        }
    }
}


export type OrderEvents<T> = {
    add: {
        event: "add";
        node: OrderNode<T>;
        value: T;
    },
    delete: {
        event: "delete";
        node: OrderNode<T>;
        value: T;
    },
    move: {
        event: "move",
        value: T;
        prev_prev: OrderNode<T> | null;
        prev_next: OrderNode<T> | null;
    }
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
export class Order<T> extends Subscribable<Iterable<T>, OrderEvents<T>> implements I_NativeCollection<T, OrderEvents<T>>
{
    /** Map from value → its node. Enforces uniqueness and provides O(1) lookup. */
    nodes: Map<T, OrderNode<T>> = new Map();

    /** Head of the list. `null` when empty. */
    first: OrderNode<T> = null;

    /** Tail of the list. `null` when empty. */
    last: OrderNode<T> = null;

    constructor(values?: Iterable<T>)
    {
        super();
        if (values)
            for (let value of values)
                this._add(value);
    }

    /**
     * Returns a snapshot array of the current values, in order.
     *
     * **TODO:** cache this and invalidate on change.
     */
    get()
    {
        return [...this].map(v => v.value);
    }

    /**
     * Internal: allocate a node, register it in `nodes`, and if the order was empty,
     * set it as both `first` and `last`. Caller is responsible for any further
     * splicing.
     */
    _create_node(value: T)
    {
        let node = new OrderNode(value, this);

        this.nodes.set(value, node);

        if (!this.first)
            return this.first = this.last = node;

        return node;
    }

    /** I_NativeCollection adapter for delete-by-value. */
    _delete(value: T)
    {
        const node = this.nodes.get(value);
        node?.delete();
    }

    /** I_NativeCollection adapter for `push`. */
    _add(value: T)
    {
        this.push(value);
    }

    /** Append `value` to the tail. Returns the new node. */
    push(value: T)
    {
        let node = this._create_node(value);

        if (this.last !== node)
            this.last._insert_after(node);

        this.emit_event({
            event: "add",
            value: node.value,
            node
        });

        this.emit(this.first);

        return node;
    }

    /**
     * Prepend `value` to the head. Returns the new node.
     */
    unshift(value: T)
    {
        let node = this._create_node(value);

        if (this.first !== node)
            this.first._insert_before(node);

        this.emit_event({
            event: "add",
            value: node.value,
            node
        });

        this.emit(this.first);

        return node;
    }

    /** Look up the node holding `value`, or `undefined` if not present. */
    get_node(value: T)
    {
        return this.nodes.get(value);
    }

    /** Number of values in the order. */
    size()
    {
        return this.nodes.size;
    }

    /**
     * Remove every value. Fires a `delete` event per removed entry, then queues a
     * whole-collection emission.
     */
    clear()
    {
        let nodes = this.nodes;
        this.nodes = new Map();

        this.first = null;
        this.last = null;

        for (let node of nodes.values())
        {
            this.emit_event({
                event: "delete",
                value: node.value,
                node
            });
        }

        this.emit(this.first);
    }

    *[Symbol.iterator]()
    {
        let node = this.first;
        while (node)
        {
            yield node;
            node = node.next;
        }
    }
}