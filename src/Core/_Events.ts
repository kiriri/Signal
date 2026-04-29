import type Subscribable from "./Subscribable";

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
    // which in reality should wait only until whatever sync function is running is done.
    // This means the effect only triggers once after all dependencies were set, instead of once
    // for each dependency that changed.
    // The effect is responsible for making sure it doesn't register itself again before the previous
    // registration has been processed.
    static register_async_emit(fn: Function, context?: any)
    {
        // if (this.waiting_to_emit.length <= 0)
        // {
            function a()
            {
                fn(context);
            }
            queueMicrotask(a);
        // }
        // this.waiting_to_emit.push(fn);
    }
}