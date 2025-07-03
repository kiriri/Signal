import type { EventRef } from "./Subscribable";
/**
 * An object which can emit events and be subscribed to.
 */
export declare class Eventable<Events extends Record<string, {
    event: string;
    value: any;
}> = {}> {
    events: Record<string, EventRef<Events[keyof Events]> | undefined>;
    any_events: EventRef<undefined> | undefined;
    subscribe_event<K extends keyof Event>(fn: (source: ThisType<this>, event: Events[K], ref: EventRef<any>) => any, event?: K): EventRef<Events[K]>;
    emit_event<K extends keyof Event>(event: Events[K]): this;
    /**
     * Force unsubscribe. This is generally not recommended, as garbage collection
     * does the same thing automatically.
     * @param reference
     */
    unsubscribe_event(reference: EventRef<any>): this;
}
