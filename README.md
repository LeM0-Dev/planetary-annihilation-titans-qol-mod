# PA QoL

Quality-of-life client mod for **Planetary Annihilation: TITANS**.
Identifier `com.lem0.pa-qol`, tested against build 124667.

## Features

- **Notification priority** — enable/disable any voice notification and give
  it a priority (0–6). A "metal storage full" line can no longer stomp
  "commander under attack". Visual alerts are untouched; only audio is gated,
  and every unknown case fails open (vanilla behaviour).
- **Notification history** — a movable, resizable window with every
  notification of the match, stamped with game time, newest first. Click a
  row to jump the camera to where it happened. Unlike the stock 5-slot strip,
  nothing expires after 10 seconds and alerts that arrive while you are
  alt-tabbed are kept.
- **Enemy targets** — a movable, resizable window listing every spotted enemy
  high-value target: commanders, Titans, nuke launchers, anti-nukes, unit
  cannons, Catalysts, Halleys (teleporters opt-in). Click to jump there.
  Entries disappear on confirmed kill and dim when the sighting is stale.

Configure everything under **Settings → PA QOL** (works from the main menu
and in-game). Window layout changes apply at the start of the next game.

## Install (development)

```sh
tools/install-symlink.sh     # symlinks this repo into PA's client_mods/
# if PA does not list the mod after a restart, fall back to:
tools/install-copy.sh
```

Then enable **PA QoL** under Community Mods → Installed and restart PA.
Client mods mount at boot; there is no reliable hot reload — restart after
every change.

## Development

```sh
npm install        # dev tooling only; nothing here ships
npm run check      # eslint (ES5 over ui/mods/**) + node --test + release gate
npm run package    # dist/com.lem0.pa-qol-<version>.zip
```

Read these before writing code:

- [`docs/architecture.md`](docs/architecture.md) — layout, feature registry,
  data flow
- [`docs/chrome40-house-rules.md`](docs/chrome40-house-rules.md) — the UI
  engine is ES5-only; what is banned and why
- [`docs/base-game-seams.md`](docs/base-game-seams.md) — every base-game
  file:line we depend on; re-diff after each PA patch
- [`docs/manual-test-checklist.md`](docs/manual-test-checklist.md) — the
  release gate that node cannot run
- [`AGENTS.md`](AGENTS.md), [`PA-MOD-CODING-RULES.md`](PA-MOD-CODING-RULES.md),
  [`OFFICIAL-DEV-INFO.md`](OFFICIAL-DEV-INFO.md) — mandatory policy

## Adding a feature

1. Create `ui/mods/com.lem0.pa-qol/features/<name>/feature.js`:

   ```js
   (function () {
       'use strict';
       paqol.registry.add({
           id: 'my_feature',
           scenes: ['live_game'],
           requires: ['model', 'ko'],   // dotted window paths, probed
           init: function (ctx) { /* ... */ }
       });
   })();
   ```

2. Add the file(s) to the matching `scenes` arrays in `modinfo.json`.
3. Pure logic goes in `shared/` with a `module.exports` tail guard and a test
   in `test/`.

A feature that throws in `init` is disabled alone with a console error; a
feature whose `requires` are missing (PA patch moved a seam) is skipped with
a warning. Other features keep running either way.
