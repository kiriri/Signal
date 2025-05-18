import { Computed } from '../Computed'; 
import { NativeSignal } from '../Signal';
import {expect, jest, test, describe, it} from '@jest/globals';

describe('Computed Signal', () => {
    it('should compute and emit initial value', () => {
        const signal = new NativeSignal(10);
        const computed = new Computed(() => signal.get() * 2);
        const subscriber = jest.fn();

        computed.subscribe(subscriber);

        expect(subscriber).toHaveBeenCalledWith(20);
        expect(computed.get()).toBe(20);
    });

    it('should update and emit when dependency changes', () => {
        const signal = new NativeSignal(10);
        const computed = new Computed(() => signal.get() * 2);
        const subscriber = jest.fn();

        computed.subscribe(subscriber);
        signal.set(15);

        expect(subscriber).toHaveBeenCalledWith(20); // Initial call
        expect(subscriber).toHaveBeenCalledWith(30); // Update call
        expect(subscriber).toHaveBeenCalledTimes(2);
        expect(computed.get()).toBe(30);
    });

    it('should not update if value is the same', () => {
        const signal = new NativeSignal(10);
        const computed = new Computed(() => signal.get() * 2);
        const subscriber = jest.fn();

        computed.subscribe(subscriber);
        signal.set(10);

        expect(subscriber).toHaveBeenCalledTimes(1); // Only initial call
        expect(computed.get()).toBe(20);
    });

    it('should handle multiple dependencies', () => {
        const signal1 = new NativeSignal(10);
        const signal2 = new NativeSignal(5);
        const computed = new Computed(() => signal1.get() + signal2.get());
        const subscriber = jest.fn();

        computed.subscribe(subscriber);
        signal1.set(15);
        signal2.set(7);

        expect(subscriber).toHaveBeenCalledTimes(3); // Initial + 2 updates
        expect(computed.get()).toBe(22);
    });

    it('should not be garbage collected while subscribed', () => {
        const signal = new NativeSignal(10);
        const computed = new Computed(() => signal.get() * 2);
        const subscriber = jest.fn();

        computed.subscribe(subscriber);

        // Remove all references to computed (except the one inside the subscription)
        let computedRef: Computed<number> | undefined = computed;
        computedRef = undefined;
        // Force garbage collection (not always reliable in tests, but good to try)
        global.gc?.();

        signal.set(15); // Should still trigger update
        expect(subscriber).toHaveBeenCalledWith(20); // Initial call
        expect(subscriber).toHaveBeenCalledWith(30); // Update call
        expect(subscriber).toHaveBeenCalledTimes(2);
        expect(computed.get()).toBe(30);
    });


    it('should correctly track and unsubscribe from dependencies', () => {
        const signal1 = new NativeSignal(10);
        const signal2 = new NativeSignal(5);
        const signal3 = new NativeSignal(2);
        const computed = new Computed(() => {
            if (signal1.get() > 5) {
                return signal1.get() + signal2.get();
            } else {
                return signal1.get() + signal3.get();
            }
        });

        // Initial computation: depends on signal1 and signal3
        computed.get();
        expect(computed.subscribed_to).toEqual([signal1, signal3]);

        // Change signal1 so that it now depends on signal1 and signal2
        signal1.set(15);
        computed.get(); // force recalculation to update dependencies
        expect(computed.subscribed_to).toEqual([signal1, signal2]);

        // Change signal1 again, but no change in dependencies
        signal1.set(20);
        computed.get(); // force recalculation to update dependencies
        expect(computed.subscribed_to).toEqual([signal1, signal2]);


        // Subscribe and check if updates are emitted
        const subscriber = jest.fn();
        computed.subscribe(subscriber)

        signal1.set(25)
        expect(subscriber).toHaveBeenCalledTimes(2); // Initial call + update
        expect(computed.get()).toBe(25 + 5);

        signal2.set(10)
        expect(subscriber).toHaveBeenCalledTimes(3); // Initial call + 2 updates
        expect(computed.get()).toBe(25 + 10);


    });

    it('should handle computed within computed', () => {
        const signal = new NativeSignal(10);
        const computed1 = new Computed(() => signal.get() * 2);
        const computed2 = new Computed(() => computed1.get() + 5);

        expect(computed2.get()).toBe(25);

        signal.set(15);
        expect(computed2.get()).toBe(35);
    });

    it('should handle computed within computed with subscriber', () => {
        const signal = new NativeSignal(10);
        const computed1 = new Computed(() => signal.get() * 2);
        const computed2 = new Computed(() => computed1.get() + 5);
        const subscriber = jest.fn();
        computed2.subscribe(subscriber);

        expect(subscriber).toHaveBeenCalledWith(25);

        signal.set(15);
        expect(subscriber).toHaveBeenCalledWith(25);
        expect(subscriber).toHaveBeenCalledWith(35);
        expect(subscriber).toHaveBeenCalledTimes(2);
        expect(computed2.get()).toBe(35);
    });

    it('should handle computed within computed with subscriber and signal change', () => {
        const signal = new NativeSignal(10);
        const computed1 = new Computed(() => signal.get() * 2);
        const computed2 = new Computed(() => computed1.get() + 5);
        const subscriber = jest.fn();
        computed2.subscribe(subscriber);

        expect(subscriber).toHaveBeenCalledWith(25);

        signal.set(15);
        expect(subscriber).toHaveBeenCalledWith(25);
        expect(subscriber).toHaveBeenCalledWith(35);
        expect(subscriber).toHaveBeenCalledTimes(2);
        expect(computed2.get()).toBe(35);
    });

    it('should not call _get() unless subscribers exist', () => {
        const signal = new NativeSignal(10);
        const computed = new Computed(() => signal.get() * 2);
        const _getSpy = jest.spyOn(computed as any, '_get');

        signal.set(15);
        expect(_getSpy).not.toHaveBeenCalled();

        const subscriber = jest.fn();
        computed.subscribe(subscriber);
        signal.set(20);

        expect(_getSpy).toHaveBeenCalledTimes(1);
    });

    it('should defer update if no subscribers', () => {
        const signal = new NativeSignal(10);
        const computed = new Computed(() => signal.get() * 2);
        const _getSpy = jest.spyOn(computed as any, '_get');

        signal.set(15);
        expect(computed._dirty).toBe(true);
        expect(_getSpy).not.toHaveBeenCalled();

        const subscriber = jest.fn();
        computed.subscribe(subscriber);
        expect(_getSpy).toHaveBeenCalledTimes(1);
        expect(subscriber).toHaveBeenCalledWith(30);
        expect(computed._dirty).toBe(false);
    });
});