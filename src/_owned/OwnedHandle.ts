
// Instead of one Weak Ref per subscription we instead create only 1 finalizer for each unowned OwnedHandle

import { NativeSignal } from "src/Core";
import { NativeSignalFlattened } from "src/Core/NativeSignal";
import { LinkedList, Subscribable } from "src/Core/Subscribable"

const finalizer = new FinalizationRegistry((state:Handleable)=>{
    state.destroy();
})


export class Handleable
{
    private _handle ?: WEAK_REF<OwnedHandle<this>>;
    private _destroyed : boolean = false;
    public fields : Record<string,Handleable> = {};
    test = 1;

    get_value()
    {
        return this.test;
    }

    // constructor(parent?:Handleable)
    // {
    //     // parent?.fields.push(this);
    // }

    // get_handle()
    // {
    //     let existing_handle = this._handle?.deref();
    //     if(existing_handle !== undefined)
    //         return existing_handle;

    //     this._handle = new WeakRef(new OwnedHandle(this));
    // }

    // destroy()
    // {
    //     for(let k in this)
    //     {
    //         let field = this[k];
    //         if(field instanceof Handleable && !field._destroyed)
    //         {
    //             field.destroy();
    //         }
    //     }
    // }
}

function get_value(self : ReturnType<typeof make_handleable>)
{
    return self.test;
}

function make_handleable(parent?:Handleable, field_name?:string)
{
    let v = {
        test:Math.random(),
        _handle : undefined,
        _destroyed: false,
        fields: {},
        get_value
    };
    if(parent)
        parent.fields[field_name!] = v
    return v;
}

export class OwnedSignal<T> extends Handleable
{
    constructor(
        public owner: Handleable, 
        public value:T
    )
    {
        super(owner);
    }

    // There are no fields that need handling.
    override destroy(): void {}
}

export class OwnedHandle<O extends Handleable>
{
    // These Handles are not part of state, but they should not
    // gc unless this handle does first.
    dependents:LinkedList<OwnedHandle<any>> | undefined;

    constructor(
        public readonly state:O,
        public readonly owner?:OwnedHandle<any> 
    )
    {
        if(owner === undefined)
        {
            finalizer.register(this,state);
        }
        else
        {

        }
    }
}



///
// Test
///


class Stat extends Handleable 
{
    value: OwnedSignal<number>;

    constructor(
        parent:Handleable,
        public name:string,
        value:number
    )
    {
        super(parent)
        this.value = new OwnedSignal(this,value);
    }
}



class Character
{
    // test = make_handleable()
    a = 1;
    b = 2;
    c = 3;
    d = 4;
    e = 5;
    f = 6;
    // name = new OwnedSignal(this,"MC");
    // age = new OwnedSignal(this,122);

    // strength = new Stat(this, "strength", 10);
    // constitution = new Stat(this, "constitution", 15);
    // intelligence = new Stat(this, "intelligence", 1);
}

class Character2
{
    // test = make_handleable()
    a = 1;
    b = 2;
    c = 3;
    d = 4;
    e = 5;
    f = 6;
    g = 7;
    // name = new OwnedSignal(this,"MC");
    // age = new OwnedSignal(this,122);

    // strength = new Stat(this, "strength", 10);
    // constitution = new Stat(this, "constitution", 15);
    // intelligence = new Stat(this, "intelligence", 1);
}

class Character3 extends Character
{
}

// class Character2 extends Handleable 
// {
//     // test = make_handleable()
//     test = new Handleable();
//     // name = new OwnedSignal(this,"MC");
//     // age = new OwnedSignal(this,122);

//     // strength = new Stat(this, "strength", 10);
//     // constitution = new Stat(this, "constitution", 15);
//     // intelligence = new Stat(this, "intelligence", 1);
// }

class Game
{
    player: OwnedHandle<Character>;

    constructor()
    {
        this.player = (new Character).get_handle();
    }
}



async function wait(ms: number)
{
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function timer(name:string|undefined, iterations:number, fn:(i?:number)=>any, steps = 511)
{
    // gc time
    // await wait(50);

    let start = performance.now();

    for(let i = 0; i < iterations; i++)
    {
        // if(!(i % steps)) // improves performance on node by A LOT (without hurting bun much)
        //     await new Promise((resolve)=>setImmediate(resolve));
        fn(i);
    }

    const duration = performance.now() - start;
    if(name !== undefined)
        console.log(name + ":" + iterations, duration)

    return duration;
}

async function GC()
{
    await wait(100);
    gc();
    await wait(100);

}

async function compare(name:string, ITERATIONS:number, fn1:(i?:number)=>any, fn2:(i?:number)=>any)
{
    await GC();

    const time1 = await timer(undefined,ITERATIONS,fn1);
    await GC();
    const time2 = await timer(undefined,ITERATIONS,fn2);
    await GC();

    let time3 = 0;
    let time4 = 0;
    for(let i = 0; i < 100; i++)
    {
        time3 += await timer(undefined,ITERATIONS/100,fn1);
        time4 += await timer(undefined,ITERATIONS/100,fn2);
    }

    console.log(name + ":" + (time3/time4).toFixed(2) + ' | ' + time3 + " vs " + time4)

    await GC();

    return time3/time4;
}

async function test()
{
    const start = Date.now();
    const ITERATIONS = 10_000_000;
    // await timer("",10_000_000,()=>{
    //     new Character();
    // });
    // await GC();
    // await timer("IGNORE",ITERATIONS,()=>{
    //     new Character();
    // });
    await GC();
    
    // await compare(
    //     "create vs make",
    //     ITERATIONS,
    //     ()=>{
    //         new Handleable();
    //     },
    //     ()=>{
    //         make_handleable();
    //     }
    // );

    await compare(
        "6 vs 7 fields",
        ITERATIONS,
        ()=>{
            new Character();
        },
        ()=>{
            new Character2();
        }
    );

    await compare(
        "extended vs flattened",
        ITERATIONS,
        ()=>{
            new NativeSignal(0);
        },
        ()=>{
            
            new NativeSignalFlattened(0)
        }
    )

    // await timer("classy",ITERATIONS,()=>{
    //     new Character();
    // });
    // await GC();
    // await timer("noparent",ITERATIONS,()=>{
    //     new Character2();
    // });
    // await GC();

    console.log("TOTAL:", Date.now() - start);

    // await timer("Character",ITERATIONS,()=>{
    //     new Character();
    // });

    

    
}

test();