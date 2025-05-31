import { NativeSignal } from "../../Signal";
import { SignalSet } from "../../SignalSet";
import { StatefulSubscribable, Subscribable } from "../../Subscribable";

export class MappedSetSignals<
    INPUT,
    OUTPUT
> extends SignalSet<StatefulSubscribable<OUTPUT>>
{
    // readonly uid = crypto.randomUUID().replace("-","");;
    readonly uid2 = crypto.randomUUID().replace("-","");;

    constructor(
        public readonly _set: SignalSet<StatefulSubscribable<INPUT>>,
        public readonly mapper: (v: INPUT) => OUTPUT
    )
    {
        super();

        const values = [..._set.get().values()] as StatefulSubscribable<INPUT>[];
        for (let i = 0; i < values.length; i++)
        {
            this.listen(values[i]);
        }

        _set.on_change.subscribe((_,values: { value: StatefulSubscribable<INPUT>, event: "add" | "delete" }[]) =>
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
    }

    on_update = (target: StatefulSubscribable<INPUT>, value: INPUT) =>
    {
        const mappedValue = this.mapper(value);
        const mappedSignal = (target as any)[this.uid] as NativeSignal<OUTPUT>;
        mappedSignal.set(mappedValue);
    }

    listen(target: StatefulSubscribable<INPUT>)
    {
        const initialValue = target.get();
        const mappedValue = this.mapper(initialValue);

        const mappedSignal = new NativeSignal<OUTPUT>(mappedValue);
        (target as any)[this.uid] = mappedSignal;

        this.add(mappedSignal);

        target.subscribe(this.on_update, true);
    }

    unlisten(target: StatefulSubscribable<INPUT>)
    {
        const mappedSignal = (target as any)[this.uid] as StatefulSubscribable<OUTPUT>;
        this.delete(mappedSignal);

        target.unsubscribe(this.on_update);

        delete (target as any)[this.uid];
        delete (target as any)[this.uid2];
    }
}



import { Computed } from "../../Computed";

export class MappedSetComputed<
    INPUT,
    OUTPUT
> extends SignalSet<StatefulSubscribable<OUTPUT>>
{
    // readonly uid = crypto.randomUUID().replace("-","");

    constructor(
        public readonly _set: SignalSet<StatefulSubscribable<INPUT>>,
        public readonly mapper: (v: StatefulSubscribable<INPUT>) => OUTPUT,
    )
    {
        super();

        const values = [..._set.get().values()] as StatefulSubscribable<INPUT>[];
        for (let i = 0; i < values.length; i++)
        {
            this.listen(values[i]);
        }

        _set.on_change.subscribe((_,values: { value: StatefulSubscribable<INPUT>, event: "add" | "delete" }[]) =>
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
    }

    listen(target: StatefulSubscribable<INPUT>)
    {
        const mappedSignal = new Computed<OUTPUT>(this.mapper.bind(undefined,target));
        (target as any)[this.uid] = mappedSignal;

        this.add(mappedSignal);
    }

    unlisten(target: StatefulSubscribable<INPUT>)
    {
        const mappedSignal = (target as any)[this.uid] as Computed<OUTPUT>;
        delete (target as any)[this.uid];
        
        this.delete(mappedSignal);
    }
}