# native-signal & native-signal-ui

A tiny, framework-independent reactivity core (`native-signal`) and a no-virtual-DOM,
JSX-based UI layer built on top of it (`native-signal-ui`). No React, no Vue, no
build-time magic beyond a JSX transform. Signals push changes through a dependency
graph; the DOM subscribes directly.

- **`native-signal`** — `NativeSignal`, `Computed`, `Effect`, plus reactive collections and helpers.
- **`native-signal-ui`** — JSX runtime (`h`/`Fragment`), reactive DOM insertion, control-flow helpers (`If`/`AB`/`Switch`/`ForKeyed`), two-way `bind`, and a `Component` base class.

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
- [Mental model recap](#mental-model-recap)

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

The upside: no orphaned listeners, ever. The downside: you own lifetimes explicitly.

In practice this means:

- **Class fields are safe** — define your signals, computeds, subscribed functions and effects as fields, then
  keep the instance alive (e.g. anchor it to its root element).
- **Standalone subscriptions and effects need an anchor.** Use [`own()`](#own) from
  `native-signal-ui` to tie their lifetime to an owner object.
- **Signals/Computeds placed in the DOM via my native-signal-ui library are safe** — the DOM node holds them, and anything
  they transitively depend on stays alive too.

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

---

# Part 2 — `native-signal-ui`

JSX and reactive utilities for the DOM. No virtual DOM: reactive values you put into the
tree (as children or attributes) update in place.

```bash
pnpm add native-signal-ui
```

```ts
import {
    own, If, AB, Switch, ForKeyed,
    bind, boundInput, boundSelect, boundTextarea,
    bind_attrs, Component, runtime,
} from "native-signal-ui";
```

## JSX setup (Vite + TypeScript)

The JSX factory is `h` and the fragment is `Fragment`, both from the `runtime` export. Wire
them up once.

**`vite.config.ts`** — auto-inject the factory so you never import it by hand:

```ts
export default defineConfig({
    esbuild: {
        jsxFactory: "h",
        jsxFragment: "Fragment",
        jsxInject: `import { runtime } from "native-signal-ui"; const { h, Fragment } = runtime;`,
    },
});
```

**`tsconfig.json`** — so `tsc` type-checks JSX with the same factory:

```json
{
    "compilerOptions": {
        "jsx": "react",
        "jsxFactory": "h",
        "jsxFragmentFactory": "Fragment"
    }
}
```

With that, JSX just works:

```tsx
const el = <div class="card">Hello</div>;
const frag = <><span>A</span><span>B</span></>;
```

## Putting reactive values in the DOM

Signals, `Computed`s, promises, arrays (nestable), and any object with `.to_html()` can be
placed **directly** as JSX children or attribute values. The DOM tracks them and updates
live.

```tsx
const name = new NativeSignal("world");
const greeting = new Computed(() => "Hello " + name.get());

// as a child
const heading = <h1>{greeting}</h1>;

// as an attribute
const box = <div data-tooltip={greeting} class={new Computed(() => name.get())}>Hi</div>;

name.set("there"); // both update automatically
```

**Crucially:** signals held *by* the DOM (and anything in their dependency chain) don't need
`own()` — the DOM keeps them alive. Only **standalone effects / subscriptions** with no DOM
anchor need it.

| Type | As child | As attribute |
|---|---|---|
| `string \| number \| boolean` | ✅ | ✅ |
| `Node \| Text \| Comment \| DocumentFragment` | ✅ | — |
| `NativeSignal` / `Computed` | ✅ live | ✅ live |
| `Promise<T>` | ✅ (resolves in place) | — |
| Array (nested ok) | ✅ | — |
| object with `.to_html()` / `Component` instance | ✅ | — |

### Event handlers, style, classes

```tsx
<button onclick={() => count.update(v => v + 1)}>+</button>

// style: object, namespaced per-property (signal-friendly), or string
<div style={{ color: "red", fontWeight: bold }} />
<div style:color={colorSignal} style:fontWeight="bold" />
<div style="color: red" />

// reactive whole class string, or toggle one class reactively
<div class={new Computed(() => active.get() ? "item on" : "item")} />
<div class:open={isOpen} class:disabled={isDisabled} />
```

## `own`

Keep a value alive as long as at least one owner exists, without modifying the owner. Use it
for effects/subscriptions that have no DOM anchor.

```ts
import { own } from "native-signal-ui";

const fn = (_src, value) => console.log(value);
signal.subscribe(fn);
own(fn, root); // fn lives at least as long as `root` does
```

Or, idiomatically, define effects as class fields and own the whole instance to its root
element — then everything is pinned in one call. `own()` isn't cheap; prefer plain field
assignment when performance matters and you control the lifetime directly.

## Conditional rendering: `If`, `AB`, `Switch`

### `If(signal, content, inverse?)`

Mounts/unmounts content based on a signal (or a plain `() => boolean`). Content is
materialised lazily on first show and cached. Pass `inverse = true` to flip the condition.

```ts
If(isLoggedIn, <Dashboard />)
If(isLoggedIn, () => <Dashboard />)       // lazy factory — built once on first show
If(isLoggedIn, <LoginPrompt />, true)     // shows when isLoggedIn is falsy
```

### `AB(signal, truthyContent, falsyContent)`

Switches between two branches. Both are lazily built and cached; the inactive branch is kept
in a detached fragment, so its inner state is preserved.

```ts
AB(isDark, <DarkTheme />, <LightTheme />)
AB(isDark, () => <DarkTheme />, () => <LightTheme />) // lazy factories
```

### `Switch(signal, cases)`

Switches between multiple named branches keyed by the signal's value. Each branch can be a
lazy factory; built once and cached.

```ts
Switch(view, {
    home:     <HomePage />,
    settings: () => <SettingsPage />,
    about:    <AboutPage />,
})
```

## Lists: `ForKeyed`

Keyed list rendering. `generator` returns an array of objects, each with a unique value at
`key`. `mapper` runs **once per unique key**, and its DOM node is reused across reorders.

```ts
ForKeyed(
    "id",
    () => items,                         // a function or anything with .get() returning T[]
    (item) => <li>{item.name} — {item.id}</li>,
)
```

`ForKeyed` only drives structural changes (insert/remove/reorder). **Internal reactivity per
item is the mapper's job** — set up signals/Computeds inside the mapper for fields that
change.

## Two-way binding: `bind` & friends

`bind(el, signal, opts?)` connects a form element to a `NativeSignal` bidirectionally.
Coercion and event type are inferred from the element (overridable via `opts`).

```ts
import { bind } from "native-signal-ui";

const name = new NativeSignal("");
const input = document.createElement("input");
const unbind = bind(input, name);
// typing updates name; name.set(...) updates the input
```

Inference:

| Element | coerce | event |
|---|---|---|
| `input[checkbox/radio]` | `boolean` | `change` |
| `input[number/range]` | `number` | `input` |
| `select[multiple]` | `array` | `change` |
| `select` | `string` | `change` |
| everything else | `string` | `input` |

Convenience factories return `[element, cleanup]`:

```ts
const [input, c1]    = boundInput("text", query, { placeholder: "Search…" });
const [select, c2]   = boundSelect([{ value: "a", label: "A" }, { value: "b", label: "B" }], choice);
const [textarea, c3] = boundTextarea(notes, { rows: "5" });
```

## `bind_attrs`

Reactively bind a map of attributes to an element. Values may be signals, `Computed`s, or
plain values (plain values are set once, not tracked). Prefix a key with `class.` to toggle
a class.

```ts
import { bind_attrs } from "native-signal-ui";

bind_attrs(button, {
    disabled:       isReadonly,   // NativeSignal<boolean>
    "aria-pressed": isActive,     // Computed<boolean>
    "class.open":   isOpen,       // toggles class "open"
    "data-id":      "static-id",  // plain — set once
});
```

## The `Component` base class

Extend `Component` to build reusable widgets. A class used as a JSX tag is instantiated with
`{ ...props, content: children }`.

```tsx
import { Component } from "native-signal-ui";

class Card extends Component {
    // props are available as this.props; field initializers are safe
    root = <div class="card">{this.props.content}</div>;
}

// used as a tag…
const a = <Card>body text</Card>;
// …or constructed directly
const b = <>{new Card({ content: "body text" })}</>;
```

```ts
abstract class Component<NODE extends Element = Element> {
    abstract root: NODE;
    to_html(): NODE;  // returns this.root
    destroy(): void;  // removes this.root from the DOM
}
```

Define your signals, computeds, and effects as fields on the component. Because the instance
is held by `root` (which is in the DOM), everything stays alive — no per-effect `own()`
needed. For the rare standalone effect, `own(effect, this.root)`.

---

## Mental model recap

1. **Signals push.** `set()` marks the graph dirty synchronously and emits on a microtask;
   synchronous writes coalesce.
2. **Computeds pull lazily** and track dependencies automatically. Eager computeds /
   `Effect`s are your side-effect sinks.
3. **The DOM is just another subscriber.** Drop signals/computeds into JSX and they update
   in place.
4. **Lifetimes are weak.** Anchor anything you want to keep — to the DOM, to a class field,
   or with `own()`. When in doubt, `own(it, theElementThatShouldOutliveIt)`.
