import type Subscribable from "./Subscribable";
export default class EventManager {
    static global_listeners: Subscribable<any, any>[];
    static waiting_to_emit: Function[];
    static register_async_emit(fn: Function, context?: any): void;
}
