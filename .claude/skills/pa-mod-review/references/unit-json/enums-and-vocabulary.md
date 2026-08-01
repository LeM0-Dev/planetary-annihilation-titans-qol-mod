# Shared Enums & Vocabulary Reference

Every enumerated string used across unit, tool, ammo, and animation specs, with its
full value list and meaning — verified against the C++ enum definitions, not inferred
from JSON usage.

**Parser conventions (apply to every enum below):**
- Matching is **case-insensitive**.
- Most enums accept an **optional prefix** (`UNITTYPE_`, `ORDER_`, `AT_`, `WL_`,
  `SOURCE_`, `TOOL_`, `ARC_`, `RET_`, `AMMO_`, `FLIGHT_`, `INTER_`). It is stripped if
  present. The prefix is noted per section.
- Unrecognized strings are skipped with an error log (the surrounding flag set simply
  lacks that bit).

## Contents

- [unit_types](#unit_types-unittype_)
- [command_caps](#command_caps-orderkind)
- [Armor types](#armor-types-armortype--at_)
- [World layers](#world-layers-worldlayer--wl_)
- [PhysicsType](#physicstype)
- [MoveType](#movetype-navigationtype)
- [Recon channels / layers / shapes](#recon-channels--layers--shapes)
- [ammo_source](#ammo_source-ammosource--was_)
- [tool_type / arc_type / reclaim_types](#tool_type--arc_type--reclaim_types)
- [Ammo flight & damage enums](#ammo-flight--damage-enums)
- [Unit-type set-expression grammar](#unit-type-set-expression-grammar)
- [Source file map](#source-file-map)

---

## unit_types (`UNITTYPE_*`)

**JSON key:** `unit_types` (array). **Prefix:** optional `UNITTYPE_`. **Source:**
`libs/paent/unit_types.{h,cpp}`. Stored as a 128-bit mask; one bit per flag.

### Class / chassis
| Value | Meaning |
|-------|---------|
| Commander | The player's commander unit |
| SupportCommander | Secondary/support commander (Avatar) |
| Fabber | Fabricator / builder unit |
| Bot | Walking bot chassis |
| Tank | Tracked tank chassis |
| Vehicle | Wheeled/tracked vehicle chassis |
| Bomber | Air unit that drops bombs |
| Fighter | Air-superiority interceptor |
| Gunship | Hovering air gun platform |
| Transport | Carries other units |
| Teleporter | Teleport structure/unit |
| Scout | Fast recon unit |
| Structure | Stationary building |
| Wall | Wall / barrier segment |
| Sub | Submarine (underwater naval) |
| Titan | Experimental tier-3 super unit |
| Debug | Debug-only / test unit |

### Domain (movement realm)
| Value | Meaning |
|-------|---------|
| Land | Operates on land |
| Naval | Operates on/in water |
| Air | Operates in the air layer |
| Orbital | Operates in orbit |

### Mobility modifiers
| Value | Meaning |
|-------|---------|
| Mobile | Can move (not a structure) |
| Hover | Hovers over land and water surface |
| WaterHover | Hovers on shallow ("brown") water |
| Amphibious | Travels on land and seafloor |
| Interplanetary | Can move between planets |

### Role
| Value | Meaning |
|-------|---------|
| Offense | Offensive combat unit |
| Defense | Defensive unit/structure |
| Economy | Economy/resource unit |
| Factory | Produces units |
| Recon | Provides reconnaissance/vision |
| Construction | Can construct/build |
| Deconstruction | Can reclaim/deconstruct |
| MetalProduction | Produces metal |
| EnergyProduction | Produces energy |

### Weapon / defense subtype
| Value | Meaning |
|-------|---------|
| Nuke | Nuclear launcher |
| NukeDefense | Anti-nuke defense |
| Tactical | Tactical-missile capable |
| TacticalDefense | Anti-tactical-missile defense |
| MissileDefense | Generic missile-interception defense |
| AirDefense | Anti-air defense |
| SurfaceDefense | Anti-surface (ground/naval) defense |
| OrbitalDefense | Anti-orbital defense |
| LaserPlatform | Laser-weapon platform |
| Artillery | Long-range indirect artillery |
| Heavy | Heavy weapon/unit class |
| SelfDestruct | Can self-destruct |
| Shield | Shield generator |
| Radar | Radar provider |
| RadarJammer | Jams enemy radar |

### Structure / special function
| Value | Meaning |
|-------|---------|
| ControlModule | Control module for a super-structure |
| PlanetEngine | Planet-moving engine (Halley) |
| Important | Strategically important (UI/AI weighting) |
| NoBuild | Cannot be built (spawned only) |

### Tech tier
| Value | Meaning |
|-------|---------|
| Basic | Tier-1 / basic tech |
| Advanced | Tier-2 / advanced tech |

### Build-source tags (who can build this)
| Value | Meaning |
|-------|---------|
| CmdBuild | Buildable by commander |
| FabBuild | Buildable by basic fabber |
| FabAdvBuild | Buildable by advanced fabber |
| FabOrbBuild | Buildable by orbital fabber |
| FactoryBuild | Buildable from a factory |
| CombatFabBuild | Buildable by basic combat fabber |
| CombatFabAdvBuild | Buildable by advanced combat fabber |
| CannonBuildable | Buildable via the Unit Cannon |

### Custom / mod-reserved
| Value | Meaning |
|-------|---------|
| Custom1 … Custom58 | Mod-reserved tags. Numbering starts at `Custom1` (there is no `Custom0`); the parser caps at `Custom58` due to an MSVC nesting limit. Keep original bit positions stable. |

---

## command_caps (`OrderKind`)

**JSON key:** `command_caps` (array). **Prefix:** optional `ORDER_`. **Source:**
`libs/paent/order_kind.uberproto`, `paent_types.cpp`. Stored as a bitfield.

| Value | Meaning |
|-------|---------|
| Move | Can be ordered to move |
| SpecialMove | Special movement order (orbital/celestial moves) |
| Patrol | Can patrol (non-terminating order) |
| Build | Can build (fabber placement build) |
| FactoryBuild | Can queue factory production |
| Attack | Can attack a target |
| Reclaim | Can reclaim |
| Repair | Can repair |
| Assist | Can assist another unit (non-terminating order) |
| Use | Can use a useable target |
| Load | Can load into/onto a transport |
| Unload | Can unload from a transport |
| FireSecondaryWeapon | Can fire a manually-triggered secondary weapon |
| Ping | Can place a map ping |
| MassTeleport | Can perform a mass teleport |

> `AttackMove` exists in the enum but has **no string mapping** — it cannot be set by
> name through `command_caps`. `Patrol` and `Assist` are the non-terminating orders.

---

## Armor types (`ArmorType` / `AT_*`)

**JSON usage:** unit `armor_type` (single); ammo `armor_damage_map` keys. **Prefix:**
optional `AT_`. **Source:** `libs/paent/unit_spec.{h,cpp}`.

| Value | Meaning |
|-------|---------|
| None | No/default armor class |
| Structure | Buildings |
| Vehicle | Vehicle chassis |
| Bot | Bot chassis |
| Naval | Naval units |
| Air | Air units |
| Orbital | Orbital units |
| Commander | Commander armor class |
| Hover | Hover units |
| Shield | Shield armor class |
| Custom0 … Custom9 | Mod-reserved armor classes |

> **This is PA's entire "damage typing" system.** An ammo's `armor_damage_map` gives a
> per-armor-class damage **multiplier**; any class not in the map uses base `damage`.
> Combined with `damage_target` (HitPoints/Metal) and `ignore_shields`, that's it —
> there is **no separate `damage_type` enum** anywhere in the engine.

---

## World layers (`WorldLayer` / `WL_*`)

**JSON usage:** `flight_layer` (ammo), `spawn_layers` (unit), `target_layers` /
`assist_layers` / `reclaim_layers` (tool), `collision_layers` (physics),
`transportable_layers` (transport). **Prefix:** optional `WL_`. **Source:**
`libs/physics/types.{h,cpp}`. Bit-flag; array fields OR layers together. Empty/`"null"`
→ default.

### Base layers (single bits)
| Value | Meaning / typical user |
|-------|------------------------|
| Invalid | Invalid / unset |
| LandHorizontal (alias `Land`) | Flat land surface — tanks |
| LandVertical | Vertical/sloped surface — spider bots |
| Structure | Structure footprint layer |
| Seafloor | Sea bottom — amphibious (commander) |
| Underwater | Submerged — submarines |
| DeepWater | Deep-water surface — boats |
| WaterSurface | Water surface — hovercraft |
| Air | Air / stratosphere — planes |
| Orbital | Orbit / exosphere — satellites |
| Lava | Lava surface |
| AnyLayer | All layers (`0xFFFFFFFF`) |

### Composite "Any*" masks
| Value | Expands to |
|-------|------------|
| AnyLand | LandHorizontal + LandVertical |
| AnySurface | Structure + LandHorizontal + LandVertical + WaterSurface |
| AnyGround | Structure + LandHorizontal + LandVertical + Seafloor |
| AnyHorizontalGround | Structure + LandHorizontal + Seafloor |
| AnyHorizontalGroundOrWaterSurface | Structure + LandHorizontal + Seafloor + WaterSurface |
| AnyWater | WaterSurface + DeepWater + Underwater |
| AnyUnderWater | DeepWater + Underwater + Seafloor |
| AnyGroundOrWater | AnyGround + AnyWater |
| AnyWaterOrSeaFloor | AnyWater + Seafloor |
| AirOrOrbital | Air + Orbital |
| AnyLayer | every layer |

Defaults: `spawn_layers` → `AnySurface`; ammo `flight_layer` → `Air`; physics
`collision_layers` → `AnyGround`.

---

## PhysicsType

**JSON usage:** physics `type` (single); `collide_with_types`, `wreckage.collision_types`
(arrays). **Prefix:** optional `PT_`. **Source:** `libs/physics/dynamic_obj.{h,cpp}`.

| Value | Meaning |
|-------|---------|
| Mobile | Mobile (moving) collider |
| Projectile | Projectile collider |
| Structure | Stationary structure collider |
| None | No collision type |
| All | Collides with all types (internal; not in the string parser) |

> `"none"` is used in `wreckage.collision_types` to make a pass-through wreck.

---

## MoveType (`navigation.type`)

**JSON usage:** unit `navigation.type` (single). **No prefix** — hyphenated lowercase.
**Source:** `libs/nav/path_types.{h,cpp}`.

| JSON string | Meaning |
|-------------|---------|
| `land-small` | Small flat-land mover — tanks/bots |
| `amphibious` | Flat land and seafloor — commander |
| `amphibious-large` | Large amphibious — titans |
| `hover` | Land and water surface |
| `hover-large` | Large hover — titans |
| `water-hover` | Shallow ("brown") water |
| `deepwater` | Deep ("blue") water — boats |
| `underwater` | Submerged — submarines |
| `air` | Stratosphere — planes/jets/bombers |
| `orbital` | Exosphere — satellites |

> A separate **InterPlanetaryMoveType** (`None` / `GravWell` / `System`) governs
> cross-planet travel (unit `navigation.inter_planetary_type`, mirroring ammo's
> `interplanetary_type`).

---

## Recon channels / layers / shapes

**JSON usage:** inside `recon.observer.items[]` and `recon.observable`. **Source:**
`libs/paent/recon_spec.{h,cpp}`.

### Channels (`channel`, prefix optional `CHANNEL_`, default `sight`)
| Value | Meaning |
|-------|---------|
| `sight` | Line-of-sight vision |
| `radar` | Radar detection (blips) |
| `deep_space` | Deep-space / interplanetary sensing |
| `radar_jammer` | Jams enemy radar in range |

### Layers (`layer`, prefix optional `LAYER_`, default `surface_and_air`)
| Value | Meaning |
|-------|---------|
| `underwater` | Sees underwater units |
| `surface_and_air` | Sees surface and air units |
| `orbital` | Sees orbital units |
| `celestial` | Sees at celestial/interplanetary scale |
| `mine` | Mine-detection layer |

### Shapes (`shape`, prefix optional `SHAPE_`, default `sphere`)
| Value | Meaning |
|-------|---------|
| `sphere` | Spherical area (uses `radius`) |
| `capsule` | Capsule area (uses `radius` + `height`) |

---

## ammo_source (`AmmoSource` / `WAS_*`)

**JSON usage:** tool `ammo_source` (single). **Prefix:** optional `SOURCE_`. **Default:**
`infinite`. **Source:** `libs/paent/tool_spec.{h,cpp}`.

| Value | Meaning |
|-------|---------|
| `infinite` | Unlimited ammo, no cost |
| `energy` | Consumes energy to fire/regen (`ammo_demand`/sec) |
| `metal` | Consumes metal to fire/regen |
| `factory` | Pulls finished projectiles from the unit's factory queue (nukes, unit cannon) |
| `time` | Regenerates ammo over time (1/sec), no economy cost |

---

## tool_type / arc_type / reclaim_types

### tool_type (prefix optional `TOOL_`)
| Value | Meaning |
|-------|---------|
| `BuildArm` | Construction/build/reclaim tool |
| `Weapon` | Weapon tool |

> `Undefined` is the unset default (not parseable). `CaptureArm` is **not** recognized
> — capture is a disabled feature.

### arc_type (prefix optional `ARC_`, default `low`)
| Value | Meaning |
|-------|---------|
| `low` | Flat/direct firing arc |
| `high` | High lobbed (artillery) arc |
| `both` | May choose low or high |

### reclaim_types (array; prefix optional `RET_`)
| Value | Meaning |
|-------|---------|
| `Unit` | Can reclaim live units |
| `Wreckage` | Can reclaim wreckage |
| `Feature` | Can reclaim map features (rocks, trees, metal spots) |
| `Friendly_Commander` | Can reclaim a friendly commander |

---

## Ammo flight & damage enums

**Source:** `libs/paent/ammo_spec.{h,cpp}`. All case-insensitive.

### ammo_type (prefix optional `AMMO_`)
| Value | Meaning |
|-------|---------|
| `Projectile` | Physical projectile (needs a `flight_type`) |
| `Beam` | Instant beam weapon |
| `PBAOE` | Point-blank area-of-effect burst |

### flight_type (prefix optional `FLIGHT_`, default `Undefined`)
| Value | Meaning |
|-------|---------|
| `Ballistic` | Gravity-affected lobbed projectile |
| `Direct` | Straight-line shot |
| `Seeking` | Homing / tracking projectile |
| `Staged` | Multi-stage projectile (uses `stages[]`) |

### interplanetary_type (prefix optional `INTER_`, default `None`)
| Value | Meaning |
|-------|---------|
| `None` | Stays on one planet |
| `GravWell` | Can travel between planets sharing a grav-well |
| `System` | Can travel to any planet in the system |

### collision_check (no prefix, default `Enemies`)
| Value | Meaning |
|-------|---------|
| `Enemies` | Collides with any enemy |
| `Target` | Collides only with its locked target |
| `Ground` | Collides only with the ground |

### collision_response (no prefix, default `Impact`)
| Value | Meaning |
|-------|---------|
| `Impact` | Area-of-effect impact on collision |
| `Destroy` | Destroys a single target (only valid with `collision_check: Target`) |

### damage_target (no prefix, default `HitPoints`)
| Value | Meaning |
|-------|---------|
| `HitPoints` | Damages target health |
| `Metal` | Drains/reclaims target metal (harvest-style weapons) |

---

## Unit-type set-expression grammar

Several fields hold a **string boolean-expression over unit-type names** that resolves
to a *set of unit specs*. Evaluated by `UnitTypeDB::evalExpression`
(`libs/paent/unit_type_db.cpp`).

### Fields that use it
| Field | Spec | Meaning |
|-------|------|---------|
| `buildable_types` | unit | Set of units this unit/factory can build |
| `target_priorities` | tool | Array of expressions, evaluated in priority order |
| `exclude_unit_types` | tool | Set excluded from targeting |
| `transportable_unit_types` | transport | Set of units this transport can carry |

### Operators
| Operator | Name | Semantics |
|----------|------|-----------|
| `&` | AND (intersection) | Keep only specs in both. If the right-hand term is empty, the whole top-level expression short-circuits to empty. |
| `\|` | OR (union) | Add the right-hand specs. |
| `-` | MINUS / AND-NOT | Remove the right-hand specs. |
| `( … )` | grouping | Parenthesized sub-expression, OR-combined into the surrounding result. |

### Rules
- **Tokens** are runs of `[A-Za-z0-9_]`; each token is one unit-type flag (prefix
  `UNITTYPE_` optional, case-insensitive). A bare token = "all loaded specs carrying
  that flag".
- **Left-to-right, no operator precedence** — operators fold into the running result
  in encounter order. Use parentheses to control grouping. (`|` greedily consumes the
  following `&`/`-`/`(...)` chain as its right operand up to the next top-level `|`.)
- Whitespace (space character only) separates tokens. An expression must start with a
  token or `(`. Unknown token names contribute the empty set (with an error log).

### The candidate universe
`UnitTypeDB` is built from a **unit list spec** (`UnitListSpec`, JSON key `units` = an
array of spec paths). It records, per flag, the set of specs carrying it. So
`"Bot & Basic & FactoryBuild"` = all units in the loaded list that are simultaneously
Bot, Basic, and FactoryBuild; `"Mobile - Air"` = all Mobile units that are not Air.

```
"buildable_types":          "Bot & Mobile & Basic & FactoryBuild"
"target_priorities":        ["Mobile - Air", "Wall"]
"transportable_unit_types": "Bot & Basic"
"exclude_unit_types":       "Hover"
```

---

## Source file map

| Group | Source |
|-------|--------|
| unit_types, set-expression evaluator | `libs/paent/unit_types.{h,cpp}`, `unit_type_db.cpp`, `unit_list_spec.{h,cpp}` |
| OrderKind / ToolType / AmmoType | `libs/paent/*.uberproto`, parsers in `paent_types.cpp` |
| ArmorType, command-cap parse | `libs/paent/unit_spec.{h,cpp}` |
| AmmoSource / ArcType / ReclaimEntityType, layer parsing | `libs/paent/tool_spec.{h,cpp}` |
| FlightType / InterplanetaryType / CollisionCheck / CollisionResponse / DamageTarget | `libs/paent/ammo_spec.{h,cpp}` |
| WorldLayer | `libs/physics/types.{h,cpp}` |
| PhysicsType | `libs/physics/dynamic_obj.{h,cpp}` |
| MoveType | `libs/nav/path_types.{h,cpp}` |
| Recon channels/layers/shapes | `libs/paent/recon_spec.{h,cpp}` |
