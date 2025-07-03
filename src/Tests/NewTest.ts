// npx tsx --expose-gc ./Tests/NewTest.ts

import { SignalSet, SignalMap, Order, Reducer, I_NativeCollection } from "src/Collections";
import { StatefulSubscribable, NativeSignal, Computed } from "src/Core";
import { Interval } from "src/Events";
import { Effect } from "src/Sinks";

const finalized: any[] = [];
const finalizer = new FinalizationRegistry((v) =>
{
    console.log(v);
    finalized.push(v);
});

function assertSame(...signals: StatefulSubscribable<any>[])
{
    assertValue(signals[0].get(), ...signals);
}

function assertValue<T>(value: T, ...signals: StatefulSubscribable<T>[])
{
    for (let i = 0; i < signals.length; i++)
    {
        const signal = signals[i];
        if (signal.get() !== value)
        {
            throw new Error("Value mismatch at " + i + " : " + value + " vs " + signal.get());
        }
    }
}

function assertSetSize(size: number, set: SignalSet<any> | SignalMap<any, any>)
{
    if (set.get().size !== size)
        throw new Error("Size mismatch " + size + ' vs ' + set.get().size);
}

async function assertGcCount(count: number)
{

    for (let i = 0; i < 500; i++)
    {
        gc();
        await wait(10);

        if (finalized.length == count)
            return;

        if (finalized.length > count)
        {
            throw new Error("Too many gc'ed objects. " + count + " vs " + finalized.length);
        }
    }

    throw new Error("GC Timeout : Did not reach the required number of gc'ed objects after 5s. " + count + " vs " + finalized.length);
}

async function wait(ms: number)
{
    let { resolve, promise } = Promise.withResolvers();
    setTimeout(resolve, ms);
    await promise;
}

global.gc()

const tests: Function[] = [
];

async function runTests()
{
    for (let test of tests)
    {
        await test();
        gc();
        await wait(100);
        gc();
        await wait(100);
        gc();

        finalized.length = 0;
    }

}

// Test setting and getting native signals.
tests.push(function test1()
{
    const INITIAL_VALUE = 123;

    const signal1 = new NativeSignal(INITIAL_VALUE);
    const signal2 = new NativeSignal(INITIAL_VALUE);

    assertSame(signal1, signal2);

    signal1.set(-1);
    assertValue(-1, signal1);
    assertValue(INITIAL_VALUE, signal2);

    signal1.update(value => value * 2);
    assertValue(-2, signal1);
});

// Test simple subscribe operation.
tests.push(async function test2()
{
    const INITIAL_VALUE = {};

    const signal1 = new NativeSignal(INITIAL_VALUE);
    const signal2 = new NativeSignal(INITIAL_VALUE);


    const fn = () =>
    {
        console.log("SETTELETTL")
        signal2.set(signal1.get());
    };
    signal1.subscribe(fn);
    // console.log("SUB DONE ", signal1.subscribers)

    assertValue(INITIAL_VALUE, signal1, signal2);

    // console.log("SET START")

    signal1.set(3);
    // console.log("SET DONE")

    // console.log("About to wait")
    await wait(1);

    // console.log(3, signal1.get(), signal2.get());
    assertValue(3, signal1, signal2);
}
);

/**
 * Test computed.
 */
tests.push(async function test3()
{
    const INITIAL_VALUE = 1;

    const signal0 = new NativeSignal(0);
    const computed0 = new Computed(() =>
    {
        return signal0.get();
    })

    signal0.set(0);
    signal0.set(1);
    signal0.set(2);

    assertValue(2, computed0, signal0)

    const signal1 = new NativeSignal(INITIAL_VALUE);
    const signal2 = new NativeSignal(INITIAL_VALUE);
    const computed1 = new Computed(() =>
    {
        return signal1.get() + signal2.get();
    })

    gc();

    const fn = () =>
    {
        signal2.set(signal1.get());
    };
    signal1.subscribe(fn);
    gc();

    assertValue(INITIAL_VALUE, signal1, signal2);
    assertValue(INITIAL_VALUE * 2, computed1);

    signal1.set(2);
    await wait(100);

    gc();

    assertValue(2, signal1, signal2);
    assertValue(4, computed1);

    async function scope1()
    {
        const computed2 = new Computed(() =>
        {
            return signal1.get() + signal2.get();
        })

        finalizer.register(computed2, "Inner computed");
    }

    await scope1();

    await assertGcCount(1);
}
);

/**
 * Test if computed stops its dependencies from GCing.
 */
tests.push(async function test3()
{
    const INITIAL_VALUE = 1;

    let computed1: Computed<number>;

    async function scope1()
    {
        const signal1 = new NativeSignal(INITIAL_VALUE);
        const signal2 = new NativeSignal(INITIAL_VALUE);
        const signal3 = new NativeSignal(INITIAL_VALUE);

        computed1 = new Computed(() =>
        {
            return signal1.get() + signal2.get();
        });

        finalizer.register(signal3, "");
        finalizer.register(signal2, "");

        gc();
        await wait(100);
        gc();

        signal1.set(2)

        gc();
        await wait(100);
        gc();

        signal2.set(3)

    }

    await scope1();


    gc();
    await wait(100);
    gc();



    await assertGcCount(1);

    assertValue(5, computed1);
}
);

/**
 * Effects and deep Computed
 */
tests.push(async function test3()
{

    console.log("First ", finalized.length)

    const INITIAL_VALUE = 1;

    async function scope1()
    {
        let operations: number = 0;
        let effect_count: number = 0;

        const signal1 = new NativeSignal(INITIAL_VALUE);
        const signal2 = new NativeSignal(INITIAL_VALUE);
        const signal3 = new NativeSignal(INITIAL_VALUE);

        const computed1 = new Computed(() =>
        {
            operations++;
            return signal1.get() + signal2.get();
        });

        const computed2 = new Computed(() =>
        {
            operations++;
            return signal3.get() + signal2.get();
        });

        const computed3 = new Computed(() =>
        {
            operations++;
            return computed1.get() + computed2.get();
        });


        let effect_1 = new Effect({
            one: signal1,
            two: signal2,
            three: signal3
        }, ({ one, two, three }) =>
        {
            console.log("Effect 1");
            effect_count++;
        });

        let effect_2 = new Effect({
            one: computed1,
            two: computed2,
            three: computed3
        }, ({ one, two, three }) =>
        {
            console.log("Effect 2");

            effect_count++;
        });

        finalizer.register(computed1, "");
        finalizer.register(computed2, "");
        finalizer.register(computed3, "");
        finalizer.register(signal1, "");

        assertValue(INITIAL_VALUE, signal1, signal2, signal3);
        assertValue(INITIAL_VALUE * 2, computed1, computed2);
        assertValue(INITIAL_VALUE * 4, computed3);

        if (operations !== 3)
        {
            throw new Error("Expected 3 operations, got " + operations);
        }

        if (effect_count !== 0)
        {
            throw new Error("Expected no effect trigger before wait, got " + effect_count);
        }



        signal1.set(2);

        await wait(10);

        if ((effect_count as number) !== 2)
        {
            throw new Error("Expected exactly two effect triggers after wait, got " + effect_count);
        }

        assertValue(INITIAL_VALUE * 4 + 1, computed3);

        if ((operations as number) !== 5)
        {
            throw new Error("Expected 5 operations, got " + operations);
        }

        finalizer.register(effect_1, "effect1");
        finalizer.register(effect_2, "effect2");
    }

    await scope1();

    gc();
    await wait(100);
    gc();

    console.log("This?");
    await assertGcCount(6);
}
);

tests.push(async () =>
{

    async function scope1()
    {
        let interval = Interval(10);
        finalizer.register(interval, "Interval");

        let computed1 = new Computed(() =>
        {
            return interval.get();
        });

        await wait(109);

        console.log(interval.get(), computed1.get());

        assertValue(10, computed1);
    };

    await scope1();

    gc();
    await wait(100);
    gc();

    await assertGcCount(1);
})


// /**
//  * Test Sets.
//  */
tests.push(async function test3()
{

    const signal1 = new NativeSignal(1);
    const signal2 = new NativeSignal(2);

    signal1["name"] = "1";
    signal2["name"] = "2";

    const set1 = new SignalSet([signal1]);

    assertSetSize(1, set1);

    // allow gc to clean up everything inside
    async function scope1()
    {
        let did_emit: { event: "add" | "delete"; value: NativeSignal<number>; }[] = [];

        const cbk = (sig, v) =>
        {
            console.log("cbk ", v)
            did_emit.push(v);
        };

        // increment the gc counter when the callback function is recycled.
        finalizer.register(cbk, "Cbk");

        set1.subscribe_event(cbk);

        set1.add(signal2);

        assertSetSize(2, set1);

        set1.add(signal2);

        assertSetSize(2, set1);


        set1.delete(signal1);

        assertSetSize(1, set1);

        set1.delete(signal1);

        assertSetSize(1, set1);

        await wait(0);

        if (
            !did_emit
            || did_emit.length !== 2
            || did_emit[0].event !== "add"
            || did_emit[0].value !== signal2
            || did_emit[1].event !== "delete"
            || did_emit[1].value !== signal1
        )
        {
            console.log('res', did_emit);
            throw new Error("Didn't emit expected values");
        }

    }

    await scope1();

    await assertGcCount(1);

    async function scope2()
    {
        signal1.set(2);
        let countedSet1 = set1.count((v) => v.get() > 1 ? 1 : 0);


        set1.add(signal1);
        signal2.set(2);

        // Problem : Get should circumvent need for wait...
        // await wait(2);
        console.log(countedSet1.get());
    }

    await scope2();
}
);

// /**
//  * Test Maps.
//  */
tests.push(async function test3()
{

    const signal1 = new NativeSignal(1);
    const signal2 = new NativeSignal(2);

    signal1["name"] = "1";
    signal2["name"] = "2";

    const map1 = new SignalMap([["1", signal1]]);

    assertSetSize(1, map1);

    // allow gc to clean up everything inside
    async function scope1()
    {
        let did_emit: { event: "add" | "delete"; key: string, value: NativeSignal<number>; }[] = [];

        const cbk = (sig, v) =>
        {
            did_emit.push(v);
        };

        // increment the gc counter when the callback function is recycled.
        finalizer.register(cbk, "Cbk");

        map1.subscribe_event(cbk);

        map1.set("2", signal2);

        assertSetSize(2, map1);

        map1.set("2", signal2);

        assertSetSize(2, map1);


        map1.delete("1");

        assertSetSize(1, map1);

        map1.delete("1");

        assertSetSize(1, map1);

        await wait(0);

        if (
            !did_emit
            || did_emit.length !== 2
            || did_emit[0].event !== "add"
            || did_emit[0].value[0] !== "2"
            || did_emit[0].value[1] !== signal2
            || did_emit[1].event !== "delete"
            || did_emit[1].value[0] !== "1"
            || did_emit[1].value[1] !== signal1
        )
        {
            console.log('res', did_emit);
            throw new Error("Didn't emit expected values");
        }

    }

    await scope1();

    await assertGcCount(1);
}
);

// /**
//  * Test Maps Refs
//  */
tests.push(async function test3()
{

    const signal1 = new NativeSignal(1);
    const signal2 = new NativeSignal(2);

    signal1["name"] = "1";
    signal2["name"] = "2";

    const map1 = new SignalMap([["1", signal1]]);

    assertValue(signal1, map1.ref("1"));

    assertValue(undefined, map1.ref("2"));
    assertSetSize(1, map1);

    map1.ref("2").set(signal2);

    await wait(0)

    assertValue(signal2, map1.ref("2"));
    assertSetSize(2, map1);
}
);

/**
 * Test Orders
 */
tests.push(async function OrderTest()
{
    const order = new Order<number>();

    console.assert(order.first === null && order.first === null, "Initial Order not empty!");

    let one = order.push(1);

    console.assert(order.first !== null && order.first !== null && order.size() === 1, "Order after push: no first/last!");

    one.delete();

    console.log(order.first, order.size())
    console.assert(order.first === null && order.first === null && order.size() === 0, "Order after Delete not empty! ");

    // push

    one = order.push(1);
    let two = order.push(2);
    let three = order.push(3);

    let items = [...order].forEach((v, i) => console.assert(v.value === (i + 1), `Items out of order ${v.value}`));
}
);

function count<T>(collection: I_NativeCollection<T>, fn: { (v: T, prev:T): number; }, map : boolean, identity:T)
{
    let reducer = new Reducer(
        identity,
        (value, last_value, result) =>
        {
            return fn(value,last_value) + result;
        },
        0
    );

    reducer.register_collection(collection,false);

    return reducer;
}

/**
 * Generic Collection Count
 */
tests.push(async function OrderTest()
{
    const order = new Order<number>();
    order.push(1);
    order.push(2);
    order.push(3);
    const map = new SignalMap<string, number>([
        ["hi", 1],
        ["hello", 2],
        ["bonjour", 3]
    ]);
    const set = new SignalSet<number>([1, 2, 3]);

    const order_count = count(order, (v,prev) => v-prev, false,0);
    const map_count = count(map, (v,prev) => v[1]-prev[1], false,["",0] as const);
    const set_count = count(set, (v,prev) => v-prev, false,0);

    assertValue(6, order_count, map_count, set_count);

    order.push(4);
    set.add(4);
    map.set("hallo",4);
    await wait(100);
    assertValue(10, order_count, map_count, set_count);

    order.push(5);
    set.add(5);
    map.set("hola",5);
    assertValue(15, order_count, map_count, set_count);

}
);

/**
 * Generic Fast Reduce (count)
 */
// tests.push(async function OrderTest2()
// {
//     const order = new Order<number>();
//     order.push(1);
//     order.push(2);
//     order.push(3);

//     const order_count = count_fast(order,(v: { event: "add"|"delete"; value: number; })=>{
//         switch(v.event)
//         {
//             case 'add': return (v.value as number);
//             case 'delete': return -(v.value as number);
//         }

//         return 0;
//     },[]);

//     assertValue(6,order_count);

//     order.push(4);
//     order.push(5);

//     assertValue(15,order_count);
// }
// );





// Test Filtered Sets
// tests.push(async function test3()
// {
//     const INITIAL_VALUE = 1;

//     const signal1 = new NativeSignal(INITIAL_VALUE);
//     const signal2 = new NativeSignal(INITIAL_VALUE);


//     const set1 = new SignalSet([signal1]);

//     // allow gc to clean up everything inside
//     function scope1()
//     {

//         const filterSet1 = new FilteredSetComputed(set1, (v) => v.get() > 1);
//         const filterSet2 = new FilteredSetSignals(set1, (v) => v > 1);

//         assertSetSize(1, set1);
//         assertSetSize(0, filterSet1);
//         assertSetSize(0, filterSet2);

//         signal1.set(2);
//         assertSetSize(1, set1);
//         assertSetSize(1, filterSet2);
//         assertSetSize(1, filterSet1);

//         set1.add(signal2)

//         assertSetSize(2, set1);
//         assertSetSize(1, filterSet1);
//         assertSetSize(1, filterSet2);

//         signal2.set(2);
//         assertSetSize(2, set1);
//         assertSetSize(2, filterSet1);
//         assertSetSize(2, filterSet2);

//         signal2.set(1);
//         assertSetSize(2, set1);
//         assertSetSize(1, filterSet1);
//         assertSetSize(1, filterSet2);

//         set1.delete(signal2);
//         assertSetSize(1, set1);
//         assertSetSize(1, filterSet1);
//         assertSetSize(1, filterSet2);

//         set1.delete(signal1);
//         assertSetSize(0, set1);
//         assertSetSize(0, filterSet1);
//         assertSetSize(0, filterSet2);

//         set1.delete(signal1);
//         assertSetSize(0, set1);
//         assertSetSize(0, filterSet1);
//         assertSetSize(0, filterSet2);

//         // BUG : As long as the set has signals in it, it cannot get GCed!!!
//         signal2.set(2);
//         set1.add(signal2);
//         assertSetSize(1, filterSet2);
//         assertSetSize(1, filterSet1);


//         finalizer.register(filterSet1, "1");
//         finalizer.register(filterSet2, "2");
//     }

//     scope1();

//     gc();
//     await wait(100);
//     gc()

//     await assertGcCount(2);
// }
// );

// // Test Transactions and Buffered Subscribables
// tests.push(async function test3()
// {
//     const signal1 = new NativeSignal(1);

//     const buffer1 = new BufferedSubscribable();

//     let result = [];
//     const get_result = (signal, value) =>
//     {
//         console.log("RES ", value);
//         result = value;
//     };

//     buffer1.subscribe(get_result);

//     // transactions should only emit after they are done.
//     // signals which support it should wait for all their dependencies before updating themselves.
//     // In particular Computed and Effect.
//     transaction(() =>
//     {


//         signal1.subscribe((source, value) => buffer1.emit(value));

//         buffer1.emit(1); // This emits in a buffer after the transaction is over
//         signal1.set(2); // This emits only after the transaction is over and the buffer has already emitted.
//         buffer1.emit(3);

//     });

//     console.log(result);

// }
// );
// Test Mapped Maps
// tests.push(async function test3()
// {
//     const INITIAL_VALUE = 1;

//     const signal1 = new NativeSignal(INITIAL_VALUE);
//     const signal2 = new NativeSignal(INITIAL_VALUE);

//     const map1 = new SignalMap([["1",signal1]]);

//     // allow gc to clean up everything inside
//     function scope1()
//     {
//         const filterSet1 = new Mapped(map1,(v)=>v.get() > 1);
//         const filterSet2 = new FilteredSetSignals(map1,(v)=>v > 1);

//         assertSetSize(1, map1);
//         assertSetSize(0, filterSet1);
//         assertSetSize(0, filterSet2);

//         signal1.set(2);
//         assertSetSize(1, map1);
//         assertSetSize(1, filterSet2);
//         assertSetSize(1, filterSet1);

//         map1.add(signal2)

//         assertSetSize(2, map1);
//         assertSetSize(1, filterSet1);
//         assertSetSize(1, filterSet2);

//         signal2.set(2);
//         assertSetSize(2, map1);
//         assertSetSize(2, filterSet1);
//         assertSetSize(2, filterSet2);

//         signal2.set(1);
//         assertSetSize(2, map1);
//         assertSetSize(1, filterSet1);
//         assertSetSize(1, filterSet2);

//         map1.delete(signal2);
//         assertSetSize(1, map1);
//         assertSetSize(1, filterSet1);
//         assertSetSize(1, filterSet2);

//         map1.delete(signal1);
//         assertSetSize(0, map1);
//         assertSetSize(0, filterSet1);
//         assertSetSize(0, filterSet2);

//         map1.delete(signal1);
//         assertSetSize(0, map1);
//         assertSetSize(0, filterSet1);
//         assertSetSize(0, filterSet2);

//         // BUG : As long as the set has signals in it, it cannot get GCed!!!
//         map1.add(signal1);


//         finalizer.register(filterSet1,"1");
//         finalizer.register(filterSet2,"2");
//     }

//     scope1();

//     await assertGcCount(2);
// }
// );













runTests();