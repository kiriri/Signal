import EventManager from "src/Core/_Events";
import type { Dirtyable, I_Subscribable, LinkedList } from "../Core/Subscribable";
import Subscribable from "../Core/Subscribable";

type MappedSignals<Inputs extends Record<string, Subscribable<any>>> = {[K in keyof Inputs]: Inputs[K] extends Subscribable<infer U> ? U : Inputs[K] extends {get():infer U} ? U : never};

/**
 * An effect may reference any number of subscribables in its function, but it will only run whenever one of its sources changes.
 */
export class Effect<Inputs extends Record<string, Subscribable<any>>, T>
{
    _source_cache: Record<keyof Inputs, Inputs[keyof Inputs] extends Subscribable<infer U> ? U : never> = {} as any;

    _updaters: { 
        [x: string]: LinkedList<WeakRef<(source: I_Subscribable<any>, value: any, ref: LinkedList<T>) => any | void>>; 
    } = {};

    // Dirty in this case just means that it has registered the deferred emit function.
    _dirty = false;
    _initialized = false;

    /**
     * Creates a new Computed signal with a function that computes its value.
     * @param fn - The function that computes the value of the computed signal.
     */
    constructor(
        public readonly sources: Inputs,
        // The function that is called to compute the current value of this Subscribable.
        public fn: (v: MappedSignals<Inputs>, self:any) => T,
        context ?: any
    )
    {
        const async_caller = ()=>{
            this._dirty = false;
            if(this._initialized === false)
                this.initialize();
            this.fn(this._source_cache, context );
        };
        
        let update_key_function = (signal,value,ref)=>{
            // @ts-ignore
            this._source_cache[ref.key] = value;

            if(this._dirty)
                return;
    
            this._dirty = true;
    
            EventManager.register_async_emit(async_caller);
        };

        for (let key in sources)
        {
            let ref = this._updaters[key] = sources[key].subscribe(update_key_function);
            // @ts-ignore
            ref.key = key;
        }
    }

    initialize()
    {
        const sources = this.sources;
        for (let key in sources)
        {
            // Not all subscribables have a value at all times.
            if(!(key in this._source_cache))
                this._source_cache[key] = (sources[key] as any)["get"]?.() ?? null;
        }

        this._initialized = true;
    }

    /**
     * Instantly removes all event listener references.
     * Call this to make sure an Effect for sure no longer
     * triggers. Without this the garbage collection may 
     * take seconds before it cleans up orphaned effects,
     * during which time they will still trigger!
     */
    destroy()
    {
        for(let key in this.sources)
        {
            const source = this.sources[key];

            source.unsubscribe(this._updaters[key]);
        }
    }
}