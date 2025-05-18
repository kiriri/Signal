// src/StressTest.ts
import { Computed } from "../_Signal2/Computed2";
import { NativeSignal } from "../_Signal2/Signal2";

async function wait(ms: number)
{
    let { resolve, promise } = Promise.withResolvers();
    setTimeout(resolve, ms);
    await promise;
}

const numSignals = 1_000_000;
const numSubscribersPerSignal = 1;
const numIterations = 1_000_000;

async function stressTest() {
    const signals: NativeSignal<number>[] = [];

    let inc = 0;
    const subber = (_,value: number) => {
        // Do nothing, just simulate a subscriber
        inc++;
    };

    let start = Date.now();

    // Create a large number of signals
    for (let i = 0; i < numSignals; i++) {
        signals.push(new NativeSignal(i));
    }

    console.log(`Created ${numSignals} signals in ${Date.now() - start}ms.`);

    start = Date.now();

    // Subscribe a large number of subscribers to each signal
    for (const signal of signals) {
        for (let j = 0; j < numSubscribersPerSignal; j++) {
            signal.subscribe(subber);
        }
    }

    console.log(`Subscribed each signal to ${numSubscribersPerSignal} subscribers each in ${Date.now() - start}ms.`);
    start = Date.now();

    // Simulate a large number of iterations where we emit values to the signals
    for (let i = 0; i < numSignals; i++) {
        signals[i].set(123);
    }

    
    console.log(`Set the value of each signal in ${Date.now() - start}ms.`);
    start = Date.now();
    
    await wait(0);

    console.log(`Ran the resulting subscriptions in ${Date.now() - start}ms.`);
}



async function stressTest2()
{
    const signal1 = new NativeSignal(1);
    const signal2 = new NativeSignal(2);

    const computed1 = new Computed(()=>signal1.get() + signal2.get());

    let start = Date.now();

    for(let i = 0; i < 1_000_000; i++)
    {
        signal1.set(i);
    }

    console.log(`Setting 1m signals with an attached computed took ${Date.now() - start}ms.`);
    start = Date.now();

    let last = 0;

    for(let i = 0; i < 1_000_000; i++)
    {
        signal1.set(i);
        last = computed1.get();
    }

    console.log(`With computed get() it took ${Date.now() - start}ms.`);
}


async function tests()
{
    await stressTest();
    await stressTest2();

}
tests();