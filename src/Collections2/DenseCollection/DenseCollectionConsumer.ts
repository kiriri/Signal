import { DenseCollectionEntry, DenseCollection, DenseCollectionEntryRef } from "./DenseCollection";



export class DenseCollectionConsumer<T, O, ITERATOR extends Iterable<DenseCollectionEntry<T>> = Iterable<DenseCollectionEntry<T>>>
{
    source: DenseCollection<T, ITERATOR>;

    // Linked list of any unprocessed dirty entries in the source.
    // This ref contains the old value, and a fast way to retrieve the newest value.
    dirty?: DenseCollectionEntryRef<T>;

    _value: O; // To map, this would be another MapCollection. But it can also be just a number if we're summing, etc.



    // TODO : 1:1 mapping will have optimizations over a generic reducer !
    // Eg polling can happen on a per-entry basis.
    reducer: (ref: DenseCollectionEntryRef<T>, current: O) => O;

    constructor(
        value: O,
        reducer: (ref: DenseCollectionEntryRef<T>, current: O) => O,
        source: DenseCollection<T, ITERATOR>
    )
    {
        this._value = value;
        this.reducer = reducer;
        this.source = source;

        source.consumers;
    }

    get()
    {
        if (this.dirty)
            this.poll();

        return this._value;
    }

    poll()
    {

        let dirty = this.dirty;
        // Clear the dirty list now so side effects can add new ones.
        this.dirty = undefined;
        while (dirty)
        {
            let next = dirty.next;

            this._value = this.reducer(dirty, this._value);

            // Move the dirty entry back to the source collections so it can receive the next changes.
            let existing_subscribers = dirty.ref.subscribers;
            dirty.ref.subscribers = dirty;
            dirty.next = existing_subscribers;

            // Proceed to the next dirty entry in this loop
            dirty = next;
        }

    }
}
