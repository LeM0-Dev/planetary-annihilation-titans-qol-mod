# PA:TITANS Mod Coding Rules

> **Purpose:** A strict, small rule set for reliable Planetary Annihilation: TITANS mods. These rules apply to JavaScript, JSON specifications, UI integrations, server scripts, AI logic, and build/packaging tools.

---

## Rule 1 — Verify every required assumption

Never assume that a scene model, API, function, observable, file, unit, or JSON property exists.

At initialization boundaries, use an invariant check that fails with a precise message:

```javascript
function invariant(condition, message, modId) {
  if (!condition) {
    throw new Error(`[${modId}] ${message}`);
  }
}

invariant(window.model && typeof model === "object",
  "Expected a scene model.", MOD_ID);
invariant(window.api && api.mods && typeof api.mods.getMounted === "function",
  "Expected api.mods.getMounted().", MOD_ID);
```

For optional functionality, do not throw. Log a warning and skip only that feature:

```javascript
if (!model.optionalPanel) {
  console.warn(`[${MOD_ID}] Optional panel unavailable; integration disabled.`);
  return;
}
```

**Assertions do not replace input validation.** Assert internal invariants; validate data received from files, APIs, users, other mods, and the game runtime.

---

## Rule 2 — Never swallow an error

Every caught error must result in one of these outcomes:

1. it is rethrown with more context;
2. it is logged with the mod ID and relevant operation;
3. the affected optional feature is disabled safely;
4. the original host behavior is restored or used as fallback.

Forbidden:

```javascript
try {
  riskyOperation();
} catch (error) {
  // ignored
}
```

Required pattern:

```javascript
try {
  riskyOperation();
} catch (error) {
  console.error(`[${MOD_ID}] Could not update the build panel.`, error);
  disableBuildPanelExtension();
}
```

Do not use exceptions as normal control flow.

---

## Rule 3 — Initialization must be idempotent

A scene may reload, reconnect, or mount code more than once. Running initialization twice must not duplicate handlers, DOM nodes, subscriptions, timers, or model patches.

```javascript
const LOAD_GUARD = "__comExampleMyModLoaded";

if (window[LOAD_GUARD]) {
  console.warn(`[${MOD_ID}] Duplicate initialization skipped.`);
  return;
}

window[LOAD_GUARD] = true;
```

Also assign stable IDs/classes to injected DOM elements and check for them before insertion. Store and dispose subscriptions/timers when the scene supports cleanup.

---

## Rule 4 — Preserve host behavior when patching

Before wrapping or replacing a game function:

- verify that the target is a function;
- retain the original reference;
- preserve `this`, arguments, and return value;
- call the original unless the change intentionally replaces it;
- fall back to the original if the wrapper fails;
- never patch the same function twice.

```javascript
function safeWrap(target, key, wrapper) {
  if (!target || typeof target[key] !== "function") {
    console.warn(`[${MOD_ID}] ${key} is not patchable.`);
    return false;
  }

  const original = target[key];

  target[key] = function wrapped(...args) {
    try {
      return wrapper.call(this, original.bind(this), ...args);
    } catch (error) {
      console.error(`[${MOD_ID}] ${key} wrapper failed.`, error);
      return original.apply(this, args);
    }
  };

  return true;
}
```

A mod must not break the base game merely because its enhancement failed.

---

## Rule 5 — Validate all data and references before runtime

Every release build must automatically or manually verify:

- all JSON parses as strict JSON;
- every `base_spec` exists;
- every unit/tool/ammo/effect path exists;
- every `scenes` resource exists;
- required units are present in `pa/units/unit_list.json`;
- dependency and companion identifiers are valid;
- path casing exactly matches packaged files;
- the ZIP contains `modinfo.json` at its root.

Do not rely on Windows' case-insensitive filesystem. Treat every path as case-sensitive.

A missing required reference is a release-blocking error, not a warning.

---

## Rule 6 — Required values fail; optional values fall back visibly

Classify each value before coding:

- **Required:** absence makes the feature invalid. Stop that feature and report an error.
- **Optional:** absence permits a documented fallback. Log once at warning or debug level.
- **Derived:** calculate it from verified inputs and validate the result.

Never silently invent a required value.

Bad:

```javascript
const unitPath = config.unitPath || "/pa/units/default.json";
```

Good:

```javascript
if (typeof config.unitPath !== "string" || config.unitPath.length === 0) {
  throw new Error(`[${MOD_ID}] Required config.unitPath is missing.`);
}
```

A fallback must be intentional, documented, and safe.

---

## Rule 7 — Keep changes minimal and namespaced

A mod must modify the smallest possible surface.

- use unique paths under `ui/mods/<identifier>/`;
- keep variables in an IIFE/module scope;
- prefix unavoidable globals, CSS classes, DOM IDs, storage keys, and log messages with the mod identifier;
- prefer scene injection over replacing an entire base UI file;
- prefer `base_spec` plus intentional overrides over copied full unit specs;
- do not load remote code;
- do not alter user settings or persistent data without explicit permission.

Every additional shadowed base file is a compatibility liability and must be justified.

---

## Rule 8 — Log actionable context, once

Every error log must answer:

- which mod failed;
- what operation failed;
- which scene/unit/path was involved when relevant;
- what safe action was taken;
- the original error/stack.

Good:

```javascript
console.error(
  `[${MOD_ID}] Failed to register live_game panel; panel integration disabled.`,
  error
);
```

Avoid per-frame or per-tick log spam. Repeated recoverable failures must be rate-limited or logged once. Logs that flood the console hide the first useful error.

---

## Rule 9 — Zero-error testing is the release gate

Do not publish while the mod produces a known client/server error or warning attributable to its code.

The minimum release matrix is:

- clean game restart;
- no other mods;
- only declared dependencies;
- representative common mods;
- initial load and reload/reconnect;
- host and joining client for server mods;
- spectator/replay scenes where relevant;
- AI paths for new units/gameplay;
- Windows and Linux-style case-sensitive path verification;
- deliberately missing optional data;
- clean installation from the final ZIP.

A test is not complete until logs have been inspected. A feature that appears correct while producing an exception is not correct.

---

## Mandatory review questions

Before merging or releasing code, answer **yes** to all of these:

- Are all required assumptions checked?
- Does every catch block report or safely handle the error?
- Can initialization run twice without duplication?
- Can a failed wrapper fall back to base-game behavior?
- Are all referenced files and identifiers verified?
- Are required and optional values handled differently?
- Is the change isolated and namespaced?
- Are logs actionable and non-spamming?
- Does the final ZIP pass the zero-error test matrix?

If any answer is **no**, the change is not ready.