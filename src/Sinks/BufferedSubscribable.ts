import { Dirtyable, Subscribable, I_Subscribable } from "../Core/Subscribable";

const EMPTY = {} as any;

/**
 * Represents a subscribable value that can be observed for changes.
 * Eg an output can be wrapped inside a buffered subscribable to always 
 * store the last emitted value, even though outputs themselves are not
 * stateful.
 * That is why when used in a transaction, BufferedSubscribable
 * will emit the history of all changes during the 
 * transaction right after.
 */
export class BufferedSubscribable<T> implements I_Subscribable<T[]>
{
    // Dirty in this case just means that it has registered the deferred emit function.
    _dirty = false;
    protected buffer: T[] = [];

    protected readonly proxy = new Subscribable<T[]>();

    /**
     * Pipe all changes from the subscribable into this buffered subscribable.
     * Returns an unsubscribe function.
     * @param target 
     * @returns 
     */
    attach(target:Subscribable<T>)
    {
        const ref = target.subscribe(this.on_target_change);

        return ()=>target.unsubscribe(ref);
    }

    on_target_change = (source: Subscribable<T>, value: T) =>
    {
        this.buffer.push(value);

        if(this._dirty)
            return;

        this._dirty = true;

        Subscribable.register_async_emit(()=>{
           this._dirty = false;
    
            const buffer = this.buffer;
            this.buffer = [];
    
            this.proxy.emit(buffer);
        });
    }



    readonly subscribe = this.proxy.subscribe.bind(this.proxy);
    readonly unsubscribe = this.proxy.unsubscribe.bind(this.proxy);
    readonly dirty = this.proxy.dirty.bind(this.proxy);

    /**
     * Please note that Buffered Subscribables by design defers emissions.
     * @param value 
     */
    emit(value:T = EMPTY)
    {
        this.on_target_change(undefined,value);
    }

    /**
     * Returns the current buffer and resets it internally.
     * Note that this conflicts with attached subscribables, which will
     * not receive the full buffer anymore.
     * @returns 
     */
    consume()
    {
        const result = this.buffer;
        this.buffer = [];
        this._dirty = false;

        if(Subscribable.global_listeners)
            Subscribable.global_listeners.push(this.proxy);

        return result;
    }
}

