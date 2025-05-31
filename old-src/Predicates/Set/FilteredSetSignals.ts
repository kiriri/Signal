import { NativeSignal } from "../../Signal";
import { SignalSet } from "../../SignalSet";
import { StatefulSubscribable, Subscribable } from "../../Subscribable";

export class FilteredSetSignals<INPUT extends StatefulSubscribable<any>> extends SignalSet<INPUT>
{
    readonly uid2 = crypto.randomUUID().replace("-", "");

    constructor(
        public readonly _set: SignalSet<INPUT>,
        public readonly predicate: (v: INPUT extends StatefulSubscribable<infer I> ? I : never) => boolean,
        test = false
    )
    {
        super();

        const values = [..._set.get().values()] as INPUT[];


        _set.on_change.subscribe((_,values: { value: INPUT, event: "add" | "delete" }[]) =>
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
            console.log(value)
            throw new Error("Cannot set null or undefined ");
        }
        return super.add(value);
    }

    on_update = (signal: INPUT, value: INPUT extends StatefulSubscribable<infer I> ? I : never) =>
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

        // How do we store the updater?
        let updater = this.on_update;
        target.subscribe(updater, true);
        // (target as any)[this.uid2] = updater;
    }

    unlisten(target: INPUT)
    {
        const isIncluded = this.has(target);
        if (isIncluded)
        {
            this.delete(target);
        }

        // let updater = (target as any)[this.uid2];
        target.unsubscribe(this.on_update);

        // delete (target as any)[this.uid2];
    }
}

import { Computed } from "../../Computed";

const deleteSet = new FinalizationRegistry((set)=>{
    console.log("Set deleted")
})

export class FilteredSetComputed<INPUT extends StatefulSubscribable<any>> extends SignalSet<INPUT>
{
    // readonly uid = crypto.randomUUID().replace("-", "");
    initialized = false;

    __subscribers = new Map<StatefulSubscribable<any>,any>();

    constructor(
        public readonly _set: SignalSet<INPUT>,
        public readonly predicate: (v: INPUT) => boolean,
        public test = false
    )
    {
        super();

        deleteSet.register(this,"");
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

        this._set.on_change.subscribe((_,values: { value: INPUT, event: "add" | "delete" }[]) =>
        {
            if(this.test)
                console.log("Running Test ", values)
            for (let { value, event } of values)
            {
                if (event === "add")
                {
                    this.listen(value);
                } 
                else if (event === "delete")
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
        // console.log("LISTEN")
        const predicateSignal = new Computed<boolean>(this.predicate.bind(undefined,  target));

        const on_predicate_change = (source:Subscribable<boolean>,is_true: boolean) =>
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
        // When the predicate changes, check if add/delete needs to occur.
        // This does not unlisten!
        predicateSignal.subscribe(on_predicate_change, null);

        // this.__subscribers2.set(target,mappedSignal);
        this.__subscribers.set(target,[on_predicate_change,predicateSignal]);
        // subscriber["computed"] = mappedSignal;

        // Track the target for future updates
        // (target as any)[this.uid] = [mappedSignal, subscriber];

        // Check right away if the item should be included or not.
        on_predicate_change(undefined, predicateSignal.get());
    }

    unlisten(target: INPUT)
    {
        const isIncluded = this.has(target);
        if (isIncluded)
        {
            this.delete(target);
        }

        this.__subscribers.delete(target);
        // this.__subscribers2.delete(target);

        console.log("UNLISTENED")

        // (target as any)[this.uid][0].unsubscribe((target as any)[this.uid][1])

        // Clean up tracking
        // delete (target as any)[this.uid];
    }
}