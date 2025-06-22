

import { Subscribable } from "../Core/Subscribable";
import { BufferedSubscribable } from "../Sinks/BufferedSubscribable";
import type { I_NativeCollection } from "../Collections/Collection";

export class OrderNode<T> implements OrderNode<T> 
{
    value: T;
    order: Order<T>;
    next: OrderNode<T> | null = null;
    prev: OrderNode<T> | null = null;

    constructor(value: T, order:Order<T>)
    {
        this.value = value;
        this.order = order;
    }

    _insertAfter(value:OrderNode<T>)
    {
        if(this.next === null)
        {
            this.order.last = value;
        }

        value.next = this.next;
        value.prev = this;
        this.next = value;
    }

    _insertBefore(value:OrderNode<T>)
    {
        if(this.prev === null)
            this.order.first = value;

        value.prev = this.prev;
        value.next = this;
        this.prev = value;
    }

    insertAfter(value:T)
    {
        let node = this.order._createNode(value);

        this._insertAfter(node);

        this.order._on_change.emit({
            event:"add",
            value:this.value,
            node:this
        });
        this.order._on_change_instant.emit({
            event:"add",
            value:this.value,
            node:this
        });

        this.order.emit(this.order.nodes);

        return node;
    }

    insertBefore(value:T)
    {
        let node = this.order._createNode(value);

        this._insertBefore(node);

        this.order._on_change.emit({
            event:"add",
            value:this.value,
            node:this
        });
        this.order._on_change_instant.emit({
            event:"add",
            value:this.value,
            node:this
        });

        this.order.emit(this.order.nodes);

        return node;
    }

    /**
     * Move this node such that it is the next node after the reference node.
     * @param value 
     */
    moveAfter(reference:OrderNode<T>)
    {
        let prevNext = this.next;
        let prevPrev = this.prev;

        if(this.next)
            this.next.prev = this.prev;
        if(this.prev)
            this.prev.next = this.next;

        this.prev = reference;
        this.next = reference.next;

        reference.next = this;

        this.order._on_change.emit({
            event:"move",
            value:this as any,
            prevNext,
            prevPrev
        });

        this.order._on_change_instant.emit({
            event:"move",
            value:this as any,
            prevNext,
            prevPrev
        });
        this.order.emit(this.order.nodes);

        return this;
    }

    /**
     * Deletes the node from the order.
     * DO NOT REUSE THE NODE AFTERWARDS!  
     * (There are no guardrails for performance reasons)
     */
    delete()
    {
        if(this.prev)
            this.prev.next = this.next;
        else
            this.order.first = this.next;
        if(this.next)
            this.next.prev = this.prev;
        else
            this.order.last = this.prev;

        this.next = null;
        this.prev = null;
        
        this.order.nodes.delete(this.value);

        this.order._on_change.emit({
            event:"delete",
            value:this.value,
            node:this
        });

        this.order._on_change_instant.emit({
            event:"delete",
            value:this.value,
            node:this
        });

        this.order.emit(this.order.nodes);
        this.order = null;
    }

}


export type OrderEvents<T> = {
    add:{
        event: "add"; 
        node: OrderNode<T>;
        value: T;
    },
    delete:{
        event: "delete"; 
        node: OrderNode<T>;
        value: T;
    },
    move:{
        event: "move",
        value: T;
        prevPrev:OrderNode<T> | null;
        prevNext:OrderNode<T> | null;
    }
};


export class Order<T> extends Subscribable<Map<T, OrderNode<T>>,OrderEvents<T>> implements I_NativeCollection<T, OrderEvents<T>>
{
    nodes: Map<T,OrderNode<T>> = new Map();
    first: OrderNode<T> = null;
    last: OrderNode<T> = null;
    _on_change: BufferedSubscribable<OrderEvents<T>[keyof OrderEvents<T>]> = new BufferedSubscribable();
    _on_change_instant = new Subscribable<OrderEvents<T>[keyof OrderEvents<T>]>;

    get()
    {
        // TODO : Cache this! Clear cache on change.
        return [...this].map(v=>v.value);
    }

    _createNode(value:T)
    {
        let node = new OrderNode(value, this);

        this.nodes.set(value, node);

        if(!this.first)
            return this.first = this.last = node;

        return node;
    }

    _delete(value: T)
    {
        const node = this.nodes.get(value);
        node?.delete();
    }
    _add(value: T)
    {
        this.push(value);
    }
    push(value: T)
    {
        let node = this._createNode(value);
        
        if(this.last !== node)
            this.last._insertAfter(node);

        this._on_change.emit({
            event:"add",
            value:node.value,
            node
        });
        this._on_change_instant.emit({
            event:"add",
            value:node.value,
            node
        });

        this.emit(this.nodes);

        return node;
    }

    shift(value:T)
    {
        let node = this._createNode(value);
        
        if(this.first !== node)
            this.first._insertBefore(node);

        this._on_change.emit({
            event:"add",
            value:node.value,
            node
        });
        this._on_change_instant.emit({
            event:"add",
            value:node.value,
            node
        });

        this.emit(this.nodes);

        return node;
    }

    getNode(value:T)
    {
        return this.nodes.get(value);
    }

    size()
    {
        return this.nodes.size;
    }

    clear()
    {
        let nodes = this.nodes;
        this.nodes = new Map();

        this.first = null;
        this.last = null;

        for(let node of nodes.values())
        {
            this._on_change.emit({
                event:"delete",
                value:node.value,
                node
            });
            this._on_change_instant.emit({
                event:"delete",
                value:node.value,
                node
            });
        }

        this.emit(this.nodes);
    }

    *[Symbol.iterator]()
    {
        let node = this.first;
        while(node)
        {
            yield node;
            node = node.next;
        }
    }
}