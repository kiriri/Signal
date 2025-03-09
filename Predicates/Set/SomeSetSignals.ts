import { uid } from "../../Shared/UID";
import { NativeSignal } from "../../Signal";
import { SignalSet } from "../../SignalSet";
import { StatefulSubscribable, Subscribable } from "../../Subscribable";

export class CountSetSignals<
    G,
    T extends StatefulSubscribable<G>
> extends NativeSignal<number>
{
    // true_values = new WeakSet<StatefulSubscribable<G>>();
    // we need to store some information, like the unsubscribe function reference,
    // in each signal object, because using large maps becomes prohibitively expensive.
    // we will use the uid as a field key.
    // readonly uid = uid();
    readonly uid2 = uid();
    // subscribers_map = new WeakMap<StatefulSubscribable<G>, (value: G) => any>();

    constructor (
        public readonly _set: SignalSet<T>,
        public readonly predicate: (v: G) => boolean
    )
    {
        super(0);

        const values = [..._set.get().values()] as StatefulSubscribable<G>[];
        for (let i = 0; i < values.length; i++)
        {
            this.listen(values[i]);
        }
        if(values.length > 0)
            this.emit(this._value);

        _set.on_change.subscribe((values: { value: T, event: "add" | "delete" }[]) =>
        {
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
            this.emit(this._value);
        });

    }


    on_update(target: StatefulSubscribable<G>, value: G)
    {
        const boolish = this.predicate(value);
        if (boolish && !(target as any)[this.uid2])
        {
            (target as any)[this.uid2] = true;
            this.set(++this._value);
        }
        else if (!boolish && (target as any)[this.uid2])
        {
            delete (target as any)[this.uid2];
            this.set(--this._value);
        }
    }

    listen(target: StatefulSubscribable<G>)
    {
        const value = target.get();
        if (this.predicate(value))
        {
            (target as any)[this.uid2] = true;
            ++this._value;
        }

        let updater = this.on_update.bind(this,target);
        target.subscribe(updater, false);
        (target as any)[this.uid] = updater;
        // this.subscribers_map.set(target, updater);
    }

    unlisten(target: StatefulSubscribable<G>)
    {
        if ((target as any)[this.uid2])
        {
            delete (target as any)[this.uid2];
            --this._value
        }

        let updater = (target as any)[this.uid]//this.subscribers_map.get(target)!;
        // this.subscribers_map.delete(target);
        target.unsubscribe(updater);
    }
}



/**
 * Same as some_constants, but the values must be subscribable, and when they change, they are automatically
 * reevaluated.
 * @param predicate 
 */
// export function some_set_signals
//     <
//         G,
//         T extends StatefulSubscribable<G>,
//     >
//     (
//         set: SignalSet<T>,
//         predicate: (v: G) => boolean
//     )
//     : StatefulSubscribable<number>
// {
//     const true_values = new WeakSet<StatefulSubscribable<G>>();

//     let counter = 0;

//     const subscribers = new WeakMap<StatefulSubscribable<G>, (value: G) => any>();

//     const values = [...set.get().values()] as StatefulSubscribable<G>[];
//     for (let i = 0; i < values.length; i++)
//     {
//         listen.apply(values[i]);
//     }

//     const signal = new Signal(counter);






//     return signal as any;
// }