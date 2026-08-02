# Base-game seams (verified against PA:TITANS build 124667)

Every base-game behaviour this mod depends on. After a PA patch, re-check each
row against the installed `media/` tree, then bump `build` in `modinfo.json`.
A moved/renamed symbol degrades gracefully: the registry's `requires` probes
disable just the affected feature with a console warning.

All paths relative to `<install>/media/`.

| File:line | Symbol | What we assume |
|---|---|---|
| `ui/main/shared/js/helpers.js:101-126` | `loadMods`/`loadScript` | Mod files load synchronously, in array order, `.js`/`.css` only |
| `ui/main/game/live_game/live_game.js:4920` | injection point | Runs after `model = new LiveGameViewModel()` and all `handlers.*`, before `registerWithCoherent`/`ko.applyBindings` |
| `ui/main/game/live_game/live_game_unit_alert.js:1101` | injection point | Same ordering in the unit_alert panel |
| `ui/main/game/settings/settings.js:493` | injection point | Same ordering in the settings scene |
| `ui/main/shared/js/helpers.js:750` | `api.Panel.ready(_.keys(handlers)...)` | Handler keys are snapshotted at registration; we must never ADD handler keys, only wrap existing ones |
| `live_game/live_game_unit_alert.js:1013` | `handlers.watch_list` | Only calls `processList` `if (model.active())` (window focus) — we wrap the handler, not the model, to capture alerts while alt-tabbed |
| `live_game/live_game_unit_alert.js:1047` | `handlers.custom_alert` | UI-authored alerts arrive here |
| `live_game/live_game.js:4839` | `handlers['panel.invoke']` | `[fn, ...args]` → `model[fn].apply(model, args)`; our cross-panel inbox |
| `live_game/live_game.js:4573` | `handlers.time` | Payload `{view, current_time, end_time, server_rate}`; game clock source (`view === 0`) |
| `live_game/live_game.js:2411` | `model.processExternalUnitEvent` | `(type, payload)`; type < 15 = watch_type forward, >= 15 = derived event |
| `live_game/live_game.js:2699` | `model.setupWatchList` | Called at game start; registers sight/death/target_destroyed for Factory/Commander/Recon/Important/Titan minus Wall — covers every HVT category except Teleporter |
| `live_game/live_game.js:4362` | `model.unitSpecs` | Plain object, spec_id → `{name, sicon, ...}`; ids may carry tags after `.json` |
| `live_game/js/constants.js:3-64` | `constants.watch_type` / `event_type` | watch types 0-14, event types 15-56; `event_type` includes the watch names; append-only |
| `live_game/js/constants.js:66-207` | `constants.unit_type` | Bits: Commander=0, Teleporter=10, Nuke=17, NukeDefense=18, ControlModule=28, PlanetEngine=29, Titan=31, Important=55 (mirrored in `shared/hvt_classify.js`) |
| `live_game/js/events.js:8-14` | `eventSystem.isType` | Bit layout `[3 - floor(bit/32)]`, mask `1 << (bit % 32)` (re-implemented in `hvt_classify`) |
| `live_game/js/audio.js:1135` | `audioModel.processEvent` | The single audio choke point; `(event_type, sub_type)`; returns void |
| `live_game/js/audio.js:1-115` | queue/priority machinery | 3 s queue slot, priorities 0-6, 30 s decay — all closure-private; our arbiter sits in front, never inside |
| `ui/main/shared/js/api/audio.js` | `api.audio.playSoundAtLocation` | Plain property, wrappable; `playSound` is the UI click path — never touched |
| `ui/main/shared/js/api/camera.js:431` | `api.camera.lookAt({location, planet_id, zoom}, smooth)` | Auto-forwards from child panels via `camera_api` |
| `live_game/live_game_unit_alert.js:469` | `/unit_cannon/` path match | The base game itself classifies unit cannons by spec path — no unit_type bit exists |
| `ui/main/game/settings/settings.html:32` | `.tab_cont .tabs .nav-pills` | Tab strip; our `<li>` is appended AFTER the ko virtual foreach block |
| `ui/main/game/settings/settings.html:97` | `.container_settings` | Pane container; panes are hardcoded per index, ours uses sentinel index 900 |
| `ui/main/game/settings/settings.js:105` | `model.activeSettingsGroupIndex` | Session-persisted; we reset it from 900 on beforeunload |
| `ui/main/game/settings/settings.js:391` | `model.restoreGroupDefaults` | Wrapped so the shared footer button resets OUR settings on our tab |
| `ui/main/shared/js/ko_bindings.js:402` | `deferBindingsUntilVisible` | Used by our settings pane |
| `ui/boot.json` | jQuery 2.1.4 / jQuery UI 1.11.4 / ko 3.5.1 / lodash 3.9.3 | jQuery UI custom build includes `draggable` AND `resizable` |
| `ui/main/shared/js/api/panel.js:288` | `api.Panel.bindElement` / `bindPanels` | `<panel>` elements become engine views from JS; a dynamically appended element binds fine |
| `ui/main/shared/js/api/panel.js:2` | `DEFAULT_UPDATE_PERIOD = 200` | Region poll rate; host calls `panel.update()` manually during drags |
| `live_game.html` (structure) | 31 `<panel>` + `<holodeck>` elements | live_game's OWN pixels are never composited — mod UI must be a panel page |
| engine message routing | `watch_list`/`custom_alert`/`time` | Broadcast to every view declaring the handler in `api.Panel.ready` (time_bar + unit_alert both declare watch_list); our window pages rely on this |
| watch payload fields | alert shape | `{id, watch_type, spec_id, planet_id, location, army_id, is_hostile, is_allied, unit_types}` |
