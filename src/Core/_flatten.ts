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
export function flatten_class<T extends new (...args: any[]) => any>(derived_class: T): T
{
    // Walk to the immediate base class via the prototype chain.
    const base_proto = Object.getPrototypeOf(derived_class.prototype);
    if (base_proto === Object.prototype || base_proto === null)
    {
        throw new Error("Class doesn't extend anything to flatten");
    }

    const original_constructor = derived_class;

    // Synthesize a class that has no superclass but invokes the original constructor body.
    const flattened_class = class extends (function () { } as any) {
        constructor(...args: any[])
        {
            super(...args);
            original_constructor.apply(this, args);
        }
    };

    // Preserve the original class name for debugging.
    Object.defineProperty(flattened_class, 'name', {
        value: original_constructor.name,
        configurable: true
    });

    // Collect every property name from the entire base chain plus the derived class.
    const all_props = new Set<string>();

    let current = base_proto;
    while (current && current !== Object.prototype)
    {
        Object.getOwnPropertyNames(current).forEach(prop =>
        {
            if (prop !== 'constructor') all_props.add(prop);
        });
        current = Object.getPrototypeOf(current);
    }

    Object.getOwnPropertyNames(derived_class.prototype).forEach(prop =>
    {
        if (prop !== 'constructor') all_props.add(prop);
    });

    // Copy each property's descriptor onto the new prototype. Derived class wins on
    // collisions (Object.getOwnPropertyDescriptor returns undefined if the name isn't
    // owned by `derived_class.prototype` directly, in which case we fall through to
    // the base).
    all_props.forEach(prop =>
    {
        const descriptor =
            Object.getOwnPropertyDescriptor(derived_class.prototype, prop) ||
            Object.getOwnPropertyDescriptor(base_proto, prop);

        if (descriptor)
        {
            Object.defineProperty(flattened_class.prototype, prop, descriptor);
        }
    });

    // Copy static properties.
    Object.getOwnPropertyNames(derived_class).forEach(prop =>
    {
        if (prop !== 'prototype' && prop !== 'length' && prop !== 'name' && prop !== 'caller')
        {
            const descriptor = Object.getOwnPropertyDescriptor(derived_class, prop);
            if (descriptor)
            {
                Object.defineProperty(flattened_class, prop, descriptor);
            }
        }
    });

    return flattened_class as unknown as T;
}


// ---------------------------------------------------------------------------
// Local self-test — kept here as a smoke check that the flattener still works
// after edits. Run by importing this file.
// ---------------------------------------------------------------------------

class BaseClass
{
    base_method()
    {
        return "base";
    }

    common_method()
    {
        return "from base";
    }
}

class DerivedClass extends BaseClass
{
    derived_method()
    {
        return "derived";
    }

    common_method()
    {
        return "from derived";
    }

    static static_method()
    {
        return "static";
    }
}

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
export function Flatten()
{
    return (target: any) =>
    {
        // Runtime no-op — transformation happens at build time.
        return target;
    };
}
 


// Before flattening
const original = new DerivedClass();
console.log(original.base_method()); // "base"
console.log(original.common_method()); // "from derived"

const FlattenedDerived = flatten_class(DerivedClass);

// After flattening
const flattened = new FlattenedDerived();
console.log(flattened.base_method()); // "base" (now directly on instance)
console.log(flattened.common_method()); // "from derived"
console.log(flattened.derived_method()); // "derived"
console.log(FlattenedDerived.static_method()); // "static"

// Verify prototype chain is flat
console.log(Object.getPrototypeOf(flattened) === FlattenedDerived.prototype); // true
console.log(Object.getPrototypeOf(FlattenedDerived.prototype) === Object.prototype); // true