// npx tsx --expose-gc ./src/Tests/StressTest3.ts
//
// Stress test for the collections + transformation (reduce) layer:
//   - raw mutation throughput of every collection (Set / Map / Heap / Order)
//   - the cost the lazy `count` reducer adds on top of plain mutation
//   - the eager (subscribed) reduce path, which also guards the coalesced
//     one-emit-per-tick behaviour now that `Collection.dirty` resets `queued`
//   - filter throughput and the per-item `Computed` cost of reactive `count`

import { performance } from 'node:perf_hooks';
import { SignalSet, SignalMap, SignalHeap, Order, count, filter } from 'src/Collections/index.js';
import { EventManager } from 'src/Core';
import type { LinkedList } from 'src/Core/Subscribable.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const N = 1_000_000;          // light mutation loops
const N_REACTIVE = 1_000_000;    // reactive count allocates one Computed per item

const HEAVY = { warmup: 1, samples: 5 };
const LIGHT = { warmup: 3, samples: 10 };

(globalThis as any).$USE_WEAK_REFS$ = true;

// ---------------------------------------------------------------------------
// Harness (same shape as StressTest2)
// ---------------------------------------------------------------------------
const gc: () => void = (globalThis as any).gc ?? (() => { });

let SINK: unknown;
const sink = (v: unknown) => { SINK = v; };

async function wait(ms: number)
{
    const { resolve, promise } = Promise.withResolvers<void>();
    setTimeout(resolve, ms);
    await promise;
}

interface Opts { warmup: number; samples: number; }

function summarize(times: number[])
{
    const sorted = [...times].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const median = sorted[Math.floor(sorted.length / 2)];
    const spreadPct = ((max - min) / min) * 100;
    return { min, median, spreadPct };
}

function report(name: string, times: number[])
{
    const { min, median, spreadPct } = summarize(times);
    console.log(
        `${name.padEnd(40)} min=${min.toFixed(1).padStart(8)}ms` +
        `  median=${median.toFixed(1).padStart(8)}ms  spread=${spreadPct.toFixed(1)}%`,
    );
}

/** Time a synchronous region across multiple samples. `setup` runs untimed. */
function bench(name: string, run: () => void, setup: () => void, opts: Opts)
{
    for (let i = 0; i < opts.warmup; i++) { setup(); run(); }
    const times: number[] = [];
    for (let i = 0; i < opts.samples; i++)
    {
        setup();
        gc();
        const t = performance.now();
        run();
        times.push(performance.now() - t);
    }
    report(name, times);
}

// ---------------------------------------------------------------------------
// 1 — raw collection mutation throughput
// ---------------------------------------------------------------------------
function benchCollections()
{
    console.log(`\n-- collection mutation (N=${N.toLocaleString()}) --`);

    let set: SignalSet<number>;
    bench('SignalSet.add',
        () => { for (let i = 0; i < N; i++) set.add(i); },
        () => { set = new SignalSet<number>(); },
        LIGHT);

    bench('SignalSet.add + delete',
        () => { for (let i = 0; i < N; i++) set.delete(i); },
        () => { set = new SignalSet<number>(); for (let i = 0; i < N; i++) set.add(i); },
        LIGHT);

    let map: SignalMap<number, number>;
    bench('SignalMap.set',
        () => { for (let i = 0; i < N; i++) map.set(i, i); },
        () => { map = new SignalMap<number, number>(); },
        LIGHT);

    let heap: SignalHeap<number>;
    let refs: LinkedList<number>[];
    bench('SignalHeap.add',
        () => { for (let i = 0; i < N; i++) refs[i] = heap.add(i); },
        () => { heap = new SignalHeap<number>(); refs = new Array(N); },
        LIGHT);

    bench('SignalHeap.add + delete(ref)',
        () => { for (let i = 0; i < N; i++) heap.delete(refs[i]); },
        () => { heap = new SignalHeap<number>(); refs = new Array(N); for (let i = 0; i < N; i++) refs[i] = heap.add(i); },
        LIGHT);

    let order: Order<number>;
    bench('Order.push',
        () => { for (let i = 0; i < N; i++) order.push(i); },
        () => { order = new Order<number>(); },
        LIGHT);
}

// ---------------------------------------------------------------------------
// 2 — reduce overhead: lazy `count` over a set
//
// Compare against the plain "SignalSet.add" baseline above: the extra time here
// is the reducer's per-mutation bookkeeping plus a single flush on read.
// ---------------------------------------------------------------------------
function benchReduce()
{
    console.log(`\n-- reduce (N=${N.toLocaleString()}) --`);

    let set: SignalSet<number>;
    let total: ReturnType<typeof count>;

    bench('count(set) lazy: add then read',
        () =>
        {
            for (let i = 0; i < N; i++) set.add(i);
            sink(total.get()); // first read flushes all pending changes
        },
        () => { set = new SignalSet<number>(); total = count(set, v => v); },
        LIGHT);

    let filtered: SignalSet<number>;
    bench('filter(set, even): add then read',
        () =>
        {
            for (let i = 0; i < N; i++) set.add(i);
            sink(filtered.get());
        },
        () => { set = new SignalSet<number>(); filtered = filter(set, v => (v & 1) === 0); },
        LIGHT);

    let reactive: ReturnType<typeof count>;
    bench(`count reactive: add (Computed/item, N=${N_REACTIVE.toLocaleString()})`,
        () =>
        {
            for (let i = 0; i < N_REACTIVE; i++) set.add(i);
            sink(reactive.get());
        },
        () => { set = new SignalSet<number>(); reactive = count(set, v => v, { reactive: true }); },
        HEAVY);
}

// ---------------------------------------------------------------------------
// 3 — eager reduce across many ticks
//
// With a subscriber attached, each tick's mutations must coalesce into exactly
// one emission. This both times that path and guards the `queued`-reset fix:
// before it, only the first tick ever emitted.
// ---------------------------------------------------------------------------
async function benchEagerEmission()
{
    console.log(`\n-- eager reduce (coalesced emit per tick) --`);

    const set = new SignalSet<number>();
    const total = count(set, v => v);

    let emits = 0;
    const sub = (_s: unknown, _v: number) => { emits++; };
    total.subscribe(sub);

    const TICKS = 200;
    const PER_TICK = 1_000;
    let n = 0;

    const t = performance.now();
    for (let tick = 0; tick < TICKS; tick++)
    {
        for (let i = 0; i < PER_TICK; i++) set.add(n++);
        EventManager.flush();
    }
    const dur = performance.now() - t;

    sink(total.get());
    report(`${TICKS} ticks x ${PER_TICK} adds (emits=${emits})`, [dur]);

    // One emission per mutated tick.
    if (emits < (TICKS-1))
        throw new Error(`Expected ~one coalesced emit per tick (queued must reset); got ${emits} over ${TICKS} ticks`);
    if (typeof sub !== 'function') throw new Error('unreachable'); // keep `sub` alive
}

// ---------------------------------------------------------------------------
async function tests()
{
    benchCollections();
    benchReduce();
    await benchEagerEmission();

    if (SINK === Symbol.for('never')) console.log(SINK);
    console.log('\nStressTest3 done.');
}
tests();
