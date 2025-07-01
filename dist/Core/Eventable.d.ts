/**
 * An object which can emit events and be subscribed to.
 */
export declare class Eventable<Events extends Record<string, {
    event: string;
    value: any;
}> = {}> {
    events: Record<string, ((source: Eventable<any>, event: Events[keyof Events]) => any)[]> | undefined;
    events2: (WeakRef<(source: Eventable<any>, event: Events[keyof Events]) => any>)[] | undefined;
    subscribe_event<K extends keyof Event>(fn: (source: Eventable<any>, event: Events[K]) => any, event?: K): this;
    emit_event<K extends keyof Event>(event: Events[K]): this;
}
