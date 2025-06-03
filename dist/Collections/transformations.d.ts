import { NativeSignal } from "../Core/NativeSignal";
import { I_NativeCollection, ReqColTypes } from "./Collection";
import { StatefulSubscribable, Subscribable } from "../Core/Subscribable";
/**
 *
 * @param source
 * @param identityValue
 * @param opts
 * @param merger Uses identityValue on delete! Applies relative changes based on previous and current value.
 * @param mapper Optionally map any added or updated value
 * @returns
 */
export declare function reduce_generic(source: I_NativeCollection<any, any>, identityValue: any, opts: {
    output?: StatefulSubscribable<typeof identityValue>;
    unpackSignals?: boolean;
    lazy?: boolean;
    dependencies?: Subscribable<any>[];
}, merger: (sourceItem: any, output: any, value: any, prev_value: any) => void, mapper?: (sourceItem: any) => any): StatefulSubscribable<any>;
/**
 * It doesn't matter if we map changes to a single nativeSignal or a collection.
 * Just provide the output directly, and the way that changes are merged into it.
 * @param producer
 * @param output
 */
export declare function reduce_fast<ConsValue, ProdValue, ProdEvents extends ReqColTypes<ProdValue>, Producer extends I_NativeCollection<ProdValue, ProdEvents>>(initial_value: ConsValue, producer: Producer, reducer: (event: {
    event: "add" | "delete" | "update";
    value: ProdValue;
}, prev_value: ConsValue) => ConsValue, dependends_on: StatefulSubscribable<any>[]): NativeSignal<ConsValue>;
export declare function count_fast<V>(collection: I_NativeCollection<V, any>, counter: (event: {
    event: "add" | "delete" | "update";
    value: V;
}) => number, depends_on: StatefulSubscribable<any>[]): NativeSignal<number>;
export declare function reduce<ProdValue, ProdEvents extends ReqColTypes<ProdValue>, Producer extends I_NativeCollection<ProdValue, ProdEvents>, ConsValue>(producer: Producer, reducer: (event: ProdValue, prev_value: ConsValue, state: object) => ConsValue, initial_value: ConsValue): NativeSignal<ConsValue>;
export declare function count<Producer extends I_NativeCollection<any, any>>(producer: Producer, counter: (v: Producer extends I_NativeCollection<infer A, any> ? A : never) => number): NativeSignal<number>;
