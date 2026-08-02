# PA QoL — architecture

Client mod, identifier `com.lem0.pa-qol`. The repo root is the mod root:
`modinfo.json` and `ui/` sit at the top so a single symlink into
`client_mods/` works and the release ZIP is `zip modinfo.json ui`.

## Layout

```
ui/mods/com.lem0.pa-qol/
├── core/       scene-glue: namespace, logger, invariants, safeWrap,
│               feature registry, localStorage store, cross-panel bus,
│               game clock, constants reverse-maps, floating panel widget
├── shared/     PURE logic — no DOM, no PA globals. Every file has a
│               module.exports tail guard and is tested by node --test.
├── features/   one directory per feature
└── scenes/     one boot file per scene; claims the scene guard and runs
                the registry
```

## The registry

Every feature calls `paqol.registry.add({id, scenes, requires, init})` at file
load. The scene boot file calls `paqol.registry.run(scene)`, which:

- skips features not declared for this scene,
- skips (warn) features whose `requires` probes (dotted window paths) fail,
- catches a throwing `init` so one broken feature never takes down another,
- dedupes on `id@scene` so double injection is a no-op.

Each mod file is its own `<script>` element, so even a *syntax* error is
contained to one file: the feature simply never registers.

**Adding a feature** = create `features/<name>/`, call `registry.add`, list
the files in the relevant `scenes` arrays in `modinfo.json`. Nothing else.

## The compositing model (learned the hard way)

**`live_game.html` is a coordinator page — its own pixels are never drawn.**
Everything visible on screen is either a `<holodeck>` (3D view) or a
`<panel>` element: a separate page composited by the ENGINE at the element's
layout box (`api/panel.js` polls the box and `engine.call('panel.move')`s the
view). DOM injected into live_game lays out and hit-tests but never renders.
Input is region-based per panel, so a full-screen overlay panel would eat all
world input.

Therefore each QoL window is its **own small `<panel>`**, created dynamically
by `features/qol_windows/host.js` and bound with `api.Panel.bindElement`.

## Data flow (v0.2)

```
engine broadcasts                    panels/window.html × 2
(watch_list / custom_alert / time    ('paqol_history', 'paqol_hvt' — role from
 go to EVERY view declaring the       api.Panel.pageName; content, rows,
 handler in api.Panel.ready)  ──────▶ camera-jump live here)
                                              ▲ 'paqol_event', 'paqol_state'
live_game (features/qol_windows/host.js)      │
  creates the <panel> elements ───────────────┘
  owns geometry: drag/resize/minimize/persist/clamp
  forwards derived events (nuke_ready, ...) from its
    processExternalUnitEvent wrap
  child streams cursor coords via handlers['panel.invoke']
    (model.paqolWinDragStart/Move/End, ResizeStart/Move/End, ToggleMin);
    host also tracks its own mousemove for when the cursor
    escapes the small child view onto the holodeck

notify_priority (audio arbiter) is unchanged: wraps audioModel.processEvent
in live_game AND live_game_unit_alert (two independent audio queues).
```

- Game time: each window page declares its own `handlers.time`
  (`payload.current_time` at `view === 0`). Unknown time renders `--:--`,
  never wall clock.
- History/HVT state lives in the window pages, whose lifetime is exactly one
  game — no game_start plumbing needed.
- Settings are shared through `localStorage` (one origin for all
  `coui://ui/...` scenes). The live scenes re-read config at most every 2 s
  (`store.reload`).
- Window pages load their scripts via their own `<script>` tags (the engine's
  `boot.json` gives every view jQuery/ko/lodash/api); only scene pages use
  the modinfo `scenes` map.

## Persistence

`paqol.store` — namespaced (`com.lem0.pa-qol/<name>`), versioned envelope
`{v, d}`, validated on read and write, migrations on version bumps, corrupt
data backed up to `<key>.corrupt.<epoch>` and replaced with defaults, writes
debounced 250 ms, quota failures disable persistence for the session with one
error. Stores: `notifications`, `prefs`, `cuemap`, `ui` (panel geometry).

History rows are **never** persisted — in-memory ring only.

## Audio arbiter (notify_priority)

Two levers, no shadowed files:

1. Wrap `audioModel.processEvent` (the single choke point every notification
   funnels through). Disabled events are dropped; a lower-priority line inside
   the stomp window (default 3000 ms, mirroring the base game's 3 s queue
   slot) while a higher one is in flight is dropped. Fails OPEN on unknown
   events, unconfigured events, config errors, and wrapper exceptions; a
   circuit breaker (>40 denials/10 s) bypasses the arbiter for the session.
2. Wrap `api.audio.playSoundAtLocation` to learn cue→event pairs while lever 1
   is delegating, and drop later-queued cues positively known to belong to a
   disabled event. Never suppresses an unlearned cue. `api.audio.playSound`
   (UI click/rollover) is deliberately untouched.

Registered in both `live_game` and `live_game_unit_alert` — each scene loads
its own copy of `js/audio.js` (two independent queues), matching the base game.

## Chrome 40 rules

See [chrome40-house-rules.md](chrome40-house-rules.md). Enforced by
`eslint` (`ecmaVersion: 5` over `ui/mods/**`) and the lexical bans in
`tools/check-modinfo.mjs`.

## Base-game seams

Every base-game file:line this mod depends on is listed in
[base-game-seams.md](base-game-seams.md). Re-diff that list after every PA
patch and bump `build` in `modinfo.json`.
