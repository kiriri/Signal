// npx tsx ./src/Collections2/DenseCollection/Test.ts

// @ts-ignore Compile-time define; substituted by rollup, provided manually under tsx.
globalThis.$USE_WEAK_REFS$ = true;

import { NativeSignal } from "../../Core/NativeSignal.js";
import { Computed } from "../../Core/Computed.js";
import { EMPTY } from "../Collection2.js";
import { DenseCollectionConsumer } from "./DenseCollectionConsumer.js";
import { ArrayCollection } from "./ArrayCollection.js";
import { MappedArrayCollection } from "./MappedArrayCollection.js";

let failures = 0;
function check(name: string, actual: any, expected: any)
{
    const ok = Object.is(actual, expected);
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"} ${name} = ${String(actual)}${ok ? "" : ` (expected ${String(expected)})`}`);
}

// Incremental sum: add the new value, subtract whatever this consumer last saw.
const sum_reducer = (value: number | typeof EMPTY, old_value: number | typeof EMPTY, _index: number, current: number) =>
{
    const add = value !== EMPTY ? value : 0;
    const sub = old_value !== EMPTY ? old_value : 0;
    return current + add - sub;
};

export function test()
{
    // -- ArrayCollection + consumers ----------------------------------------

    const arr = new ArrayCollection([1, 2, 3]);

    // Aggregate into a NativeSignal, so the total is itself a signal.
    const signal_sum = new DenseCollectionConsumer(
        new NativeSignal(0),
        (value: number | typeof EMPTY, old_value: number | typeof EMPTY, _index: number, current) =>
        {
            const add = value !== EMPTY ? value : 0;
            const sub = old_value !== EMPTY ? old_value : 0;
            current.set(current.get() + add - sub);
            return current;
        },
        arr
    );

    // Aggregate into a plain number.
    const num_sum = new DenseCollectionConsumer(0, sum_reducer, arr);

    check("initial signal sum", signal_sum.get().get(), 6);
    check("initial numeric sum", num_sum.get(), 6);
    check("initial length", arr.length, 3);

    arr.set(0, 2);
    arr.set(0, 3); // coalesces with the previous set; only the final value counts.
    check("sum after set [0]=2, [0]=3", num_sum.get(), 8);
    check("signal sum matches", signal_sum.get().get(), 8);
    check("per-index get", arr.get(0), 3);

    // push -> consumers see an addition.
    arr.push(10);
    check("length after push", arr.length, 4);
    check("sum after push 10", num_sum.get(), 18);
    check("get pushed index", arr.get(3), 10);

    // pop -> consumers see a removal.
    check("pop returns value", arr.pop(), 10);
    check("length after pop", arr.length, 3);
    check("sum after pop", num_sum.get(), 8);
    check("get of popped index", arr.get(3), undefined);

    // A computed depending on a consumer must be invalidated by source changes.
    const doubled = new Computed(() => num_sum.get() * 2);
    check("computed over consumer", doubled.get(), 16);
    arr.set(2, 5); // was 3 -> 5, sum 8 -> 10
    check("computed after set [2]=5", doubled.get(), 20);

    // -- MappedArrayCollection ----------------------------------------------

    const source = new ArrayCollection([1, 2]);
    const source_sum = new DenseCollectionConsumer(0, sum_reducer, source);
    check("source sum", source_sum.get(), 3);

    const mapped = new MappedArrayCollection(source, v => v * 10);
    check("mapped [0]", mapped.get(0), 10);
    check("mapped [1]", mapped.get(1), 20);
    check("mapped length", mapped.length, 2);

    // Consumer of a mapped collection: must see source changes through the settle
    // chain without anyone reading `mapped` in between.
    const mapped_sum = new DenseCollectionConsumer(0, sum_reducer, mapped);
    check("mapped sum", mapped_sum.get(), 30);

    source.set(0, 3);
    check("mapped sum after source set", mapped_sum.get(), 50);
    check("mapped [0] after source set", mapped.get(0), 30);

    source.push(5); // adds propagate through the mapper.
    check("mapped [2] after source push", mapped.get(2), 50);
    check("mapped length after push", mapped.length, 3);
    check("mapped sum after add", mapped_sum.get(), 100);
    check("source sum after changes", source_sum.get(), 10);

    source.pop(); // removals propagate through the mapper.
    check("mapped [2] after source pop", mapped.get(2), undefined);
    check("mapped length after pop", mapped.length, 2);
    check("mapped sum after remove", mapped_sum.get(), 50);

    // Multiple pushes in one batch must land in order (structure from source length).
    source.push(7);
    source.push(8);
    check("mapped [2] after two pushes", mapped.get(2), 70);
    check("mapped [3] after two pushes", mapped.get(3), 80);
    check("mapped sum after two pushes", mapped_sum.get(), 200);

    // Multiple pops in one batch must shrink to the right length.
    source.pop();
    source.pop();
    check("mapped length after two pops", mapped.length, 2);
    check("mapped sum after two pops", mapped_sum.get(), 50);

    // Mappers chain.
    const mapped2 = new MappedArrayCollection(mapped, v => v + 1);
    check("chained mapper [0]", mapped2.get(0), 31);
    check("chained mapper [1]", mapped2.get(1), 21);
    source.set(0, 4);
    check("chained mapper after source set", mapped2.get(0), 41);

    // A computed over a per-index read of a mapped collection.
    const plus_one = new Computed(() => (mapped.get(0) ?? 0) + 1);
    check("computed over mapped", plus_one.get(), 41);
    source.set(0, 6);
    check("computed over mapped after set", plus_one.get(), 61);
    check("chained mapper follows", mapped2.get(0), 61);

    // -- dispose --------------------------------------------------------------

    const d = new ArrayCollection([1]);
    const d_sum = new DenseCollectionConsumer(0, sum_reducer, d);
    d.set(0, 5);
    check("sum before dispose", d_sum.get(), 5);
    d_sum.dispose();
    d.set(0, 9);
    check("sum after dispose stays stale", d_sum.get(), 5);
    check("source consumer list emptied", d.consumers.length, 0);

    // -- ref() ------------------------------------------------------------------

    const rc = new ArrayCollection([1, 2]);

    // ref() on an existing index starts at the current value.
    const ref_0 = rc.ref(0);
    check("ref initial value", ref_0.get(), 1);

    // Calling ref() twice for the same index returns the same signal instance.
    check("ref is memoized", rc.ref(0), ref_0);

    // A computed depending on ref(index) only sees changes to that exact index.
    let recomputes = 0;
    const zero_plus_one = new Computed(() => { recomputes++; return (ref_0.get() ?? 0) + 1; });
    check("computed over ref initial", zero_plus_one.get(), 2);
    check("computed over ref recompute count", recomputes, 1);

    rc.set(1, 20); // unrelated index: must not invalidate a computed keyed on index 0.
    check("computed over ref unaffected by unrelated set", zero_plus_one.get(), 2);
    check("computed over ref recompute count unaffected", recomputes, 1);

    rc.set(0, 5);
    check("computed over ref after set [0]=5", zero_plus_one.get(), 6);
    check("computed over ref recomputed once", recomputes, 2);

    // Popping the ref'd slot drives its signal to undefined.
    const rc_last = new ArrayCollection([1, 2, 3]);
    const ref_last = rc_last.ref(2);
    check("ref of last value", ref_last.get(), 3);
    rc_last.pop();
    check("ref undefined after its slot popped", ref_last.get(), undefined);

    // A ref'd index still aggregates correctly through a consumer.
    const rc2 = new ArrayCollection([1]);
    const rc2_sum = new DenseCollectionConsumer(0, sum_reducer, rc2);
    check("sum before ref", rc2_sum.get(), 1);
    rc2.ref(0);
    check("sum unaffected by ref", rc2_sum.get(), 1);
    rc2.push(4);
    check("sum after push on ref'd collection", rc2_sum.get(), 5);

    // -- Tier 2 specifics -------------------------------------------------------

    // Capacity growth: push well past the initial backing, then churn pop/push so dead
    // capacity is reused. The incremental sum must stay exact throughout.
    const grow = new ArrayCollection<number>();
    const grow_sum = new DenseCollectionConsumer(0, sum_reducer, grow);
    let expected = 0;
    for (let i = 0; i < 100; i++) { grow.push(i); expected += i; }
    check("sum after 100 pushes (capacity growth)", grow_sum.get(), expected);
    for (let i = 99; i >= 50; i--) { expected -= i; grow.pop(); }
    check("length after popping down to 50", grow.length, 50);
    check("sum after popping down to 50", grow_sum.get(), expected);
    for (let i = 0; i < 30; i++) { grow.push(1000 + i); expected += 1000 + i; } // reuses dead capacity
    check("sum after refilling reused capacity", grow_sum.get(), expected);
    check("value at reused slot", grow.get(50), 1000);

    // Positional ref: pop below the ref, then push to refill the same slot — the same
    // signal instance revives with the new element's value.
    const pos = new ArrayCollection([10, 20]);
    const pos_ref = pos.ref(1);
    check("positional ref initial", pos_ref.get(), 20);
    pos.pop();
    check("positional ref undefined after pop", pos_ref.get(), undefined);
    pos.push(99); // refills slot 1
    check("positional ref revived after push", pos_ref.get(), 99);
    check("positional ref same instance", pos.ref(1), pos_ref);

    // Disposing a consumer that is NOT last must swap the last one into its slot and keep
    // that survivor's bookkeeping correct (the O(1) swap-remove path).
    const multi = new ArrayCollection([1, 2, 3]);
    const first = new DenseCollectionConsumer(0, sum_reducer, multi);
    const second = new DenseCollectionConsumer(0, sum_reducer, multi);
    check("two consumers registered", multi.consumers.length, 2);
    check("first consumer sum", first.get(), 6);
    check("second consumer sum", second.get(), 6);
    first.dispose(); // swaps `second` down into slot 0
    check("one consumer left", multi.consumers.length, 1);
    multi.set(0, 10); // was 1 -> 10
    check("survivor still updates after swap-remove", second.get(), 15);
    check("disposed consumer stays stale", first.get(), 6);

    console.log(failures === 0 ? "\nAll tests passed." : `\n${failures} test(s) FAILED.`);
    if ((globalThis as any).process)
        (globalThis as any).process.exitCode = failures === 0 ? 0 : 1;
}

test();
