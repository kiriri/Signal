import { DenseCollection } from "./DenseCollection.js";

/**
 * The concrete, user-facing dense collection: a flat-array-backed `DenseCollection`.
 *
 * All the reactive machinery (push/pop/set/get/ref/consumers) lives on the base; this
 * subclass only adds a bulk-load constructor. Kept as its own class (rather than folding
 * it into the base) to mirror the KeyedCollection / MapCollection split and to leave room
 * for alternative dense backings (e.g. a TypedArray-specialized numeric variant) later.
 */
export class ArrayCollection<T> extends DenseCollection<T>
{
    constructor(init?: ArrayLike<T> | Iterable<T>)
    {
        super();

        if (init === undefined)
            return;

        // Load straight into the backing store: there are no consumers or signals yet at
        // construction, so the per-element broadcast that `push` does is pure waste.
        const values = this.values;
        if (typeof (init as ArrayLike<T>).length === "number" && typeof (init as Iterable<T>)[Symbol.iterator] !== "function")
        {
            const arr = init as ArrayLike<T>;
            for (let i = 0; i < arr.length; i++)
                values.push(arr[i]);
        }
        else
        {
            for (const v of init as Iterable<T>)
                values.push(v);
        }
        this._length = values.length;
    }
}
