/**
 * Creates a new class with all properties/methods from both the derived and base classes
 * copied directly, eliminating the prototype chain inheritance.
 *
 * @param DerivedClass - The class that extends another class
 * @returns A new flattened class with combined functionality
 */
declare function flattenClass<T extends new (...args: any[]) => any>(DerivedClass: T): T;
declare class BaseClass {
    baseMethod(): string;
    commonMethod(): string;
}
declare class DerivedClass extends BaseClass {
    derivedMethod(): string;
    commonMethod(): string;
    static staticMethod(): string;
}
declare const original: DerivedClass;
declare const FlattenedDerived: typeof DerivedClass;
declare const flattened: DerivedClass;
