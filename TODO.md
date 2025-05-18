

StatefulSignal
Subscribable (Unstateful)
BufferedSubscribable
Computed
Effect
Angular
Interval

SignalSet
SignalMap

ComputedSet
FilteredSet
MappedSet
ReducedSet (So operations like sum work just as well)
SomeSet (Same as ReducedSet, but terminates early.)


# Rethink emit

We need "sinks" which represent functions or classes which always want to be informed of a change asap. Eg a generic subscribed function, or an Angular() wrapper or an Effect.
But normal Computed should only propagate "sinkiness". A trailing computed should be ignored until get() is called. Same applies to mapped sets/maps.

Furthermore we need a dependency map. Signals like Computed must be able to tell if all of their components are ready. Otherwise they must defer. Or they must be able to force update the values from their components, and make them defer when it's their turn.

There's also the difference between emitting immediately, and emitting asap ( setTimeout(,0) ) . Both have valid use cases. But isn't this kind of what a Transaction already is? Do we force transactions, put emit behind setTimeout()?





# Transactionlike

So what if we trigger subscribed functions late, but dependent signals immediately?

Eg Effect is called late. So are custom subscribe() calls.
But Computed is called immediately once it is requested through get().


So sinks like Effect or subscribables with custom subscribe functions will register themselves in a global set. Any set operation will check a global bool if setTimeout has been called. If it hasn't, it will create it.

## Changes
- Remove transaction entirely.
- subscribe : hard reference to signals. just a function means its a sink.
- dirty() and _dirty=false