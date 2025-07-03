import { Eventable } from "src/Core/Eventable";
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
        value: any;
    };
};
export interface I_NativeCollection<T, Events extends ReqColTypes<T> = ReqColTypes<T>> extends Eventable<Events> {
    get(): Iterable<T>;
    _add(value: T): any;
    _delete(value: T): any;
}
