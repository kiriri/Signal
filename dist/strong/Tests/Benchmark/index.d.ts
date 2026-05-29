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
