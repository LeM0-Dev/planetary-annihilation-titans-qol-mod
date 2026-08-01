# Unit Spec JSON Reference

The main unit file — e.g. `content/units/land/assault_bot/assault_bot.json`. Parsed
by `libs/paent/unit_spec.cpp` (simulation) and `client/client_unit.cpp`
(`ClientUnitSpec`, visuals/audio). Fields marked **(client)** are presentation-only
and read by the client layer.

See [README.md](README.md) for the `base_spec` inheritance model and global
conventions, and [enums-and-vocabulary.md](enums-and-vocabulary.md) for every enum
value.

> **Required:** the only strictly-required fields are a non-empty `id` (supplied by
> the file path) and a non-empty `unit_types` array. `UnitSpec::isComplete()` fails
> without unit types. Everything else has a default.

## Contents

- [base_spec & identity](#base_spec--identity)
- [Cost, health & decay](#cost-health--decay)
- [unit_types & command_caps](#unit_types--command_caps)
- [navigation (movement)](#navigation--movement)
- [physics (collision body)](#physics--collision-body)
- [recon (vision / radar / visibility)](#recon--vision--radar--visibility)
- [tools (weapons & build arms wiring)](#tools--weapons--build-arms-wiring)
- [Economy: production / consumption / storage](#economy-production--consumption--storage)
- [Factory & build](#factory--build)
- [Geometry, placement & area-build](#geometry-placement--area-build)
- [Targeting & guard behavior](#targeting--guard-behavior)
- [model & animation (client)](#model--animation-client)
- [Wreckage & death](#wreckage--death)
- [events & audio & fx (client)](#events--audio--fx-client)
- [Shield](#shield)
- [Transport](#transport)
- [Teleport](#teleport)
- [Orbital & interplanetary](#orbital--interplanetary)
- [Features, attach points & misc](#features-attach-points--misc)

---

## base_spec & identity

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `base_spec` | string | — | Path to a parent unit JSON to deep-merge under this one. See [README](README.md#how-specs-combine--base_spec). |
| `unit_name` | string | falls back to `display_name` | Internal/long name. |
| `display_name` | string | `{no display name}` | UI name. `!LOC:` prefix = localizable. |
| `description` | string | `{no description}` | Tooltip text. `!LOC:` prefix = localizable. |
| `replaceable_units` | array[string] | `[]` | Unit ids this one upgrades/replaces in a build queue. |
| `display_group` | int | `0` | UI ordering group, clamped `[0,999]`. |
| `display_index` | int | `0` | UI order within group, clamped `[0,999]`. |

---

## Cost, health & decay

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `max_health` | number | `0` | Hit points. |
| `build_metal_cost` | number | `0` | Metal cost to build the unit. (Energy cost and build time derive from the building tool's `construction_demand`, not from the unit.) |
| `passive_health_regen` | number | `0` | Per-second HP regen. **Clamped to ≤ 0 by the sim — positive values are unsupported.** |
| `armor_type` | enum (`AT_*`) | `AT_None` | Damage-table armor class. See [armor types](enums-and-vocabulary.md#armor-types-armortype--at_). |
| `energy_efficiency_requirement` | number | `0` | Minimum economy energy efficiency `[0,1]` for the unit to operate (radar, teleporter, etc.). |
| `atrophy_rate` | number | `0` | HP lost/sec when out of build range / unpowered (decaying structures). |
| `atrophy_cool_down` | number | `0` | Seconds before atrophy begins. |
| `wreckage_health_frac` | number | `0.5` | Fraction of `max_health` the wreckage spawns with. `0` = no wreck. |

---

## unit_types & command_caps

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `unit_types` | array[enum `UNITTYPE_*`] | — (**required**) | Category flags driving buildable filters, targeting, and AI. Stored as a 128-bit mask. |
| `command_caps` | array[enum `ORDER_*`] | `[]` | Orders the unit accepts. |

Full value lists with meanings:
[unit_types](enums-and-vocabulary.md#unit_types-unittype_) ·
[command_caps](enums-and-vocabulary.md#command_caps-orderkind).

```json
"unit_types": ["UNITTYPE_Bot","UNITTYPE_Mobile","UNITTYPE_Offense","UNITTYPE_Land",
               "UNITTYPE_Basic","UNITTYPE_FactoryBuild","UNITTYPE_Amphibious"],
"command_caps": ["ORDER_Move","ORDER_Patrol","ORDER_Attack","ORDER_Assist","ORDER_Use"]
```

---

## navigation (movement)

Object (`nav::AgentSpec`, `libs/nav/agent.cpp`). **Omit the whole block to make an
immobile unit** (no movement agent is created). Angles are in degrees.

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `type` | enum (MoveType) | `land-small` | Movement domain. See [move types](enums-and-vocabulary.md#movetype-navigationtype). |
| `inter_planetary_type` | enum | `System` if orbital, else `None` | Interplanetary travel: `None`, `GravWell`, `System`. |
| `turn_in_place` | bool | `false` | Allow turning while stationary. |
| `acceleration` | number | `5.0` | m/s² speed increase. |
| `brake` | number | `10.0` | m/s² deceleration. `-1` is commonly used to mean "no explicit brake". |
| `move_speed` | number | `10.0` | Max horizontal speed (m/s). |
| `turn_speed` | number (deg/s) | `90` | Max turn rate. |
| `turn_accel` | number (deg/s²) | `0` | Turn acceleration. |
| `vertical_speed` | number | `20.0` | Max vertical speed (m/s) — air units. |
| `dodge_radius` | number | `5.0` | Neighbor distance that triggers dodging. |
| `dodge_multiplier` | number | `1.0` | Dodge strength; `0` disables dodging. |
| `aggressive_behavior` | enum (MoveBehavior) | `Follow` | Movement while attacking: `Point`, `Follow`, `Line`, `Circle`. |
| `aggressive_distance` | number | `10.0` | Desired distance to target before turning to goal. |
| `aggressive_height` | number | `0` | Desired height over target (bombers). |
| `hover_time` | number | `-1.0` | Air: hover duration before landing. `-1` = never land. |
| `circle_min_time` / `circle_max_time` | number | `1.0` / `3.0` | Air: min/max time before switching circle direction. |
| `bank_factor` | number | `1.0` | Air: roll/tilt scale when turning. |
| `wobble_factor` | number | `0.2` | Air: wobble amount `[0,1]`. |
| `wobble_speed` | number | `0.1` | Air: wobble rotation speed. |
| `group_preference` | enum | `None` | Formation slot: `front`, `center`, `side`, `back`. |
| `leash_distance` | number | `10.0` | Distance kept when assisting a moving target. |
| `leash_behavior` | enum (MoveBehavior) | `Point` | Behavior when leashed. |
| `ignore_overshoot` | bool | `false` | Suppress the brake-vs-speed overshoot warning. |
| `park_stamp` | object (CostStamp) | — | Nav cost stamp written when parked. See [Cost stamps](#cost-stamps). |

---

## physics (collision body)

Object (`PhysicsSpec`, `libs/physics/dynamic_obj.cpp`).

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `type` | enum (PhysicsType) | `Mobile` | Body type. **Structures must set `"Structure"`.** |
| `radius` | number | `3.0` | Steering/collision radius (m). |
| `shape` | enum | `Sphere` | `Sphere` or `Box` (Box forces `sync_radius_to_extents`). |
| `collision_layers` | enum (WorldLayer) | `WL_AnyGround` | Mesh layers this body collides with. |
| `collide_with_types` | array[enum PhysicsType] | `All` | Object types allowed to collide. |
| `air_friction` | number | `0` | Air drag. |
| `gravity_scalar` | number | `1.0` | Gravity multiplier. |
| `ignore_gravity` | bool | `false` | Disable gravity. |
| `orient_interp_rate` | number (deg/s) | `0` | Client orientation interpolation rate. |
| `add_to_spatial_db` | bool | `true` | Add to spatial DB (projectiles set false for perf). |
| `allow_pushing` | bool | `true` | Can be pushed by other bodies. |
| `push_sideways` | bool | `true` | Allow sideways pushing. |
| `allow_underground` | bool | `false` | Don't snap above ground. |
| `sync_radius_to_extents` | bool | `true` | Keep radius synced to mesh extents. |
| `underwater` | bool | `false` | Treated as underwater. |

---

## recon (vision / radar / visibility)

Object with two sub-objects (`libs/paent/recon_spec.cpp`). `observer` is what the
unit can **see**; `observable` is how the unit is **seen** by others.

### recon.observer.items[] — detection volumes

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `layer` | enum (ReconLayer) | `surface_and_air` | `underwater`, `surface_and_air`, `orbital`, `celestial`, `mine`. |
| `channel` | enum (ReconChannel) | `sight` | `sight`, `radar`, `deep_space`, `radar_jammer`. |
| `shape` | enum | `sphere` | `sphere` or `capsule`. |
| `radius` | number | `1` | Detection radius (m). |
| `height` | number | `1` | Capsule height (only when `shape=capsule`). |
| `uses_energy` | bool | `false` | Sensor only active when energy-efficient. |

```json
"recon": { "observer": { "items": [
    { "layer": "surface_and_air", "channel": "sight", "shape": "capsule", "radius": 105 },
    { "layer": "underwater",      "channel": "sight", "shape": "capsule", "radius": 105 }
]}}
```

### recon.observable — how others see this unit

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `layer` | enum (ReconLayer) | `surface_and_air` | Layer it registers on. |
| `sphere_radius` | number | `5.0` | Observable size. |
| `ignore_sight` | bool | `false` | Invisible to sight. |
| `ignore_radar` | bool | `false` | Invisible to radar. |
| `always_visible` | bool | `false` | Always shown to all players. |
| `retain_visible` | bool | `false` | Stays visible once seen. |
| `show_ghost` | bool | `false` | Leaves a ghost/fog memory (structures). |

Related top-level: `influence_radius` (number, default `20.0`; if absent it is
derived from `mesh_bounds` and observer radii). Used by AI / control-point influence.

---

## tools (weapons & build arms wiring)

`tools` is an array of mount entries. Each binds an external tool spec (a weapon or
build arm, see [tool-weapon-reference.md](tool-weapon-reference.md)) to bones on this
unit's model. The tool's *behaviour* lives in the referenced file; the *placement*
lives here.

| JSON key (`tools[]`) | Type | Default | Meaning |
|---|---|---|---|
| `spec_id` | string | — (**required**) | Path to the tool/weapon/build-arm JSON. |
| `aim_bone` | string | `"bone_root"` | Bone the tool aims from / pivots around. |
| `muzzle_bone` | string \| array[string] \| null | `[""]` | Muzzle bone(s) projectiles fire from. Array round-robins muzzles per projectile. |
| `projectiles_per_fire` | int | `1` | Projectiles per fire event, clamped to `[0, #muzzle_bones]`. |
| `record_index` | int | `0` | Weapon target slot, clamped `[-1, 3]`. |
| `show_range` | bool | `true` | Draw this weapon's range ring in the UI. |
| `fire_event` | enum (UnitEvent) | `Fired` | Which unit event triggers firing. Recoil controls bind to this name (e.g. `fired0`). |
| `primary_weapon` | bool | `false` | Mark as the primary weapon. |
| `secondary_weapon` | bool | `false` | Mark as the secondary weapon (used by `ORDER_FireSecondaryWeapon`). |

```json
"tools": [
    { "spec_id": "/pa/units/land/assault_bot/assault_bot_tool_weapon.json",
      "aim_bone": "socket_aim",
      "projectiles_per_fire": 2,
      "muzzle_bone": ["socket_leftMuzzle", "socket_rightMuzzle"] }
]
```

The engine auto-derives indices: the first `BuildArm` tool sets the unit's build arm;
the first weapon is primary unless one is flagged `primary_weapon`.

---

## Economy: production / consumption / storage

Each is an object with `energy` and/or `metal` (both default `0`), parsed by
`Resources::parse`.

| JSON key | Type | Meaning |
|---|---|---|
| `production` | object `{energy?, metal?}` | Resources generated per second while operating. |
| `consumption` | object `{energy?, metal?}` | Resources drained per second. |
| `storage` | object `{energy?, metal?}` | Added to the player's storage cap. |

```json
"production":  { "metal": 7 },
"storage":     { "energy": 100000, "metal": 1500 }
```

---

## Factory & build

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `buildable_types` | string (set-expression) | `""` | Boolean expression of unit-type tags this factory/fabber can build. See [set-expression grammar](enums-and-vocabulary.md#unit-type-set-expression-grammar). |
| `buildable_projectiles` | array[string] | `[]` | Projectile/ammo specs this unit can build (nuke / anti-nuke launchers). |
| `rolloff_dirs` | array[vec3] | `[]` | Directions newly built units exit a factory. |
| `wait_to_rolloff_time` | number | `0` | Delay before rolloff. |
| `factory_cooldown_time` | number | `5.0` | Cooldown between produced units. |

```json
"buildable_types": "Bot & Mobile & Basic & FactoryBuild"
```

### factory (object, `FactorySpec`)

| JSON key (`factory`) | Type | Default | Meaning |
|---|---|---|---|
| `store_units` | bool | `false` | Hold finished units internally (missile silos). |
| `deploy_projectile` | string | `""` | Projectile used to deploy stored units. |
| `hide_deploy_projectile` | bool | `false` | Hide that projectile. |
| `hide_stored_units` | bool | `false` | Hide stored units visually. |
| `spawn_points` | array[string] | `[]` | Bone names where units/ammo spawn. |
| `default_ammo` | array[string] | `[]` | Default ammo specs to keep loaded. |
| `initial_build_spec` | string | `""` | Auto-build this on completion (silo auto-loads a missile). |
| `default_build_stance` | enum | `Normal` | `Normal` or `Continuous`. |
| `pass_on_orders` | bool | `true` | Pass orders to produced units. |

### orders (object, `OrdersSpec`)

| JSON key (`orders`) | Type | Default | Meaning |
|---|---|---|---|
| `handler_type` | enum | `default` | `default`, `factory`, or `inert`. |

### Cost stamps

`navigation.park_stamp`, `structure.cost_stamp`, and top-level `build_stamp` all use
the same `CostStampSpec` object (writes nav-pathing cost into the world):

| JSON key | Type | Meaning |
|---|---|---|
| `shape` | enum | `sphere` or `box`. |
| `cost` | int (0-255) | Pathing cost value (simple stamps). |
| `type_data` | array[`{move_type, stamp_type}`] | Per-movetype behavior. `stamp_type` is `simple` or `structure`. |

---

## Geometry, placement & area-build

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `mesh_bounds` | vec3 | `[10,10,10]` | dx, dy, dz bounding volume (m). |
| `wreckage_mesh_bounds` | vec3 | `[10,10,10]` | Wreck bounding volume. |
| `placement_size` | array[2] number | derived from `mesh_bounds` | Footprint for overlap/placement checks. |
| `icon_vertical_offset` | number | `mesh_bounds.z / 2` | Height to float the strategic icon. |
| `area_build_separation` | number | `2.0` | Spacing between buildings in area build. |
| `alt_area_build_separation` | number | = `area_build_separation` | Alt-mode spacing. |
| `area_max_radius` / `alt_area_max_radius` | number | `0` | Max radius for circular area build. |
| `area_build_type` / `alt_area_build_type` | enum | `Invalid` | Area-build shape (`Sphere`, `Line`, …). |
| `area_build_pattern` / `alt_area_build_pattern` | array[array[bool]] | `[]` | 2D grid mask for stamped patterns. |
| `legacy_orientation_hack` | bool | `false` | Rotate old-style buildings on line build. |
| `flip_drag_orientation` | bool | `false` | Flip "forward" when orienting placement. |
| `spawn_layers` | enum (WorldLayer) | `WL_AnySurface` | Where the unit may be placed/spawned. |
| `build_restrictions` | string (space-sep) | `None` | Planet-type limits: `Terrainless`, `MetalPlanet`, `Thrustable`. |
| `TEMP_texelinfo` | number | `5.0` | Legacy texel hint — not a real volume; do not rely on it. |

---

## Targeting & guard behavior

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `guard_radius` | number | `0` | Radius within which a guarding/patrolling unit auto-engages. |
| `guard_layer` | enum (WorldLayer) | `WL_Invalid` | Layer restriction for guard targeting. |
| `attack_range_frac` | number | `1.0` | Fraction of weapon range used when deciding to engage. |
| `nearby_target_tick_update_interval` | int | `10` | Ticks between nearby-target rescans. |
| `maintain_priority_target` | bool | `true` | Keep priority target after a move order. |
| `stop_clears_nearby_targets` | bool | `false` | A Stop order clears auto-acquired targets. |

---

## model & animation (client)

`model` may be a **single object** OR an **array of objects** (one per world layer —
e.g. distinct land vs. sea building variants; each array entry then requires a
`layer`).

| JSON key (`model` / `model[]`) | Type | Default | Meaning |
|---|---|---|---|
| `filename` | string | `""` | `.papa` mesh. Textures `_diffuse`, `_material`, `_mask` of the same base name are auto-loaded. |
| `layer` | enum (WorldLayer) | — | Required when `model` is an array; selects which surface this variant is used on. |
| `animations` | object `{state: path}` | `{}` | Map of animation-state name → `.papa` clip. Keys are modder-chosen (see note). |
| `animtree` | string | `""` | Animation tree JSON controlling blending. |
| `walk_speed` | number | `10` | Reference speed for walk-cycle playback rate. |
| `skirt_decal` | string | — | Ground skirt decal spec (structures). |

The `animations` keys (`idle`, `walk`, `aim_up`, `aim_down`, `death01`,
`build_start`/`build_loop`/`build_end`, …) are **conventions chosen by the modder**;
the animation tree's `playback` nodes look these names up. The only engine-special
name is `idle`. See [animation-tree-reference.md](animation-tree-reference.md#how-anim_name-maps-to-the-model).

```json
"model": {
    "filename": "/pa/units/land/assault_bot/assault_bot.papa",
    "animations": {
        "death01": "/pa/units/land/assault_bot/assault_bot_anim_death01.papa",
        "walk":    "/pa/units/land/assault_bot/assault_bot_anim_run.papa",
        "idle":    "/pa/units/land/assault_bot/assault_bot_anim_idle.papa",
        "aim_up":  "/pa/units/land/assault_bot/assault_bot_anim_aim_up.papa",
        "aim_down":"/pa/units/land/assault_bot/assault_bot_anim_aim_dwn.papa"
    },
    "animtree": "/pa/anim/anim_trees/bipedal_mech_anim_tree.json",
    "walk_speed": 20
}
```

### Strategic icon & selection (client)

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `strategic_icon_priority` | number | `1.0` | Strategic-icon draw priority (lower = more important; commander uses `0`). |
| `si_name` | string | — | Overrides strategic-icon base-name lookup. |
| `lod_hide_pixelsize` | number | `32.0` | Pixel size below which the mesh stops drawing. |
| `selection_icon` | object | — | Selection ring: `.diameter`, `.thickness`, `.vertical_offset`. |
| `selection_bais_scale` | number | `5.0` | (sic — keep the typo) selection-circle bias = footprint × value. |
| `mesh_bounds` | vec3 | `[10,10,10]` | Also used client-side for icon placement. |

---

## Wreckage & death

### wreckage (object)

| JSON key (`wreckage`) | Type | Default | Meaning |
|---|---|---|---|
| `collision_types` | array[enum PhysicsType] | `[]` | Collision the wreck has (`"none"` = pass-through). |
| `remove_ground_cost_stamp` | bool | `false` | Remove the nav cost stamp when wrecked. |

> **Gotcha:** `WreckageSpec::parse` reads `collision_types`, but the stock base specs
> write `collision`. The `collision` key is therefore inert — use `collision_types`.

### death (object) & death-related top-level fields

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `death.decals` | array[string] | `[]` | Scorch/decal specs placed on death. |
| `spawn_unit_on_death` | string | `""` | Unit id spawned when this unit dies. |
| `death_weapon` | object | — | Explosion-on-death (commander nuke): `.ground_ammo_spec`, `.air_ammo_spec`, `.air_height_threshold`. |
| `has_death_effects` | bool (client) | `false` | Whether authored death effects play. |

---

## events & audio & fx (client)

### events — map of UnitEvent → response

Object keyed by event name: `build_complete`, `fired`, `died`, `destroyed`,
`teleported`, `enabled`, `disabled`, etc. An empty `{}` value **erases** an inherited
response.

| JSON key (`events.<event>`) | Type | Default | Meaning |
|---|---|---|---|
| `audio_cue` | string | `"null"` | Sound cue path. |
| `audio_interplanetary` | bool | `false` | Audible across planets. |
| `effect_spec` | string | `"null"` | PFX effect spec; may include space-separated bone(s) and multiple effect+bone pairs. |
| `effect_scale` | number | `1.0` | Effect scale. |
| `effect_world_aligned` | bool | `true` | Align effect to world vs. unit. |
| `effect_world_scaled` | bool | `false` | Scale effect in world space. |
| `camera_shake` | object | — | `duration`, `min_falloff_dist`, `max_falloff_dist`, `interval_variance`, plus curve refs. |

```json
"events": {
    "fired": {
        "audio_cue": "/SE/Weapons/bot/assault_fire",
        "effect_spec": "/pa/effects/specs/default_small_muzzle_flash.pfx socket_rightMuzzle /pa/effects/specs/default_small_muzzle_flash.pfx socket_leftMuzzle"
    }
}
```

### audio (client)

| JSON key (`audio`) | Type | Meaning |
|---|---|---|
| `loops` | object `{name: loopspec}` | Looping sounds. Each loop: `cue`, `flag` (e.g. `vel_changed`, `build_target_changed`, `enable_changed`), `should_start_func` / `should_stop_func` (predicate names), `interplanetary` (bool). Empty `{}` erases an inherited loop. |
| `selection_response` | object | Selection sound: `.cue`. |
| `sing_selection_response` | object | Singing/easter-egg selection sound. |
| `command_response` | object | Sound when given an order. |

### fx_offsets (client)

Array (or single object) of persistent attached effects:

| JSON key (`fx_offsets[]`) | Type | Meaning |
|---|---|---|
| `type` | enum | `Idle`, `Enabled`, `Energy`, `Build`, `Moving`, `Moving_Forward`, `Phasing`, `Shield`. |
| `filename` | string | PFX spec. |
| `bone` | string | Attach bone. |
| `offset` | vec3 | Local offset. |
| `orientation` | vec3 (deg) | Yaw/pitch/roll. |

### Lights (client)

Both `headlights[]` and `lamps[]` accept a single object or an array.

- **headlights[]:** `gobo`, `offset`, `orientation`, `near_width`/`near_height`/`near_distance`/`far_distance`, `color`, `intensity`, `bone`, `shadow_resolution`, `debug`.
- **lamps[]:** `offset`, `radius`, `color`, `intensity`, `bone`, `debug`.

### orbital_offset[] (client)
Per-view-type orbital connector lines: `view_type` (`Ally`/`Enemy`/`Selected`/`Unselected`/`Preview`), `enabled`, `effect`, `texture`, `use_team_color`, `color_at_ground`/`color_at_unit`, `uv_factor`, `scale`, `offset_from_unit`, `offset_from_ground`.

---

## Shield

`shield` (object, `ShieldSpec`). Fully parsed but not present in stock base content
(an expansion / Titans feature).

| JSON key (`shield`) | Type | Default | Meaning |
|---|---|---|---|
| `radius` | number | `0` | Bubble radius. **Hard-capped at 200.** |
| `energy_demand` | number | `0` | Energy/sec to maintain. |
| `max_health` | number | `0` | Shield HP pool. |
| `recharge_rate` | number | `0` | HP/sec regen. |
| `cooldown_time` | number | `0` | Delay after collapse before recharging. |
| `recharge_requires_efficiency` | bool | `false` | Only recharge when economy is efficient. |

---

## Transport

### transportable (object) — this unit CAN be carried

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `size` | int | `1` | Slots consumed in a transport. (May be `{}` to mark transportability with default size.) |

### transporter (object) — this unit CARRIES others

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `capacity` | int | `1` | Total slots. |
| `load_range` | number | `10.0` | Pickup range. |
| `chase_range` | number | `20.0` | Range to chase a unit to load. |
| `transportable_unit_types` | string (set-expression) | `""` | Who can be carried. |
| `transporter_attach_bone` | string | `""` | Bone carried units attach to. |
| `transportable_attach_offset` | string | `""` | Named attachment offset. |
| `transportable_layers` | array[enum WorldLayer] | `WL_AnyLayer` | Which layers' units can be loaded. |

---

## Teleport

| Block | Key | Type | Default | Meaning |
|---|---|---|---|---|
| `teleporter` | `type` | enum | `land` | `land` or `orbital`. |
| | `energy_demand` | number | `500` | Energy/sec while active. |
| | `radius` | number | `25.0` | Effect radius (orbital type). |
| `teleportable` | — | object | — | Marks the unit teleportable (often `{}`, no fields). |
| `mass_teleporter` | `radius` | number | `75.0` | Capture radius. |
| | `phasing_duration` | number | `5.0` | Phase-in time. |
| | `phasing_health_frac` | number | `0.1` | HP fraction during phasing. |
| | `energy_drain` | number | `5000` | Energy/sec while charging. |
| | `energy_cost` | number | `10000` | One-time energy cost. |
| | `unit_cap` | int | `-1` | Max units (−1 = unlimited). |
| | `max_range` | number | `-1.0` | Max teleport distance (−1 = unlimited). |
| `useable` | `type` | enum | `transport` | `teleporter` or `transport`. |
| | `range` | number | `10.0` | Use range. |

---

## Orbital & interplanetary

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `show_in_orbital_layer` | bool | `false` | Render in orbital view. |
| `enable_orbital_shell` | bool | `false` | Add orbital shell mechanics. |
| `activates_control_point` | bool | `false` | Activates a planetary control point. |
| `system_velocity_multiplier` | number | `0` | Inter-system travel speed scale. |
| `gravwell_velocity_multiplier` | number | `0` | Gravwell travel speed scale. |
| `planetary_arrival_cooldown_time` | number | `0` | Cooldown after arriving at a planet. |
| `orbital_thruster` | object | — | `.power` — thrust for planet-moving engines. |

---

## Features, attach points & misc

| JSON key | Type | Default | Meaning |
|---|---|---|---|
| `feature_requirements` | array[enum FeatureType] | `None` | Map features required to build (metal/geothermal spots). |
| `force_snap_to_feature_orientation` | bool | `false` | Orient to the feature. |
| `feature_snap_ignores_pathability` | bool | `false` | Allow snap even on unpathable terrain. |
| `attachable` | object | — | Named bone offsets for child attachments: `.default_attach_bone`, `.offsets` (`{name: [x,y,z]}`). |
| `scrolling_uv` | object | — | Tank-tread UV scroll: `.scroll_rate`, `.uv_split`. |
| `ai_metal_extractor_names` | object `{basic, advanced}` | — | AI hints mapping to extractor unit names. |

```json
"attachable": { "offsets": { "root": [0,0,0], "head": [0,0,3.5] } }
```
