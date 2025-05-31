//@ts-nocheck

import { Computed } from "./Computed";
import { NativeSignal } from "./Signal";

describe("Computed Signal", () => {
    test("emits a change when any of its constituent signals change", () => {
        // Create instances of Signal and Computed
        const signal1 = new NativeSignal<number>(0);
        const signal2 = new NativeSignal<string>("initial");
        const computed = new Computed(() => signal1.get() + signal2.get());

        // Subscribe to the Computed signal
        let result: any;
        computed.subscribe((value) => {
            console.log("What?", value)
            result = value;
        });

        // Change the value of one of the constituent signals
        signal1.set(5);

        // Verify that the Computed signal emits the new value
        expect(result).toBe("5initial");
        expect(computed.get()).toBe("5initial");
    });
});
