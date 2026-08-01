# Planetary Annihilation — Unit JSON Reference

A complete, source-verified reference for every JSON file that defines a unit in
Planetary Annihilation: the unit spec itself, its weapons/build arms, its
ammunition, and its animation tree.

Everything here was extracted directly from the engine's C++ parsers
(`libs/paent/*_spec.cpp`, `libs/physics`, `libs/nav`, `client/client_anim_nodes.cpp`)
and cross-checked against the shipped content under `content/` and `content_ex1/`.
Where the shipped JSON disagrees with the parser, the parser wins — those cases are
called out as **gotchas**.

## The documents

| Guide | Covers |
|-------|--------|
| [unit-spec-reference.md](unit-spec-reference.md) | The main unit file (`assault_bot.json`, `base_bot.json`, …) — health, cost, movement, vision, economy, factories, tools wiring, model/audio, death, shields, transport, teleport |
| [tool-weapon-reference.md](tool-weapon-reference.md) | Tool specs (`*_tool_weapon.json`, `*_build_arm.json`) — weapons, build arms, the `ammo_id` linkage, and the unit-side `tools[]` array |
| [ammo-reference.md](ammo-reference.md) | Ammo specs (`*_ammo.json`) — projectiles, beams, missiles, bombs, shells, torpedoes, flak, PBAOE/nukes |
| [animation-tree-reference.md](animation-tree-reference.md) | Animation trees (`*_anim_tree.json`) — blend nodes and procedural skeleton controls |
| [enums-and-vocabulary.md](enums-and-vocabulary.md) | Every shared enum — unit types, command caps, armor types, world layers, move types, recon channels, plus the unit-type set-expression grammar |
| [schemas/](schemas/) | Machine-readable JSON Schema (draft-07) for `unit`, `tool`, `ammo`, and `anim_tree` files |

If you only read one section first, read **["How specs combine"](#how-specs-combine--base_spec)** below — the inheritance model is the single most important thing to understand before editing any unit.

---

## The four file types

A single buildable unit is usually described by **four** cooperating JSON files,
living together in the unit's content folder
(e.g. `content/units/land/assault_bot/`):

```
assault_bot.json               <- the UNIT spec  (stats, model, what tools it mounts)
  └─ tools[].spec_id ──────────►  assault_bot_tool_weapon.json   <- the TOOL spec (a weapon)
       └─ ammo_id ─────────────►    assault_bot_ammo.json        <- the AMMO spec (the projectile)
  └─ model.animtree ───────────►  /pa/anim/anim_trees/bipedal_mech_anim_tree.json  <- the ANIM TREE
```

| File pattern | Type | Root document |
|--------------|------|---------------|
| `<unit>.json` | Unit spec | [unit-spec-reference.md](unit-spec-reference.md) |
| `<unit>_tool_weapon.json`, `<unit>_tool_*.json` | Weapon tool | [tool-weapon-reference.md](tool-weapon-reference.md) |
| `<unit>_build_arm.json`, `*_tool_build_arm.json` | Build-arm tool | [tool-weapon-reference.md](tool-weapon-reference.md) |
| `<unit>_ammo.json`, `*_ammo_*.json` | Ammo | [ammo-reference.md](ammo-reference.md) |
| `*_anim_tree.json` | Animation tree | [animation-tree-reference.md](animation-tree-reference.md) |

The wiring is by **path reference**, not by file naming — a unit fires whatever
`ammo_id` its tool points at, regardless of file name. The naming convention above
is just a convention.

### Where each type is parsed (source of truth)

| Type | Parser |
|------|--------|
| Unit spec (sim) | `libs/paent/unit_spec.cpp` (+ `recon_spec.cpp`, `transport_spec.cpp`, `entity_spec.cpp`) |
| Unit spec (visuals/audio) | `client/client_unit.cpp` (`ClientUnitSpec`) |
| Tool spec | `libs/paent/tool_spec.cpp` |
| Ammo spec | `libs/paent/ammo_spec.cpp` |
| Animation tree | `client/client_anim_nodes.cpp` |
| `navigation` / cost stamps | `libs/nav/agent.cpp` |
| `physics` | `libs/physics/dynamic_obj.cpp` |
| `base_spec` merge | `engine/crom/speclib.cpp` |

---

## How specs combine — `base_spec`

Nearly every shipped unit, tool, and ammo file starts with:

```json
{ "base_spec": "/pa/units/land/base_bot/base_bot.json", ... }
```

`base_spec` names a **parent** JSON. The parent is loaded first, then the child is
**recursively deep-merged on top of it** (`engine/crom/speclib.cpp`, `loadJson`).
A child therefore only needs to specify the keys it *changes*; everything else is
inherited. Chains are allowed — a parent may itself have a `base_spec`.

Merge semantics worth knowing:

- **Objects merge key-by-key**, recursively. `events`, `audio`, `navigation`,
  `physics`, `recon` etc. are all merged, not replaced wholesale.
- **Arrays replace wholesale.** If you override `tools`, `unit_types`, or
  `ammo_id`, you must restate the *entire* array — the child's array does not
  append to the parent's.
- **Erasing an inherited block:** setting an inherited event/loop to an empty
  object `{}` removes it. e.g. `"events": { "died": {} }` deletes the inherited
  death response.
- The `base_*` files (`base_bot`, `base_vehicle`, `base_structure`, `base_flyer`,
  `base_ship`, `base_orbital`, `base_commander`, and the `content/tools/base_*`,
  `content/ammo/base_*` files) are **templates meant to be inherited**. They are
  intentionally incomplete (`base_bot.json` has `max_health: 1`) and are never
  built directly.

### Path resolution (the `/pa/...` prefix)

All cross-references use absolute virtual paths beginning with `/pa/`, `/ui/`,
`/shaders/`, or `/stock_mods/`. These are **mount points**, not disk paths. When
running with `--content-dev`, the engine mounts source directories over them:

| Source directory | Virtual mount |
|------------------|---------------|
| `content/` | `/pa/` |
| `content_ex1/` (expansion) | `/pa/` (overlaid on top of `content/`) |
| `ui/` | `/ui/` |
| `engine/shaders/gl/` | `/shaders/` |
| `stockmods/` | `/stock_mods/` |

So `/pa/units/land/base_bot/base_bot.json` resolves to
`content/units/land/base_bot/base_bot.json` (or the `content_ex1` override if one
exists). The expansion (`content_ex1`) overlays the base game — a file present in
both is taken from `content_ex1`.

---

## Reading the field tables

Every reference uses the same column meaning:

- **JSON key** — the dotted path from the file root. `recon.observer.items[].radius`
  means an array `items` under `recon.observer`, each element having a `radius`.
- **Type** — JSON type: `number`, `int`, `string`, `bool`, `array`, `object`, or
  an `enum` (a string from a fixed list — see
  [enums-and-vocabulary.md](enums-and-vocabulary.md)).
- **Default** — the value the parser uses when the key is **absent**. `—` means
  no default / required. Defaults are taken from the C++ `get("key", default)`
  calls, so they are authoritative.
- **Meaning / units** — what it does and the unit of measure.

### Conventions that apply everywhere

- **Angles are authored in degrees** and converted to radians on load. This applies
  to `navigation.turn_speed`, every tool `yaw_rate`/`pitch_rate`/`*_range`/`*_arc`,
  ammo `turn_rate`/`climb_angle`, and giblet `angular_velocity`.
- **Distances are in meters / world units.** Speeds are m/s, accelerations m/s².
- **Times are in seconds**, *except* animation `stage_duration` which is in
  **milliseconds**.
- **Coordinates / offsets** are `[x, y, z]`. **Orientations** are
  `[yaw, pitch, roll]` in degrees.
- **`!LOC:` prefix** on a `display_name`/`description` marks a localizable string
  (looked up in the locale tables); without it the literal text is shown.
- **`.pfx` / effect specs** are particle effect spec paths. An `effect_spec` string
  may carry a bone name and even multiple effect+bone pairs separated by spaces:
  `"/pa/effects/specs/flash.pfx socket_muzzle"`.
- **Unknown keys are silently ignored.** The parsers only read keys they know;
  typos and stale keys do not error — they simply do nothing. Several such
  vestigial keys exist in shipped content and are flagged in the references.
- **Prefixes are optional and case-insensitive** on every enum: `UNITTYPE_Bot` ==
  `Bot`, `WL_Air` == `Air`, `AT_Bot` == `Bot`, etc.

---

## Minimal end-to-end example

A complete, buildable shooting bot reduced to essentials:

**`my_bot.json`** (unit)
```json
{
    "base_spec": "/pa/units/land/base_bot/base_bot.json",
    "display_name": "My Bot",
    "max_health": 100,
    "build_metal_cost": 90,
    "unit_types": ["UNITTYPE_Bot", "UNITTYPE_Mobile", "UNITTYPE_Land", "UNITTYPE_Offense"],
    "navigation": { "type": "land-small", "acceleration": 50, "move_speed": 18, "turn_speed": 360 },
    "physics": { "radius": 2.0 },
    "model": {
        "filename": "/pa/units/land/my_bot/my_bot.papa",
        "animtree": "/pa/anim/anim_trees/bipedal_mech_anim_tree.json"
    },
    "tools": [
        { "spec_id": "/pa/units/land/my_bot/my_bot_tool_weapon.json",
          "aim_bone": "bone_turret", "muzzle_bone": ["socket_muzzle"] }
    ]
}
```

**`my_bot_tool_weapon.json`** (weapon)
```json
{
    "tool_type": "TOOL_Weapon",
    "ammo_id": "/pa/units/land/my_bot/my_bot_ammo.json",
    "rate_of_fire": 2.0,
    "max_range": 90,
    "yaw_rate": 360, "pitch_rate": 360, "yaw_range": 180, "pitch_range": 40,
    "auto_attack": true,
    "target_layers": ["WL_LandHorizontal", "WL_WaterSurface", "WL_Air"]
}
```

**`my_bot_ammo.json`** (projectile)
```json
{
    "base_spec": "/pa/ammo/base_bullet/base_bullet.json",
    "ammo_type": "AMMO_Projectile",
    "flight_type": "FLIGHT_Ballistic",
    "damage": 20,
    "initial_velocity": 130.0,
    "max_velocity": 130.0,
    "lifetime": 1.0
}
```

The unit references the weapon by path; the weapon references the ammo by path; the
unit references a shared animation tree by path. See each reference document for the
full field set.

---

## Quick gotcha list

These are the parser-vs-content discrepancies and surprises documented in detail in
the per-type guides:

- `wreckage.collision` (in the base specs) does **nothing** — the real key is
  `wreckage.collision_types`.
- `passive_health_regen` is clamped to **≤ 0**; positive regen is unsupported on a
  unit spec.
- `shield.radius` is hard-capped at **200**.
- There is **no `damage_type` key.** Damage typing is done via the ammo's
  `armor_damage_map` (per-armor multipliers) plus `damage_target` (HitPoints/Metal).
- Gravity/drag for projectiles live in the nested `physics` block
  (`gravity_scalar`, `air_friction`, `ignore_gravity`), **not** at the ammo top
  level.
- Beam ammo has no duration/tick keys — beam lifetime is engine-fixed (~200 ms);
  DPS is set by `damage` × the weapon's `rate_of_fire`.
- `TOOL_CaptureArm` is **not implemented** in this engine build; capture tool files
  and their `capture_*` keys are inert.
- `model` may be a single object **or an array** (one entry per world layer, each
  needing a `layer` key) for land/sea building variants.
- Structures must set `physics.type = "Structure"` or the nav structure component
  logs an error.
- The first `BuildArm` in `tools[]` becomes the unit's build arm; the first
  weapon becomes its primary unless one is flagged `primary_weapon`.
