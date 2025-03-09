import {SignalSet} from "../../SignalSet"
import {Effect} from "../../Effect"
import { Computed } from "../../Computed";

export function ComputedSet<T>(fn:()=>Set<T>|SignalSet<T>): SignalSet<T>
{
    let result = new SignalSet<T>();
    
    let computed = new Computed(fn);
    
    let effect = new Effect({set:computed},function update({set})
    {
        if(set !== null)
        {
            if(set instanceof SignalSet)
            {
                // raw dog the internals together
                // @ts-expect-error
                result._internal = set._internal;
            }
            else
            {
                // @ts-expect-error
                result._internal = set;
            }

            result.emit(result._internal);
        }
    });

    effect.emit();

    return result;
}