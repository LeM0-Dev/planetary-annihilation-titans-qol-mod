# Ammo Spec JSON Reference

The projectile / beam / blast a weapon fires — e.g.
`content/units/land/assault_bot/assault_bot_ammo.json`. Parsed by
`libs/paent/ammo_spec.cpp`; runtime in `libs/pasim/sim_projectile.cpp` and
`sim_beam.cpp`. A weapon tool points at an ammo spec via its
[`ammo_id`](tool-weapon-reference.md#the-ammo_id-structure). A file is treated as ammo
if its path contains `_ammo.json`.

See [README.md](README.md) for inheritance and conventions, and
[enums-and-vocabulary.md](enums-and-vocabulary.md) for enum values.

> **Required:** `id` (file path) and `ammo_type`. See
> [validation rules](#validation-rules) for the full `isComplete()` constraints.

## Set expectations first

- **There is no `damage_type` key.** Damage typing is done via `armor_damage_map`
  (per-armor-class multipliers) plus `damage_target` (HitPoints vs Metal).
- **Gravity / drag live in the nested `physics` block** (`gravity_scalar`,
  `air_friction`, `ignore_gravity`) — not at the top level.
- These names **do not exist**: `muzzle_velocity`, `acceleration` (it's `accel_rate`),
  `drag`, `gravity_scale`, `use_gravity`, `homing`, `guidance`, `proximity`,
  `armed_distance`, `tracks_target`, `ballistic`, `max_height`, `trajectory_height`,
  `beam_duration`, `tick_rate`, `destroys_self`, `pass_through_water`. The closest real
  equivalents are noted in context.
- Angles (`turn_rate`, `stage_turn_rate`, `climb_angle`) are **degrees** → radians.
  Times are **seconds**, *except* `stage_duration` which is **milliseconds**.

## Contents

- [Core fields (all families)](#core-fields-all-families)
- [Event responses & FX](#event-responses--fx)
- [physics block (projectiles)](#physics-block-projectiles)
- [Projectile motion](#projectile-motion)
- [Staged flight](#staged-flight)
- [Beam family](#beam-family)
- [PBAOE & nuke family](#pbaoe--nuke-family)
- [Field applicability by family](#field-applicability-by-family)
- [Validation rules](#validation-rules)
- [Keys that are NOT ammo fields](#keys-that-are-not-ammo-fields)

---

## Core fields (all families)

Applies regardless of `ammo_type` unless noted.

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `ammo_type` | enum | `Undefined` (**required**) | `AMMO_Projectile`, `AMMO_Beam`, or `PBAOE`. |
| `display_name` | string | `{no display name}` | UI name (`!LOC:` localizable). |
| `description` | string | `{no description}` | UI description (`!LOC:` localizable). |
| `damage` | number | `0.0` | Primary direct-hit damage (HP, or metal if `damage_target: Metal`). |
| `damage_target` | enum | `HitPoints` | `HitPoints` (damage health) or `Metal` (drain/harvest target metal). |
| `splash_damage` | number | `0.0` | Damage applied in the splash area (separate from direct `damage`). |
| `splash_radius` | number (m) | `0.0` | Outer splash radius. Damage falls off from `full_damage_splash_radius` to here. |
| `full_damage_splash_radius` | number (m) | = `splash_radius` | Inner radius receiving 100% splash; falloff occurs between this and `splash_radius`. |
| `splash_damages_allies` | bool | `false` | Whether splash hits friendly units. |
| `splash_damage_orbital` | bool | `false` | Extend splash as a capsule up to orbital height. |
| `armor_damage_map` | object `{ArmorType: number}` | `{}` | Per-armor-class damage **multiplier**. Missing classes = 1.0; `0.0` = immune. |
| `ignore_shields` | bool | `false` | Damage bypasses shields and hits the unit directly. |
| `lifetime` | number (s) | `0.0` | Max time the ammo exists before self-destruct. |
| `model` | object | — | Visual model: `.filename` (`.papa`; `""`/`null` = invisible), `.arrows` (strategic-icon arrow count). |
| `recon` | object | — | Visibility spec (e.g. `observable.ignore_radar`). |
| `build_metal_cost` | number | `-1.0` | Metal cost to build/launch (nukes, orbital units). `-1` = free. |
| `atrophy_rate` | number | `0.0` | Metal/sec drain while armed-idle (launcher-style ammo). |
| `atrophy_cool_down` | number (s) | `0.0` | Seconds before atrophy begins. |
| `signal_type` | string | `""` | Intel/warning tag (e.g. `"nuke"`). |
| `has_notifications` | bool | `false` | Enables server-side notification/culling (nuke warnings). |
| `influence_radius` | number (m) | `20.0` | AI/threat influence radius. |

```json
"armor_damage_map": { "AT_Commander": 0.33, "AT_Structure": 1.0 }
```

### Spawn-on-death / attach / transport

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `spawn_unit_on_death` | string | `""` | Unit spec spawned when this ammo dies (deployed payload). |
| `spawn_unit_on_death_with_velocity` | bool | `false` | Inherit ammo velocity into the spawned unit. |
| `attachable` | object | — | Lets the ammo carry a payload: `.default_attach_bone`, `.offsets`. |
| `transporter` | object | — | Carries a unit (unit cannon): `.capacity`, `.transportable_unit_types`, `.transporter_attach_bone`, `.transportable_attach_offset`. |
| `planet_impact_spec` | object | — | Planet-smash ammo: `.delay_time`. |

---

## Event responses & FX

### events.<event> — map of AmmoEvent → response

`events` is keyed by `spawned`, `fired`, `collided`, `died`, `child_attached`,
`child_detached`. Each value is the same response object as unit events. Setting a
value to a non-object **removes** that event.

| JSON key (`events.<e>`) | Type | Default | Meaning |
|---|---|---|---|
| `audio_cue` | string | `""` | FMOD cue path. |
| `audio_interplanetary` | bool | `false` | Audible across planets. |
| `effect_spec` | string | `""` | PFX/effect spec path. |
| `effect_scale` | number | `1.0` | Effect scale. |
| `effect_world_aligned` | bool | `false` | Orient effect to world vs. ammo. |
| `effect_world_scaled` | bool | `false` | Scale effect by world scale. |
| `camera_shake` | object | — | Camera shake spec. |

### Sim-side effects & trails

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `sim_fire_effect` | string | `""` | Effect spawned at fire time (PBAOE/nuke entity effect). |
| `sim_impact_effect` | string | `""` | Effect spawned at impact (nuke explosion entity effect). |
| `impact_decals` | array[string] | `[]` | Decal specs stamped on impact (scorch marks). Empty array clears inherited. |
| `fx_trail` | object | — | Projectile trail: `.filename` (PFX), `.offset` (vec3). Projectile families only. |

---

## physics block (projectiles)

`physics` is a `PhysicsSpec` governing the projectile's dynamic-object behavior. This
is where gravity/drag live (there is no top-level gravity/drag key).

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `physics.type` | enum | `Mobile` | Usually `Projectile` for ammo. |
| `physics.radius` | number (m) | `3.0` | Collision radius of the projectile. |
| `physics.shape` | enum | `Sphere` | Collision shape. |
| `physics.collision_layers` | enum (WorldLayer) | `AnyGround` | Mesh/world layers it collides against. |
| `physics.air_friction` | number | `0.0` | Drag coefficient (the real "drag" knob). |
| `physics.gravity_scalar` | number | `1.0` | Gravity multiplier (the real "gravity_scale" knob); higher = steeper arc. |
| `physics.ignore_gravity` | bool | `false` | Disable gravity. **Invalid with `flight_type: Ballistic`.** |
| `physics.orient_interp_rate` | number (deg/s) | `0.0` | Orientation interpolation rate. |
| `physics.add_to_spatial_db` | bool | `true` | Register in the spatial DB (set `false` for most projectiles for perf). |
| `physics.allow_underground` | bool | `false` | Allow below terrain surface. |
| `physics.collide_with_types` | array[enum] | all | Whitelist of physics types it collides with. |

---

## Projectile motion

For `ammo_type: AMMO_Projectile`. Interpretation depends on `flight_type`.

| JSON key | Type | Default | Meaning | Applies to |
|---|---|---|---|---|
| `flight_type` | enum | `Undefined` | `Ballistic`, `Direct`, `Seeking`, `Staged`. | all projectiles |
| `initial_velocity` | number (m/s) | `0.0` | Speed at spawn (effectively muzzle velocity). | all |
| `max_velocity` | number (m/s) | `0.0` | Speed cap when accelerating. | all |
| `accel_rate` | number (m/s²) | `0.0` | Acceleration toward `max_velocity`. | accelerating / seeking |
| `turn_rate` | number (deg/s) | `0.0` | Max turn rate. Steering for Seeking; arc-correction for Ballistic. `0` = no steering. | Seeking, Direct |
| `local_forward` | vec3 | `[0,-1,0]` | Model's local forward axis used to orient to velocity. | all |
| `cruise_height` | number (m) | `8.0` | Height above `flight_layer` that seeking ammo maintains. | Seeking (torpedoes ~2) |
| `flight_layer` | enum (WorldLayer) | `WL_Air` | Layer the cruise height references (Air or Underwater). | Seeking |
| `ground_target_area_spread` | number (m) | `0.0` | Random scatter radius when targeting ground. | Staged / bombardment |
| `collision_check` | enum | `Enemies` | `Enemies`, `Target`, `Ground`. | all |
| `collision_response` | enum | `Impact` | `Impact` (AoE) or `Destroy` (single target). | all |
| `collision_bounds` | number (m) | `1.0` | Collision test radius/bounds. | all |
| `interplanetary_type` | enum | `INTER_None` | `None`, `GravWell`, `System`. | interplanetary ammo |
| `system_velocity_multiplier` | number | `0.0` | Speed multiplier between systems/planets. | interplanetary |
| `gravwell_velocity_multiplier` | number | `0.0` | Speed multiplier within a grav-well. | interplanetary |
| `stage_on_planet_handoff` | int | `-1` | Stage index to jump to when crossing to a new planet (`-1` = none). | staged interplanetary |

```json
{
    "base_spec": "/pa/ammo/base_bullet/base_bullet.json",
    "ammo_type": "AMMO_Projectile",
    "flight_type": "FLIGHT_Ballistic",
    "damage": 10,
    "initial_velocity": 130.0, "max_velocity": 130.0,
    "lifetime": 1.0,
    "fx_trail": { "filename": "/pa/effects/specs/bullet_proj_trail.pfx", "offset": [0,0,0] }
}
```

---

## Staged flight

For `flight_type: Staged`. `stages` is an ordered array of flight phases (boost,
climb, cruise, terminal, release). `flight_type` may be omitted if `stages` is
present.

| JSON key (`stages[]`) | Type | Default | Meaning |
|---|---|---|---|
| `apply_thrust` | bool | `true` | Whether the stage actively accelerates the ammo. |
| `ignores_gravity` | bool | `false` | Gravity disabled during this stage. |
| `ignores_LOS` | bool | `false` | Ignore line-of-sight checks (boosting up/over). |
| `rotates_to_velocity` | bool | `true` | Orient the model along its velocity vector. |
| `release_payload` | bool | `false` | Release carried payload when this stage begins. |
| `release_payload_on_impact` | bool | `false` | Release payload upon impact during this stage. |
| `die_here` | bool | `false` | Ammo self-destructs at the end of this stage. |
| `stage_duration` | number (**ms**) | `0.0` | Stage length. `0` = until a transition condition is met. |
| `stage_turn_rate` | number (deg/s) | `360` | Max turn rate during this stage. |
| `stage_change_range` | number (m) | `0.0` | Distance from target at which to advance to the next stage. |
| `stage_change_height` | number (m) | `0.0` | Height above terrain that triggers transition (climb to height). |
| `stage_change_height_below` | number (m) | `0.0` | Transition when descending below this height. |
| `climb_angle` | number (deg) | `0.0` | Desired climb/pitch angle. |

```json
"stages": [
    { "ignores_gravity": true, "ignores_LOS": true, "stage_duration": 0,
      "stage_turn_rate": 90, "climb_angle": 45, "stage_change_height": 200,
      "rotates_to_velocity": false }
]
```

---

## Beam family

For `ammo_type: AMMO_Beam` — continuous, instantaneous-hit weapons (`SimBeam`). Beams
do **not** use `physics`, `flight_type`, velocity, or trails. A beam lives ~200 ms and
emits Spawned/Died events automatically. They reuse the core damage/splash fields.

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `ammo_type` | enum | — (**required**) | `"AMMO_Beam"`. |
| `damage` | number | `0.0` | Per-application damage at the impact point. |
| `splash_radius` / `splash_damage` | number | `0.0` | Optional AoE at the beam endpoint (e.g. flak). |
| `lifetime` | number (s) | `0.0` | How long the beam persists. |
| `fx_beam_spec` | string | `""` | PFX spec drawn along the beam line. |
| `fx_collision_spec` | string | `""` | PFX spec at the beam's impact point. |
| `audio_loop` | string | `""` | Looping audio cue while the beam is active. |
| `collision_audio` | string | `""` | Audio cue at the beam's impact point. |

> No `beam_duration` / `tick_rate` / `tick_damage` keys exist — duration is engine
> -fixed (~200 ms). Design DPS via `damage` per beam × the weapon's `rate_of_fire`.

---

## PBAOE & nuke family

For `ammo_type: PBAOE` ("Point-Blank Area Of Effect") — detonates in place (no
flight): nuke detonations, mines, commander self-destruct. Reuses the core
damage/splash/armor fields and adds an expanding shockwave + feature burn.

> A nuke *missile* is a `Projectile`/`Staged` ammo (e.g. `nuke_launcher_ammo.json`);
> the *detonation* is a separate `PBAOE` ammo (e.g. `nuke_pbaoe.json`) that drives the
> expanding `damage_volume`.

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `ammo_type` | enum | — (**required**) | `"PBAOE"`. |
| `damage` | number | `0.0` | Total unit damage within the damage volume / splash. |
| `splash_radius` | number (m) | `0.0` | Outer damage radius. |
| `full_damage_splash_radius` | number (m) | = `splash_radius` | Inner full-damage radius. |
| `burn_damage` | number | `0.0` | DoT applied to burnable features (forests) in the burn area. |
| `burn_radius` | number (m) | `0.0` | Radius of the burn/fire effect on features. |
| `sim_fire_effect` | string | `""` | Detonation entity effect (the explosion). |
| `impact_decals` | array[string] | `[]` | Scorch decals. |

### damage_volume — expanding shockwave

When present, `damage_volume` replaces the instantaneous splash with an **expanding
sphere** that deals damage as it grows (used by nukes/large detonations; works on both
PBAOE and Projectile ammo).

| JSON key (`damage_volume`) | Type | Default | Meaning |
|---|---|---|---|
| `initial_radius` | number (m) | `0.0` | Starting radius of the shockwave. |
| `radius_velocity` | number (m/s) | `10.0` | Expansion speed. |
| `radius_accel` | number (m/s²) | `10.0` | Radius acceleration (negative = decelerating expansion, e.g. `-40`). |
| `delay` | number (s) | `0.0` | Delay before the volume starts. |
| `delay_damage` | bool | `false` | Delay damage application (not just visual). |
| `unit_remove_radius` | number (m) | `0.0` | Radius within which units are removed outright. |
| `burnable_remove_radius` | number (m) | `0.0` | Radius within which burnable features are removed. |

```json
"damage_volume": {
    "initial_radius": 20.0, "radius_velocity": 200.0, "radius_accel": -40.0,
    "delay": 1.5, "burnable_remove_radius": 100.0
}
```

---

## Field applicability by family

✓ = commonly/validly used · — = not applicable · (opt) = supported but uncommon

| Field group | Base | Bullet/Shell | Beam | Missile | Bomb/Staged | Torpedo | Flak/AA | PBAOE/Nuke |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `ammo_type`,`damage`,`armor_damage_map`,`damage_target` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `splash_*` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `physics.*` | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | — |
| `flight_type` | ✓ | Ballistic | — | Seeking | Staged | Seeking | — | — |
| `initial_velocity`/`max_velocity`/`accel_rate` | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | — |
| `turn_rate` | ✓ | (arc) | — | ✓ | ✓ | ✓ | — | — |
| `cruise_height`/`flight_layer` | ✓ | — | — | ✓ | ✓ | ✓ (Underwater) | — | — |
| `fx_trail`/`events.died` | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | (decals) |
| `fx_beam_spec`/`fx_collision_spec`/`audio_loop` | — | — | ✓ | — | — | — | ✓ (beam) | — |
| `stages[*]`/`stage_on_planet_handoff` | — | — | — | — | ✓ | — | — | — |
| `interplanetary_type`/`*_velocity_multiplier` | — | — | — | (orbital) | ✓ (orbital) | — | — | — |
| `collision_check`/`collision_response`/`collision_bounds` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `damage_volume.*`/`burn_damage`/`burn_radius` | — | (opt) | — | (opt) | (opt) | — | — | ✓ |
| `sim_fire_effect`/`sim_impact_effect`/`impact_decals` | — | (opt) | — | (opt) | ✓ | — | — | ✓ |
| `attachable`/`transporter`/`spawn_unit_on_death*` | — | — | — | — | ✓ (cannon) | — | — | — |
| `has_notifications`/`signal_type`/`build_metal_cost` | (opt) | — | — | (opt) | ✓ (nuke) | — | — | (opt) |

---

## Validation rules

`AmmoSpec::isComplete()` rejects a spec at load if:

1. `id` (file name) is empty.
2. `ammo_type == Undefined` — you must set `ammo_type`.
3. `ammo_type == Projectile` **and** `flight_type == Undefined` **and** no `stages`.
4. `collision_response == Destroy` while `collision_check != Target`.
5. `flight_type == Ballistic` while `physics.ignore_gravity == true`.

---

## Keys that are NOT ammo fields

Present in some shipped files but **not read** by `AmmoSpec::parse`:

| Key | Status |
|-----|--------|
| `spawn_layers`, `show_strategic_icon`, `show_in_orbital_layer`, `enable_orbital_shell`, `unit_types`, `si_name` | UnitSpec keys — only meaningful when the ammo file doubles as a unit (orbital ammo). |
| `burn_duration` (in `base_ammo.json`) | Not parsed; burn timing is governed by `burn_damage`/`burn_radius` + the burnable feature spec. |
| `death` / `death.decals` | Not parsed for ammo — use `impact_decals`. |
| `effect_specs` (plural) in `events.*` | Typo for `effect_spec` — ignored. |
| `damage_type`, `muzzle_velocity`, `drag`, `gravity_scale`, `use_gravity`, `homing`, `guidance`, `proximity`, `armed_distance`, `tracks_target`, `max_height`, `trajectory_height`, `beam_duration`, `tick_rate` | Do not exist. See real equivalents in [Set expectations](#set-expectations-first). |
