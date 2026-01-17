// import { Flatten } from "src/_decorators/flatten";
// import EventManager from "./_Events";
// import Subscribable, { Dirtyable } from "./Subscribable";
// /**
//  * Represents a real Subscribable value that is stored in this Signal.
//  */

// export class NativeSignal
// {
//     // The internal value. Only get it directly if you want to make sure no computed type subscribes to it.
//     _value;
//     queued;
//     /**
//      * Creates a new Signal with an initial value.
//      * @param value - The initial value of the signal.
//      */
//     constructor(value)
//     {

//         this._value = value;
//     }
//     /**
//      * Gets the current value of the signal.
//      * If called inside another computed signal, it will add itself to the list of listeners.
//      * @returns The current value of the signal.
//      */
//     get()
//     {
//         if (EventManager.global_listeners)
//             EventManager.global_listeners.push(this);
//         return this._value;
//     }
//     /**
//      * Sets a new value for the signal and emits it to all subscribers.
//      * @param value - The new value to set.
//      */
//     set(value)
//     {
//         if (value === this._value)
//             return;
//         this._value = value;
//         this.dirty(this, undefined, value);
//     }
//     update(fn)
//     {
//         // this.set(fn(this._value));
//         const value = fn(this._value);
//         if (value === this._value)
//             return;
//         this._value = value;
//         this.dirty(this, undefined, value);
//     }
//     dirty(source, ref, value)
//     {
//         // If it's queued for emit(), 
//         // then it stands to reason that it has propagated dirty as well.
//         if (this.queued)
//             return this;
//         if (this.subscribers !== undefined)
//         {
//             this.queued = true;
//             EventManager.register_async_emit(this.on_emit, this);
//         }
//         super.dirty(source, ref);
//         return this;
//     }
//     on_emit(context)
//     {
//         context.queued = false;
//         context.emit(context._value);
//     }

//     subscribers: LinkedList<WeakRef<(
//         source: I_Subscribable<T>,
//         value: any,
//         ref: LinkedList<any>
//     ) => any>> | undefined;
//     dependants: LinkedList<WeakRef<Dirtyable>> | undefined;
//     events: Record<string,
//         EventRef<Events[keyof Events]> | undefined
//     >;
//     any_events: EventRef<undefined> | undefined;
//     subscribe_event<K extends keyof Event>(
//         fn: (
//             source: Subscribable<any, any>,
//             event: Events[K],
//             ref: EventRef<any>
//         ) => any,
//         event?: K
//     )
//     {
//         let previous_first_item = event === undefined ? this.any_events : (this.events ??= {})[event];

//         const new_item: EventRef<Events[K]> = {
//             next: previous_first_item,
//             value: new WeakRef(fn),
//             event
//         };

//         if (previous_first_item === undefined)
//         {
//             if (event === undefined)
//                 this.any_events = new_item;
//             else
//                 this.events[event] = new_item;
//         }

//         if (previous_first_item !== undefined)
//             previous_first_item.prev = new_item;

//         return new_item;
//     }

//     unsubscribe_event(reference: EventRef<any>)
//     {
//         let event_name = reference["event"];

//         if (reference.next !== undefined)
//             reference.next.prev = reference.prev;

//         if (reference.prev !== undefined)
//             reference.prev.next = reference.next;
//         else
//         {
//             if (event_name === undefined)
//                 if (this.any_events === reference)
//                     this.any_events = reference.next;
//                 else
//                     if (this.events?.[event_name] === reference)
//                         this.events[event_name] = reference.next;
//         }

//         return this;
//     }

//     can_emit<K extends keyof Event>(event: Events[K])
//     {
//         return (this.any_events ?? this.events?.[event.event]) !== undefined;
//     }

//     emit_event<K extends keyof Event>(event: Events[K])
//     {
//         let events = this.events?.[event.event];
//         while (events !== undefined)
//         {

//             const deref = events.value.deref();
//             if (deref === undefined)
//                 this.unsubscribe_event(events)
//             else
//                 deref(this as any, event, events)


//             events = events.next;
//         }

//         let events2 = this.any_events;
//         while (events2 !== undefined)
//         {

//             const deref = events2.value.deref();
//             if (deref === undefined)
//                 this.unsubscribe_event(events2)
//             else
//                 deref(this as any, event, events2)


//             events2 = events2.next;
//         }

//         return this;
//     }

//     subscribe(
//         fn: ((source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any)
//     ): LinkedList<WeakRef<((source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any)>>
//     {

//         const previous_first_item = this.subscribers;

//         const new_item: LinkedList<WeakRef<typeof fn>> = this.subscribers = {
//             next: previous_first_item,
//             value: new WeakRef(fn)
//         }

//         if (previous_first_item !== undefined)
//             previous_first_item.prev = new_item;

//         return new_item;

//     }

//     depend(
//         dirtyable: Dirtyable
//     ): LinkedList<WeakRef<Dirtyable>>
//     {
//         const previous_first_item = this.dependants;

//         const new_item: LinkedList<WeakRef<Dirtyable>> = this.dependants = {
//             next: previous_first_item,
//             value: new WeakRef(dirtyable)
//         }

//         if (previous_first_item !== undefined)
//             previous_first_item.prev = new_item;


//         return new_item;
//     }

//     unsubscribe(reference: NonNullable<typeof this["subscribers"] | typeof this["dependants"]>)
//     {
//         if (reference.next !== undefined)
//             reference.next.prev = reference.prev;

//         if (reference.prev !== undefined)
//             reference.prev.next = reference.next;
//         else
//         {
//             if (this.dependants === reference)
//                 this.dependants = this.dependants.next;
//             else if (this.subscribers === reference)
//                 this.subscribers = this.subscribers.next;
//         }

//         return this;
//     }

//     dirty(source?: I_Subscribable<any>, ref?: LinkedList<any>)
//     {
//         let dependant = this.dependants;
//         // Propagate dirty state to all dependent subscribables.
//         while (dependant !== undefined)
//         {
//             const deref = dependant.value.deref();
//             if (deref === undefined)
//                 this.unsubscribe(dependant)
//             else
//                 deref.dirty(this as any, dependant)

//             dependant = dependant.next;
//         }
//     }

//     emit(value: T)
//     {
//         let subscriber = this.subscribers;
//         // Propagate dirty state to all dependent subscribables.
//         while (subscriber !== undefined)
//         {
//             const deref = subscriber.value.deref();
//             if (deref === undefined)
//                 this.unsubscribe(subscriber)
//             else
//                 deref(this as any, value, subscriber)


//             subscriber = subscriber.next;
//         }

//         // let dependant = this.dependants;
//         // // Propagate dirty state to all dependent subscribables.
//         // while (dependant !== undefined)
//         // {
//         //     const deref = dependant.value.deref();
//         //     if (deref === undefined)
//         //         this.unsubscribe(dependant)
//         //     else
//         //         deref.dirty(this as any, dependant, value)

//         //     dependant = dependant.next;
//         // }

//         return this;
//     }

//     promise(): Promise<T>
//     {
//         let resolve: (arg0: T) => void;
//         let reference;
//         const subscriber = (source: Dirtyable, v: T) =>
//         {
//             this.unsubscribe(reference);
//             resolve(v);
//         }
//         reference = this.subscribe(subscriber);
//         return new Promise((_resolve) =>
//         {
//             resolve = _resolve
//         })
//     }
// }
// //# sourceMappingURL=NativeSignal.js.map