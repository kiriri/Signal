// src/StressTest.ts
import { Order } from "../_Signal2/Collections/Order";
import { Computed } from "../_Signal2/Core/Computed";
import { NativeSignal } from "../_Signal2/Core/Signal";

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

import { count, reduce_fast } from '../_Signal2/Collections/transformations';

async function stressTestCount()
{
    const num = 100_000;
    const order = new Order<number>();
    let start = Date.now();

    for(let i = 0; i < num; i++)
        order.push(i);

    console.log(`Added ${num} numbers to Order in ${Date.now() - start}.`);
    start = Date.now();

    const order_count = count(order,(v)=>1);

    console.log(`Initialized count in ${Date.now() - start}.`);
    start = Date.now();

    const order_count2 = reduce_fast(order,(v,prev)=>{
        switch(v.event)
        {
            case 'add': return prev + 1;
            case 'delete': return prev - 1;
        }

        return prev;
    },0,[]);

    console.log(`Initialized count2 in ${Date.now() - start}.`);
    start = Date.now();


    for(let i = 0; i < num; i++)
        order.push(i);

    console.log(order_count.get(),order_count2.get());
    console.log(`Added ${num} ${Date.now() - start}.`);



}



async function tests()
{
    await stressTest();
    await stressTest2();

    await stressTestCount();

}
tests();