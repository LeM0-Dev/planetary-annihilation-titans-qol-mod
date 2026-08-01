# JavaScript target: Chromium 40

PA's UI is Coherent UI, which embeds **Chromium 40** (V8 ~3.30/4.0, January 2015). Node and
every modern browser accept far more than this, so "it runs in my editor" proves nothing.

## The rule that governs everything

**A syntax error kills the entire file.** Not the statement — the file. PA injects scene
scripts with `document.createElement('script')`, so if the parse fails, every symbol the
file was meant to define is simply absent. This is why unsupported *syntax* is a Blocker
while an unsupported *runtime API* is only a Bug: the API call fails when reached, but the
file up to that point ran.

## Do not infer the target from a mod's linter config

GW-AI-Overhaul's ESLint sets `ecmaVersion: 6`, which permits `let` and `const`. GWO ships
**zero** of either. The config is more permissive than the engine, and following it would
produce broken mods. **Engine behaviour governs, not tooling config.**

## Syntax — Blockers

| Construct | Shipped in Chrome | Use instead |
|---|---|---|
| `let` | 49 (sloppy mode) | `var` |
| arrow `=>` | 45 | `function () {}` |
| template literal `` `x` `` | 41 | string concatenation with `+` |
| `class` | 42 | constructor function + prototype |
| spread / rest `...` | 46 / 47 | `arguments`, `.apply()`, `slice.call()` |
| destructuring | 49 | one `var` per property |
| default parameters | 49 | `if (x === undefined) { x = ...; }` |
| `async` / `await` | 55 | `Promise` chains |

### `let` specifically

Chrome 40 accepts `let` **only in strict mode**. PA scene files are classic, non-strict
scripts, so `let` is a SyntaxError and the whole file is dead. Block-scoped `let` in sloppy
mode did not arrive until Chrome 49.

## `const` — Area of Concern

`const` *parses* in Chrome 40, but as the **pre-ES6 V8 extension**, not the ES6 keyword:

- it is **function-scoped, not block-scoped**
- it does **not** create a fresh binding per loop iteration
- reassignment **fails silently** rather than throwing

So `const` usually appears to work and then misbehaves inside a loop. It is reported as an
Area of Concern rather than a Blocker because the file still loads.

## Permitted

`for...of` (38), `Promise` (32), `Map`/`Set`/`WeakMap` (38), `Symbol` (38),
`Object.setPrototypeOf` (34), `Number.isInteger` (34), `Math.trunc`/`sign` (38),
generators `function*` (39), and all of ES5.

## Runtime APIs missing from Chrome 40 — Bugs

Only calls whose receiver is a built-in **namespace** are checked, because those are
unambiguous:

| API | Shipped in Chrome |
|---|---|
| `Object.assign` | 45 |
| `Object.entries`, `Object.values` | 54 |
| `Object.getOwnPropertyDescriptors` | 54 |
| `Array.from`, `Array.of` | 45 |
| `String.raw` | 41 |
| `Number.isSafeInteger` | 41 |

### `startsWith` and `endsWith` are safe — PA polyfills them

Chrome 40 does lack both, but the game defines them in
`media/ui/main/shared/js/helpers.js:130-142`, guarded by
`typeof String.prototype.x !== 'function'`. The base game uses them throughout. That block
contains **exactly these two** and nothing else, so no other missing API is covered.

### Prototype methods are deliberately not checked

`Array.prototype.find`/`includes`/`fill` and `String.prototype.repeat`/`padStart` genuinely
are absent from Chrome 40, but whether a call is dangerous depends entirely on the
receiver's type, and the names collide with libraries PA ships:

```js
$(content).find('a')          // jQuery, fine
this.$element.find('input')   // jQuery, fine
ctx.fill()                    // canvas, fine
```

Auditing 347 base-game scripts, **all 24 hits were false positives of exactly this kind**. A
check that is wrong 24 times out of 24 on known-good code is worse than no check, so it was
removed rather than tuned. If you need certainty here, check the receiver by hand.

### `async` and `await` are not reserved words in ES5

The base game uses `async` as an ordinary identifier — `var async = function () {`,
`async : options.getAsync`, `typeof async == "boolean"`. Only real `async function` /
`await <expr>` syntax is a Blocker.

## Libraries PA ships globally

From `media/ui/main/shared/js/thirdparty/`:

- **lodash 3.9.3** as `_` — the safe substitute for most missing APIs
- **Knockout 3.5.1** as `ko`
- **jQuery** as `$`
- **CreateJS** as `createjs`

Pin lodash to **3.9.3** exactly in any dev tooling. A newer lodash in `devDependencies`
will accept calls the shipped version rejects.

## `try`/`catch` is not required

Wrapping a scene script body in `try`/`catch` is **gold plating, not a requirement**. Its
absence is never reported at any severity.

This is called out explicitly because Legion Expansion's own `CLAUDE.md` mandates the idiom
for its own codebase. That is a house style, not a platform rule, and a reviewer treating it
as a rule would flag every mod that omits it.
