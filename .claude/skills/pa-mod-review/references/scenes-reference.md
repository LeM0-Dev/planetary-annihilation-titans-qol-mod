# UI scenes reference

The complete set of scene keys PA:TITANS accepts, derived from the shipped engine rather
than from documentation. A key that is not in this list is never looked up, so every file
listed under it is silently never loaded and nothing is reported.

## How scene loading works

`media/ui/main/shared/js/boot_prefix.js` declares `var scene_mod_list = {};`. The mod
manager writes the enabled mods' `scenes` maps into it —
`community-mods-manager.js:1576` builds the file with
`'var scene_mod_list = ' + JSON.stringify(_.omit(scenes, 'global_mod_list'), null, 4)`.

Each UI scene then loads its own slice. From `media/ui/main/shared/js/helpers.js`:

```js
function loadMods(list) {
    var js = /[.]js$/;
    var css = /[.]css$/;
    for (i = 0; i < list.length; i++) {
        mod = list[i];
        if (mod.match(js))  loadScript(mod);
        if (mod.match(css)) loadCSS(mod);
    }
}
```

Consequences that matter for review:

- **Only `.js` and `.css` are acted on.** Anything else in a `scenes` array is silently
  ignored. `media/ui/mods/readme.txt` confirms: *"Only .css and .js files are currently
  supported (html fragments will be supported latter)."*
- **Array order is load order**, and mod files load *after* the base UI files for that
  scene.
- `loadScript` injects via `document.createElement('script')`, so **every scene script
  shares one global scope**. Prefix your globals.
- Images and fonts need no `scenes` entry; only scripts and stylesheets do.
- Paths must be absolute `coui://` URLs.

## `global_mod_list` — not a scene

`readme.txt`: *"Files in the 'global_mod_list' will be loaded for every ui scene, while
files in the 'scene_mod_list' will only be loaded for the labled scene."*

`community-mods-manager.js:1576` explicitly `_.omit`s it when building the scene map, so it
must never be validated as a scene name.

## The 59 scene keys

Two call forms register scene mods. Regenerate after a PA patch with:

```
rg -o "loadMods\(scene_mod_list\[['\"]([a-zA-Z0-9_]+)['\"]" <media>
rg -o "loadSceneMods\(['\"]([a-zA-Z0-9_]+)['\"]"            <media>
```

### Form 1 — `loadMods(scene_mod_list['x'])`, 47 keys

| Scene | Registered in |
|---|---|
| `armory` | `game/armory/armory.js:739` |
| `building_planets` | `game/building_planets/building_planets.js:33` |
| `game_over` | `game/game_over/game_over.js:721` |
| `guide` | `game/guide/guide.js:40` |
| `gw_archive` | `game/galactic_war/gw_start/gw_archive.js:71` |
| `gw_lobby` | `game/galactic_war/gw_lobby/gw_lobby.js:477` |
| `gw_play` | `game/galactic_war/gw_play/gw_play.js:5752` |
| `gw_start` | `game/galactic_war/gw_start/gw_start.js:929` |
| `gw_war_over` | `game/galactic_war/gw_war_over/gw_war_over.js:130` |
| `icon_atlas` | `atlas/icon_atlas/icon_atlas.js:154` |
| `leaderboard` | `game/leaderboard/leaderboard.js:284` |
| `live_game` | `game/live_game/live_game.js:4921` |
| `live_game_action_bar` | `game/live_game/live_game_action_bar.js:527` |
| `live_game_build_bar` | `game/live_game/live_game_build_bar.js:785` |
| `live_game_build_hover` | `game/live_game/live_game_build_hover.js:93` |
| `live_game_celestial_control` | `game/live_game/live_game_celestial_control.js:40` |
| `live_game_chat` | `game/live_game/live_game_chat.js:146` |
| `live_game_control_group_bar` | `game/live_game/live_game_control_group_bar.js:330` |
| `live_game_devmode` | `game/live_game/live_game_devmode.js:71` |
| `live_game_econ` | `game/live_game/live_game_econ.js:303` |
| `live_game_footer` | `game/live_game/live_game_footer.js:21` and `live_game_tutorial.js:112` |
| `live_game_header` | `game/live_game/live_game_header.js:21` |
| `live_game_hover` | `game/live_game/live_game_world_popup.js:212` |
| `live_game_menu` | `game/live_game/live_game_menu.js:75` |
| `live_game_message` | `game/live_game/live_game_message.js:44` |
| `live_game_options_bar` | `game/live_game/live_game_options_bar.js:168` |
| `live_game_paused_popup` | `game/live_game/live_game_paused_popup.js:105` |
| `live_game_pip` | `game/live_game/live_game_pip.js:44` |
| `live_game_planets` | `game/live_game/live_game_planets.js:255` |
| `live_game_players` | `game/live_game/live_game_players.js:503` |
| `live_game_popup` | `game/live_game/live_game_popup.js:104` |
| `live_game_sandbox` | `game/live_game/live_game_sandbox.js:125` |
| `live_game_selection` | `game/live_game/live_game_selection.js:141` |
| `live_game_time_bar` | `game/live_game/live_game_time_bar.js:479` |
| `live_game_time_bar_alerts` | `game/live_game/live_game_time_bar_alerts.js:120` |
| `live_game_unit_alert` | `game/live_game/live_game_unit_alert.js:1102` |
| `new_game_cinematic` | `game/new_game/new_game_cinematic.js:117` |
| `new_game_ladder` | `game/new_game/new_game_ladder.js:716` |
| `replay_browser` | `game/replay_browser/replay_browser.js:487` |
| `save_game_browser` | `game/save_game_browser/save_game_browser.js:95` |
| `settings` | `game/settings/settings.js:494` |
| `shared_build` | `shared/js/build.js:198` |
| `social` | `game/social/social.js:296` |
| `special_icon_atlas` | `atlas/special_icon_atlas/special_icon_atlas.js:37` |
| `system_editor` | `game/system_editor/system_editor.js:2801` |
| `transit` | `game/transit/transit.js:37` |
| `uberbar` | `uberbar/uberbar.js:1289` |

### Form 2 — `loadSceneMods('x')`, 12 keys

| Scene | Registered in |
|---|---|
| `connect_to_game` | `game/connect_to_game/connect_to_game.js:1061` |
| `gw_campaign_loading` | `game/gw_campaign_loading/…:260`, `game/galactic_war/gw_campaign_loading/…:329` |
| `gw_campaign_restart_loading` | `game/gw_campaign_restart_loading/…:147`, `game/galactic_war/…:670` |
| `gw_coop_per_player_loadout` | `game/galactic_war/gw_coop_per_player_loadout/…:351` |
| `gw_reconnect_loading` | `game/gw_reconnect_loading/…:330`, `game/galactic_war/gw_reconnect_loading/…:425` |
| `load_planet` | `game/load_planet/load_planet.js:397` |
| `main` | `ui/main/main.js:201` |
| `matchmaking` | `game/matchmaking/matchmaking.js:534` |
| `new_game` | `game/new_game/new_game.js:3521` |
| `replay_loading` | `game/replay_loading/replay_loading.js:181` |
| `server_browser` | `game/server_browser/server_browser.js:1050` |
| `start` | `game/start/start.js:2407` |

## Two nuances

- **`lobby`** appears in the `ui_mod_list.js` template in `media/ui/mods/readme.txt`, but
  there is **no loader for it in the current build**. The related live scene is `gw_lobby`.
  Files listed under `lobby` are probably never loaded — report as an Area of Concern, not
  a Bug, since the documentation sanctions the name.
- Scene keys are **panel-level**, not screen-level. `live_game_players` is a distinct scene
  from `live_game`. Targeting the parent when you meant the panel is a common mistake and
  fails silently.
