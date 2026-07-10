// Stress / throughput benchmark for the Collections2 signal collection proposal.
//
//   npx tsx --expose-gc ./src/Collections2/StressTest.ts
//
// Measures operations-per-second for the four headline operations of a keyed
// signal collection and compares each against a plain native `Map`:
//
//   construct  - build a collection of N entries from existing data
//   set        - overwrite the value of an existing key
//   get        - read a single value by key
//   consumer   - mutate one entry, then read the reduced aggregate
//                (the reactive path; the Map baseline re-scans to recompute)
//
// Every case is measured across several timed windows (500ms each) and the
// per-second rates are averaged, so a single slow window (GC, JIT) shows up as
// spread rather than silently skewing the headline number.

import { EMPTY } from "./Collection2.js";
import { MapCollection } from "./KeyedCollection/MapCollection.js";
import { KeyedCollectionConsumer } from "./KeyedCollection/KeyedCollectionConsumer.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const SIZES = [8, 1_000, 100_000];   // small, medium, large
const WINDOW_MS = 500;               // measurement window per repeat
const REPEATS = 5;                   // timed windows, averaged
const WARMUP = 2;                    // untimed windows to settle the JIT

const gc: () => void = (globalThis as any).gc ?? (() => { });

// Keep the optimizer from eliding "useless" work.
let SINK: unknown;
const sink = (v: unknown) => { SINK = v; };

// The per-entry reducer used by the signal consumer (mirrors KeyedCollection/Test.ts).
const sumReducer = (ref: any, current: number) =>
    ref.ref.value !== EMPTY ? current + ref.ref.value : current;

// ---------------------------------------------------------------------------
// Timing harness
// ---------------------------------------------------------------------------

/** A side of a comparison: untimed `setup`, then `chunk` is called until the
 *  window expires. `chunk` returns how many operations it performed. */
interface Side
{
    setup?: () => void;
    chunk: () => number;
}

/** Run `chunk` until ~`windowMs` has elapsed; return operations per second. */
function timeWindow(chunk: () => number, windowMs: number): number
{
    let ops = 0;
    const start = performance.now();
    let elapsed = 0;
    do
    {
        ops += chunk();
        elapsed = performance.now() - start;
    } while (elapsed < windowMs);

    return ops / (elapsed / 1000);
}

interface Stats { mean: number; min: number; max: number; spreadPct: number; }

function measure(side: Side): Stats
{
    side.setup?.();
    for (let i = 0; i < WARMUP; i++) timeWindow(side.chunk, WINDOW_MS);

    const rates: number[] = [];
    for (let i = 0; i < REPEATS; i++)
    {
        side.setup?.();
        gc();
        rates.push(timeWindow(side.chunk, WINDOW_MS));
    }

    const min = Math.min(...rates);
    const max = Math.max(...rates);
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    return { mean, min, max, spreadPct: ((max - min) / min) * 100 };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function humanRate(n: number): string
{
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "G";
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
    return n.toFixed(1);
}

function row(scenario: string, size: number, signal: Stats, map: Stats)
{
    const ratio = signal.mean / map.mean;
    const ratioStr = ratio >= 1
        ? `${ratio.toFixed(2)}x faster`
        : `${(1 / ratio).toFixed(2)}x slower`;

    console.log(
        scenario.padEnd(12) +
        size.toLocaleString().padStart(9) +
        `   signal ${(humanRate(signal.mean) + "/s").padStart(10)} (±${signal.spreadPct.toFixed(0)}%)` +
        `   map ${(humanRate(map.mean) + "/s").padStart(10)} (±${map.spreadPct.toFixed(0)}%)` +
        `   ${ratioStr.padStart(13)}`,
    );
}

/** Run one scenario across all sizes and print a comparison row per size. */
function compare(
    scenario: string,
    opLabel: string,
    build: (size: number) => { signal: Side; map: Side },
)
{
    console.log(`\n-- ${scenario}  (op = ${opLabel}) --`);
    for (const size of SIZES)
    {
        const { signal, map } = build(size);
        row(scenario, size, measure(signal), measure(map));
    }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Pre-built source data for a given size so construction isn't paying for it. */
function fixture(size: number)
{
    const keys = new Array<number>(size);
    const entries = new Array<[number, number]>(size);
    for (let i = 0; i < size; i++)
    {
        keys[i] = i;
        entries[i] = [i, i];
    }
    const sourceMap = new Map<number, number>(entries);
    return { keys, entries, sourceMap };
}

/** Operations per chunk, scaled so each chunk is cheap but dwarfs the clock read. */
function chunkCount(size: number): number
{
    // O(1) ops: keep a fat fixed batch regardless of size.
    return 50_000;
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

// 1 - construct a collection of `size` entries from existing data.
function buildConstruct(size: number)
{
    const { sourceMap, entries } = fixture(size);
    // Fewer constructions per chunk for big collections; both sides match.
    const batch = Math.max(1, Math.min(5_000, Math.round(1_000_000 / size)));

    return {
        signal: {
            chunk: () =>
            {
                for (let i = 0; i < batch; i++) sink(new MapCollection(sourceMap));
                return batch;
            },
        } as Side,
        map: {
            chunk: () =>
            {
                for (let i = 0; i < batch; i++) sink(new Map(entries));
                return batch;
            },
        } as Side,
    };
}

// 2 - overwrite the value of an existing key (cycling through all keys).
function buildSet(size: number)
{
    const { sourceMap, keys } = fixture(size);
    const count = chunkCount(size);
    let coll: MapCollection<number, number>;
    let map: Map<number, number>;
    let v = 0;

    return {
        signal: {
            setup: () => { coll = new MapCollection(sourceMap); },
            chunk: () =>
            {
                for (let i = 0; i < count; i++) coll.set(keys[i % size], v++);
                return count;
            },
        } as Side,
        map: {
            setup: () => { map = new Map(sourceMap); },
            chunk: () =>
            {
                for (let i = 0; i < count; i++) map.set(keys[i % size], v++);
                return count;
            },
        } as Side,
    };
}

// 3 - read a single value by key (cycling through all keys).
function buildGet(size: number)
{
    const { sourceMap, keys } = fixture(size);
    const count = chunkCount(size);
    let coll: MapCollection<number, number>;
    let map: Map<number, number>;

    return {
        signal: {
            setup: () => { coll = new MapCollection(sourceMap); },
            chunk: () =>
            {
                let acc = 0;
                for (let i = 0; i < count; i++)
                {
                    const v = coll.value.get(keys[i % size])!.value;
                    if (v !== EMPTY) acc += v as number;
                }
                sink(acc);
                return count;
            },
        } as Side,
        map: {
            setup: () => { map = new Map(sourceMap); },
            chunk: () =>
            {
                let acc = 0;
                for (let i = 0; i < count; i++) acc += map.get(keys[i % size])!;
                sink(acc);
                return count;
            },
        } as Side,
    };
}

// 4 - reactive aggregate: mutate one entry, then read the reduced total.
//     The signal consumer updates incrementally (only the dirty entry is
//     re-reduced); the Map has no reactivity, so the honest baseline re-scans
//     every value to recompute the total.
function buildConsumer(size: number)
{
    const { sourceMap, keys } = fixture(size);
    // Map re-scans `size` values per op, so scale the batch to bound chunk cost.
    const count = Math.max(1, Math.min(50_000, Math.round(2_000_000 / size)));

    let coll: MapCollection<number, number>;
    let consumer: KeyedCollectionConsumer<number, number, number>;
    let map: Map<number, number>;
    let v = 0;

    return {
        signal: {
            setup: () =>
            {
                coll = new MapCollection(sourceMap);
                consumer = new KeyedCollectionConsumer(0, sumReducer, coll);
                consumer.get(); // settle: first poll registers per-entry subscribers
            },
            chunk: () =>
            {
                for (let i = 0; i < count; i++)
                {
                    coll.set(keys[i % size], v++);
                    sink(consumer.get());
                }
                return count;
            },
        } as Side,
        map: {
            setup: () => { map = new Map(sourceMap); },
            chunk: () =>
            {
                for (let i = 0; i < count; i++)
                {
                    map.set(keys[i % size], v++);
                    let total = 0;
                    for (const value of map.values()) total += value;
                    sink(total);
                }
                return count;
            },
        } as Side,
    };
}

// ---------------------------------------------------------------------------
async function main()
{
    console.log("Collections2 throughput benchmark (signal MapCollection vs native Map)");
    console.log(`window=${WINDOW_MS}ms  repeats=${REPEATS} (averaged)  warmup=${WARMUP}  node=${process.version}`);
    if ((globalThis as any).gc === undefined)
        console.log("note: run with --expose-gc for cleaner between-window state");

    compare("construct", "build a collection of N entries", buildConstruct);
    compare("set", "overwrite one existing key", buildSet);
    compare("get", "read one value by key", buildGet);
    compare("consumer", "mutate one entry + read aggregate", buildConsumer);

    if (SINK === Symbol.for("never")) console.log(SINK);
    console.log("\nStressTest done.");
}

main();
