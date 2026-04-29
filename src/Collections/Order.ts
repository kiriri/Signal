

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

        this.order.emit_event({
            event:"add",
            value:this.value,
            node:this
        });

        this.order.emit(this.order.first);

        return node;
    }

    insertBefore(value:T)
    {
        let node = this.order._createNode(value);

        this._insertBefore(node);

        this.order.emit_event({
            event:"add",
            value:this.value,
            node:this
        });

        this.order.emit(this.order.first);

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

        this.order.emit_event({
            event:"move",
            value:this as any,
            prevNext,
            prevPrev
        });
        this.order.emit(this.order.first);

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

        this.order.emit_event({
            event:"delete",
            value:this.value,
            node:this
        });

        this.order.emit(this.order.first);
        this.order = null;
    }

    *[Symbol.iterator]()
    {
        let node = this as OrderNode<T>;
        while(node)
        {
            yield node.value;
            node = node.next;
        }
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


export class Order<T> extends Subscribable<Iterable<T>,OrderEvents<T>> implements I_NativeCollection<T, OrderEvents<T>>
{
    nodes: Map<T,OrderNode<T>> = new Map();
    first: OrderNode<T> = null;
    last: OrderNode<T> = null;

    constructor(values?: Iterable<T>)
    {
        super();
        if(values)
            for(let value of values)
                this._add(value);
    }

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

        this.emit_event({
            event:"add",
            value:node.value,
            node
        });

        this.emit(this.first);

        return node;
    }

    shift(value:T)
    {
        let node = this._createNode(value);
        
        if(this.first !== node)
            this.first._insertBefore(node);

        this.emit_event({
            event:"add",
            value:node.value,
            node
        });

        this.emit(this.first);

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
            this.emit_event({
                event:"delete",
                value:node.value,
                node
            });
        }

        this.emit(this.first);
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