import { I_Eventable } from "../Core/Subscribable";
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
export interface I_NativeCollection<T, Events extends ReqColTypes<T> = ReqColTypes<T>> extends I_Eventable<Events> {
    get(): Iterable<T>;
}
