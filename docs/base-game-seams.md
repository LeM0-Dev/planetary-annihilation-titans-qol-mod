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
| `live_game/js/audio.js:1-115` | queue/priority machinery | 3 s queue slot, priorities 0-6, 30 s decay — all closure-private; our arbiter sits in front. **⚠ WHOLE-FILE SHADOW**: `ui/main/game/live_game/js/audio.js` in this mod replaces the base file to make the 30 s decay configurable (`paqol.audioDecayMs`). After EVERY PA patch, diff the shadow against the new base file and re-apply the one marked change (base md5 at time of copy: 64c22eb2). A stale shadow silently reverts base-game audio fixes. |
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
| engine message routing | `watch_list`/`custom_alert`/`time`/`combat_list`/`player_data` | Broadcast to every view declaring the handler in `api.Panel.ready` (time_bar + unit_alert both declare watch_list); our window pages rely on this |
| `live_game/live_game_unit_alert.js:884-906` | combat payload | `{id, planet_id, last_location, average_location, lifespan, last_event_time, damaged_entities[].army_idx}` — the units window's combat rows |
| `ui/main/shared/js/api/worldview.js:15-32` | `getArmyUnits(armyIndex, planetIndex)` | Army-INDEX based and must be queried PER PLANET — `planetIndex -1` returns nothing (verified live). Result keyed by (possibly tagged) spec id |
| verified live, engine binding | `getUnitState(ids)` | Returns `{army (index), planet (index), pos:[x,y,z], orient, vel, health, built_frac, orders, build_target, build, unit_spec}`; empty orders + no build_target = idle; `built_frac < 1` = still under construction (holds its factory rally order while stationary — stuck detection must skip it); dead/unknown ids return a HOLLOW OBJECT (never null) — require `pos` to treat a unit as alive |
| `live_game/live_game.js:875-895` | `player_data` broadcast + `model.playerData` | `{ids, names, colors}` broadcast on CHANGE (races page load — pull once at boot); alliances/army indices are NOT in it, hence the host's `paqol_roster` |
| `live_game/live_game.js:4594-4633` | `model.players()` / `stateToPlayer` | Values seen live: `'self'`, `'allied'`, `'allied_eco'`, `'hostile'`; entries may carry `replay: true` (replay viewing) — engine army indices count them, so never index a filtered roster positionally |
| planet identity | `planetListState().planets[].index` vs `.id` | DIFFERENT numbers (index 2 = id 54939 observed); worldview/unit state speak indices, camera targets need ids |
| `live_game/live_game.js:2699` | `watchlist.setIdleAlertTypes` | Ships EMPTY ("disabled until the alert ui can be cleaned up") — the host repopulates it with `Factory` for idle-factory rows |
| `live_game/live_game.js:4368-4381` | `siconFor` / `sicon_override` | Strategic icon name = spec FILENAME stem unless `sicon_override`; the atlas PNGs encode yellow = army-colour fill, red = glyph drawn black — reproduced with an SVG feColorMatrix |
| watch payload fields | alert shape | `{id, watch_type, spec_id, planet_id, location, army_id, is_hostile, is_allied, unit_types}` |
| `ui/main/game/armory/armory.js:739/746` | injection point | Mods load after `model = new ArmoryViewModel()`, before `ko.applyBindings` — pre-bind template edits bind natively |
| `ui/main/game/armory/armory.js:101-110` | `model.costForCommander` / `formatRM` | Returns 'Owned'/'Locked'/price string; consumed ONLY by the two tile display bindings (armory.html:211-213) — safe to wrap for the 'Purchased' label |
| `ui/main/game/armory/armory.js:391-411` | `model.addItemToCart` / cart item shape | `{Item: PlayFab.getCatalogItem(name), Quantity}` + `createCart()`; the quick-add batch mirrors this shape |
| `ui/main/game/armory/armory.js:619-634` | `model.addCart` | Inlines the cart-tab jump (`$('a[href="#cart"]').click()`) — replaced, not wrapped; body mirrored minus the jump |
| `ui/main/game/armory/armory.html:55/365/381` | `ko if: $root.allowMicroTransactions` | Gates ALL stock cart UI — every mod cart control must gate on it too; NB `$root.addCartExpansion` contains `$root.addCart` as a prefix (anchor filters need the trailing comma) |
| `ui/main/game/armory/armory.js:132-148` | `model.sortCommanders` | Rebuilds the commanders list (available/purchaseable/locked) after every inventory refresh — wrapped to re-apply default/favorites-first order |
| `ui/main/game/armory/armory.js:120` / `CommanderUtility` | `preferredCommander` (`local: 'preferredCommander_v2'`) | JSON spec path in localStorage; gw_start has NO observable for it and reads the key directly |
| `ui/main/shared/js/playfab.js` | `PlayFab.catalog` (ko observable) | `isItemOwned` reads it — computeds over the catalog are reactive to inventory load |
| `ui/main/game/galactic_war/gw_start/gw_start.js:929` | injection point / `model.commanders` | Spec-path strings; stock prev/next carousel walks the array in order; selection is by VALUE |
| GW-AI-Overhaul (`gwo-commander-picker`) | picker grid | Built by GWO's OWN scene script — arrival order vs our mod is undefined; decorate rendered tiles post-bind, never template-edit |
| `ui/main/game/new_game/new_game.js:3521/610-665` | injection point / lobby commander picker | `model.commanders` = spec paths; tiles select by INDEX (`setCommander($index())`); `selectedCommanderIndex` (-1 = preferred) must be remapped after reorder — direct observable write does NOT resend `update_commander` |
| `ui/main/game/galactic_war/gw_play/gw_play.js:650` | `player.moveSpeed` (ko observable, GU/ms) | Travel-speed boost multiplies it; the player VM is REBUILT on every campaign-state reload (`:3225`), so the boost re-applies per instance |
| `ui/main/game/galactic_war/gw_play/gw_play.js:502-520` | `model.galaxy.systems()` star view models | `origin`/`systemDisplay` are EaselJS containers (easeljs 0.7.1) — intel labels are `createjs.Text` children; `star.ai()` is null once a system is conquered |
| GW `star.ai()` payload | `econ_rate`, `minions`, `foes`, `typeOfBuffs`, `bossCommanders`, `mirrorMode`, ... | Threat = GWO's `measureThreat` port (see MNT-002 in the review); re-check when GWO updates |
| `ui/main/game/live_game/live_game.js:2575` | `model.menuConfigGenerator` | Observable HOLDING the ESC-menu generator fn — wrap by replacing the value, re-wrap on change (the GW patch may swap it); `model.isGalaticWar` does NOT exist on the main VM — gate on `model.gameType() === 'Galactic War'` |
| `live_game.js:2707` / watch payload | `watchlist.setAmmoAlertTypes` / `ammo_fraction_change` (watch_type 14) | Registered by the base game for Nuke/NukeDefense; payload carries exact `ammo_count`/`max_ammo_count`. Ammo units are INVISIBLE to getArmyUnits/getUnitState (hollow objects) — alerts are the ONLY ammo source, and no missile build-%% exists |
