// npx tsx ./src/Collections2/KeyedCollection/Test.ts

// @ts-ignore Compile-time define; substituted by rollup, provided manually under tsx.
globalThis.$USE_WEAK_REFS$ = true;

import { NativeSignal } from "../../Core/NativeSignal.js";
import { Computed } from "../../Core/Computed.js";
import { EMPTY } from "../Collection2.js";
import type { KeyedCollectionEntryRef } from "./KeyedCollection.js";
import { KeyedCollectionConsumer } from "./KeyedCollectionConsumer.js";
import { RecordCollection } from "./RecordCollection.js";
import { MapCollection } from "./MapCollection.js";
import { MappedCollection } from "./MappedCollection.js";

let failures = 0;
function check(name: string, actual: any, expected: any)
{
    const ok = Object.is(actual, expected);
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"} ${name} = ${String(actual)}${ok ? "" : ` (expected ${String(expected)})`}`);
}

// Incremental sum: add the new value, subtract whatever this consumer last saw.
const sum_reducer = (ref: KeyedCollectionEntryRef<any, number>, current: number) =>
{
    const add = ref.ref.value !== EMPTY ? ref.ref.value : 0;
    const sub = ref.old_value !== EMPTY ? ref.old_value : 0;
    return current + add - sub;
};

export function test()
{
    // -- RecordCollection + consumers ---------------------------------------

    const record = new RecordCollection({ a: 1, b: 2, c: 3 });

    // Aggregate into a NativeSignal, so the total is itself a signal.
    const signal_sum = new KeyedCollectionConsumer(
        new NativeSignal(0),
        (ref: KeyedCollectionEntryRef<string, number>, current) =>
        {
            const add = ref.ref.value !== EMPTY ? ref.ref.value : 0;
            const sub = ref.old_value !== EMPTY ? ref.old_value : 0;
            current.set(current.get() + add - sub);
            return current;
        },
        record
    );

    // Aggregate into a plain number.
    const num_sum = new KeyedCollectionConsumer(0, sum_reducer, record);

    check("initial signal sum", signal_sum.get().get(), 6);
    check("initial numeric sum", num_sum.get(), 6);

    record.set("a", 2);
    record.set("a", 3); // coalesces with the previous set; only the final value counts.
    check("sum after set a=2, a=3", num_sum.get(), 8);
    check("signal sum matches", signal_sum.get().get(), 8);
    check("per-key get", record.get("a"), 3);

    check("delete existing", record.delete("b"), true);
    check("delete missing", record.delete("b"), false);
    check("sum after delete b", num_sum.get(), 6);
    check("get of deleted key", record.get("b"), undefined);

    record.set("b", 10); // re-add after delete creates a fresh entry.
    check("sum after re-add b=10", num_sum.get(), 16);

    // A computed depending on a consumer must be invalidated by source changes.
    const doubled = new Computed(() => num_sum.get() * 2);
    check("computed over consumer", doubled.get(), 32);
    record.set("c", 4);
    check("computed after set c=4", doubled.get(), 34);

    // -- MapCollection + MappedCollection -----------------------------------

    const source = new MapCollection(new Map([["x", 1], ["y", 2]]));
    const source_sum = new KeyedCollectionConsumer(0, sum_reducer, source);
    check("map collection sum", source_sum.get(), 3);

    const mapped = new MappedCollection(source, v => v * 10);
    check("mapped x", mapped.get("x"), 10);
    check("mapped y", mapped.get("y"), 20);

    // Consumer of a mapped collection: must see source changes through the
    // settle chain without anyone reading `mapped` in between.
    const mapped_sum = new KeyedCollectionConsumer(0, sum_reducer, mapped);
    check("mapped sum", mapped_sum.get(), 30);

    source.set("x", 3);
    check("mapped sum after source set", mapped_sum.get(), 50);
    check("mapped x after source set", mapped.get("x"), 30);

    source.set("z", 5); // adds propagate through the mapper.
    check("mapped z", mapped.get("z"), 50);
    check("mapped sum after add", mapped_sum.get(), 100);
    check("source sum after changes", source_sum.get(), 10);

    source.delete("y"); // deletes propagate through the mapper.
    check("mapped y after source delete", mapped.get("y"), undefined);
    check("mapped sum after delete", mapped_sum.get(), 80);
    check("mapped storage dropped y", mapped.value.has("y"), false);

    // Mappers chain.
    const mapped2 = new MappedCollection(mapped, v => v + 1);
    check("chained mapper x", mapped2.get("x"), 31);
    check("chained mapper z", mapped2.get("z"), 51);
    source.set("x", 4);
    check("chained mapper after source set", mapped2.get("x"), 41);

    // A computed over a per-key read of a mapped collection.
    const plus_one = new Computed(() => (mapped.get("x") ?? 0) + 1);
    check("computed over mapped", plus_one.get(), 41);
    source.set("x", 6);
    check("computed over mapped after set", plus_one.get(), 61);
    check("chained mapper follows", mapped2.get("x"), 61);

    // -- dispose --------------------------------------------------------------

    const d = new MapCollection(new Map([["k", 1]]));
    const d_sum = new KeyedCollectionConsumer(0, sum_reducer, d);
    d.set("k", 5);
    check("sum before dispose", d_sum.get(), 5);
    d_sum.dispose();
    d.set("k", 9);
    check("sum after dispose stays stale", d_sum.get(), 5);
    check("source consumer list emptied", d.consumers, undefined);

    // -- ref() ------------------------------------------------------------------

    const rc = new RecordCollection<string, number>({ a: 1, b: 2 });

    // ref() on an existing key starts at the current value.
    const ref_a = rc.ref("a");
    check("ref initial value", ref_a.get(), 1);

    // ref() on a not-yet-existing key reports undefined until set.
    const ref_c = rc.ref("c");
    check("ref of absent key", ref_c.get(), undefined);
    check("absent key still reports undefined via get()", rc.get("c"), undefined);

    // Calling ref() twice for the same key returns the same signal instance.
    check("ref is memoized", rc.ref("a"), ref_a);

    rc.set("c", 99);
    check("ref picks up value once key is added", ref_c.get(), 99);

    // A computed depending on ref(key) only sees changes to that exact key.
    let recomputes = 0;
    const a_plus_one = new Computed(() => { recomputes++; return (ref_a.get() ?? 0) + 1; });
    check("computed over ref initial", a_plus_one.get(), 2);
    check("computed over ref recompute count", recomputes, 1);

    rc.set("b", 20); // unrelated key: must not invalidate a computed keyed on "a".
    check("computed over ref unaffected by unrelated set", a_plus_one.get(), 2);
    check("computed over ref recompute count unaffected", recomputes, 1);

    rc.set("a", 5);
    check("computed over ref after set a=5", a_plus_one.get(), 6);
    check("computed over ref recomputed once", recomputes, 2);

    // ref() survives delete/re-add of its key (unlike a raw KeyedCollectionEntry).
    rc.delete("a");
    check("ref reflects delete", ref_a.get(), undefined);
    check("computed over ref after delete", a_plus_one.get(), 1);
    rc.set("a", 7);
    check("ref reflects re-add", ref_a.get(), 7);
    check("computed over ref after re-add", a_plus_one.get(), 8);

    // A ref'd-but-absent key doesn't leak a fake value into the aggregate sum:
    // its placeholder entry is EMPTY, so the reducer treats it as a no-op.
    const rc2 = new RecordCollection<string, number>({ x: 1 });
    const rc2_sum = new KeyedCollectionConsumer(0, sum_reducer, rc2);
    check("sum before ref of absent key", rc2_sum.get(), 1);
    rc2.ref("y"); // plants an EMPTY placeholder for "y"
    check("sum unaffected by ref of absent key", rc2_sum.get(), 1);
    rc2.set("y", 4);
    check("sum after setting the ref'd key", rc2_sum.get(), 5);

    // Same, but the consumer attaches *after* the placeholder already exists
    // (initialize_consumer path instead of entry_added).
    const rc3 = new RecordCollection<string, number>({ p: 1 });
    rc3.ref("q"); // placeholder exists before any consumer is attached
    const rc3_sum = new KeyedCollectionConsumer(0, sum_reducer, rc3);
    check("sum with pre-existing placeholder", rc3_sum.get(), 1);
    rc3.set("q", 9);
    check("sum after setting pre-existing placeholder's key", rc3_sum.get(), 10);

    console.log(failures === 0 ? "\nAll tests passed." : `\n${failures} test(s) FAILED.`);
    if ((globalThis as any).process)
        (globalThis as any).process.exitCode = failures === 0 ? 0 : 1;
}

test();
