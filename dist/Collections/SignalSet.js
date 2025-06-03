import { BufferedSubscribable } from "../Sinks/BufferedSubscribable";
import { Computed } from "../Core/Computed";
import { NativeSignal } from "../Core/NativeSignal";
import { Subscribable } from "../Core/Subscribable";
export class SignalSet extends Subscribable {
    _internal;
    // We're using on_change instead of on_add + on_delete so transactions which
    // add and delete the same value in a short time can be historialized in sequence in one buffer.
    on_change = new BufferedSubscribable();
    _on_change_instant = new Subscribable();
    constructor(items) {
        super();
        this._internal = new Set(items ? [...items] : []);
    }
    get() {
        if (Subscribable.global_listeners)
            Subscribable.global_listeners.push(this);
        return this._internal;
    }
    _add(value) {
        this.add(value);
    }
    add(value) {
        let exists = this._internal.has(value);
        if (!exists) {
            this._internal.add(value);
            this.on_change.emit({ event: "add", value });
            this._on_change_instant.emit({ event: "add", value });
            this.dirty();
        }
    }
    _delete(value) {
        this.delete(value);
    }
    delete(value) {
        if (this._internal.delete(value)) {
            this.on_change.emit({ event: "delete", value });
            this._on_change_instant.emit({ event: "delete", value });
            this.dirty();
        }
    }
    clear() {
        let values = [...this._internal.values()];
        this._internal.clear();
        for (let value of values) {
            this.on_change.emit({ event: "delete", value });
            this._on_change_instant.emit({ event: "delete", value });
        }
        this.dirty();
    }
    queued = false;
    dirty(source) {
        // If it's queued for emit(),
        // then it stands to reason that it has propagated dirty as well.
        if (this.queued)
            return this;
        if (this.subscribers) {
            this.queued = true;
            Subscribable.register_async_emit(() => this.emit());
        }
        return super.dirty(source);
    }
    emit(value = this._internal) {
        return super.emit(value);
    }
    has(value) {
        return this._internal.has(value);
    }
    count(fn, subscribe = true) {
        const result = new NativeSignal(0);
        const listeners = new Map();
        // This is very inefficient. Like 
        function listen(v) {
            let computed;
            computed = new Computed(() => {
                let old_value = computed?._cache ?? 0;
                let new_value = fn(v);
                result.set(result._value + new_value - old_value);
                return new_value;
            }, true);
            listeners.set(v, computed);
        }
        function unlisten(v) {
            listeners.get(v).destroy();
            listeners.delete(v);
        }
        const values = [...this.get().values()];
        for (let i = 0; i < values.length; i++) {
            listen(values[i]);
        }
        this._on_change_instant.subscribe((_, ve) => {
            let { value, event } = ve;
            if (event === "add") {
                listen(value);
            }
            else if (event === "delete") {
                unlisten(value);
            }
        });
        return result;
    }
}
/**
 * Create what is essentially a very smart reduce() compute.
 * This kind of signal is somewhat expensive to initialize, but it hooks directly into change events
 * of the set so it updates much faster,especially for large sets with sporadic point changes.
 * @param set
 * @param operation
 */
// export function SignalSetOperation(set: SignalSet<number>, operation: "sum" | "product"): StatefulSubscribable<number>;
// export function SignalSetOperation(set: SignalSet<StatefulSubscribable<number>>, operation: "sum" | "product", use_states: true): StatefulSubscribable<number>;
// export function SignalSetOperation(set: SignalSet<number> | SignalSet<StatefulSubscribable<number>>, operation: "sum" | "product", use_states?: boolean): StatefulSubscribable<number>
// {
//     if (use_states)
//     {
//         // type hinting
//         const _set = set as SignalSet<StatefulSubscribable<number>>;
//         // the last stored value for each subscribable.
//         const _cache = new Map<StatefulSubscribable<number>, number>();
//         // a list of subscription functions for use in unsubscribing.
//         const _cached_subscribers = new Map<StatefulSubscribable<number>, (source:Subscribable<number>,v: number) => any>();
//         const result = new NativeSignal(0);
//         if (operation === "sum")
//         {
//             result._value = [..._set.get().values()].reduce((prev, v) => prev + v.get(), 0);
//         }
//         else
//         {
//             result._value = [..._set.get().values()].reduce((prev, v) => prev * v.get(), 1);
//         }
//         const listen_to_item = operation === "sum" ?
//             function listen_to_item_sum(item: StatefulSubscribable<number>)
//             {
//                 function on_change(source:Subscribable<number>,new_value: number)
//                 {
//                     const old_value = _cache.get(item) ?? 1;
//                     if (old_value === new_value)
//                         return;
//                     result.update(product => product + new_value - old_value)
//                     _cache.set(item, new_value);
//                 }
//                 item.subscribe(on_change, false);
//                 _cached_subscribers.set(item, on_change);
//             } :
//             function listen_to_item_product(item: StatefulSubscribable<number>)
//             {
//                 function on_change(source:Subscribable<number>,new_value: number)
//                 {
//                     const old_value = _cache.get(item) ?? 1;
//                     if (old_value === new_value)
//                         return;
//                     result.update(product => product * new_value / old_value)
//                     _cache.set(item, new_value);
//                 }
//                 item.subscribe(on_change, false);
//                 _cached_subscribers.set(item, on_change);
//             }
//         const handle_set_change = operation === "sum" ?
//             function on_add_sum(source:Subscribable<{ value: StatefulSubscribable<number>, event: "add" | "delete" }[]>, values: { value: StatefulSubscribable<number>, event: "add" | "delete" }[])
//             {
//                 for (let { value, event } of values)
//                 {
//                     if (event === "add")
//                     {
//                         result.set(result._value + value.get());
//                         listen_to_item(value);
//                     }
//                     else
//                     {
//                         result.set(result._value - value.get());
//                         value.unsubscribe(_cached_subscribers.get(value)!)
//                     }
//                 }
//             } :
//             function on_add_product(source:Subscribable<{ value: StatefulSubscribable<number>, event: "add" | "delete" }[]>,values: { value: StatefulSubscribable<number>, event: "add" | "delete" }[])
//             {
//                 for (let { value, event } of values)
//                 {
//                     if (event === "add")
//                     {
//                         result.set(result._value * value.get());
//                         listen_to_item(value);
//                     }
//                     else
//                     {
//                         result.set(result._value / value.get());
//                         value.unsubscribe(_cached_subscribers.get(value)!)
//                     }
//                 }
//             }
//         const initial_values = [..._set.get().values()];
//         for (const v of initial_values)
//         {
//             listen_to_item(v);
//         }
//         _set.on_change.subscribe(handle_set_change);
//         return result;
//     }
//     switch (operation)
//     {
//         //    const result = new Signal([..._set.get().values()].reduce((prev,v)=>prev * v.get(), 1));
//         case "sum":
//             return new Computed(() =>
//             {
//                 return [...(set as SignalSet<number>).get().values()].reduce((prev, v) => prev + v, 0);
//             })
//         case "product":
//             return new Computed(() =>
//             {
//                 return [...(set as SignalSet<number>).get().values()].reduce((prev, v) => prev * v, 1);
//             })
//     }
// }
//# sourceMappingURL=SignalSet.js.map