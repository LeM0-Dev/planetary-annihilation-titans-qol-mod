"use strict";
// The complete set of UI scene keys accepted by PA:TITANS.
//
// Derived from the engine, not from documentation or from what other mods happen
// to use. Two call forms register scene mods; both were enumerated across
// `media`. Regenerate after a PA patch with:
//
//   rg -o "loadMods\(scene_mod_list\[['\"]([a-zA-Z0-9_]+)['\"]" <media>
//   rg -o "loadSceneMods\(['\"]([a-zA-Z0-9_]+)['\"]"            <media>
//
// A key absent from this set means the mod's files are never loaded and PA
// reports nothing at all, which is why an unknown key is a Bug and not cosmetic.

// Form 1: `if (scene_mod_list['x']) loadMods(scene_mod_list['x']);` — 47 keys.
const SCENES_LOADMODS = [
  "armory",
  "building_planets",
  "game_over",
  "guide",
  "gw_archive",
  "gw_lobby",
  "gw_play",
  "gw_start",
  "gw_war_over",
  "icon_atlas",
  "leaderboard",
  "live_game",
  "live_game_action_bar",
  "live_game_build_bar",
  "live_game_build_hover",
  "live_game_celestial_control",
  "live_game_chat",
  "live_game_control_group_bar",
  "live_game_devmode",
  "live_game_econ",
  "live_game_footer",
  "live_game_header",
  "live_game_hover",
  "live_game_menu",
  "live_game_message",
  "live_game_options_bar",
  "live_game_paused_popup",
  "live_game_pip",
  "live_game_planets",
  "live_game_players",
  "live_game_popup",
  "live_game_sandbox",
  "live_game_selection",
  "live_game_time_bar",
  "live_game_time_bar_alerts",
  "live_game_unit_alert",
  "new_game_cinematic",
  "new_game_ladder",
  "replay_browser",
  "save_game_browser",
  "settings",
  "shared_build",
  "social",
  "special_icon_atlas",
  "system_editor",
  "transit",
  "uberbar",
];

// Form 2: `loadSceneMods('x')` — 12 further keys.
const SCENES_LOADSCENEMODS = [
  "connect_to_game",
  "gw_campaign_loading",
  "gw_campaign_restart_loading",
  "gw_coop_per_player_loadout",
  "gw_reconnect_loading",
  "load_planet",
  "main",
  "matchmaking",
  "new_game",
  "replay_loading",
  "server_browser",
  "start",
];

const VALID_SCENES = new Set(
  SCENES_LOADMODS.concat(SCENES_LOADSCENEMODS)
);

// Not a scene. Files here load into *every* scene. community-mods-manager.js
// explicitly `_.omit`s it when building the scene map, so it must never be
// validated as a scene name.
const GLOBAL_MOD_LIST = "global_mod_list";

// Present in the `ui_mod_list.js` template in media/ui/mods/readme.txt, but no
// loader for it exists in the current build (`gw_lobby` does). Reported as an
// Area of Concern — likely dead — never as a Bug, since the documentation
// sanctions it.
const DOCUMENTED_BUT_UNLOADED = new Set(["lobby"]);

// Only these extensions are acted on. readme.txt: "Only .css and .js files are
// currently supported (html fragments will be supported latter)." Confirmed in
// media/ui/main/shared/js/helpers.js loadMods(), which tests /[.]js$/ and
// /[.]css$/ and silently ignores everything else.
const LOADABLE_EXTENSIONS = [".js", ".css"];

module.exports = {
  VALID_SCENES,
  SCENES_LOADMODS,
  SCENES_LOADSCENEMODS,
  GLOBAL_MOD_LIST,
  DOCUMENTED_BUT_UNLOADED,
  LOADABLE_EXTENSIONS,
};
