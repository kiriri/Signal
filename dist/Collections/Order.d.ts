import { Subscribable } from "../Core/Subscribable";
import { BufferedSubscribable } from "../Sinks/BufferedSubscribable";
import type { I_NativeCollection } from "../Collections/Collection";
export declare class OrderNode<T> implements OrderNode<T> {
    value: T;
    order: Order<T>;
    next: OrderNode<T> | null;
    prev: OrderNode<T> | null;
    constructor(value: T, order: Order<T>);
    _insertAfter(value: OrderNode<T>): void;
    _insertBefore(value: OrderNode<T>): void;
    insertAfter(value: T): OrderNode<T>;
    insertBefore(value: T): OrderNode<T>;
    /**
     * Move this node such that it is the next node after the reference node.
     * @param value
     */
    moveAfter(reference: OrderNode<T>): this;
    /**
     * Deletes the node from the order.
     * DO NOT REUSE THE NODE AFTERWARDS!
     * (There are no guardrails for performance reasons)
     */
    delete(): void;
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
        prevPrev: OrderNode<T> | null;
        prevNext: OrderNode<T> | null;
    };
};
export declare class Order<T> extends Subscribable<Map<T, OrderNode<T>>, OrderEvents<T>> implements I_NativeCollection<T, OrderEvents<T>> {
    nodes: Map<T, OrderNode<T>>;
    first: OrderNode<T>;
    last: OrderNode<T>;
    _on_change: BufferedSubscribable<OrderEvents<T>[keyof OrderEvents<T>]>;
    _on_change_instant: Subscribable<{
        event: "add";
        node: OrderNode<T>;
        value: T;
    } | {
        event: "delete";
        node: OrderNode<T>;
        value: T;
    } | {
        event: "move";
        value: T;
        prevPrev: OrderNode<T>;
        prevNext: OrderNode<T>;
    }, {}>;
    get(): T[];
    _createNode(value: T): OrderNode<T>;
    _delete(value: T): void;
    _add(value: T): void;
    push(value: T): OrderNode<T>;
    shift(value: T): OrderNode<T>;
    getNode(value: T): OrderNode<T>;
    size(): number;
    clear(): void;
    [Symbol.iterator](): Generator<OrderNode<T>, void, unknown>;
}
