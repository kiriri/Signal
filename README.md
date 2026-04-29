

# This Project is WIP
The signal/computed/effect part works. But everything related to collections is slow and may not work and prone to change. Don't use it.
Keep in mind that you need to keep listener functions around yourself. They will get garbage collected if you don't.
The same goes for effects. Everything that's not being depended upon will get GCed.

# NodeJS
[] Simplify Subscribable so it can be flattened.
[] Flatten all performance relevant classes so they don't extend. ~5x creation speed.

# Bun
[] Try to make all classes have at most 6 fields (huge performance gains, like 4x creation speed)