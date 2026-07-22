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

    set(key: K, value: T)
    {
        const entry = this.value[key];
        if (entry === undefined)
        {
            const new_entry = new KeyedCollectionEntry(this, key, value, undefined);
            this.value[key] = new_entry;
            this.entry_added(new_entry);
        }
        else
            entry.set(value);
    }

    delete(key: K)
    {
        const entry = this.value[key];
        if (entry === undefined)
            return false;

        delete this.value[key];
        // Marks all consumer refs dirty with value EMPTY (reducers see a removal),
        // after which poll() drops the refs so entry and refs can be GCed.
        entry.set(EMPTY);
        return true;
    }
}
