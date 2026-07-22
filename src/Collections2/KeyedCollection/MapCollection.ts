import { EMPTY } from "../Collection2.js";
import { KeyedCollection, KeyedCollectionEntry } from "./KeyedCollection.js";

export class MapCollection<K, T> extends KeyedCollection<K, T, Map<K, KeyedCollectionEntry<K, T>>>
{
    value = new Map<K, KeyedCollectionEntry<K, T>>();

    constructor(init?: Map<K, T> | Iterable<readonly [K, T]>)
    {
        super();

        if (init)
            for (const [k, v] of init)
                this.set(k, v);
    }

    entry(key: K)
    {
        return this.value.get(key);
    }

    entries()
    {
        return this.value.values();
    }

    protected create_entry(key: K, value: T | typeof EMPTY)
    {
        const entry = new KeyedCollectionEntry(this, key, value, undefined);
        this.value.set(key, entry);
        this.entry_added(entry);
        return entry;
    }

    set(key: K, value: T)
    {
        const entry = this.value.get(key);
        if (entry === undefined)
            this.create_entry(key, value);
        else
            entry.set(value);
    }

    delete(key: K)
    {
        const entry = this.value.get(key);
        if (entry === undefined)
            return false;

        // A ref'd entry keeps its placeholder in storage (EMPTY) so the signal
        // survives; otherwise drop it entirely.
        if (entry.signal === undefined)
            this.value.delete(key);

        // Marks all consumer refs dirty with value EMPTY (reducers see a removal),
        // after which poll() drops the refs so entry and refs can be GCed.
        entry.set(EMPTY);
        return true;
    }
}
