# native-signal & native-signal-ui

A tiny, framework-independent reactivity core (`native-signal`) that works in servers and browsers alike.

`NativeSignal`, `Computed`, `Effect`, plus reactive collections and helpers.

See `native-signal-ui` for a reactive jsx framework which implements these signals.

---

## Table of contents

- [The one rule you must know (GC / `own`)](#the-one-rule-you-must-know-gc--own)
- [Part 1 — `native-signal`](#part-1--native-signal)
  - [Install & import](#install--import)
  - [`NativeSignal<T>`](#nativesignalt)
  - [`Computed<T>`](#computedt)
  - [`Effect`](#effect)
  - [`detached`](#detached)
  - [Wrappers & events: `local`, `interval`](#wrappers--events-local-interval)
  - [Collections (WIP)](#collections-wip)

---

## The one rule you must know (GC / `own`)

`native-signal`'s default ("weak") build holds every subscriber and dependant through a
`WeakRef`. **You must keep a strong reference to anything you want to keep firing.**

```ts
new NativeSignal(1).subscribe(fn); // fn is held weakly!
```

If nothing else references `fn`, the garbage collector will eventually collect it and the
subscription silently stops. The same applies to `Computed`s and `Effect`s: a `Computed`
nobody holds, or an `Effect` that has gone out of scope, will stop working once GC runs.

The upside: no orphaned listeners, ever. The downside: you own lifetimes explicitly by not discarding the relevant object's references.

There is also a **strong** build (`native-signal/strong`) where nothing is GC'd
automatically — you must `destroy()` every `Computed`/`Effect` yourself. The weak build is
the default and what the rest of this document assumes.

---

# Part 1 — `native-signal`

The reactive core. Three primitives — `NativeSignal`, `Computed`, `Effect` — built on a
shared `Subscribable`. Together they form a push-based graph with **automatic dependency
tracking**: any `signal.get()` called while a `Computed` runs becomes a dependency of that
computed.

## Install & import

```bash
pnpm add native-signal
```

Everything is imported from the `weak` entry point:

```ts
import { NativeSignal, Computed, Effect, detached } from "native-signal/weak";
```

> The package also exposes `native-signal/strong` (manual lifetimes). Pick one and stick
> with it across your app.

## `NativeSignal<T>`

A writable, stateful value — the root of any reactive graph.

```ts
const count = new NativeSignal(0);

count.get();              // → 0; registers a dependency if read inside a Computed
count.set(1);             // set a value
count.update(v => v + 1); // shorthand for set(fn(current))

count._value;             // raw read — bypasses dependency tracking
count.dirty(count);       // force-mark dirty without changing the value (e.g. after
                          // mutating a collection/object in place)
```

Key behaviors:

- **`set()` is a no-op if the new value `===` the current one** — no dirty propagation, no
  emission.
- **Emissions coalesce.** `set()` marks dependants dirty *synchronously*, but value
  subscribers are notified *asynchronously* on the next microtask. A thousand `set()`s in
  one tick collapse into a single emission.
- **`ReadonlySignal<T>`** is `NativeSignal<T>` without `set` — hand this out for read-only
  views.

```ts
function counter(): ReadonlySignal<number> {
    return new NativeSignal(0); // caller can .get() but not .set()
}
```

## `Computed<T>`

A lazily-evaluated, auto-tracked derived value.

```ts
const count = new NativeSignal(2);
const doubled = new Computed(() => count.get() * 2);

doubled.get(); // → 4; evaluates fn on first call, then caches
count.set(5);
doubled.get(); // → 10; re-evaluated because a dependency changed
```

- **Lazy by default.** The function doesn't run until someone calls `get()` or
  `subscribe()`. After the first run, dependency changes mark it stale; the next `get()`
  recomputes.
- **Dependency tracking is automatic and conditional.** Only the signals actually read in a
  given evaluation are tracked — branches that didn't run aren't dependencies.
- **It cuts unnecessary work.** If an upstream change doesn't actually alter this computed's
  output, propagation stops here (downstream consumers aren't re-run).

### Eager mode = effects

Pass `eager = true` (the 3rd constructor arg) to run immediately and re-run on every
dependency change, whether or not anyone reads the value. This is how you do side effects:

```ts
// runs now, and again every time `count` changes
const logger = new Computed(() => console.log("count is", count.get()), undefined, true);
own(logger, someElement); // hold it — see the GC rule above
```

The **2nd argument is an optional `context`** passed to the function — use it to share one
static function across many computeds instead of allocating a closure each time (a
micro-optimization):

```ts
const c = new Computed(self => self.a.get() + self.b.get(), { a, b });
```

### Stopping a computed

```ts
doubled.subscribe(fn); // receive updates on change (this makes the computed eager)
doubled.destroy();     // stop listening to dependencies immediately, don't wait for GC
```

## `Effect`

A multi-source side-effect sink: run a function whenever **any** named source changes. Use
it when you want "do X when any of these change" and don't need a value back.

```ts
import { Effect } from "native-signal/weak";

const fx = new Effect(
    { x: signalA, y: signalB },          // named sources
    ({ x, y }) => console.log(x, y),     // values keyed by the same names
);

fx.destroy(); // unsubscribe from all sources immediately
```

- `fn(values, self)` receives the latest value of every source, keyed by your source names.
- Multiple synchronous source changes within a tick coalesce into one call.
- `fx.add_listener(key, source)` attaches another source at runtime.
- `fx._source_cache` holds the most-recent value seen from each source.
- **Lifecycle:** an `Effect` lives as long as something references it (sources hold it
  weakly). Keep a reference, or call `destroy()` to stop it now.

> A `Computed(..., undefined, true)` and an `Effect` overlap: use a `Computed` when one
> derivation reads several signals; use an `Effect` when you want explicitly named inputs.

## `detached`

Run a block inside a `Computed` *without* subscribing to what it reads. Returns the block's
result directly.

```ts
import { detached } from "native-signal/weak";

const total = new Computed(() => {
    const live = items.get();                    // tracked dependency
    const snapshot = detached(() => config.get()); // read once, NOT a dependency
    return live.length * snapshot.factor;
});
```

In an eager computed you can also use `queueMicrotask(...)` to run code outside the tracking
scope.

## Wrappers & events: `local`, `interval`

```ts
import { local, interval } from "native-signal/weak";
```

**`local(key, signal)`** — persist a signal to `localStorage` (JSON). On call it loads an
existing value (if any) into the signal, otherwise seeds storage from the signal, then keeps
them in sync. Returns the same signal.

```ts
const theme = local("theme", new NativeSignal("light"));
theme.set("dark"); // written to localStorage["theme"]
```

> JSON only; browser only. The subscription lives as long as the signal does — keep a
> reference.

**`interval(delta)`** — a `NativeSignal<number>` that increments every `delta` ms. Calling
`interval(50)` twice returns the *same* signal (one `setInterval` per delta). Held weakly:
keep a reference to keep it ticking; it fires on interval boundaries, not immediately.

```ts
const tick = interval(1000);
const clock = new Computed(() => new Date(tick.get() && Date.now()).toLocaleTimeString());
```

## Collections (WIP)

`native-signal` ships reactive collections — `SignalSet`, `SignalMap`, `SignalHeap`, and
`Order` — plus reducers (`reduce`, `count`). They expose **two** notification channels:

1. **Whole-collection** via `subscribe(...)` (coalesced on a microtask).
2. **Per-change named events** via `subscribe_event("add" | "delete" | ...)` (synchronous).

```ts
import { SignalMap, SignalSet } from "native-signal/weak";

const users = new SignalMap<string, User>();
users.set("u1", alice);
users.get();             // Map snapshot (a dependency inside a Computed)
const u = users.ref("u1"); // NativeSignal<User|undefined> for one key
u.set(undefined);          // setting a ref to undefined deletes the entry
```

`SignalMap.ref(key)` is the highlight: a per-key signal a `Computed` can depend on without
re-running when unrelated keys change.

> ⚠️ **Per the upstream README, collections are WIP** — slower than the core, subject to
> change, and with at least one known `clear()` quirk on `SignalMap`. Prefer plain signals
> + `Computed` until you specifically need collection semantics.