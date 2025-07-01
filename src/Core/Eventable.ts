
/**
 * An object which can emit events and be subscribed to.
 */
export class Eventable<Events extends Record<string, { event: string, value: any }> = {}>
{

    events: Record<string, ((source:Eventable<any>,event: Events[keyof Events]) => any)[]> | undefined;
    events2: (WeakRef<(source:Eventable<any>,event: Events[keyof Events]) => any>)[] | undefined;
    // events: Record< string, ((event:Events[keyof Events]) => any)[] > | undefined;

    subscribe_event<K extends keyof Event>(fn: (source:Eventable<any>,event: Events[K]) => any, event?: K)
    {
        if (event)
        {
            let events = this.events;
            if (!events)
                events = this.events = {};
            let fns = events[event];
            if (!fns)
                events[event] = [fn];
            else
                fns.push(fn);
        }
        else
        {
            let events = this.events2;
            if (!events)
                this.events2 = [new WeakRef(fn)];
            else
                events.push(new WeakRef(fn));
        }
        return this;
    }

    emit_event<K extends keyof Event>(event: Events[K])
    {
        const events = this.events?.[event.event];
        if (events)
        {
            for (let fn of events)
            {
                fn(this, event);
            }
        }

        if (this.events2)
        {
            for (let fn of this.events2)
            {
                fn.deref()?.(this, event);
            }
        }

        return this;
    }
}