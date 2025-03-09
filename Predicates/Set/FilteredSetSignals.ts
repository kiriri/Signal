import { NativeSignal } from "../../Signal";
import { SignalSet } from "../../SignalSet";
import { StatefulSubscribable, Subscribable } from "../../Subscribable";

export class FilteredSetSignals<INPUT extends StatefulSubscribable<any>> extends SignalSet<INPUT>
{
    readonly uid2 = crypto.randomUUID().replace("-", "");

    constructor(
        public readonly _set: SignalSet<INPUT>,
        public readonly predicate: (v: INPUT extends StatefulSubscribable<infer I> ? I : never) => boolean
    )
    {
        super();

        const values = [..._set.get().values()] as INPUT[];


        _set.on_change.subscribe((values: { value: INPUT, event: "add" | "delete" }[]) =>
        {
            for (let { value, event } of values)
            {
                if (event === "add")
                {
                    this.listen(value);
                } else if (event === "delete")
                {
                    this.unlisten(value);
                }
            }
        });

        for (let i = 0; i < values.length; i++)
        {
            this.listen(values[i]);
        }
    }

    override add(value: INPUT): void
    {
        if (!value)
        {
            throw new Error("Cannot set null or undefined ", value);
        }
        return super.add(value);
    }

    on_update(signal: INPUT, value: INPUT extends StatefulSubscribable<infer I> ? I : never)
    {
        // Undefined signals === Value has been deleted from the source. Use null otherwise!
        const shouldInclude = value === undefined || this.predicate(value);
        const isIncluded = this.has(signal);

        if (shouldInclude && !isIncluded)
        {
            this.add(signal);
        } else if (!shouldInclude && isIncluded)
        {
            this.delete(signal);
        }
    }

    listen(target: INPUT)
    {
        const initialValue = target.get();

        const shouldInclude = this.predicate(initialValue);

        if (shouldInclude)
        {
            this.add(target);
        }

        let updater = this.on_update.bind(this, target);
        target.subscribe(updater, false);
        (target as any)[this.uid2] = updater;
    }

    unlisten(target: INPUT)
    {
        const isIncluded = this.has(target);
        if (isIncluded)
        {
            this.delete(target);
        }

        let updater = (target as any)[this.uid2];
        target.unsubscribe(updater);

        delete (target as any)[this.uid2];
    }
}

import { Computed } from "../../Computed";

export class FilteredSetComputed<INPUT extends StatefulSubscribable<any>> extends SignalSet<INPUT>
{
    // readonly uid = crypto.randomUUID().replace("-", "");
    initialized = false;

    constructor(
        public readonly _set: SignalSet<INPUT>,
        public readonly predicate: (v: INPUT) => boolean
    )
    {
        super();
    }

    // Delay initialization until it's actually required. This helps with setting up complex signal complexes.
    override get()
    {
        if (!this.initialized)
        {
            this.initialize();
        }

        return super.get();
    }

    initialize()
    {
        const values = [...this._set.get().values()] as INPUT[];
        for (let i = 0; i < values.length; i++)
        {
            this.listen(values[i]);
        }

        this._set.on_change.subscribe((values: { value: INPUT, event: "add" | "delete" }[]) =>
        {
            for (let { value, event } of values)
            {
                if (event === "add")
                {
                    this.listen(value);
                } else if (event === "delete")
                {
                    this.unlisten(value);
                }
            }
        });

        this.emit();

        this.initialized = true;
    }

    override emit(value: Set<INPUT> = this._internal): void
    {
        return super.emit(value);
    }

    listen(target: INPUT)
    {
        const mappedSignal = new Computed<boolean>(this.predicate.bind(undefined, target));

        const subscriber = (is_true: boolean) =>
        {
            if (is_true)
            {
                this.add(target);
            }
            else
            {
                this.delete(target);
            }
        };
        mappedSignal.subscribe(subscriber, false);

        // Track the target for future updates
        (target as any)[this.uid] = [mappedSignal, subscriber];

        subscriber(this.predicate(target));
    }

    unlisten(target: INPUT)
    {
        const isIncluded = this.has(target);
        if (isIncluded)
        {
            this.delete(target);
        }

        (target as any)[this.uid][0].unsubscribe((target as any)[this.uid][1])

        // Clean up tracking
        delete (target as any)[this.uid];
    }
}