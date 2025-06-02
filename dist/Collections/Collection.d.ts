import { Subscribable } from "../Core/Subscribable";
import { BufferedSubscribable } from "../Sinks/BufferedSubscribable";
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
    on_change: BufferedSubscribable<Events[keyof Events]>;
    _on_change_instant: Subscribable<Events[keyof Events]>;
    get(): Iterable<T>;
    _add(value: T): any;
    _delete(value: T): any;
}
