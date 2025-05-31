


// export async function async_transaction(fn:()=>Promise<any>)
// {
//     Subscribable.global_transaction_depth++;

import { uid, uid2 } from "./Shared/UID";

//     const res = await fn();
    
//     Subscribable.global_transaction_depth--;

//     return res;
// }

export type StatefulSubscribable<T> = Subscribable<T> & {get():T};




// TODO : This is a fake WeakRef. Using the real one results in bugs:
// We want subscribers to disappear from the subscribers array when they are no longer used. But we don't want this subscribable,
// which active subscribers listen to, to be removed. WeakRefs are weak in both directions! Therefore we need to store "Is listening to"
// just to keep the source alive!
class FakeWeakRef<T>
{
    constructor(public value:T)
    {

    }

    deref()
    {
        return this.value;
    }
}

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
    static readonly global_transactions: Map<Subscribable<any>,any> = new Map();
    // How many transactions are currently open. Ticks up/down when entering/exiting transaction(...)
    static global_transaction_depth : number = 0;

    // These functions want to be called when this Subscribable's value changes.
    // We store them as WeakRefs so they get GCed when nobody uses the object anymore.
    subscribers: Set<WeakRef<(source:Subscribable<T>, value: T) => any>> | undefined;

    readonly uid = uid();

    /**
     * Subscribes a function to be called when the value of this Subscribable changes.
     * @param fn - The function to subscribe.
     * @param function_owns_signal - If true, this subscribable will not GC while the function is being held. If false, the function will not GC while the signal is held.
     */
    subscribe(fn: (source:Subscribable<T>, value: T) => any|void, function_owns_signal : boolean|null = false)
    {
        if(typeof fn !== "function")
            throw new Error("NOT A FUNCTION!")
        if (Subscribable.global_listeners)
            Subscribable.global_listeners.push(this);

        if (!this.subscribers)
            this.subscribers = new Set();

        
        if(function_owns_signal)
        {
            this.subscribers.add((fn as any)["$weakRef"]??=new WeakRef(fn));
            (fn as any)[this.uid] = this; // Don't remove the weak ref until this is removed as well
        }
        else if(function_owns_signal === false)
        {
            this.subscribers.add((fn as any)["$fweakRef"]??=new FakeWeakRef(fn))
        }
        else
        {
            this.subscribers.add((fn as any)["$weakRef"]??=new WeakRef(fn))
        }


        return this;
    }

    /**
     * Unsubscribes a function from being called when the value of this Subscribable changes.
     * @param fn - The function to unsubscribe.
     */
    unsubscribe(fn: (source:Subscribable<T>, value: T) => any)
    {
        if (this.subscribers)
        {
            if((fn as any)["$weakRef"])
                this.subscribers.delete((fn as any)["$weakRef"]);
            if((fn as any)["$fweakRef"])
                this.subscribers.delete((fn as any)["$fweakRef"]);
            delete (fn as any)[this.uid];
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
            if(Subscribable.global_transaction_depth)
            {
                Subscribable.global_transactions.set(this,value);
            }
            else
            {
                const values = this.subscribers.values();

                for(const ref of values)
                {
                    const deref = ref.deref();
                    if(!deref)
                        this.subscribers.delete(ref);
                    else
                    {
                        deref(this, value)
                    }
                }
            }
        }  
    }

    promise():Promise<T>
    {
        let resolve: (arg0: T) => void;
        const subscriber = (source:Subscribable<T>,v:T)=>{
            this.unsubscribe(subscriber);
            resolve(v);
        }
        this.subscribe(subscriber,false);
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
            let entries = [...(Subscribable.global_transactions as Map<Subscribable<any>,any>).entries()];
            if(entries.length === 0)
                break;
            Subscribable.global_transactions.clear();

            for(const [signal,arg] of entries)
            {
                signal.emit(arg);
            }
        }

        is_processing_transactions = false;
    }

    return res;
}