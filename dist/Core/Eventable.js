/**
 * An object which can emit events and be subscribed to.
 */
export class Eventable {
    events;
    events2;
    // events: Record< string, ((event:Events[keyof Events]) => any)[] > | undefined;
    subscribe_event(fn, event) {
        if (event) {
            let events = this.events;
            if (!events)
                events = this.events = {};
            let fns = events[event];
            if (!fns)
                events[event] = [fn];
            else
                fns.push(fn);
        }
        else {
            let events = this.events2;
            if (!events)
                this.events2 = [new WeakRef(fn)];
            else
                events.push(new WeakRef(fn));
        }
        return this;
    }
    emit_event(event) {
        const events = this.events?.[event.event];
        if (events) {
            for (let fn of events) {
                fn(this, event);
            }
        }
        if (this.events2) {
            for (let fn of this.events2) {
                fn.deref()?.(this, event);
            }
        }
        return this;
    }
}
//# sourceMappingURL=Eventable.js.map