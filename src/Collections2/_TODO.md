# Weak Ref  
Don't use weak refs, instead create a separate internal object which everything links to . Use a finalization registry to detect when the main object is GCed. Then destroy the internal object, unsubscribing from everywhere. 

# Collection Refs
Adding something to a collection should return a reference object through which setting can be done at O(1) .