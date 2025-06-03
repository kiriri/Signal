
export type StatefulSubscribable<T> = I_Subscribable<T> & {get():T};

// This is a fake WeakRef. Using the real one results in bugs:
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
 * An object which can be marked as dirty.
 * This may imply that it lazily computes a value, like Compute,
 * or that it defers triggering a function like Effect.
 */
export interface Dirtyable {
    dirty(source?:I_Subscribable<any>):void;
    // _dirty:boolean;
}

export interface I_Subscribable<T>{
    subscribe(subscribable : Dirtyable) : this;
    subscribe(subscribable : (source:I_Subscribable<T>, value: T) => any|void) : this;
    subscribe(
        fn: ((source:I_Subscribable<T>, value: T) => any|void) | Dirtyable, 
    ):this;

    unsubscribe(subscribable : Dirtyable) : this;
    unsubscribe(subscribable : (source:I_Subscribable<T>, value: T) => any|void) : this;
    unsubscribe(
        fn: ((source:I_Subscribable<T>, value: T) => any|void) | Dirtyable, 
    ):this;

    dirty(source?:I_Subscribable<any>):this;
}

/**
 * Represents a subscribable value that can be observed for changes.
 */
export class Subscribable<T> implements I_Subscribable<T>
{
    
    // This is set or replaced whenever a computed type ( or a similar custom Subscribable )
    // runs its .get() function. While it is open, any other subscribable's get() function
    // should add itself to this set. This way the computed signal knows which signals it
    // depends on.
    static  global_listeners: Subscribable<any>[] = null!;

    // 
    static waiting_to_emit : Function[] = []; 

    // To avoid updating say an effect every time its dependency changes while the same function
    // is processing, it will register its callback with an async delay, 
    // which in reality should wait until whatever sync function is running is done.
    // This means the effect only triggers once after all dependencies were set, instead of once
    // for each dependency that changed.
    static register_async_emit(fn:Function)
    {
        if(this.waiting_to_emit.length <= 0)
        {
            const a = ()=>{
                const emits = this.waiting_to_emit;
                this.waiting_to_emit = [];
                for(let f of emits)
                {
                    f();
                }
            }
            // setImmediate is faster but only works reliably in node
            if(typeof process === 'object')
                setImmediate(a);
            else // firefox breaks terribly if setImmediate is used.
                setTimeout(a,0);
        }
        this.waiting_to_emit.push(fn);
    }

    // These functions want to be called when this Subscribable's value changes.
    // We store them as WeakRefs so they get GCed when nobody uses the object anymore.
    subscribers: Set<
        WeakRef<(source:Subscribable<T>, value: T) => any> | 
        FakeWeakRef<(source:Subscribable<T>, value: T) => any>
    > | undefined;

    dependants: Set<WeakRef<Subscribable<any>>> | undefined;

    // readonly uid = uid();

    /**
     * Subscribes a function to be called when the value of this Subscribable changes.
     * @param fn - The function to subscribe.
     * @param function_owns_signal - If true, this subscribable will not GC while the function is being held. If false, the function will not GC while the signal is held.
     * @param subscribable If set, instantly sets the target subscribable to dirty when this subscribable emits.
     */
    subscribe(subscribable : Dirtyable) : this;
    subscribe(subscribable : (source:I_Subscribable<T>, value: T) => any|void) : this;
    subscribe(
        fn: ((source:I_Subscribable<T>, value: T) => any|void) | Dirtyable, 
    )
    {
        if (Subscribable.global_listeners)
            Subscribable.global_listeners.push(this);

        if(typeof fn === "function")
        {
            if (!this.subscribers)
                this.subscribers = new Set();

            let weak_entry : WeakRef<typeof fn> | FakeWeakRef<typeof fn>;

            weak_entry = (fn as any)["$weakRef"]??=new WeakRef(fn);

            // if(function_owns_signal)
            // {
            //     weak_entry = new WeakRef(entry);
    
            //     (fn as any)["$weakRef"]??=new WeakRef(entry);
            //     (fn as any)[this.uid] = this; // Don't remove the weak ref until this is removed as well
            // }
            // else if(function_owns_signal === false)
            // {
            //     this.subscribers.add((fn as any)["$fweakRef"]??=new FakeWeakRef(entry))
            // }
            // else
            // {
            //     this.subscribers.add((fn as any)["$weakRef"]??=new WeakRef(entry))
            // }

            this.subscribers.add(weak_entry);
        }
        else
        {
            if (!this.dependants)
                this.dependants = new Set();

            this.dependants.add((fn as any)["$weakRef"]??=new WeakRef(fn))
        }

        return this;
    }

    /**
     * Unsubscribes a function from being called when the value of this Subscribable changes.
     * @param fn - The function to unsubscribe.
     */
    unsubscribe(subscribable : Dirtyable) : this;
    unsubscribe(subscribable : (source:I_Subscribable<T>, value: T) => any|void) : this;
    unsubscribe(
        fn: ((source:I_Subscribable<T>, value: T) => any|void) | Dirtyable, 
    ):this
    {
        if(typeof fn === "function")
        {
            if (this.subscribers)
            {
                if((fn as any)["$weakRef"])
                    this.subscribers.delete((fn as any)["$weakRef"]);
                if((fn as any)["$fweakRef"])
                    this.subscribers.delete((fn as any)["$fweakRef"]);
                // delete (fn as any)[this.uid];
            }
        }
        else
        {
            this.dependants?.delete((fn as any)["$weakRef"])
            delete (fn as any)["$weakRef"];
        }

        return this;
    }

    /**
     * Call this whenever this subscribable or any of its dependencies have changed.
     * This should propagate all the way through all subscribable which depend on this.
     */
    dirty(source?:I_Subscribable<any>)
    {   
        // Propagate dirty state to all dependent subscribables.
        if (this.dependants)
        {
            const values = this.dependants.values();

            for(const ref of values)
            {
                const deref = ref.deref();
                if(!deref)
                    this.dependants.delete(ref);
                else
                {
                    deref.dirty(this)
                }
            }
        }  

        return this;
    }


    /**
     * Emits a new value and notifies all subscribers immediately
     * @param value - The new value to emit.
     */
    emit(value: T)
    {
        if (this.subscribers)
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

        return this;
    }

    promise():Promise<T>
    {
        let resolve: (arg0: T) => void;
        const subscriber = (source:Dirtyable,v:T)=>{
            this.unsubscribe(subscriber);
            resolve(v);
        }
        this.subscribe(subscriber);
        return new Promise((_resolve)=>{
            resolve = _resolve
        })
    }
}