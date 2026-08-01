# Tool Spec JSON Reference

"Tools" are what a unit *does* — they come in exactly **two engine types**:

| `tool_type` | Purpose | Typical file |
|-------------|---------|--------------|
| `TOOL_Weapon` | Fires ammo at targets | `*_tool_weapon.json` |
| `TOOL_BuildArm` | Builds / assists / reclaims | `*_build_arm.json` |

Parsed by `libs/paent/tool_spec.cpp` (struct in `tool_spec.h`); runtime behavior in
`libs/pasim/sim_weapon.cpp` and `sim_beam.cpp`. A tool spec is **referenced from a
unit's `tools[]` array** by `spec_id` — the unit supplies the bones, the tool supplies
the behavior. See [README.md](README.md) for inheritance and conventions.

> **Required:** `id` (from the file path) and `tool_type`. `ToolSpec::isComplete()`
> fails if `tool_type` is `Undefined`. Everything else has a default. **Unknown keys
> are silently ignored** — several stock files contain inert keys (flagged below).

## Contents

- [Structural facts](#structural-facts)
- [Weapon tools](#weapon-tools)
  - [Core & identity](#core--identity)
  - [Targeting](#targeting)
  - [Rate of fire, range, aiming](#rate-of-fire-range-aiming)
  - [Ballistic / arc fire](#ballistic--arc-fire)
  - [Ammo economy & charge behavior](#ammo-economy--charge-behavior)
  - [The ammo_id structure](#the-ammo_id-structure)
  - [Misc / self-destruct / manual fire](#misc--self-destruct--manual-fire)
- [Build arms](#build-arms)
- [Capture & special tools](#capture--special-tools)
- [Beam weapons](#beam-weapons)
- [Unit-side tools[] wiring](#unit-side-tools-wiring)
- [Keys that are NOT tool fields](#keys-that-are-not-tool-fields)

---

## Structural facts

1. **Only two real tool types exist.** `toolTypeFromString` recognizes only
   `TOOL_BuildArm` and `TOOL_Weapon` (the `TOOL_` prefix is optional,
   case-insensitive). Anything else → `Undefined` → the tool is rejected.
2. **The tool spec and the unit-side mount are different objects.** Aim/muzzle bone
   placement (`aim_bone`, `muzzle_bone`, `projectiles_per_fire`, …) lives in the
   unit's `tools[]` array, *not* in the tool spec. See
   [Unit-side tools[] wiring](#unit-side-tools-wiring).
3. **PBAOE / nuke "weapons" are ordinary `TOOL_Weapon`s** whose *ammo* is PBAOE.
   The blast parameters are in the ammo spec, not the tool.

---

## Weapon tools

### Core & identity

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `tool_type` | enum | — (**required**) | `"TOOL_Weapon"`. |
| `base_spec` | string | — | Parent tool spec to inherit from. |
| `ammo_id` | string \| array | — | The ammo this weapon fires. See [the ammo_id structure](#the-ammo_id-structure). |

### Targeting

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `target_layers` | array[enum WorldLayer] | `0` (none) | World layers this weapon may target. |
| `auto_attack` | bool | `false` | Auto-acquire hostile targets in range. |
| `no_busy_auto_attack` | bool | `false` | Suppress auto-attack while the unit is busy with another order. |
| `exclude_unit_types` | string (set-expr) | `""` | Targets in this unit-type set are rejected. |
| `target_priorities` | array[string set-expr] | `[]` | Ordered priority list; lower index = higher priority. |
| `auto_task_type` | string | `"default"` | `default`, `none`, or `anti_entity` (anti-projectile interceptor). |
| `anti_entity_targets` | array[string] | `[]` | **Only read when `auto_task_type == "anti_entity"`.** Ammo/unit specs to intercept (incoming nukes/missiles). |
| `anti_entity_targets_units` | bool | `true` | Whether the interceptor also targets full units, not just projectiles. |

See [set-expression grammar](enums-and-vocabulary.md#unit-type-set-expression-grammar)
for `exclude_unit_types` / `target_priorities`.

### Rate of fire, range, aiming

All `*_rate`, `*_range`, `*_arc`, and `default_firing_pitch` are authored in
**degrees** (converted to radians on load); `max_range` is in **meters**.

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `rate_of_fire` | number | `0.0` | **Firing cycles per second.** Cooldown = `1 / rate_of_fire`. `0` = no cooldown gate. |
| `reload_rate` | number | `0.0` | Legacy reload time; `rate_of_fire` governs actual cadence. |
| `max_range` | number (m) | `0.0` | Max engagement range. |
| `yaw_rate` | number (deg/s) | `0.0` | Turret yaw speed toward target. |
| `pitch_rate` | number (deg/s) | `0.0` | Turret pitch speed. |
| `yaw_range` | number (deg) | `0.0` | Max yaw travel from default. `≥180` = full 360° rotation. |
| `pitch_range` | number (deg) | `0.0` | Max pitch travel from default. `≥180` = unrestricted. |
| `firing_arc_yaw` | number (deg) | `0.0` | How close in yaw the aim must be before firing is allowed. |
| `firing_arc_pitch` | number (deg) | `0.0` | Same, for pitch. |
| `default_firing_pitch` | number (deg) | `+INF` (unset) | If finite, the weapon always pitches to this fixed angle (e.g. unit cannon = `-65`). |
| `idle_aim_delay` | number (s) | `-1.0` | Delay before returning to rest aim after losing a target. `<0` = never return. |
| `firing_standard_deviation` | number (deg) | `0.0` | Gaussian spread per shot. `0` = perfect accuracy. |

### Ballistic / arc fire

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `arc_type` | enum | `ARC_Low` | `ARC_Low` (flat), `ARC_High` (lob), `ARC_Both` (try low then high). |
| `max_firing_velocity` | number | `0.0` | Max muzzle velocity for the ballistic solve. Falls back to the ammo's `max_velocity` if `0`. |
| `min_firing_velocity` | number | `0.0` | Min muzzle velocity; enables variable-velocity solving. Falls back to the ammo's `initial_velocity` if `0`. |
| `force_fire_from_muzzle` | bool | `false` | Launch from the muzzle bone with computed orientation (factory-ammo weapons like the unit cannon). |

### Ammo economy & charge behavior

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `ammo_source` | enum | `infinite` | Where ammo comes from: `infinite`, `energy`, `metal`, `factory`, `time`. See [ammo_source](enums-and-vocabulary.md#ammo_source-ammosource--was_). |
| `ammo_capacity` | number | `0` | Total ammo that can be stored (`≥0`). |
| `ammo_demand` | number | `0` | Ammo regenerated per second (drawn from energy/metal per `ammo_source`). |
| `ammo_per_shot` | number | `0` | Ammo consumed per shot (`0 ≤ per_shot ≤ capacity`). Max shots = `floor(capacity / per_shot)`. |
| `start_fully_charged` | bool | `true` | Spawn with full ammo (else empty). |
| `charge_ammo_when_targeting` | bool | `false` | Only accumulate ammo while a firing solution exists; resets to 0 with no target. |
| `auto_fire_when_charged` | bool | `false` | PBAOE: auto-fire once charged, no explicit target needed. |
| `carpet_fire` | bool | `false` | Carpet-bombing: once on target, keep firing until ammo exhausted. |
| `carpet_wait_for_full_ammo` | bool | `false` | Don't begin a carpet run until ammo is full. |

**`ammo_source` semantics:**
- `infinite` — no ammo tracking; always fires.
- `energy` / `metal` — economy item demanding that resource at `ammo_demand`/s up to
  `ammo_capacity`; consumes `ammo_per_shot` per shot.
- `factory` — pulls a pre-built projectile from the unit's factory queue (nukes,
  anti-nukes, unit cannon). `ammo_capacity`/`per_shot` are ignored.
- `time` — accumulates ammo purely over time (1/sec), no economy cost.

### The ammo_id structure

`ammo_id` accepts **two forms**, stored internally as
`[(WorldLayer, ammoSpecPath), ...]`:

**Form A — simple string** (most common). Maps to `WL_AnyLayer` — same ammo
everywhere:
```json
"ammo_id": "/pa/ammo/base_ammo/base_ammo.json"
```

**Form B — layer-keyed array.** Each element is `{ "layer": <WorldLayer>, "id": <path> }`.
The weapon picks ammo by the unit's **current world layer** at fire time (matched by
bitmask). This lets one weapon fire different ammo on land vs. water vs. air (e.g. an
amphibious bot's land bullet vs. an underwater variant):
```json
"ammo_id": [
    { "layer": "WL_AnyLand", "id": "/pa/units/land/assault_bot/assault_bot_ammo.json" }
]
```
At runtime the weapon reloads the ammo spec whenever the unit's layer changes.

### Misc / self-destruct / manual fire

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `manual_fire` | bool | `false` | Only fires on explicit player command (uber cannon, nukes). |
| `only_fire_once` | bool | `false` | Stops requesting execution after firing once. |
| `self_destruct` | bool | `false` | Unit is killed immediately after firing (bot bomb, land mine). |
| `spread_fire` | bool | `false` | Distributes shots across multiple targets (common on AA). |
| `fire_delay` | number (s) | `0.0` | Delay between the fire *event* (anim/SFX) and the projectile spawning. |

> `construction_demand`, `assist_layers`, `reclaim_layers`, `reclaim_types`,
> `auto_repair`, `auto_reclaim`, `can_only_assist_with_buildable_items` parse for all
> tool types but are only meaningful for build arms — see below.

---

## Build arms

A build arm shares the aim/range keys (`max_range`, `yaw_rate`, `pitch_rate`,
`yaw_range`, `pitch_range` — same units/defaults as weapons). The build-specific keys:

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `tool_type` | enum | — (**required**) | `"TOOL_BuildArm"`. |
| `construction_demand` | object | `{0,0}` | Build/assist economy draw **per second** at full efficiency. |
| `construction_demand.energy` | number | `0` | Energy per second while building. |
| `construction_demand.metal` | number | `0` | Metal per second while building — effectively the **build/metal rate**. |
| `max_range` | number (m) | `0.0` | Build/assist reach. |
| `assist_layers` | array[enum WorldLayer] | `0` | Layers the arm may build/assist into. |
| `reclaim_layers` | array[enum WorldLayer] | `0` | Layers the arm may reclaim from. |
| `reclaim_types` | array[enum] | `0` | What is reclaimable: `Unit`, `Wreckage`, `Feature`, `Friendly_Commander`. |
| `can_only_assist_with_buildable_items` | bool | `false` | May only assist building units it could itself build. |
| `auto_repair` | bool | `false` | Auto-repairs nearby damaged friendlies. |
| `auto_reclaim` | bool | `false` | Auto-reclaims nearby wreckage/features. |

```json
{
    "tool_type": "TOOL_BuildArm",
    "construction_demand": { "energy": 1750, "metal": 30 },
    "max_range": 30,
    "assist_layers": ["WL_AnyHorizontalGroundOrWaterSurface","WL_Air","WL_Underwater"],
    "reclaim_layers": ["WL_AnyHorizontalGroundOrWaterSurface","WL_Air"],
    "reclaim_types": ["Unit","Wreckage","Feature"]
}
```

> **`buildable_types` is NOT a tool field — it is a UNIT field.** What a factory or
> fabber can build is set by `buildable_types` (a set-expression) and
> `buildable_projectiles` on the **unit** spec, not on the build arm. There is no
> per-tool "build rate" key — the rate is `construction_demand.metal`. See
> [unit-spec-reference.md](unit-spec-reference.md#factory--build).

**Factory vs. fabricator arms** are mechanically identical. Factory arms typically
omit `assist_layers`/`reclaim_layers` (they only build their own queue); fabricator,
engineer, and commander arms include assist + reclaim layers. The commander arm is
just a higher-demand fabricator arm.

---

## Capture & special tools

### Capture arms — NOT implemented in this build

`content/tools/base_capture_arm/base_capture_arm.json` declares
`"tool_type": "TOOL_CaptureArm"` plus `capture_type`, `capture_rate`,
`capture_lock_time`, `capture_radius`, `auto_capture`, `capture_demand`, etc.

**None of this works in the current engine:** `toolTypeFromString` does not recognize
`TOOL_CaptureArm` (it resolves to `Undefined`, which fails `isComplete()`), and no
`capture_*` key is read anywhere in `tool_spec.cpp` or `libs/pasim`. Treat capture
arms and all `capture_*` keys as **reserved / non-functional**.

### commander_death.json — a normal weapon

Despite the name, this is an ordinary `TOOL_Weapon` firing a PBAOE ammo with
`manual_fire: true` — the commander's death explosion. All weapon fields apply.

---

## Beam weapons

Beam weapons are `TOOL_Weapon`s firing ammo with `ammo_type: AMMO_Beam` (runtime in
`sim_beam.cpp`). The **tool** contributes only `target_layers` (for the surface /
underwater raycast filter) and the usual aim/range/rate keys. Everything else —
`damage`, `splash_radius`, `collision_check`, `collision_response`, `ignore_shields`,
the beam/collision FX — lives in the **ammo spec**. There are no beam-specific keys on
the tool spec, and **no beam duration/tick keys anywhere** (beam lifetime is engine
-fixed at ~200 ms; DPS = ammo `damage` × `rate_of_fire`). See
[ammo-reference.md](ammo-reference.md#beam-family).

---

## Unit-side tools[] wiring

These keys are **not** in the tool spec file — they live in each element of a unit's
`"tools": [...]` array and bind a tool to bones on that unit's model. Repeated here
for convenience; the canonical table is in
[unit-spec-reference.md](unit-spec-reference.md#tools--weapons--build-arms-wiring).

| JSON key (`tools[]`) | Type | Default | Meaning |
|---|---|---|---|
| `spec_id` | string | — (**required**) | Path to the tool spec to mount. |
| `aim_bone` | string | `""` | Bone the tool aims from / pivots around. |
| `muzzle_bone` | string \| array \| null | `[""]` | Muzzle bone(s); array round-robins per projectile. |
| `projectiles_per_fire` | int | clamped 0..#muzzles | Projectiles per fire cycle. |
| `record_index` | int | clamped −1..3 | Replay/history weapon slot. |
| `show_range` | bool | `true` | UI range ring. |
| `fire_event` | enum | `Fired` | Event fired on shot; recoil controls bind to this (e.g. `fired0`). |
| `primary_weapon` | bool | `false` | Marks the primary weapon. |
| `secondary_weapon` | bool | `false` | Marks the secondary weapon. |

---

## Keys that are NOT tool fields

Verified absent from `ToolSpec::parse` — present in some shipped files but **inert**:

| Key(s) | Status |
|--------|--------|
| `range_height` (in `base_turret.json`) | Ignored — read nowhere. |
| `flight_type`, `stages` (in `base_bomb_bay.json`) | Ignored on a tool — these are **ammo** concepts. |
| `capture_*` (capture arms) | Ignored — capture is a disabled feature. |
| `min_range`, `tracking`, `windup`, `reentry`, `check_los`, `fire_rate`, `fire_solution`, `max_slope_angle`, `splash` | Do not exist as tool keys. |
| `buildable_types`, `buildable_projectiles` | **Unit** fields, not tool fields. |
