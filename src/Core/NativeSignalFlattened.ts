



// /**
//  * Represents a real Subscribable value that is stored in this Signal. 
//  */
// export class NativeSignalFlattened<T> implements StatefulSubscribable<T>
// {
//     // The internal value. Only get it directly if you want to make sure no computed type subscribes to it.
//     _value: T;
//     queued?: boolean;

//     /**
//      * Creates a new Signal with an initial value.
//      * @param value - The initial value of the signal.
//      */
//     constructor(value: T)
//     {
//         this._value = value;
//     }

//     /**
//      * Gets the current value of the signal.
//      * If called inside another computed signal, it will add itself to the list of listeners.
//      * @returns The current value of the signal.
//      */
//     get(): T
//     {
//         if (EventManager.global_listeners)
//             EventManager.global_listeners.push(this);
//         return this._value;
//     }

//     /**
//      * Sets a new value for the signal and emits it to all subscribers.
//      * @param value - The new value to set.
//      */
//     set(value: T): void
//     {
//         if (value === this._value)
//             return;
//         this._value = value;
//         this.dirty(this, undefined, value);
//     }

//     update(fn: (v: T) => T)
//     {
//         // this.set(fn(this._value));
//         const value = fn(this._value);
//         if (value === this._value)
//             return;
//         this._value = value;
//         this.dirty(this, undefined, value)
//     }

//     dirty(source: this, ref?: LinkedList<T>, value?: T)
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

//         this._dirty(source, ref);

//         return this;
//     }

//     on_emit(context: this)
//     {
//         context.queued = false;
//         context.emit(context._value);
//     }


    







//      // These functions want to be called when this Subscribable's value changes.
//     // We store them as WeakRefs so they get GCed when nobody uses the object anymore.
//     subscribers: LinkedList<WeakRef<(
//         source: I_Subscribable<T>,
//         value: any,
//         ref: LinkedList<any>
//     ) => any>> | undefined;

//     dependants: LinkedList<WeakRef<Dirtyable>> | undefined;

//     // event subscribers
//     events: Record<string,
//         EventRef<Events[keyof Events]> | undefined
//     >;

//     any_events:EventRef<undefined> | undefined;

//     /**
//      * Subscribe to a named event, or to any named event if event parameter is left undefined.
//      * Please note that unlike regular value subscribe() hooks, event subscriptions propagate *instantly*.
//      * @param fn 
//      * @param event 
//      * @returns 
//      */
//     subscribe_event<K extends keyof Event>(
//         fn: (
//             source: Subscribable<any, any>, 
//             event: Events[K], 
//             ref:EventRef<any>
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

//         if(previous_first_item === undefined)
//         {
//             if(event === undefined)
//                 this.any_events = new_item;
//             else
//                 this.events[event] = new_item;
//         }

//         if (previous_first_item !== undefined)
//             previous_first_item.prev = new_item;

//         return new_item;
//     }

//         /**
//      * Force unsubscribe. This is generally not recommended, as garbage collection 
//      * does the same thing automatically.
//      * @param reference
//      */
//         unsubscribe_event(reference: EventRef<any>)
//         {
//             let event_name = reference["event"];
    
//             if (reference.next !== undefined)
//                 reference.next.prev = reference.prev;
    
//             if (reference.prev !== undefined)
//                 reference.prev.next = reference.next;
//             else
//             {
//                 if(event_name === undefined)
//                     if(this.any_events === reference)
//                         this.any_events = reference.next;
//                 else 
//                     if(this.events?.[event_name] === reference)
//                         this.events[event_name] = reference.next;
//             }
    
//             return this;
//         }

//         /**
//          * emit_event will not be inlined, but this function will.
//          * Which makes if(can_emit(e)) emit_event(e) paradoxically faster some of the time than using just emit_event(e). 
//          * @param event 
//          * @returns 
//          */
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


//                 events = events.next;
//         }

//         let events2 = this.any_events;
//         while (events2 !== undefined)
//         {
            
//             const deref = events2.value.deref();
//             if (deref === undefined)
//                 this.unsubscribe_event(events2)
//             else
//                 deref(this as any, event, events2)


//                 events2 = events2.next;
//         }

//         return this;
//     }

//     // readonly uid = uid();

//     /**
//      * Subscribes a function to be called when the value of this Subscribable changes.
//      * @param fn - The function to subscribe.
//      * @param function_owns_signal - If true, this subscribable will not GC while the function is being held. If false, the function will not GC while the signal is held.
//      * @param subscribable If set, instantly sets the target subscribable to dirty when this subscribable emits.
//      */
//     subscribe(
//         subscribable: Dirtyable
//     ): LinkedList<WeakRef<Dirtyable>>;
//     subscribe(
//         subscribable: (source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void
//     ): LinkedList<WeakRef<(source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any | void>>;
//     subscribe(
//         fn: ((source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any) | Dirtyable
//     ): LinkedList<WeakRef<Dirtyable | ((source: I_Subscribable<T>, value: T, ref: LinkedList<any>) => any)>>
//     {


//         if (typeof fn === "function")
//         {
//             const previous_first_item = this.subscribers;

//             const new_item: LinkedList<WeakRef<typeof fn>> = this.subscribers = {
//                 next: previous_first_item,
//                 value: new WeakRef(fn)
//             }

//             if (previous_first_item !== undefined)
//                 previous_first_item.prev = new_item;

//             return new_item;
//         }

//         const previous_first_item = this.dependants;

//         const new_item: LinkedList<WeakRef<typeof fn>> = this.dependants = {
//             next: previous_first_item,
//             value: new WeakRef(fn)
//         }

//         if (previous_first_item !== undefined)
//             previous_first_item.prev = new_item;


//         return new_item;
//     }

//     /**
//      * Force unsubscribe. This is generally not recommended, as garbage collection 
//      * does the same thing automatically.
//      * @param reference
//      */
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

//     /**
//      * Call this whenever this subscribable or any of its dependencies have changed.
//      * This is only used for stateful subscribables.
//      * This should propagate all the way through all subscribables which depend on this.
//      */
//     _dirty(source?: I_Subscribable<any>, ref?: LinkedList<any>)
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

//     /**
//      * Emits a new value and notifies all subscribers immediately
//      * Use this function instead of dirty if your subscribable is stateless.
//      * @param value - The new value to emit.
//      */
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


















// // /**
// //  * Flattens class inheritance by copying all properties/methods from base to derived class.
// //  * This improves instance creation performance at the cost of slightly increased memory usage.
// //  * 
// //  * @param Derived - The class that will receive all properties/methods
// //  * @param Base - The class whose properties/methods will be copied
// //  * @returns The enhanced Derived class with flattened prototype chain
// //  */
// // function mergeClasses<T extends new (...args: any[]) => any, U extends new (...args: any[]) => any>(
// //     Derived: T,
// //     Base: U
// // ): T & {
// //     // Ensure TypeScript understands the merged type
// //     prototype: InstanceType<T> & InstanceType<U>
// // }
// // {
// //     // Get all properties from Base class (including inherited ones)
// //     const baseProps = new Set<string>();
// //     let current = Base.prototype;

// //     while (current && current !== Object.prototype)
// //     {
// //         Object.getOwnPropertyNames(current).forEach(prop =>
// //         {
// //             // Skip constructor and properties already in Derived
// //             if (prop !== 'constructor' && !Derived.prototype.hasOwnProperty(prop))
// //             {
// //                 baseProps.add(prop);
// //             }
// //         });
// //         current = Object.getPrototypeOf(current);
// //     }

// //     // Copy each property to Derived class
// //     baseProps.forEach(prop =>
// //     {
// //         const descriptor = Object.getOwnPropertyDescriptor(Base.prototype, prop) ||
// //             Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Base.prototype), prop);

// //         if (descriptor)
// //         {
// //             Object.defineProperty(Derived.prototype, prop, descriptor);
// //         }
// //     });

// //     // Copy static properties if any exist
// //     Object.getOwnPropertyNames(Base).forEach(prop =>
// //     {
// //         if (prop !== 'prototype' && prop !== 'length' && prop !== 'name' && prop !== 'caller')
// //         {
// //             const descriptor = Object.getOwnPropertyDescriptor(Base, prop);
// //             if (descriptor && !Derived.hasOwnProperty(prop))
// //             {
// //                 Object.defineProperty(Derived, prop, descriptor);
// //             }
// //         }
// //     });

// //     return Derived as any;
// // }

// // export const MySignal = mergeClasses(NativeSignal, Subscribable);

// // new MySignal(1).