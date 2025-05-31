//@ts-nocheck

import { Computed } from "./Computed.js";
import { NativeSignal } from "./Signal.js";

describe('StressTest', () => {
  it('should perform stress test on signals and computed signals', async () => {
    // Create some signals
    const signal1 = new NativeSignal(0);
    const signal2 = new NativeSignal(0);

    // Create a computed signal that depends on the above signals
    const computedSignal = new Computed(function(){return signal1.get() + signal2.get()});

    // Check initial value of computed signal
    expect(computedSignal.get()).toBe(0);

    // Update signal1 and check if computed signal updates correctly
    signal1.set(5);
    expect(computedSignal.get()).toBe(5);

    // Update signal2 and check if computed signal updates correctly
    signal2.set(3);
    expect(computedSignal.get()).toBe(8);

    const COUNT = 1000000;
    // Perform a stress test by updating signals multiple times
    const startTime = performance.now();
    for (let i = 0; i < COUNT; i++) {
      signal1.set(i);
      signal2.set(COUNT - i);
      computedSignal.get();
    }
    const endTime = performance.now();

    // Check if the stress test took longer than 200ms
    expect(endTime - startTime).toBeLessThanOrEqual(1000);

  });
});
