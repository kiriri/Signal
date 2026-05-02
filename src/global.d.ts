// Compile time variables:
declare const $USE_WEAK_REFS$: boolean;
declare type WEAK_REF<T> = USE_WEAK_REFS extends true ? WeakRef<T> : T; 