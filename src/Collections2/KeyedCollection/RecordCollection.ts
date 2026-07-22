import { EMPTY } from "../Collection2.js";
import { KeyedCollection, KeyedCollectionEntry } from "./KeyedCollection.js";

export class RecordCollection<K extends string, T> extends KeyedCollection<K, T, Record<K, KeyedCollectionEntry<K, T>>>
{
    value = {} as Record<K, KeyedCollectionEntry<K, T>>;

    constructor(init?: Record<K, T>)
    {
        super();

        if (init)
            for (const k in init)
                this.set(k, init[k]);
    }

    entry(key: K)
    {
        return this.value[key];
    }

    entries()
    {
        return Object.values<KeyedCollectionEntry<K, T>>(this.value);
    }

    protected create_entry(key: K, value: T | typeof EMPTY)
    {
        const entry = new KeyedCollectionEntry(this, key, value, undefined);
        this.value[key] = entry;
        this.entry_added(entry);
        return entry;
    }

    set(key: K, value: T)
    {
        const entry = this.value[key];
        if (entry === undefined)
            this.create_entry(key, value);
        else
            entry.set(value);
    }

    delete(key: K)
    {
        const entry = this.value[key];
        if (entry === undefined)
            return false;

        // A ref'd entry keeps its placeholder in storage (EMPTY) so the signal
        // survives; otherwise drop it entirely.
        if (entry.signal === undefined)
            delete this.value[key];

        // Marks all consumer refs dirty with value EMPTY (reducers see a removal),
        // after which poll() drops the refs so entry and refs can be GCed.
        entry.set(EMPTY);
        return true;
    }
}
