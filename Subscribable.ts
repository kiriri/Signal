


// export async function async_transaction(fn:()=>Promise<any>)
// {
//     Subscribable.global_transaction_depth++;

//     const res = await fn();
    
//     Subscribable.global_transaction_depth--;

//     return res;
// }

export type StatefulSubscribable<T> = Subscribable<T> & {get():T};

/**
 * Represents a subscribable value that can be observed for changes.
 */
export class Subscribable<T>
{
    
    // This is set or replaced whenever a computed type ( or a similar custom Subscribable )
    // runs its .get() function. While it is open, any other subscribable's get() function
    // should add itself to this set. This way the computed signal knows which signals it
    // depends on.
    static  global_listeners: Subscribable<any>[] = null!;

    // While any transaction is active, no events are emitted.
    // This is a list of all the emitted functions and their latest value.
    // When the last transaction closes, all remaining functions will be notified.
    static readonly global_transactions: Map<Function,any> = new Map<Function,any>();
    // How many transactions are currently open. Ticks up/down when entering/exiting transaction(...)
    static global_transaction_depth : number = 0;

    // These functions want to be called when this Subscribable's value changes.
    subscribers: Set<WeakRef<(value: T) => any>> | undefined;

    /**
     * Subscribes a function to be called when the value of this Subscribable changes.
     * @param fn - The function to subscribe.
     */
    subscribe(fn: (value: T) => any|void)
    {
        if (Subscribable.global_listeners)
            Subscribable.global_listeners.push(this);

        if (!this.subscribers)
            this.subscribers = new Set();

        this.subscribers.add((fn as any)["$weakRef"]??=new WeakRef(fn));

        return this;
    }

    /**
     * Unsubscribes a function from being called when the value of this Subscribable changes.
     * @param fn - The function to unsubscribe.
     */
    unsubscribe(fn: (value: T) => any)
    {
        if (this.subscribers)
        {
            this.subscribers.delete((fn as any)["$weakRef"]);
        }

        return this;
    }

    /**
     * Emits a new value and notifies all subscribers immediately, unless in a transaction.
     * @param value - The new value to emit.
     */
    emit(value: T)
    {
        if (this.subscribers)
        {
            const values = this.subscribers.values();
            if(Subscribable.global_transaction_depth)
            {
                for(const ref of values)
                {
                    const deref = ref.deref();
                    if(!deref)
                        this.subscribers.delete(ref);
                    else
                        Subscribable.global_transactions.set(deref!,value);
                }    
            }
            else
            {
                for(const ref of values)
                {
                    const deref = ref.deref();
                    if(!deref)
                        this.subscribers.delete(ref);
                    else
                        deref(value)
                }
            }
        }  
    }

    promise():Promise<T>
    {
        let resolve: (arg0: T) => void;
        const subscriber = (v:T)=>{
            this.unsubscribe(subscriber);
            resolve(v);
        }
        this.subscribe(subscriber);
        return new Promise((_resolve)=>{
            resolve = _resolve
        })
    }
}


let is_processing_transactions = false;
export function transaction(fn:Function)
{
    Subscribable.global_transaction_depth++;
    const res = fn();
    Subscribable.global_transaction_depth--;

    if((!Subscribable.global_transaction_depth) && !is_processing_transactions)
    {
        is_processing_transactions = true;
        
        while(true)
        {
            let entries = [...(Subscribable.global_transactions as Map<Function,any>).entries()];
            if(entries.length === 0)
                break;
            Subscribable.global_transactions.clear();

            for(const [fn,arg] of entries)
            {
                fn(arg);
            }
        }

        is_processing_transactions = false;
    }

    return res;
}