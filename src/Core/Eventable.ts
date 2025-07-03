import type { EventRef, Subscribable } from "./Subscribable";

/**
 * An object which can emit events and be subscribed to.
 */
export class Eventable<Events extends Record<string, { event: string, value: any }> = {}>
{

    // event subscribers
    events: Record<string,
        EventRef<Events[keyof Events]> | undefined
    >;

    any_events:EventRef<undefined> | undefined;

    subscribe_event<K extends keyof Event>(
        fn: (
            source: ThisType<this>, 
            event: Events[K], 
            ref:EventRef<any>
        ) => any, 
        event?: K
    )
    {
        let previous_first_item = event === undefined ? this.any_events : (this.events ??= {})[event];

        const new_item: EventRef<Events[K]> = {
            next: previous_first_item,
            value: new WeakRef(fn),
            event
        };

        if(previous_first_item === undefined)
        {
            if(event === undefined)
                this.any_events = new_item;
            else
                this.events[event] = new_item;
        }

        if (previous_first_item !== undefined)
            previous_first_item.prev = new_item;

        return new_item;
    }

    emit_event<K extends keyof Event>(event: Events[K])
    {
        let events = this.events?.[event.event];
        while (events !== undefined)
        {
            const deref = events.value.deref();
            if (deref === undefined)
                this.unsubscribe_event(events as EventRef<any>)
            else
                deref(this as any, event, events)


                events = events.next;
        }

        events = this.any_events;
        while (events !== undefined)
        {
            const deref = events.value.deref();
            if (deref === undefined)
                this.unsubscribe_event(events)
            else
                deref(this as any, event, events)


                events = events.next;
        }

        return this;
    }

    /**
     * Force unsubscribe. This is generally not recommended, as garbage collection 
     * does the same thing automatically.
     * @param reference
     */
    unsubscribe_event(reference: EventRef<any>)
    {
        let event_name = reference["event"];

        if (reference.next !== undefined)
            reference.next.prev = reference.prev;

        if (reference.prev !== undefined)
            reference.prev.next = reference.next;
        else
        {
            if(event_name === undefined)
                if(this.any_events === reference)
                    this.any_events = reference.next;
            else 
                if(this.events?.[event_name] === reference)
                    this.events[event_name] = reference.next;
        }

        return this;
    }
}