import { NativeSignal } from "../Core/NativeSignal";
import { EMPTY } from "../Collection2";
import { KeyedCollectionConsumer } from "./KeyedCollectionConsumer";
import { RecordCollection } from "./RecordCollection";


export async function test()
{
    const collection = new RecordCollection({
        a: 1,
        b: 2,
        c: 3
    });

    // collection.set("a", 2);

    let consumer = new KeyedCollectionConsumer(
        new NativeSignal(0),
        (ref, current) =>
        {
            const add = (ref.ref.value !== EMPTY ? ref.ref.value : 0);
            const sub = ref.old_value !== EMPTY ? ref.old_value : 0;
            current.set(current.get() + add - sub);
            return current;
        },
        collection
    );

    let consumer2 = new KeyedCollectionConsumer(
        0,
        (ref, current) =>
        {
            const add = (ref.ref.value !== EMPTY ? ref.ref.value : 0);
            const sub = ref.old_value !== EMPTY ? ref.old_value : 0;
            return current + add - sub;
        },
        collection
    );

    collection.set("a", 1);
    collection.set("a", 3);

    console.log("Result is ", consumer.get().get())
    console.log("Result2 is ", consumer2.get())

}

test();