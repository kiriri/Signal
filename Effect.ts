// Computed signals will add a set to this when they get their value.
// Any other signal whose value is used will automatically add itself to the last array.

import { Subscribable } from "./Subscribable";

/**
 * An effect may reference any number of subscribables in its function, but it will only run whenever one of its sources changes.
 */
export class Effect<Inputs extends Record<string, Subscribable<any>>, T> extends Subscribable<T>
{
    _source_cache: Record<keyof Inputs, Inputs[keyof Inputs] extends Subscribable<infer U> ? U : never> = {} as any;

    /**
     * Creates a new Computed signal with a function that computes its value.
     * @param fn - The function that computes the value of the computed signal.
     * @param [standalone=true] - A standalone effect gets GCed when it's no longer being held. A non standalone effect only gets GCed if it and none of its sources are held any longer.
     */
    constructor(
        public readonly sources: Inputs,
        // The function that is called to compute the current value of this Subscribable.
        public fn: (v: Record<keyof Inputs, Inputs[keyof Inputs] extends Subscribable<infer U> ? U : never>) => T,
        standalone:boolean = true
    )
    {
        super();

        // this._source_cache = Object.fromEntries(Object.entries(sources).map(v => ([v[0], null]))) as any;
        for (let key in sources)
        {
            sources[key].subscribe(a.bind(this,key,fn), standalone);
            // Not all subscribables have a value at all times.
            this._source_cache[key] = (sources[key] as any)["get"]?.() ?? null;
        }
    }
}

const subscribe = function subscribe(this:{subscribers:Set<any>},fn: (value: any) => any)
{
    if (!this.subscribers)
        this.subscribers = new Set();

    this.subscribers.add(fn);

    return this;
};

/**
 * Unsubscribes a function from being called when the value of this Subscribable changes.
 * @param fn - The function to unsubscribe.
 */
const unsubscribe = function unsubscribe(this:{subscribers:Set<any>},fn: (value: any) => any)
{
    if (this.subscribers)
        this.subscribers.delete(fn);

    return this;
};

const emit = function emit(this:{subscribers:Set<any>},value:any)
{
    if (this.subscribers)
        this.subscribers.forEach(subscriber =>subscriber(value))
};

// export function effect<Inputs extends Record<string, Subscribable<any>>, T>
//     (
//         sources: Inputs, 
//         fn: (v: Record<keyof Inputs, Inputs[keyof Inputs] extends Subscribable<infer U> ? U : never>) => T
//     )
//     {
    
//     let _source_cache = {} as any;
//     // Object.fromEntries(Object.entries(sources).map(v => ([v[0], null]))) as any
//     // for(let key in sources)
//     // {
//     //     sou
//     // }

//     // let subscribers : Set<Function> | null;

//     const res = {
        
//     } as Subscribable<T>;

//     res["emit"] = emit.bind(res as any);
//     res["subscribe"] = subscribe.bind(res as any);
//     res["unsubscribe"] = unsubscribe.bind(res as any);

//     for (let key in sources)
//     {
//         sources[key].subscribe((value) =>
//         {
//             _source_cache[key] = value;
//             res.emit(fn(_source_cache));
//         })
//     }

//     return res;
// }

// export type Effect<T> = Subscribable<T> & { _source_cache: any };

function a<T>(this: any, key:string ,fn : any, value : T)
{
    this._source_cache[key] = value; 
    this.emit(fn(this._source_cache));
}

export function effect<Inputs extends Record<string, Subscribable<any>>, T>
    (
        sources: Inputs,
        fn: (v: Record<keyof Inputs, Inputs[keyof Inputs] extends Subscribable<infer U> ? U : never>) => T,
        standalone:boolean = true
    )
{
    const res = {
        _source_cache: {}

    } as any as Subscribable<T> & { _source_cache: any };

    res["emit"] = emit.bind(res as any);
    res["subscribe"] = subscribe.bind(res as any) as any;
    res["unsubscribe"] = unsubscribe.bind(res as any) as any;

    for (let key in sources)
    {
        sources[key].subscribe(a.bind(res,key,fn), standalone)
    }

    return res;
}