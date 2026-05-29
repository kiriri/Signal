import { performance } from 'node:perf_hooks';
import { Computed, NativeSignal } from 'src/Core';
// import { count, Order, reduce_fast } from 'src/Collections';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const numSignals = 10_000_000;
const numSubscribersPerSignal = 1;

// Heavy pipeline (creation) is expensive per run, so use fewer samples.
// The light loops can afford more. Tune these until `spread` is small.
const HEAVY = { warmup: 1, samples: 5 };
const LIGHT = { warmup: 3, samples: 12 };

(globalThis as any).$USE_WEAK_REFS$ = true;

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

// Use global.gc() if available (run node with --expose-gc), else no-op.
const gc: () => void = (globalThis as any).gc ?? (() => {});

// Sink to defeat dead-code elimination. Anything assigned here is observably
// "used" because we log it once at the very end.
let SINK: unknown;
const sink = (v: unknown) => { SINK = v; };

async function wait(ms: number) {
    const { resolve, promise } = Promise.withResolvers<void>();
    setTimeout(resolve, ms);
    await promise;
}

interface Opts { warmup: number; samples: number; }

function summarize(times: number[]) {
    const sorted = [...times].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const median = sorted[Math.floor(sorted.length / 2)];
    const spreadPct = ((max - min) / min) * 100; // relative range of samples
    return { min, median, spreadPct };
}

function report(name: string, times: number[]) {
    const { min, median, spreadPct } = summarize(times);
    // `min` is your reliable score. `spread` tells you whether to trust it:
    // a large spread means the environment is noisy (close background apps,
    // disable turbo, pin a core) rather than the code being slow.
    console.log(
        `${name.padEnd(42)} min=${min.toFixed(1).padStart(8)}ms` +
        `  median=${median.toFixed(1).padStart(8)}ms  spread=${spreadPct.toFixed(1)}%`,
    );
}

/** Time a synchronous region across multiple samples. `setup` runs untimed. */
function bench(name: string, run: () => void, setup: () => void, opts: Opts) {
    for (let i = 0; i < opts.warmup; i++) { setup(); run(); }
    const times: number[] = [];
    for (let i = 0; i < opts.samples; i++) {
        setup();
        gc(); // collect before timing so GC doesn't fire inside the region
        const t = performance.now();
        run();
        times.push(performance.now() - t);
    }
    report(name, times);
}

// ---------------------------------------------------------------------------
// Stress test 1 — create / subscribe / set / flush pipeline
//
// The phases are dependent, so we run the whole pipeline K times and keep the
// per-phase min across runs. gc() between runs frees the previous batch so it
// doesn't add heap pressure to the next.
// ---------------------------------------------------------------------------
async function runPipelineOnce() {
    const signals = new Array<NativeSignal<number>>(numSignals); // preallocate
    let inc = 0;
    const subber = (_: unknown, _value: number) => { inc++; };

    gc();
    let t = performance.now();
    for (let i = 0; i < numSignals; i++) signals[i] = new NativeSignal(i);
    const create = performance.now() - t;

    gc();
    t = performance.now();
    for (let i = 0; i < numSignals; i++)
        for (let j = 0; j < numSubscribersPerSignal; j++) signals[i].subscribe(subber);
    const subscribe = performance.now() - t;

    gc();
    t = performance.now();
    for (let i = 0; i < numSignals; i++) signals[i].set(123);
    const set = performance.now() - t;

    t = performance.now();
    await wait(0);
    const flush = performance.now() - t;

    sink(inc); // prevent the empty subscriber loop from being optimized away
    return { create, subscribe, set, flush };
}

async function stressTest() {
    const phases = ['create', 'subscribe', 'set', 'flush'] as const;
    const samples: Record<typeof phases[number], number[]> =
        { create: [], subscribe: [], set: [], flush: [] };

    for (let i = 0; i < HEAVY.warmup; i++) { await runPipelineOnce(); gc(); }
    for (let i = 0; i < HEAVY.samples; i++) {
        const r = await runPipelineOnce();
        for (const p of phases) samples[p].push(r[p]);
        gc();
    }

    report('create signals', samples.create);
    report(`subscribe x${numSubscribersPerSignal}`, samples.subscribe);
    report('set values', samples.set);
    report('flush subscriptions', samples.flush);
}

// ---------------------------------------------------------------------------
// Stress test 2 — computed dependency
// ---------------------------------------------------------------------------
function stressTest2() {
    const signal1 = new NativeSignal(1);
    const signal2 = new NativeSignal(2);
    const computed1 = new Computed(() => signal1.get() + signal2.get());

    bench(
        'set (lazy computed, no read)',
        () => { for (let i = 0; i < numSignals; i++) signal1.set(i); },
        () => {},
        LIGHT,
    );

    bench(
        'set + computed.get()',
        () => {
            let last = 0;
            for (let i = 0; i < numSignals; i++) { signal1.set(i); last = computed1.get(); }
            sink(last); // prevent the get() from being elided
        },
        () => {},
        LIGHT,
    );
}

// ---------------------------------------------------------------------------
async function tests() {
    await stressTest();
    stressTest2();
    if (SINK === Symbol.for('never')) console.log(SINK); // keep SINK observably live
}
tests();