// Shared test utilities. Extracted so individual test files stay focused on
// scenarios rather than ceremony.

import type { StatefulSubscribable } from "../Core/index.js";
import type { SignalSet, SignalMap } from "src/Collections/index.js";

/**
 * Items that have been finalized (i.e. garbage collected) since the last reset.
 * Tests push tags onto this via the shared `finalizer` (see below) and inspect
 * its length to verify GC behavior.
 */
export const finalized: any[] = [];

/**
 * Process-wide FinalizationRegistry. Tests use `finalizer.register(obj, tag)` to
 * mark `obj` as something whose collection they want to observe. When `obj` gets
 * GC'd, `tag` lands in the `finalized` array.
 */
export const finalizer = new FinalizationRegistry((tag) =>
{
    finalized.push(tag);
});

/** Reset the GC observation buffer. Call between tests. */
export function reset_finalized()
{
    finalized.length = 0;
}

/** Sleep for `ms` milliseconds. */
export function wait(ms: number)
{
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Assert that every signal in `signals` reports the same value as the first one.
 * Throws on mismatch with a clear "at index N" message.
 */
export function assert_same(...signals: StatefulSubscribable<any>[])
{
    assert_value(signals[0].get(), ...signals);
}

/**
 * Assert every signal in `signals` reports `value`. Throws with a clear
 * "at index N" message on mismatch.
 */
export function assert_value<T>(value: T, ...signals: StatefulSubscribable<T>[])
{
    for (let i = 0; i < signals.length; i++)
    {
        const got = signals[i].get();
        if (got !== value)
        {
            throw new Error(`Value mismatch at signal[${i}]: expected ${value}, got ${got}`);
        }
    }
}

/**
 * Assert that a SignalSet or SignalMap currently holds exactly `size` items.
 */
export function assert_size(size: number, set: SignalSet<any> | SignalMap<any, any>)
{
    if (set.get().size !== size)
        throw new Error(`Size mismatch: expected ${size}, got ${set.get().size}`);
}

/**
 * Wait (and trigger GC) until `count` items have been collected, or up to ~5s.
 * Uses node's `--expose-gc` global; throws if the count is exceeded or the
 * timeout is hit.
 */
export async function assert_gc_count(count: number)
{
    for (let i = 0; i < 500; i++)
    {
        gc();
        await wait(10);

        if (finalized.length === count)
            return;

        if (finalized.length > count)
        {
            throw new Error(`Too many GC'ed objects: expected ${count}, got ${finalized.length}`);
        }
    }

    throw new Error(`GC timeout: did not reach the required GC count after 5s. Expected ${count}, got ${finalized.length}.`);
}

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
export const tests: Test[] = [];

/**
 * Register a test. The recommended pattern is one call per scenario, with a
 * sentence-style `name` describing what the test asserts.
 */
export function register_test(name: string, fn: () => any | Promise<any>)
{
    tests.push({ name, fn });
}

/**
 * Run every registered test in order. Between tests we force a few rounds of GC
 * with short sleeps to give finalizers time to fire and reset the observation
 * buffer. Failures bubble up immediately and abort the run.
 */
export async function run_all_tests()
{
    let passed = 0;
    let failed = 0;

    for (let i = 0; i < tests.length; i++)
    {
        const test = tests[i];
        const label = `[${i + 1}/${tests.length}] ${test.name}`;

        try
        {
            await test.fn();
            console.log(`PASS  ${label}`);
            passed++;
        }
        catch (err)
        {
            console.error(`FAIL  ${label}`);
            console.error(err);
            failed++;
        }

        // Inter-test cleanup: force GC, give finalizers a chance to fire, reset state.
        gc();
        await wait(100);
        gc();
        await wait(100);
        gc();
        reset_finalized();
    }

    console.log(`\n${passed}/${tests.length} passed, ${failed} failed.`);

    if (failed > 0)
        process.exit(1);
}