import { Subscribable } from "../Core/Subscribable";
/**
 * An effect may reference any number of subscribables in its function, but it will only run whenever one of its sources changes.
 */
export class Effect {
    sources;
    fn;
    _source_cache = {};
    _updaters = {};
    // Dirty in this case just means that it has registered the deferred emit function.
    _dirty = false;
    _initialized = false;
    /**
     * Creates a new Computed signal with a function that computes its value.
     * @param fn - The function that computes the value of the computed signal.
     */
    constructor(sources, 
    // The function that is called to compute the current value of this Subscribable.
    fn) {
        this.sources = sources;
        this.fn = fn;
        for (let key in sources) {
            let update_key_function = (signal, value) => {
                this._source_cache[key] = value;
                if (this._dirty)
                    return;
                this._dirty = true;
                Subscribable.register_async_emit(() => {
                    this._dirty = false;
                    if (!this._initialized)
                        this.initialize();
                    this.fn(this._source_cache);
                });
            };
            this._updaters[key] = update_key_function;
            sources[key].subscribe(update_key_function);
        }
    }
    initialize() {
        const sources = this.sources;
        for (let key in sources) {
            // Not all subscribables have a value at all times.
            this._source_cache[key] = sources[key]["get"]?.() ?? null;
        }
        this._initialized = true;
    }
    /**
     * Instantly removes all event listener references.
     * Call this to make sure an Effect for sure no longer
     * triggers. Without this the garbage collection may
     * take seconds before it cleans up orphaned effects,
     * during which time they will still trigger!
     */
    destroy() {
        for (let key in this.sources) {
            const source = this.sources[key];
            source.unsubscribe(this._updaters[key]);
        }
    }
}
//# sourceMappingURL=Effect.js.map