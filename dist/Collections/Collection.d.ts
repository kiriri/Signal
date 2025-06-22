import { Subscribable } from "../Core/Subscribable";
export type ReqColTypes<T> = {
    add: {
        event: "add";
        value: T;
    };
    delete: {
        event: "delete";
        value: T;
    };
    [K: Exclude<string, "add" | "delete">]: {
        event: string;
    };
};
export interface I_NativeCollection<T, Events extends ReqColTypes<T> = ReqColTypes<T>> {
    get(): Iterable<T>;
    _add(value: T): any;
    _delete(value: T): any;
    subscribe_event<K extends keyof Event>(fn: (source: Subscribable<any, any>, event: Events[K]) => any, event?: K): any;
    emit_event<K extends keyof Event>(event: Events[K]): any;
}
