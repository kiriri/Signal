

# This Project is WIP
The signal/computed/effect part works. But everything related to collections is slow and may not work and prone to change. Don't use it.

This project exists in 2 modes : Weak and Strong .

# Weak (Uses WeakRefs)
In this mode any subscriber stays only around while the listener exists. So `new Signal(1).subscribe(fn)` will only work so long as you hold the fn function object.
Discard it and let the GC clean it up, and the subscription disappears alongside it. And because in this example we don't hold the signal either, that disappears too.

The same goes for effects. Everything that's not being depended upon will get GCed.

The upside is no more orphans. The downside is increasingly bad performance past ~100k signals/subscribers. I hope v8 improves it in the future, but it's what it's.

# Strong
Anything subscription needs to be manually removed again. All `Effect`s and `Computed`s will need to be `destroy()`ed for their effects to disappear.