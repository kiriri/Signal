import type { StatefulSubscribable } from "src/Core/index.js";
import type { SignalSet, SignalMap } from "src/Collections/index.js";
/**
 * Items that have been finalized (i.e. garbage collected) since the last reset.
 * Tests push tags onto this via the shared `finalizer` (see below) and inspect
 * its length to verify GC behavior.
 */
export declare const finalized: any[];
/**
 * Process-wide FinalizationRegistry. Tests use `finalizer.register(obj, tag)` to
 * mark `obj` as something whose collection they want to observe. When `obj` gets
 * GC'd, `tag` lands in the `finalized` array.
 */
export declare const finalizer: FinalizationRegistry<unknown>;
/** Reset the GC observation buffer. Call between tests. */
export declare function reset_finalized(): void;
/** Sleep for `ms` milliseconds. */
export declare function wait(ms: number): Promise<void>;
/**
 * Assert that every signal in `signals` reports the same value as the first one.
 * Throws on mismatch with a clear "at index N" message.
 */
export declare function assert_same(...signals: StatefulSubscribable<any>[]): void;
/**
 * Assert every signal in `signals` reports `value`. Throws with a clear
 * "at index N" message on mismatch.
 */
export declare function assert_value<T>(value: T, ...signals: StatefulSubscribable<T>[]): void;
/**
 * Assert that a SignalSet or SignalMap currently holds exactly `size` items.
 */
export declare function assert_size(size: number, set: SignalSet<any> | SignalMap<any, any>): void;
/**
 * Wait (and trigger GC) until `count` items have been collected, or up to ~5s.
 * Uses node's `--expose-gc` global; throws if the count is exceeded or the
 * timeout is hit.
 */
export declare function assert_gc_count(count: number): Promise<void>;
/**
 * A test as registered by `register_test`. Holds its descriptive name and the
 * async body that runs it.
 */
export type Test = {
    name: string;
    fn: () => any | Promise<any>;
};
/**
 * Mutable list of tests assembled at module-load time across every test file
 * that imports this module. The runner walks it sequentially.
 */
export declare const tests: Test[];
/**
 * Register a test. The recommended pattern is one call per scenario, with a
 * sentence-style `name` describing what the test asserts.
 */
export declare function register_test(name: string, fn: () => any | Promise<any>): void;
/**
 * Run every registered test in order. Between tests we force a few rounds of GC
 * with short sleeps to give finalizers time to fire and reset the observation
 * buffer. Failures bubble up immediately and abort the run.
 */
export declare function run_all_tests(): Promise<void>;
