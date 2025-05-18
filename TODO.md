
# Rethink emit

We need "sinks" which represent functions or classes which always want to be informed of a change asap. Eg a generic subscribed function, or an Angular() wrapper or an Effect.
But normal Computed should only propagate "sinkiness". A trailing computed should be ignored until get() is called. Same applies to mapped sets/maps.

Furthermore we need a dependency map. Signals like Computed must be able to tell if all of their components are ready. Otherwise they must defer. Or they must be able to force update the values from their components, and make them defer when it's their turn.

There's also the difference between emitting immediately, and emitting asap ( setTimeout(,0) ) . Both have valid use cases. But isn't this kind of what a Transaction already is?