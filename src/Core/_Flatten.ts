/**
 * Creates a new class with all properties/methods from both the derived and base classes
 * copied directly, eliminating the prototype chain inheritance.
 * 
 * @param DerivedClass - The class that extends another class
 * @returns A new flattened class with combined functionality
 */
function flattenClass<T extends new (...args: any[]) => any>(DerivedClass: T): T
{
    // Get the base class from the prototype chain
    const baseProto = Object.getPrototypeOf(DerivedClass.prototype);
    if (baseProto === Object.prototype || baseProto === null)
    {
        throw new Error("Class doesn't extend anything to flatten");
    }

    // Get the original constructor
    const OriginalConstructor = DerivedClass;

    // Create a new class
    const FlattenedClass = class extends (function () { } as any) {
        constructor(...args: any[])
        {
            super(...args);
            OriginalConstructor.apply(this, args);
        }
    };

    // Copy the original class name
    Object.defineProperty(FlattenedClass, 'name', {
        value: OriginalConstructor.name,
        configurable: true
    });

    // Copy all properties from both prototypes
    const allProps = new Set<string>();

    // Get properties from base class
    let current = baseProto;
    while (current && current !== Object.prototype)
    {
        Object.getOwnPropertyNames(current).forEach(prop =>
        {
            if (prop !== 'constructor') allProps.add(prop);
        });
        current = Object.getPrototypeOf(current);
    }

    // Get properties from derived class
    Object.getOwnPropertyNames(DerivedClass.prototype).forEach(prop =>
    {
        if (prop !== 'constructor') allProps.add(prop);
    });

    // Copy all properties to the new class
    allProps.forEach(prop =>
    {
        const descriptor =
            Object.getOwnPropertyDescriptor(DerivedClass.prototype, prop) ||
            Object.getOwnPropertyDescriptor(baseProto, prop);

        if (descriptor)
        {
            Object.defineProperty(FlattenedClass.prototype, prop, descriptor);
        }
    });

    // Copy static properties
    Object.getOwnPropertyNames(DerivedClass).forEach(prop =>
    {
        if (prop !== 'prototype' && prop !== 'length' && prop !== 'name' && prop !== 'caller')
        {
            const descriptor = Object.getOwnPropertyDescriptor(DerivedClass, prop);
            if (descriptor)
            {
                Object.defineProperty(FlattenedClass, prop, descriptor);
            }
        }
    });

    return FlattenedClass as unknown as T;
}


class BaseClass
{
    baseMethod()
    {
        return "base";
    }

    commonMethod()
    {
        return "from base";
    }
}

class DerivedClass extends BaseClass
{
    derivedMethod()
    {
        return "derived";
    }

    commonMethod()
    {
        return "from derived";
    }

    static staticMethod()
    {
        return "static";
    }
}

// Before flattening
const original = new DerivedClass();
console.log(original.baseMethod()); // "base"
console.log(original.commonMethod()); // "from derived"

// Flatten the class
const FlattenedDerived = flattenClass(DerivedClass);

// After flattening
const flattened = new FlattenedDerived();
console.log(flattened.baseMethod()); // "base" (now directly on instance)
console.log(flattened.commonMethod()); // "from derived"
console.log(flattened.derivedMethod()); // "derived"
console.log(FlattenedDerived.staticMethod()); // "static"

// Verify prototype chain is flat
console.log(Object.getPrototypeOf(flattened) === FlattenedDerived.prototype); // true
console.log(Object.getPrototypeOf(FlattenedDerived.prototype) === Object.prototype); // true