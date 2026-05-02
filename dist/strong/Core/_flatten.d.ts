/**
 * Builds a "flat" copy of a class — one whose prototype chain has been collapsed so all
 * methods/properties live directly on the new class's prototype rather than walking up
 * through inheritance.
 *
 * **Why.** V8 optimizes property lookup based on the shape of the prototype chain. A
 * class extending another class is meaningfully slower to construct than a class with
 * no superclass (~5x in our benchmarks for `NativeSignal extends Subscribable`). For
 * hot-path code that creates many instances, that's a lot.
 *
 * **What it does.** Walks both the derived class's prototype and its base prototype(s),
 * copies every method/property descriptor onto a fresh class with no superclass, then
 * forwards the constructor.
 *
 * **Caveats.** Since the result has no prototype chain, `instanceof BaseClass` checks
 * on the original base will fail. Static properties are also copied. Don't combine
 * with classes that rely on `super.method()` calls — that will break, because there is
 * no `super` to delegate to once the chain is gone.
 *
 * The bottom of this file contains a small self-test that runs at module load — it's
 * intentional, kept for quick local sanity checking.
 *
 * @param derived_class The class to flatten.
 * @returns A new class equivalent to `derived_class` but with no prototype chain.
 */
export declare function flatten_class<T extends new (...args: any[]) => any>(derived_class: T): T;
/**
 * Build-time hint marker. Tags a class for prototype-chain flattening by the rollup
 * plugin (`rollup.plugin.flatten-classes.ts`).
 *
 * Runtime behavior is a no-op: this just attaches a marker the build pipeline can
 * detect. The actual flattening happens during the bundling step, where the
 * `_flatten.ts` machinery (or its compile-time equivalent) rewrites the class to
 * eliminate prototype-chain inheritance — see the perf rationale documented there.
 *
 * Apply this only to classes whose construction is on a hot path. It only has any
 * effect under the production build; in `tsx`/dev runs it does nothing.
 */
export declare function Flatten(): (target: any) => any;
