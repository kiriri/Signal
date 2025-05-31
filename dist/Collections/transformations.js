"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reduce_fast = reduce_fast;
exports.count_fast = count_fast;
exports.reduce = reduce;
exports.count = count;
var Signal_1 = require("../Core/Signal");
var Computed_1 = require("../Core/Computed");
// TODO : Maps need to use the same entry in every single event or else we can't store related
// state info.
// Reduce can be done much more efficiently without Computed, 
// but it won't work if the reduce function contains any signals.
// This will completely recalculate the reduced value whenever any of the dependencies changes.
// Otherwise it will partially update the value whenever something is added or removed.
function reduce_fast(producer, reducer, initial_value, dependends_on) {
    var result = new Signal_1.NativeSignal(initial_value);
    var dirty_entries = new Map();
    var fully_dirty = false;
    function reset_value() {
        var new_value = initial_value;
        for (var _i = 0, _a = producer.get(); _i < _a.length; _i++) {
            var value = _a[_i];
            new_value = reducer({ event: "add", value: value }, new_value);
        }
        result.set(new_value);
        fully_dirty = false;
        dirty_entries.clear();
    }
    result.get = function () {
        if (fully_dirty)
            reset_value();
        else {
            var new_value = result._value;
            for (var _i = 0, _a = dirty_entries.values(); _i < _a.length; _i++) {
                var value = _a[_i];
                new_value = reducer(value, new_value);
            }
            result.set(new_value);
        }
        return result._value;
    };
    if (dependends_on.length > 0) {
        var dependency_handler = {
            dirty: function (source) {
                fully_dirty = true;
                result.dirty();
            }
        };
        result["dependency_handler"] = dependency_handler; // Bind it so it GCs alongside the result
        for (var _i = 0, dependends_on_1 = dependends_on; _i < dependends_on_1.length; _i++) {
            var dependency = dependends_on_1[_i];
            dependency.subscribe(dependency_handler);
        }
    }
    producer._on_change_instant.subscribe(function (_, ve) {
        // fully dirty will calculate all entries from scratch the next time
        // the result's get() function is called.
        if (fully_dirty)
            return;
        // Either it has added and then deleted, or vice versa. 
        // Either way, skip updating the value altogether
        if (dirty_entries.has(ve["value"]))
            dirty_entries.delete(ve["value"]);
        else
            dirty_entries.set(ve["value"], ve);
    });
    reset_value();
    return result;
}
function count_fast(collection, counter, depends_on) {
    return reduce_fast(collection, function (event, prev) { return prev + counter(event); }, 0, depends_on);
}
function reduce(producer, reducer, initial_value) {
    // TODO : Replace Native Signal with one which on get forcefully pulls all dirty Computed values
    var result = new Signal_1.NativeSignal(initial_value);
    var listeners = new Map();
    function listen(v) {
        // BUG : Computed is late, and result does not force update computed on get
        var computed;
        var state = {};
        computed = new Computed_1.Computed(function () {
            var prev_value = result._value;
            var new_value = reducer(v, prev_value, state);
            result.set(new_value);
            return new_value;
        }, true);
        listeners.set(v, computed);
    }
    function unlisten(v) {
        listeners.get(v).destroy();
        listeners.delete(v);
    }
    var values = __spreadArray([], producer.get(), true);
    for (var i = 0; i < values.length; i++)
        listen(values[i]);
    producer._on_change_instant.subscribe(function (_, ve) {
        if (ve['event'] === "add")
            listen(ve['value']);
        else if (ve['event'] === "delete")
            unlisten(ve['value']);
    });
    return result;
}
function count(producer, counter) {
    return reduce(producer, function (v, prev, state) {
        var _a;
        var count = counter(v);
        var old_value = (_a = state.prev_value) !== null && _a !== void 0 ? _a : 0;
        state.prev_value = count;
        return prev + count - old_value;
    }, 0);
}
// Map/Filter
// export function map_fast<
//     ProdValue,
//     ProdEvents extends ReqColTypes<ProdValue>,
//     Producer extends I_NativeCollection<ProdValue, ProdEvents>,
//     ConsValue,
// >(
//     producer: Producer,
//     constructor: {new():I_NativeCollection<ConsValue,any>},
//     handler: (event: ReqColTypes<ProdValue>["add" | "delete"], prev_value: ConsValue) => ConsValue,
//     dependends_on: StatefulSubscribable<any>[],
// ): I_NativeCollection<ConsValue,any>
// {
//     const result = new constructor();
//     const dirty_entries = new Map<ProdValue, ReqColTypes<ProdValue>["add" | "delete"]>();
//     let fully_dirty = false;
//     function reset_value()
//     {
//         let new_value = initial_value;
//         for (let value of producer.get())
//             new_value = handler({ event: "add", value }, new_value);
//         result.set(new_value);
//         fully_dirty = false;
//         dirty_entries.clear();
//     }
//     result.get = () =>
//     {
//         if (fully_dirty)
//             reset_value();
//         else
//         {
//             let new_value = result._value;
//             for (let value of dirty_entries.values())
//                 new_value = handler(value, new_value);
//             result.set(new_value);
//         }
//         return result._value;
//     }
//     if (dependends_on.length > 0)
//     {
//         const dependency_handler = {
//             dirty: function (source?: I_Subscribable<any>)
//             {
//                 fully_dirty = true;
//                 result.dirty();
//             }
//         }
//         result["dependency_handler"] = dependency_handler; // Bind it so it GCs alongside the result
//         for (let dependency of dependends_on)
//             dependency.subscribe(dependency_handler);
//     }
//     producer._on_change_instant.subscribe((_, ve) =>
//     {
//         // fully dirty will calculate all entries from scratch the next time
//         // the result's get() function is called.
//         if (fully_dirty)
//             return;
//         // Either it has added and then deleted, or vice versa. 
//         // Either way, skip updating the value altogether
//         if (dirty_entries.has(ve["value"]))
//             dirty_entries.delete(ve["value"]);
//         else
//             dirty_entries.set(ve["value"], ve);
//     });
//     reset_value();
//     return result;
// }
// function transform<
// ProdValue, 
// ProdEvents extends ReqColTypes<ProdValue>, 
// Producer extends I_NativeCollection<ProdValue,ProdEvents>,
// ConsValue, 
// ConsEvents extends ReqColTypes<ProdValue>, 
// Consumer extends I_NativeCollection<ProdValue,ProdEvents>,
// >(
//     producer:Producer
// )
// {
//     // consumer + producer pattern
//     // Map uses
//     let mapExample : (value:ProdValue)=>ConsValue;
//     // Filter uses (Plus requires ConsValue === ProdValue)
//     let filterExample : (value:ProdValue)=>boolean
//     // Reduce uses (Plus result is single NativeSignal)
//     let reduceExample : (value:ProdValue)=>ConsValue
// }
