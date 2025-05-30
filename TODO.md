

StatefulSignal
Subscribable (Unstateful)
BufferedSubscribable
Computed
Effect
Angular
Interval

SignalSet
SignalMap
Order

ComputedSet
FilteredSet
MappedSet
ReducedSet (So operations like sum work just as well)
SomeSet (Same as ReducedSet, but terminates early.)


# Rethink Collections

Map + Set is good.

I_NativeCollection + mapper functions?

- "merge"|"sum"|"multiply" (ie order doesn't matter)
- map
- expand (ie 1 to many)


## Order
- We need some way to handle order. Eg a binary linked list with a binary tree backup for log(n) order comparisons (is in front of / is after would traverse the tree up until a common node is found, then compare the last node of each path). This could ceaselessly slot into the existing Set/Map structures.
This could be called `Order` and support operations like move(), push, pop, etc inside of it.
But implementing some sort of ab tree is a lot of work if we want it to auto balance.
- Orders should be capable of holding duplicates?
- Should `OrderItem`s extend NativeSignals?

BUT : isBefore/isAfter is so rarely used, why make all O(1) operations into O(log n) for something noone uses?! It should be extracted into its own class.


## Order 2.0 : ReferenceCollection
The current iteration of Order is just a binary linked list, where events trigger on `add`/`delete` (which set covers) and `move` (which is new).

Ideally this should be generalized into a more generic form which also supports more complex graphs.
Order should then be a very specific subset of such a ReferenceCollection.

Question is, does this affect the performance? The mapping to other types?

## Collection Transformation Interface
Now that all collections use on_change BufferSubscribables, we can turn mapped/filtered/reduced type into more generic, more maintainable operations.