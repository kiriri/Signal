// src/StressTest.ts
import { Signal } from "./Signal.js";

const numSignals = 1000;
const numSubscribersPerSignal = 100;
const numIterations = 10000;

function stressTest() {
    const signals: Signal<number>[] = [];

    // Create a large number of signals
    for (let i = 0; i < numSignals; i++) {
        signals.push(new Signal(i));
    }

    // Subscribe a large number of subscribers to each signal
    for (const signal of signals) {
        for (let j = 0; j < numSubscribersPerSignal; j++) {
            signal.subscribe((value: number) => {
                // Do nothing, just simulate a subscriber
            });
        }
    }

    console.log(`Created ${numSignals} signals with ${numSubscribersPerSignal} subscribers each`);

    // Simulate a large number of iterations where we emit values to the signals
    for (let i = 0; i < numIterations; i++) {
        const signalIndex = Math.floor(Math.random() * numSignals);
        const newValue = Math.random();
        signals[signalIndex].set(newValue);
    }

    console.log(`Completed ${numIterations} iterations of emitting values to random signals`);
}

stressTest();
