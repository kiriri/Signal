import { Subscribable } from "./Subscribable";

/**
 * Represents a subscribable value that can be observed for changes.
 */
export class BufferedSubscribable<T> extends Subscribable<T[]>
{
    
    protected readonly buffer : T[] = [];

    /**
     * Emits a new value and notifies all subscribers immediately, unless in a transaction.
     * @param value - The new value to emit.
     */
    // @ts-expect-error ( We emit single values, but the underlyign subscribable handles 
    // them as arrays )
    override emit(value: T)
    {
        if (this.subscribers)
        {
            // const subscribers = this.subscribers.values();
            if(Subscribable.global_transaction_depth)
            {
                this.buffer.push(value);
                // If this is the first buffered item, add all subscribers to the list
                // of functions to emit after the transaction is done.
                // We only need to do this once per transaction, because buffer remains
                // constant.
                if(this.buffer.length === 1)
                {
                    for(const subscriber of this.subscribers)
                    {
                        const deref = subscriber.deref();
                        if(!deref)
                            this.subscribers.delete(subscriber);
                        else
                            Subscribable.global_transactions.set(deref!,this.buffer);
                    }

                    // Reset buffer after transaction is done.
                    Subscribable.global_transactions.set(this.reset_buffer,null)
                }
            }
            else
            {
                for(const ref of this.subscribers)
                {
                    const deref = ref.deref();
                    if(!deref)
                        this.subscribers.delete(ref);
                    else
                        deref([value])
                }
            }
        }
    }

    reset_buffer = ()=>{this.buffer.length = 0};

    override subscribe(fn: (value: T[]) => any | void): this
    {
        super.subscribe(fn);

        // If at least one item exists in buffer, tell the new subscription as soon
        // as the transaction ends.
        if(Subscribable.global_transaction_depth && this.buffer.length)
        {
            Subscribable.global_transactions.set(fn,this.buffer);
        }
        
        return this;
    }
}

