# Planetary Annihilation: TITANS — Mod Developer Information

> **Status:** Consolidated developer reference, last verified **2026-08-01**.  
> **Important:** This is not an official SDK manual published as a single document by Planetary Annihilation Inc. The original modding documentation is archived and fragmented. This guide combines that documentation with current official repositories and actively maintained mods. When sources disagree, use the following order of authority:
>
> 1. The files shipped with your current game build.
> 2. Current official Planetary Annihilation repositories and mods.
> 3. Current maintained community mods.
> 4. The archived PA Lobby modding wiki.

---

## 1. What a PA:TITANS mod is

Planetary Annihilation is heavily data-driven. A mod normally supplies files that are mounted into the game's virtual filesystem. Depending on the path, those files either:

- add new content;
- replace an existing file at the same virtual path;
- inject JavaScript or CSS into a UI scene;
- modify server-side game data, lobby logic, AI, units, weapons, maps, or effects.

The game does not require a traditional compiled SDK for most mods. Typical mod content consists of:

- JSON specifications;
- JavaScript;
- HTML and CSS;
- images and strategic icons;
- `.papa` models, textures, and effects;
- `.pas` system/map files.

### Main mod contexts

| Context | Runs where | Typical uses | Multiplayer authority |
|---|---|---|---|
| **Client mod** | Local client | UI, alerts, hotkeys, panels, icons, visual effects, map packs | Cannot authoritatively change unit simulation data in multiplayer |
| **Server mod** | Game server and mounted clients | Units, weapons, balance, AI, economy, lobby rules, gameplay | Authoritative for simulation/gameplay changes |
| **Companion client mod** | Downloaded/mounted alongside a server mod | Large UI or visual assets associated with a server mod | Declared by the server mod to reduce server-side package weight |

References:

- [Client mods](https://wiki.palobby.com/wiki/Planetary_Annihilation_Client_Mods)
- [Server mods](https://wiki.palobby.com/wiki/Planetary_Annihilation_Server_Mods)
- [Community Mods](https://wiki.palobby.com/wiki/Planetary_Annihilation_Community_Mods)

---

## 2. Install and data directories

There are two different roots you must understand.

### 2.1 Game installation directory

The installed game contains the current base files. Its important content is normally under:

```text
<PA_INSTALL_DIRECTORY>/media/
```

Treat the installed `media` directory as the source of truth for the current build. Archived web documentation and public source mirrors may be older.

Common areas:

```text
media/
├── pa/
│   ├── units/
│   ├── ammo/
│   ├── effects/
│   ├── terrain/
│   └── ...
├── ui/
│   └── main/
│       ├── game/
│       ├── shared/
│       ├── atlas/
│       └── uberbar/
└── server-script/
    ├── main.js
    └── states/
```

Do not edit installed base files directly. Copy only the files you need into a mod, preserving their virtual paths.

### 2.2 User data directory

Official troubleshooting documentation lists these locations:

| Platform | User data directory |
|---|---|
| Windows | `%LOCALAPPDATA%\Uber Entertainment\Planetary Annihilation` |
| macOS | `~/Library/Application Support/Uber Entertainment/Planetary Annihilation` |
| Linux | `~/.local/Uber Entertainment/Planetary Annihilation/` |

This directory contains logs, local storage, downloaded Community Mods, and local development mods.

Reference: [Official troubleshooting and data-directory locations](https://planetaryannihilation.com/support/troubleshooting/)

### 2.3 Local mod folders

The archived documentation calls the local folders:

```text
client_mods/
server_mods/
```

Current community projects commonly install client development mods under:

```text
mods/
```

Server mods still commonly use:

```text
server_mods/
```

Because this changed across eras/builds, inspect the existing folders in your user data directory and the paths used by a current local mod. Do not assume that an old tutorial's `client_mods` name is correct for every current installation.

Each locally installed mod gets its own directory:

```text
<USER_DATA>/mods/com.example.my-mod/
<USER_DATA>/server_mods/com.example.my-mod/
```

---

## 3. Create a stable mod identity

Use a globally unique, lowercase identifier. Reverse-domain notation is conventional:

```text
com.example.my-mod
```

Good identifiers:

```text
com.alex.alerts
net.example.expanded-units
org.teamname.ai-overhaul
```

Avoid:

- spaces;
- uppercase letters;
- an identifier copied from another mod;
- a generic name such as `better-ui`;
- changing the identifier after publication.

Use the same identifier for:

- the local directory name;
- `modinfo.json`;
- the unique UI path under `ui/mods/`;
- log prefixes;
- global duplicate-load guards, when one is unavoidable.

Archived tutorial: [Creating Your First Planetary Annihilation Mod](https://wiki.palobby.com/wiki/Creating_Your_First_Planetary_Annihilation_Mod)

---

## 4. `modinfo.json`

Every mod requires a `modinfo.json` at the root of the mod package.

### 4.1 Safe client-mod baseline

```json
{
  "context": "client",
  "identifier": "com.example.my-ui-mod",
  "display_name": "My UI Mod",
  "description": "One-sentence description of the feature.",
  "author": "Your Name",
  "version": "0.1.0",
  "build": "CURRENT_GAME_BUILD",
  "date": "2026-08-01",
  "signature": "",
  "forum": "",
  "priority": 100,
  "category": ["ui", "titans"],
  "titansOnly": true,
  "scenes": {
    "live_game": [
      "coui://ui/mods/com.example.my-ui-mod/live_game.js"
    ]
  }
}
```

### 4.2 Safe server-mod baseline

```json
{
  "context": "server",
  "identifier": "com.example.my-gameplay-mod",
  "display_name": "My Gameplay Mod",
  "description": "One-sentence description of the gameplay change.",
  "author": "Your Name",
  "version": "0.1.0",
  "build": "CURRENT_GAME_BUILD",
  "date": "2026-08-01",
  "signature": "",
  "forum": "",
  "priority": 100,
  "category": ["gameplay", "units", "titans"],
  "titansOnly": true
}
```

Replace `CURRENT_GAME_BUILD` with the build you actually tested. Do not copy a stale build number from this guide or another mod.

### 4.3 Important fields

| Field | Purpose |
|---|---|
| `context` | `client` or `server` |
| `identifier` | Permanent unique ID |
| `display_name` | Human-readable name in Community Mods |
| `description` | Brief description shown to users |
| `author` / `authors` | Author metadata |
| `version` | Your release version; semantic versioning is recommended |
| `build` | PA build against which the mod was tested |
| `date` | Release date, normally `YYYY-MM-DD` in UTC |
| `priority` | Relative mounting/loading priority; do not use it as a substitute for explicit dependencies |
| `category` | Search/discovery categories |
| `scenes` | UI scene IDs and injected files |
| `dependencies` | Required mods by identifier |
| `companions` | Companion client mods for a server mod |
| `titansOnly` | Restricts the mod to TITANS |
| `classicOnly` | Restricts the mod to classic PA |
| `github` | Source/repository metadata when used by the manager/ecosystem |

The archived schema describes several fields as mandatory. Current official examples sometimes leave fields such as `signature`, `forum`, or `category` empty. Keep the keys for broad compatibility, but validate against a current working mod and Community Mods behavior.

References:

- [Archived Mod Structure reference](https://wiki.palobby.com/wiki/Mod_Structure)
- [Current official PA Service Mod `modinfo.json`](https://github.com/planetary-annihilation/pa-service-mod/blob/main/modinfo.json)
- [Current Queller AI development `modinfo.json`](https://github.com/Quitch/Queller-AI/blob/develop/modinfo.json)

### 4.4 Scene paths

Scene resources use the `coui://` virtual protocol:

```json
{
  "scenes": {
    "new_game": [
      "coui://ui/mods/com.example.my-mod/new_game.js"
    ],
    "live_game": [
      "coui://ui/mods/com.example.my-mod/live_game.css",
      "coui://ui/mods/com.example.my-mod/live_game.js"
    ]
  }
}
```

Use only the scenes your feature needs. Global injection increases conflicts and makes failures harder to isolate.

---

## 5. Minimal client UI mod

### 5.1 Directory structure

```text
com.example.my-ui-mod/
├── modinfo.json
└── ui/
    └── mods/
        └── com.example.my-ui-mod/
            ├── live_game.js
            └── live_game.css
```

The path beneath `ui/mods/` should be unique to your mod.

### 5.2 Defensive JavaScript bootstrap

```javascript
(function bootstrapMyMod() {
  "use strict";

  const MOD_ID = "com.example.my-ui-mod";
  const LOAD_GUARD = "__comExampleMyUiModLoaded";

  function invariant(condition, message) {
    if (!condition) {
      throw new Error(`[${MOD_ID}] ${message}`);
    }
  }

  function initialize() {
    if (window[LOAD_GUARD]) {
      console.warn(`[${MOD_ID}] Duplicate initialization skipped.`);
      return;
    }

    invariant(typeof window.model === "object" && window.model !== null,
      "Expected the scene model to exist.");
    invariant(typeof window.ko === "object" && window.ko !== null,
      "Expected Knockout to be available.");

    window[LOAD_GUARD] = true;

    // Register observables, subscriptions, or DOM work here.

    console.info(`[${MOD_ID}] Initialized.`);
  }

  try {
    initialize();
  } catch (error) {
    console.error(`[${MOD_ID}] Initialization failed.`, error);
  }
}());
```

This pattern:

- keeps variables out of the global scope;
- detects accidental duplicate loading;
- verifies required host objects;
- reports failures with the mod identifier;
- prevents one optional feature from crashing the whole scene bootstrap.

### 5.3 UI technologies and compatibility

The UI is based on HTML, CSS, JavaScript, KnockoutJS, jQuery, and Coherent UI/Chromium. Compatibility may differ from modern browsers. Do not assume that a newly standardized browser API is supported. Feature-detect APIs and inspect the runtime used by the current game.

Useful references:

- [User Interface Modding](https://wiki.palobby.com/wiki/User_Interface_Modding)
- [Example Mod: Chat Alert](https://wiki.palobby.com/wiki/Example_Mod_Chat_Alert)
- [New Game scene](https://wiki.palobby.com/wiki/New_game_user_interface_scene)
- [Live Game scene](https://wiki.palobby.com/wiki/Live_game_user_interface_scene)
- [Official public `pa-ui` mirror](https://github.com/planetary-annihilation/pa-ui)
- [Official UI `ui/main` tree](https://github.com/planetary-annihilation/pa-ui/tree/master/ui/main)

The public `pa-ui` repository is useful for orientation but is old. Prefer your installed `media/ui/` files when identifying current scene names, model members, and APIs.

### 5.4 Avoid whole-file UI replacement

Prefer:

- scene injection through `modinfo.json`;
- small DOM additions;
- subscriptions to existing observables;
- narrowly scoped function wrappers;
- CSS under a namespaced parent class or ID.

Avoid replacing an entire base HTML or JavaScript file unless no injection point exists. Whole-file shadowing conflicts with game updates and other mods.

### 5.5 Wrapping host functions safely

```javascript
function wrapFunction(target, key, wrapper, modId) {
  if (!target || typeof target[key] !== "function") {
    console.warn(`[${modId}] Cannot wrap ${key}; expected a function.`);
    return false;
  }

  const original = target[key];

  target[key] = function wrappedFunction(...args) {
    try {
      return wrapper.call(this, original.bind(this), ...args);
    } catch (error) {
      console.error(`[${modId}] Wrapper for ${key} failed; using original.`, error);
      return original.apply(this, args);
    }
  };

  return true;
}
```

A wrapper must preserve `this`, arguments, return behavior, and a safe fallback to the original implementation.

---

## 6. Minimal server/gameplay mod

Gameplay modifications usually rely on exact virtual-path replacement. To modify an existing unit:

1. Find the current file under the installed `media/` directory.
2. Copy it into the mod under the same path relative to `media/`.
3. Change only the required fields.
4. Preserve all referenced paths and casing.
5. Restart/reload the relevant game/server context and inspect logs.

Example:

```text
Base file:
<INSTALL>/media/pa/units/land/bot_bomb/bot_bomb.json

Mod file:
<com.example.my-mod>/pa/units/land/bot_bomb/bot_bomb.json
```

The mod's file shadows the base file at runtime.

Reference: [Example Mod: Bigger Boom Bot](https://wiki.palobby.com/wiki/Example_Mod_Bigger_Boom_Bot)

### 6.1 Prefer inheritance for new specs

Unit JSON supports `base_spec`. Use it when creating a related unit so your file contains only intentional overrides:

```json
{
  "base_spec": "/pa/units/land/assault_bot/assault_bot.json",
  "display_name": "My Assault Bot",
  "description": "A modified assault unit.",
  "max_health": 600
}
```

Benefits:

- smaller diffs;
- easier review;
- fewer stale copied properties;
- better compatibility when base values change.

Do not inherit blindly. Verify that the base file exists in the current build and that inherited values are appropriate.

References:

- [Unit Specs](https://wiki.palobby.com/wiki/Planetary_Annihilation_Unit_Specs)
- [Unit Types](https://wiki.palobby.com/wiki/Planetary_Annihilation_Unit_Types)
- [Tool Types](https://wiki.palobby.com/wiki/Planetary_Annihilation_Tool_Types)

### 6.2 Adding a complete new unit

A new unit often requires more than one JSON file. Verify every applicable item:

- unit spec;
- model/mesh and material references;
- build arm or weapon tool specs;
- ammunition specs;
- effects and audio references;
- strategic icon;
- build-bar image;
- `pa/units/unit_list.json` registration;
- a builder's `buildable_types` or explicit build list;
- AI unit maps, priorities, or build logic;
- localization/display text;
- build-bar/UI placement;
- wreckage or feature specs, if applicable.

Actively maintained Legion development documentation is one of the best practical examples:

- [Legion Expansion repository](https://github.com/Legion-Expansion/Legion-Expansion)
- [Legion source tree](https://github.com/Legion-Expansion/Legion-Expansion/tree/develop/src)
- [Legion contributing guide](https://github.com/Legion-Expansion/Legion-Expansion/blob/develop/CONTRIBUTING.md)
- [Legion development installer](https://github.com/Legion-Expansion/Legion-Expansion/blob/develop/src/install_devel.py)

### 6.3 Case sensitivity is mandatory

Windows may allow a wrongly cased path to appear to work. Linux generally will not. Treat all paths and references as case-sensitive on every platform.

Bad:

```text
/pa/Units/Land/My_Unit/My_Unit.json
```

Good, assuming the actual files use this casing:

```text
/pa/units/land/my_unit/my_unit.json
```

---

## 7. Server scripts and lobby logic

Server-side JavaScript is mounted under the `server-script` virtual tree. Important current-installation locations include:

```text
media/server-script/main.js
media/server-script/states/
media/server-script/states/lobby.js
```

The official public mirror provides a useful map of the architecture:

- [Official `pa-server-script` repository](https://github.com/planetary-annihilation/pa-server-script)
- [`server-script` tree](https://github.com/planetary-annihilation/pa-server-script/tree/master/server-script)
- [Lobby state](https://github.com/planetary-annihilation/pa-server-script/blob/master/server-script/states/lobby.js)

As with `pa-ui`, the public mirror is historical. Inspect the files shipped with your current build before patching or shadowing server behavior.

When altering lobby/server code:

- validate every expected state/member before use;
- keep patches narrow;
- preserve original behavior for unsupported cases;
- avoid persistent changes outside the match;
- never trap users in UI or prevent them from leaving a game;
- do not modify user settings or data without explicit permission.

---

## 8. AI mods

AI mods may alter build conditions, unit maps, personalities, priorities, and server-side AI behavior. Start from a current working AI project rather than an old isolated snippet.

Best current reference:

- [Queller AI repository](https://github.com/Quitch/Queller-AI)
- [Queller AI game-data tree](https://github.com/Quitch/Queller-AI/tree/develop/pa/ai_queller)
- [Queller development `modinfo.json`](https://github.com/Quitch/Queller-AI/blob/develop/modinfo.json)

General rules:

- check that every referenced unit exists;
- handle missing optional units explicitly;
- test on multiple planet types and map sizes;
- test economy collapse and recovery paths;
- log invalid build conditions rather than silently returning misleading values;
- avoid infinite retry loops when a build choice is impossible.

Archived AI documentation is indexed here:

- [PA Modding category index](https://wiki.palobby.com/wiki/Category:Modding)

---

## 9. Maps and systems

PA system files use the `.pas` format and are JSON-based. A system can define planets, positions, landing zones, biome settings, and other map metadata.

Reference:

- [TITANS & Classic Maps](https://wiki.palobby.com/wiki/Planetary_Annihilation_Titans_%26_Classic_Maps)

For a map pack:

1. export and test each system in the current game;
2. retain valid JSON and unique system names;
3. package the `.pas` files in the expected client-mod layout;
4. test spawn counts and landing zones with every supported player count;
5. verify that required custom biomes or assets are declared and packaged.

---

## 10. Models, textures, effects, and shaders

PA uses `.papa` resources for many binary assets. Conversion and authoring workflows differ by asset type.

Important references:

- [PAPA format specification](https://wiki.palobby.com/wiki/Planetary_Annihilation_Papa_Spec)
- [Custom Skybox example](https://wiki.palobby.com/wiki/Example_Mod_Custom_Skybox)
- [Particle System](https://wiki.palobby.com/wiki/Particle_System)
- [Particle System Reference](https://wiki.palobby.com/wiki/Particle_System_Reference)
- [Shaders](https://wiki.palobby.com/wiki/Shaders)
- [Custom Strategic Icons](https://wiki.palobby.com/wiki/Custom_Strategic_Icons)
- [World Layers](https://wiki.palobby.com/wiki/Planetary_Annihilation_World_Layers)
- [Recon Types](https://wiki.palobby.com/wiki/Planetary_Annihilation_Recon_Types)

Rules for binary/assets work:

- keep editable source assets outside the release package;
- package only runtime output;
- preserve exact virtual paths;
- verify dimensions, channels, compression, and expected material references;
- test with missing or invalid assets to ensure the failure is obvious in logs;
- avoid replacing common global assets when a mod-specific asset path is possible.

---

## 11. Runtime APIs

The UI exposes APIs such as `api.mods` and `api.net`. The archived `api.mods` documentation describes promise-based mounted-mod queries and warns that older callback patterns are deprecated.

References:

- [Planetary Annihilation APIs](https://wiki.palobby.com/wiki/Planetary_Annihilation_APIs)
- [`api.mods` reference](https://wiki.palobby.com/wiki/Planetary_Annihilation_mods_API)

Example defensive use:

```javascript
async function getMountedMods(context, modId) {
  if (!window.api || !api.mods || typeof api.mods.getMounted !== "function") {
    throw new Error(`[${modId}] api.mods.getMounted is unavailable.`);
  }

  const result = await api.mods.getMounted(context);

  if (!result || !Array.isArray(result.mounted_mods)) {
    throw new Error(`[${modId}] Unexpected getMounted response shape.`);
  }

  return result.mounted_mods;
}
```

Because the web API documentation is archived, verify actual signatures in the current runtime with the Coherent debugger and current game files.

---

## 12. Development and debugging workflow

### 12.1 Recommended loop

1. Create the unique mod directory.
2. Add and validate `modinfo.json`.
3. Enable the filesystem mod in **Community Mods → Installed**.
4. Make one small change.
5. Start the narrowest scene or match that exercises it.
6. inspect client and server logs.
7. fix every new error and warning attributable to the mod.
8. test failure paths, not only the happy path.
9. repeat until the package is release-clean.

### 12.2 Reload behavior

- UI changes can often be retested with a scene reload such as `F5` in the Coherent UI context.
- Unit, server, and mounted data changes commonly require leaving/restarting the relevant game or server context.
- Do not rely on hot reload for final validation. Perform a clean game restart before release.

### 12.3 Logs

Logs are stored beneath the user data directory, commonly in a `log` or `logs` folder depending on build/platform history. Inspect the newest client and server logs after every test.

A release candidate must have:

- no JSON parse errors;
- no missing-file errors;
- no unresolved unit/tool/ammo references;
- no uncaught JavaScript exceptions;
- no duplicate-load warnings;
- no new server errors;
- no case-sensitive path failures.

### 12.4 Coherent UI debugger

Archived documentation describes launching PA with a Coherent debugging port, commonly:

```text
--coherent_port=9999
```

Use the debugger to inspect:

- console output;
- loaded scene scripts;
- DOM state;
- observables and model members;
- network/resource failures;
- whether the mod was mounted more than once.

Command-line behavior can change. Verify the current launch option in the installed build or current community guidance before depending on it.

---

## 13. Testing matrix

Before publishing, test at least:

| Test | Why |
|---|---|
| No other mods enabled | Establishes your own baseline |
| Only required dependencies | Confirms dependency declarations |
| Common UI/gameplay mods enabled | Finds load-order and shadowing conflicts |
| Fresh game restart | Detects hidden hot-reload state |
| New game and reconnect | Finds initialization/idempotency defects |
| Spectator/replay where relevant | These scenes may expose different models |
| Multiplayer host and joining client | Verifies server/client mounting behavior |
| AI and human players | Finds missing AI registration or assumptions |
| Windows and Linux path casing | Detects casing defects masked by Windows |
| Invalid or unavailable optional data | Verifies safe failure behavior |

For gameplay mods, also test:

- every factory/build source that should construct the new unit;
- economy at low and high income;
- transport, orbital, water, land, and air interactions where applicable;
- death, wreckage, reclaim, selection, strategic icon, and build-bar presentation;
- AI use and AI response;
- save/replay behavior if supported by the current game flow.

---

## 14. Packaging

The distributable ZIP should contain `modinfo.json` at its root, not inside an extra accidental parent folder.

Correct:

```text
my-mod.zip
├── modinfo.json
├── pa/
└── ui/
```

Incorrect:

```text
my-mod.zip
└── my-mod-main/
    ├── modinfo.json
    ├── pa/
    └── ui/
```

Package only files needed at runtime. Exclude:

- source artwork;
- PSD/Blender project files;
- test fixtures;
- local logs;
- editor settings;
- build caches;
- unrelated documentation;
- secrets or private URLs.

Before creating the ZIP:

- update `version`;
- update `date`;
- set the tested PA `build`;
- validate all JSON files;
- verify dependencies and companions;
- remove obsolete files from the staging directory;
- install the ZIP as a clean user would and retest it.

Archived publishing guide: [Creating Your First PA Mod](https://wiki.palobby.com/wiki/Creating_Your_First_Planetary_Annihilation_Mod)

---

## 15. Publishing through Community Mods

The in-game Community Mods manager handles discovery, installation, updates, and dependencies. Old PAMM-only instructions are obsolete.

The archived release flow describes:

1. host a direct static ZIP URL;
2. ensure `modinfo.json` is at the package root;
3. update version/date/build metadata;
4. submit new mods through the official community Discord's mod-submission process;
5. publish later updates at the same direct URL with changed metadata.

Submission channels and bot behavior can change. Check the current official Discord and Community Mods instructions immediately before submission.

Reference: [Community Mods](https://wiki.palobby.com/wiki/Planetary_Annihilation_Community_Mods)

---

## 16. Most important local files

These are starting points, not a complete schema.

| Local path relative to installed `media/` | Why it matters |
|---|---|
| `pa/units/unit_list.json` | Master registration list for unit specs |
| `pa/units/<layer>/<unit>/<unit>.json` | Unit definitions |
| Paths referenced by a unit's `tools[*].spec_id` | Build arms and weapons |
| Paths referenced by weapon/tool ammunition fields | Projectile/ammunition behavior |
| `ui/main/game/` | Game UI scenes and panels |
| `ui/main/shared/` | Shared UI code and resources |
| `ui/main/atlas/` | Atlas and strategic-icon resources |
| `ui/main/uberbar/` | Uberbar/global UI elements |
| `server-script/main.js` | Server-script entry architecture |
| `server-script/states/lobby.js` | Lobby state and setup logic |

Always follow the references in the current JSON or JavaScript file rather than guessing a sibling path.

---

## 17. Best repositories to study

### Official/current

- [Planetary Annihilation GitHub organization](https://github.com/planetary-annihilation)
- [Official PA Service Mod](https://github.com/planetary-annihilation/pa-service-mod)
- [Official public UI mirror](https://github.com/planetary-annihilation/pa-ui)
- [Official public server-script mirror](https://github.com/planetary-annihilation/pa-server-script)

### Large maintained examples

- [Legion Expansion](https://github.com/Legion-Expansion/Legion-Expansion) — units, balance, UI, assets, build tooling, and packaging
- [Queller AI](https://github.com/Quitch/Queller-AI) — AI behavior, validation, tests, and current mod metadata

Use repositories to learn patterns, not to copy identifiers or undocumented assumptions. Check licenses before reusing code or assets.

---

## 18. Documentation index

### Core guides

- [Modding index](https://wiki.palobby.com/wiki/Planetary_Annihilation_Modding)
- [Category: Modding](https://wiki.palobby.com/wiki/Category:Modding)
- [Creating Your First Mod](https://wiki.palobby.com/wiki/Creating_Your_First_Planetary_Annihilation_Mod)
- [Mod Structure](https://wiki.palobby.com/wiki/Mod_Structure)
- [Data Directory](https://wiki.palobby.com/wiki/Planetary_Annihilation_Data_Directory)
- [Community Mods](https://wiki.palobby.com/wiki/Planetary_Annihilation_Community_Mods)

### Client/UI

- [Client Mods](https://wiki.palobby.com/wiki/Planetary_Annihilation_Client_Mods)
- [User Interface Modding](https://wiki.palobby.com/wiki/User_Interface_Modding)
- [Chat Alert example](https://wiki.palobby.com/wiki/Example_Mod_Chat_Alert)
- [New Game scene](https://wiki.palobby.com/wiki/New_game_user_interface_scene)
- [Live Game scene](https://wiki.palobby.com/wiki/Live_game_user_interface_scene)
- [APIs](https://wiki.palobby.com/wiki/Planetary_Annihilation_APIs)
- [`api.mods`](https://wiki.palobby.com/wiki/Planetary_Annihilation_mods_API)

### Server/gameplay

- [Server Mods](https://wiki.palobby.com/wiki/Planetary_Annihilation_Server_Mods)
- [Bigger Boom Bot example](https://wiki.palobby.com/wiki/Example_Mod_Bigger_Boom_Bot)
- [Unit Specs](https://wiki.palobby.com/wiki/Planetary_Annihilation_Unit_Specs)
- [Unit Types](https://wiki.palobby.com/wiki/Planetary_Annihilation_Unit_Types)
- [Tool Types](https://wiki.palobby.com/wiki/Planetary_Annihilation_Tool_Types)

### Maps/assets

- [Maps](https://wiki.palobby.com/wiki/Planetary_Annihilation_Titans_%26_Classic_Maps)
- [PAPA specification](https://wiki.palobby.com/wiki/Planetary_Annihilation_Papa_Spec)
- [Particle System](https://wiki.palobby.com/wiki/Particle_System)
- [Particle System Reference](https://wiki.palobby.com/wiki/Particle_System_Reference)
- [Shaders](https://wiki.palobby.com/wiki/Shaders)
- [Strategic Icons](https://wiki.palobby.com/wiki/Custom_Strategic_Icons)
- [World Layers](https://wiki.palobby.com/wiki/Planetary_Annihilation_World_Layers)
- [Recon Types](https://wiki.palobby.com/wiki/Planetary_Annihilation_Recon_Types)

---

## 19. Release checklist

- [ ] Unique permanent identifier
- [ ] Correct `client` or `server` context
- [ ] `modinfo.json` parses as strict JSON
- [ ] Version, date, and tested build updated
- [ ] All paths use exact casing
- [ ] Every referenced file exists
- [ ] Required units are registered
- [ ] Dependencies and companions declared
- [ ] Initialization is idempotent
- [ ] Required assumptions are checked explicitly
- [ ] Optional features fail safely
- [ ] No uncaught client or server exceptions
- [ ] No mod-caused errors or warnings in logs
- [ ] Tested from a clean restart
- [ ] Tested with only required dependencies
- [ ] Tested with representative other mods
- [ ] ZIP root contains `modinfo.json`
- [ ] ZIP contains runtime files only
- [ ] Clean ZIP installation passes final test

---

## 20. Practical principle

**Never code against what you remember PA looked like. Code against the current installed file, verify each runtime assumption, preserve host behavior, and make every failure visible in the logs.**