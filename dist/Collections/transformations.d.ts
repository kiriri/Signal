import { NativeSignal } from "../Core/NativeSignal";
import { I_NativeCollection, ReqColTypes } from "./Collection";
import { EventRef, I_GettableSubscribable, I_Subscribable, LinkedList, StatefulSubscribable, Subscribable } from "../Core/Subscribable";
export type ReducerRef<INPUT> = LinkedList<INPUT> & {
    last: INPUT;
};
export declare class Reducer<INPUT, OUTPUT> extends Subscribable<OUTPUT> {
    readonly identityValue: INPUT;
    readonly merger: (value: INPUT, last_value: INPUT, result: OUTPUT, source: I_GettableSubscribable<INPUT> | I_NativeCollection<INPUT>, ref: ReducerRef<INPUT>, target: this) => OUTPUT;
    _value: OUTPUT;
    _dirty: boolean;
    private set;
    get(): OUTPUT;
    dirty(source: any, ref: any): void;
    constructor(identityValue: INPUT, merger: (value: INPUT, last_value: INPUT, result: OUTPUT, source: (I_GettableSubscribable<INPUT>) | I_NativeCollection<INPUT>, ref: ReducerRef<INPUT>, target: Reducer<INPUT, OUTPUT>) => OUTPUT, value: OUTPUT);
    register_collection(source: I_NativeCollection<INPUT>, mapped: boolean): EventRef<{
        event: string;
        value: any;
    }>;
    on_collection_change(source: I_NativeCollection<INPUT>, event: {
        event: string;
        value?: any;
    }, ref: EventRef<any>): void;
    _self: WeakRef<this>;
    register_source(source: I_Subscribable<INPUT> | NativeSignal<INPUT>): LinkedList<WeakRef<(source: I_Subscribable<INPUT>, value: INPUT, ref: LinkedList<any>) => any | void>> & {
        last: INPUT;
        reducer: WeakRef<Reducer<INPUT, OUTPUT>>;
        source: typeof source;
    };
    unregister_source(ref: ReturnType<this["register_source"]>): void;
    on_change(this: undefined, source: I_Subscribable<INPUT>, value: INPUT, ref: ReducerRef<INPUT>): void;
}
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
    merger: (sourceItem: any, output: any, value: any, prev_value: any) => void;
    mapper?: (sourceItem: any) => any;
}): StatefulSubscribable<any>;
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
