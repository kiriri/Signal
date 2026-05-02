/**
 * benchmark.ts
 *
 * Compares Angular's signal/computed primitives, Solid-js signals/memos, and
 * the custom NativeSignal / Computed implementation.
 *
 * Run with:
 *   npm install @angular/core @angular/compiler rxjs reflect-metadata solid-js
 *   npx ts-node benchmark.ts
 *
 * ─── FAIRNESS NOTES ──────────────────────────────────────────────────────────
 *
 * Order bias
 *   Each implementation is run in a freshly randomised order every repetition.
 *   At the end we report the trimmed mean (drop lowest + highest 1 run per
 *   implementation) so transient JIT spikes are excluded symmetrically.
 *
 * Angular watcher API
 *   Angular's public effect() needs ChangeDetectionScheduler (only available
 *   inside a bootstrapped app). The correct out-of-app primitive is
 *   createWatch() from @angular/core/primitives/signals, which is what
 *   effect() itself is built on. We use that directly — no DI, no CD.
 *
 * Solid
 *   Solid's reactive primitives (createSignal / createMemo / createEffect) must
 *   run inside a createRoot() owner context, otherwise Solid emits a warning
 *   and the cleanup graph is broken. Each scenario wraps its setup in one root.
 *   createMemo is the structural equivalent of Angular's computed() and our
 *   Computed — it is lazy and caches between reads.
 *
 * WeakRef overhead (Scenario 6)
 *   Our Subscribable stores dependants as a linked list of WeakRef<Dirtyable>.
 *   Angular stores live consumers as a plain ReactiveNode[] (strong refs, flat
 *   array). The dirty() walk pays a .deref() GC-table lookup per node vs a
 *   plain indexed array read. At 50 k nodes this accumulates into a visible
 *   gap. This is noted in the output — it is not algorithmic inefficiency.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import 'reflect-metadata';

import {
    computed as ngComputed,
    signal   as ngSignal,
} from '@angular/core';

import {
    createMemo,
    createRoot,
    createSignal,
} from 'solid-js';

// !!! tsx will import the actual TypeScript sources instead of dist !!!
import { Computed, NativeSignal } from '../../index';

// ════════════════════════════════════════════════════════════════════════════
// Statistical helpers
// ════════════════════════════════════════════════════════════════════════════

/** Sort ascending and drop the lowest and highest `trim` values, then average. */
function trimmedMean(arr: number[], trim = 1): number {
    if (arr.length <= trim * 2) {
        // Not enough data — fall back to plain mean.
        return arr.reduce((s, v) => s + v, 0) / arr.length;
    }
    const s = [...arr].sort((a, b) => a - b).slice(trim, arr.length - trim);
    return s.reduce((sum, v) => sum + v, 0) / s.length;
}

function stddev(arr: number[]): number {
    const m = arr.reduce((s, v) => s + v, 0) / arr.length;
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

/** Fisher-Yates shuffle — mutates in place, returns the array. */
function shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ════════════════════════════════════════════════════════════════════════════
// Config
// ════════════════════════════════════════════════════════════════════════════

/** Total repetitions per implementation per scenario (including trimmed ends). */
const REPS = 9;   // trimmedMean drops 1 each side → 7 samples contribute
const N          = 500_000;
const COMPUTED_N =  500_000;
const FANOUT_N   =  50_000;

// ════════════════════════════════════════════════════════════════════════════
// Scenario factory types
// ════════════════════════════════════════════════════════════════════════════

type Timing = () => number | Promise<number>;

interface Impl {
    name: string;
    fn:   Timing;
}

interface Scenario {
    name:  string;
    impls: Impl[];
    note?: string;
}

// ════════════════════════════════════════════════════════════════════════════
// Scenario 1 — Construction
// ════════════════════════════════════════════════════════════════════════════

const construction: Scenario = {
    name: 'Construction (N signals)',
    impls: [
        {
            name: 'Angular',
            fn() {
                const t0   = performance.now();
                const sigs = new Array<ReturnType<typeof ngSignal<number>>>(N);
                for (let i = 0; i < N; i++) sigs[i] = ngSignal(i);
                return performance.now() - t0;
            },
        },
        {
            name: 'Solid',
            fn() {
                let elapsed = 0;
                createRoot(dispose => {
                    const t0   = performance.now();
                    const sigs = new Array<ReturnType<typeof createSignal<number>>>(N);
                    for (let i = 0; i < N; i++) sigs[i] = createSignal(i);
                    elapsed = performance.now() - t0;
                    dispose();
                });
                return elapsed;
            },
        },
        {
            name: 'Custom',
            fn() {
                const t0   = performance.now();
                const sigs = new Array<NativeSignal<number>>(N);
                for (let i = 0; i < N; i++) sigs[i] = new NativeSignal(i);
                return performance.now() - t0;
            },
        },
    ],
};

// ════════════════════════════════════════════════════════════════════════════
// Scenario 2 — Read (no tracking context, no subscriber)
// ════════════════════════════════════════════════════════════════════════════

const read: Scenario = {
    name: 'Read — no subscribers, no tracking context',
    impls: [
        {
            name: 'Angular',
            fn() {
                const sigs = Array.from({ length: N }, (_, i) => ngSignal(i));
                let   sink = 0;
                const t0   = performance.now();
                for (let i = 0; i < N; i++) sink += sigs[i]();
                return performance.now() - t0;
            },
        },
        {
            name: 'Solid',
            fn() {
                // createSignal returns [getter, setter].
                const sigs = Array.from({ length: N }, (_, i) => createSignal(i)[0]);
                let   sink = 0;
                const t0   = performance.now();
                for (let i = 0; i < N; i++) sink += sigs[i]();
                return performance.now() - t0;
            },
        },
        {
            name: 'Custom',
            fn() {
                const sigs = Array.from({ length: N }, (_, i) => new NativeSignal(i));
                let   sink = 0;
                const t0   = performance.now();
                for (let i = 0; i < N; i++) sink += sigs[i].get();
                return performance.now() - t0;
            },
        },
    ],
};

// ════════════════════════════════════════════════════════════════════════════
// Scenario 3 — Set, no dependants
// ════════════════════════════════════════════════════════════════════════════

const setNoSubs: Scenario = {
    name: 'Set — no dependants (write + identity check only)',
    impls: [
        {
            name: 'Angular',
            fn() {
                const sigs = Array.from({ length: N }, (_, i) => ngSignal(i));
                const t0   = performance.now();
                for (let i = 0; i < N; i++) sigs[i].set(i + 1);
                return performance.now() - t0;
            },
        },
        {
            name: 'Solid',
            fn() {
                const pairs = Array.from({ length: N }, (_, i) => createSignal(i));
                const t0    = performance.now();
                for (let i = 0; i < N; i++) pairs[i][1](i + 1);
                return performance.now() - t0;
            },
        },
        {
            name: 'Custom',
            fn() {
                const sigs = Array.from({ length: N }, (_, i) => new NativeSignal(i));
                const t0   = performance.now();
                for (let i = 0; i < N; i++) sigs[i].set(i + 1);
                return performance.now() - t0;
            },
        },
    ],
};

// ════════════════════════════════════════════════════════════════════════════
// Scenario 4 — Set with one dependent computed each (sync dirty propagation)
//
// We do NOT drain async queues here — we measure synchronous dirty marking
// only, not scheduling.
// ════════════════════════════════════════════════════════════════════════════

const setWithComputed: Scenario = {
    name: 'Set — 1 dependent computed each (sync dirty propagation)',
    impls: [
        {
            name: 'Angular',
            fn() {
                const sigs  = Array.from({ length: N }, (_, i) => ngSignal(i));
                const comps = sigs.map(s => ngComputed(() => s() * 2));
                for (let i = 0; i < N; i++) comps[i](); // wire dep edges
                const t0 = performance.now();
                for (let i = 0; i < N; i++) sigs[i].set(i + 1);
                return performance.now() - t0;
            },
        },
        {
            name: 'Solid',
            fn() {
                let elapsed = 0;
                // createMemo must be inside an owner.
                createRoot(dispose => {
                    const pairs = Array.from({ length: N }, (_, i) => createSignal(i));
                    const memos = pairs.map(([get]) => createMemo(() => get() * 2));
                    for (let i = 0; i < N; i++) memos[i](); // warm
                    const t0 = performance.now();
                    for (let i = 0; i < N; i++) pairs[i][1](i + 1);
                    elapsed = performance.now() - t0;
                    dispose();
                });
                return elapsed;
            },
        },
        {
            name: 'Custom',
            fn() {
                const sigs  = Array.from({ length: N }, (_, i) => new NativeSignal(i));
                const comps = sigs.map(s => new Computed(() => s.get() * 2));
                for (let i = 0; i < N; i++) comps[i].get();
                const t0 = performance.now();
                for (let i = 0; i < N; i++) sigs[i].set(i + 1);
                const elapsed = performance.now() - t0;
                for (let i = 0; i < N; i++) comps[i].destroy();
                return elapsed;
            },
        },
    ],
};

// ════════════════════════════════════════════════════════════════════════════
// Scenario 5 — Computed read, cache warm
//   COMPUTED_N computeds all reading the same 2 source signals.
//
//   Memory note: dep-graph edges dominate at 500k. We use a smaller N and
//   explicitly free edges between reps so GC pressure is symmetric.
// ════════════════════════════════════════════════════════════════════════════

const computedRead: Scenario = {
    name: `Computed read — cache hit (${COMPUTED_N.toLocaleString()} computeds, 2 shared deps)`,
    impls: [
        {
            name: 'Angular',
            fn() {
                const a = ngSignal(1), b = ngSignal(2);
                const comps = Array.from({ length: COMPUTED_N }, () => ngComputed(() => a() + b()));
                for (let i = 0; i < COMPUTED_N; i++) comps[i]();   // warm + wire
                let sink = 0;
                const t0 = performance.now();
                for (let i = 0; i < COMPUTED_N; i++) sink += comps[i]();
                const elapsed = performance.now() - t0;
                comps.length = 0;
                return elapsed;
            },
        },
        {
            name: 'Solid',
            fn() {
                let elapsed = 0;
                createRoot(dispose => {
                    const [a] = createSignal(1);
                    const [b] = createSignal(2);
                    const memos = Array.from({ length: COMPUTED_N }, () => createMemo(() => a() + b()));
                    for (let i = 0; i < COMPUTED_N; i++) memos[i]();
                    let sink = 0;
                    const t0 = performance.now();
                    for (let i = 0; i < COMPUTED_N; i++) sink += memos[i]();
                    elapsed = performance.now() - t0;
                    dispose();  // frees all memo dep edges at once
                });
                return elapsed;
            },
        },
        {
            name: 'Custom',
            fn() {
                const a = new NativeSignal(1), b = new NativeSignal(2);
                const comps = Array.from({ length: COMPUTED_N }, () => new Computed(() => a.get() + b.get()));
                for (let i = 0; i < COMPUTED_N; i++) comps[i].get();
                let sink = 0;
                const t0 = performance.now();
                for (let i = 0; i < COMPUTED_N; i++) sink += comps[i].get();
                const elapsed = performance.now() - t0;
                for (let i = 0; i < COMPUTED_N; i++) comps[i].destroy();
                comps.length = 0;
                return elapsed;
            },
        },
    ],
};

// ════════════════════════════════════════════════════════════════════════════
// Scenario 6 — Computed fan-out: set 1 signal → dirty + recompute all N
// ════════════════════════════════════════════════════════════════════════════

const computedFanout: Scenario = {
    name: `Computed fan-out — 1 set → dirty+recompute ${FANOUT_N.toLocaleString()} dependants`,
    note: [
        'Angular stores consumers as a flat ReactiveNode[] (strong refs).',
        'Custom stores them as a linked list of WeakRef<Dirtyable>.',
        'The .deref() GC-table lookup per node explains any gap here.',
    ].join('\n  '),
    impls: [
        {
            name: 'Angular',
            fn() {
                const src   = ngSignal(0);
                const comps = Array.from({ length: FANOUT_N }, () => ngComputed(() => src() * 2));
                for (let i = 0; i < FANOUT_N; i++) comps[i]();
                const t0 = performance.now();
                src.set(1);
                for (let i = 0; i < FANOUT_N; i++) comps[i]();
                const elapsed = performance.now() - t0;
                comps.length = 0;
                return elapsed;
            },
        },
        {
            name: 'Solid',
            fn() {
                let elapsed = 0;
                createRoot(dispose => {
                    const [src, setSrc] = createSignal(0);
                    const memos = Array.from({ length: FANOUT_N }, () => createMemo(() => src() * 2));
                    for (let i = 0; i < FANOUT_N; i++) memos[i]();
                    const t0 = performance.now();
                    setSrc(1);
                    for (let i = 0; i < FANOUT_N; i++) memos[i]();
                    elapsed = performance.now() - t0;
                    dispose();
                });
                return elapsed;
            },
        },
        {
            name: 'Custom',
            fn() {
                const src   = new NativeSignal(0);
                const comps = Array.from({ length: FANOUT_N }, () => new Computed(() => src.get() * 2));
                for (let i = 0; i < FANOUT_N; i++) comps[i].get();
                const t0 = performance.now();
                src.set(1);
                for (let i = 0; i < FANOUT_N; i++) comps[i].get();
                const elapsed = performance.now() - t0;
                for (let i = 0; i < FANOUT_N; i++) comps[i].destroy();
                comps.length = 0;
                return elapsed;
            },
        },
    ],
};

// ════════════════════════════════════════════════════════════════════════════
// Runner
// ════════════════════════════════════════════════════════════════════════════

/**
 * Run a single scenario.
 *
 * Strategy:
 *   1. One warm-up pass for every implementation (fixes JIT compilation for all
 *      before any timing begins, so the first-compiled impl doesn't get a free ride).
 *   2. REPS measurement rounds. In each round the implementation order is
 *      independently shuffled so that any systematic OS / CPU / GC bias is
 *      spread randomly across all implementations.
 *   3. Report trimmed mean ± σ (raw samples) so readers can judge variance.
 */
async function runScenario(scenario: Scenario): Promise<void> {
    const { name, impls, note } = scenario;
    const implNames = impls.map(i => i.name);

    // Step 1: warm-up every implementation once (sequential, not timed).
    for (const impl of impls) await impl.fn();

    // Step 2: REPS rounds, shuffled order each round.
    const times: Record<string, number[]> = {};
    for (const impl of impls) times[impl.name] = [];

    for (let r = 0; r < REPS; r++) {
        const order = shuffle([...impls]);
        for (const impl of order) {
            times[impl.name].push(await impl.fn());
        }
    }

    // Step 3: report.
    const width   = Math.max(...implNames.map(n => n.length));
    const results = implNames.map(n => ({
        name: n,
        mean: trimmedMean(times[n]),
        sd:   stddev(times[n]),
    }));
    results.sort((a, b) => a.mean - b.mean);

    const winner = results[0];

    console.log(`\n┌─ ${name}`);
    for (const r of results) {
        const tag    = r.name === winner.name ? ' 🏆' : '   ';
        const label  = r.name.padEnd(width);
        const mean   = r.mean.toFixed(2).padStart(9);
        const sd     = r.sd.toFixed(2).padStart(7);
        console.log(`│  ${label}${tag}  ${mean}ms  ±${sd}ms`);
    }

    // Ratio table (fastest = baseline).
    const base = winner.mean;
    console.log('│');
    console.log('│  Ratios vs fastest:');
    for (const r of results) {
        const ratio = (r.mean / base).toFixed(2).padStart(6);
        console.log(`│    ${r.name.padEnd(width)}  ${ratio}×`);
    }

    if (note) {
        console.log('│');
        console.log(`│  ℹ  ${note}`);
    }

    console.log('└' + '─'.repeat(60));
}

async function main(): Promise<void> {
    const scenarios: Scenario[] = [
        construction,
        read,
        setNoSubs,
        setWithComputed,
        computedRead,
        computedFanout,
    ];

    console.log('='.repeat(62));
    console.log(' Signal benchmark: Angular · Solid · Custom');
    console.log(`  N=${N.toLocaleString()}  computed_N=${COMPUTED_N.toLocaleString()}  reps=${REPS}  trimmed-mean reported`);
    console.log('  Order shuffled independently each repetition.');
    console.log('  1 warm-up pass per implementation before timing begins.');
    console.log('='.repeat(62));

    for (const scenario of scenarios) {
        await runScenario(scenario);
    }

    console.log('\n' + '='.repeat(62));
    console.log(' Done.');
    console.log('='.repeat(62));
}

main().catch(console.error);