import { Subscribable } from "./Subscribable";

const BUFFER_NULL = {};

/**
 * Represents a subscribable value that can be observed for changes.
 * Eg an output can be wrapped inside a buffered subscribable to always 
 * store the last emitted value, even though outputs themselves are not
 * stateful.
 * That is why when used in a transaction, BufferedSubscribable
 * will emit the history of all changes during the 
 * transaction right after.
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
                if(Subscribable.global_transaction_depth)
                {
                    Subscribable.global_transactions.set(this,BUFFER_NULL);
                }
            }
            else
            {
                let buffer = this.buffer;
                // If the buffer exists, ignore the current value.
                if(buffer.length > 0)
                {
                    buffer = [...buffer];

                    // sanity check
                    if(value !== BUFFER_NULL)
                    {
                        // Edge case : subscriber triggered before BUFFER_NULL

                        buffer.push(value);
                        
                        // throw new Error("Fatal error. Expected null, got " + value);
                    }
                    
                    this.buffer.length = 0;
                }
                else
                {
                    // Edge case, a subscribe call has already triggered this.
                    if(BUFFER_NULL === value)
                        return;
                    buffer = [value];
                }
                
                for(const ref of this.subscribers)
                {
                    const deref = ref.deref();
                    if(!deref)
                        this.subscribers.delete(ref);
                    else
                        deref(this as any, buffer)
                }
            }
        }
    }

    override subscribe(fn: (source:Subscribable<T[]>, value: T[]) => any | void): this
    {
        super.subscribe(fn, true);

        // If at least one item exists in buffer, tell the new subscription as soon
        // as the transaction ends.
        // if(Subscribable.global_transaction_depth && this.buffer.length)
        // {
        //     Subscribable.global_transactions.set(this,this.buffer);
        // }
        
        return this;
    }
}

