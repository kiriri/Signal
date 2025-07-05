import type Subscribable from "./Subscribable";

const IS_NODE = typeof process === 'object';

export default class EventManager
{
    // This is set or replaced whenever a computed type ( or a similar custom Subscribable )
    // runs its .get() function. While it is open, any other subscribable's get() function
    // should add itself to this set. This way the computed signal knows which signals it
    // depends on.
    static global_listeners: Subscribable<any, any>[] = null!;

    // 
    static waiting_to_emit: Function[] = [];


    // To avoid updating say an effect every time its dependency changes while the same function
    // is processing, it will register its callback with an async delay, 
    // which in reality should wait until whatever sync function is running is done.
    // This means the effect only triggers once after all dependencies were set, instead of once
    // for each dependency that changed.
    static register_async_emit(fn: Function, context?: any)
    {
        if (this.waiting_to_emit.length <= 0)
        {
            const a = () =>
            {
                const emits = this.waiting_to_emit;
                this.waiting_to_emit = [];
                for (let f of emits)
                {
                    f(context);
                }
            }
            // setImmediate is faster but only works reliably in node
            if (IS_NODE)
                setImmediate(a);
            else // firefox breaks terribly if setImmediate is used.
                setTimeout(a, 0);
        }
        this.waiting_to_emit.push(fn);
    }
}