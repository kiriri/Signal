import { LinkedList } from "../Core/Subscribable";
export declare class Handleable {
    private _handle?;
    private _destroyed;
    fields: Record<string, Handleable>;
    test: number;
    get_value(): number;
}
export declare class OwnedSignal<T> extends Handleable {
    owner: Handleable;
    value: T;
    constructor(owner: Handleable, value: T);
    destroy(): void;
}
export declare class OwnedHandle<O extends Handleable> {
    readonly state: O;
    readonly owner?: OwnedHandle<any>;
    dependents: LinkedList<OwnedHandle<any>> | undefined;
    constructor(state: O, owner?: OwnedHandle<any>);
}
