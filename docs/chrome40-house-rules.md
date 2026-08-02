# Chrome 40 house rules

PA's UI runs on Coherent UI ≈ Chromium 40. Everything under `ui/mods/**` is
**ES5 only**. Enforced by `eslint` (`ecmaVersion: 5`) plus lexical bans in
`tools/check-modinfo.mjs`.

## Fatal syntax errors (kill the whole file silently)

`let`, arrow functions, template literals, `class`, rest/spread (`...`),
destructuring, default parameters, `async`/`await` as syntax, generators in
expression positions you haven't tested.

## Parses but broken

- `const` — function-scoped, reassignment fails **silently**. Banned outright.

## Missing at runtime (parses, throws when reached)

`Object.assign`*, `Object.entries`, `Object.values`, `Array.from`, `Array.of`.
Use lodash 3.9.3 (global `_`): `_.assign`, `_.pairs`, `_.values`, `_.toArray`.

*`_.assign` is fine — the ban is on the `Object.` builtin.

## Safe

ES5 everything, `Date.now`, `JSON`, `Promise`, `Map`/`Set`,
`String.prototype.startsWith/endsWith` (polyfilled by the base game's
`helpers.js:130-142`).

## The safeWrap trap

`PA-MOD-CODING-RULES.md`'s own `safeWrap` example uses `const`, rest args and
template literals — **do not copy it verbatim**. The Chrome-40-correct
implementation lives in `ui/mods/com.lem0.pat-qol/core/safe.js`; use
`paqol.safeWrap(target, key, wrapper, tag)` where the wrapper is called as
`wrapper.call(this, callOriginal, args)`.

## Node-testable modules

Files under `shared/` must stay pure (no DOM, no PA globals, dependencies
injected) and end with the ES5-safe tail guard:

```js
if (typeof module !== 'undefined' && module.exports) module.exports = thing;
```

Note for tooling: `package.json` must NOT set `"type": "module"`, or node
would treat these `.js` files as ESM and the tail guard dies.
