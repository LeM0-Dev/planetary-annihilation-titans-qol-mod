# Animation Tree JSON Reference

Animation trees — e.g. `content/anim/anim_trees/bipedal_mech_anim_tree.json` —
describe how a unit's authored animation clips are blended and how procedural bone
controls (turret aim, recoil, giblets) are applied. A unit references one via
`model.animtree`.

Parsed by `client/client_anim_nodes.cpp` (with `client_unit.cpp`,
`client_unit_anim_events.cpp`, and `engine/crom/animation.cpp`). **Animation is
entirely client-side and cosmetic — it never affects the simulation.**

## Top-level structure

```jsonc
{
  "blend_root":        { ... },   // required: the root blend node (produces the pose)
  "skeleton_controls": [ ... ]    // optional: procedural bone controllers, applied in order
}
```

Two phases per frame:
1. The **`blend_root`** node tree produces a full skeletal pose (per-bone
   translation/rotation).
2. Each **`skeleton_controls`** entry is applied **in array order** on top of the
   resulting bone matrices (turret yaw/pitch, recoil offsets, faders, giblets).

If `blend_root` is missing/invalid, the tree falls back to a single `bind_pose`.
`skeleton_controls` must be an array; controls that fail to build (missing bone, bad
axis) are silently dropped.

## Contents

- [Enum quick reference](#enum-quick-reference)
- [blend_root node types](#blend_root-node-types)
  - [playback](#playback) · [bind_pose](#bind_pose) · [aim_blend](#aim_blend) · [walk](#walk) · [fly](#fly) · [toggle](#toggle) · [unit_state](#unit_state) · [sequence](#sequence) · [slotted_build_target](#slotted_build_target)
- [skeleton_controls types](#skeleton_controls-types)
  - [fader](#fader) · [procedural_aim](#procedural_aim) · [procedural_aim_yaw_pitch](#procedural_aim_yaw_pitch) · [recoil](#recoil) · [giblet](#giblet)
- [Playback events](#playback-events)
- [How anim_name maps to the model](#how-anim_name-maps-to-the-model)
- [How controls relate to weapons/tools](#how-controls-relate-to-weaponstools)
- [Annotated example](#annotated-example)

---

## Enum quick reference

**`blend_root` node `"type"` values:** `playback`, `aim_blend`, `bind_pose`, `walk`,
`fly`, `toggle`, `sequence`, `sequence_item`, `unit_state`, `slotted_build_target`.

**`skeleton_controls` `"type"` values:** `fader`, `procedural_aim`,
`procedural_aim_yaw_pitch`, `recoil`, `giblet`.

**`unit_state` child-state keys:** `being_built`, `living`, `dead`, `ghost` (all four
expected; a missing one becomes `bind_pose`).

**Fader `lerp_func`:** `is_active`, `not_being_built`, `is_dead`.

**`toggle` `func`:** `has_build_target`, `is_being_built`, `is_ghost`, `is_attached`,
`has_energy`, `is_moving`, `not_moving`, `is_moving_forward`, `is_hovering`.

**Sequence transition `func`:** `has_build_target`, `no_build_target`, `is_firing`,
`is_firing_and_moving`, `not_firing`, `has_energy`, `no_energy`, `has_full_ammo`,
`has_ammo`, `has_no_ammo`, `has_full_or_no_ammo`, `true_func`, `false_func`,
`is_attached`, `not_attached`, `is_moving`, `is_moving_faster_than`, `is_moving_fast`,
`is_moving_very_fast`, `is_moving_forward`, `is_hovering`, `not_moving`, `is_turning`,
`is_turning_faster_than`, `is_turning_left`, `is_turning_right`, `not_turning`,
`anim_complete`, `no_build_target_and_anim_complete`, `no_energy_and_anim_complete`.

**`transition_seek` `func`:** `has_build_target`, `is_attached`, `intro`, `true_func`.

**Entry `reset`:** `playback_reset`, `turning_reset`, `null`.

**Rotation axis (`rotation_axis`, `recoil_dir`):** `x`, `-x`, `y`, `-y`, `z`, `-z`.

**Playback event `type`:** `audio`, `effect`.

---

## blend_root node types

Every node is an object with a `"type"` key plus type-specific keys below.

### playback
Plays one named animation clip.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `type` | string | — | `"playback"`. |
| `anim_name` | string | — | **Required.** Key into the unit model's `animations` map (see [mapping](#how-anim_name-maps-to-the-model)). Not found → falls back to `bind_pose`. |
| `looping` | bool | `true` | Whether the clip loops. Transition funcs may disable looping to detect completion. |
| `rate` | number | `1.0` | Playback speed multiplier. |
| `enable_control` | bool | `true` | If `false`, skeleton controls are suppressed while this clip plays. |
| `events` | array | `[]` | Timed audio/effect events (see [Playback events](#playback-events)). |

### bind_pose
Outputs the rest pose, unmodified. Only `"type": "bind_pose"`. The universal fallback
and the most common leaf node.

### aim_blend
Additive vertical-aim layered onto a child animation, driven by weapon pitch.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `type` | string | — | `"aim_blend"`. |
| `aim_bone_root` | string | — | **Required.** Bone where the aim chain starts; **all descendant bones** receive the additive aim delta. |
| `weapon_index` | int | `0` | Which weapon's aim direction drives the blend. |
| `node_aim_down` | node | — | Pose when aiming fully down (blend = −1). |
| `node_aim_neutral` | node | — | Pose when level (blend = 0). |
| `node_aim_up` | node | — | Pose when aiming fully up (blend = +1). |
| `child` | node | — | Base animation the aim delta is added on top of (e.g. a `walk`). |

Blend = `asin(aimDir.z) / (π/2)`, clamped to [−1,1]. At 0 only `child` is sampled.
The delta applies only to the masked sub-chain; bones above `aim_bone_root` come
straight from `child`.

### walk
Blends idle ↔ walking by ground speed.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `type` | string | — | `"walk"`. |
| `node_idle` | node | — | Pose when stationary. |
| `node_walk` | node | — | Pose when moving; its time advances at `dt · speed / walk_speed` so the cycle syncs to movement. |

`walk_speed` comes from the **unit model spec** (`model.walk_speed`, default 10), not
the tree.

### fly
Blends idle ↔ flying by forward velocity fraction.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `type` | string | — | `"fly"`. |
| `node_idle` | node | — | Pose at zero forward speed. |
| `node_fly` | node | — | Pose near max speed. Blend = `forwardSpeed / maxVelocity`, smoothed. |

### toggle
Smoothly cross-fades between exactly two children based on a 0/1 function.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `type` | string | — | `"toggle"`. |
| `func` | string | — | A [toggle func](#enum-quick-reference). Returns 0 → favor `node_0`, 1 → favor `node_1`. Watch polarity (e.g. `has_energy` returns 0 when energy IS met). |
| `node_0` | node | — | Child shown when func returns 0. |
| `node_1` | node | — | Child shown when func returns 1. |

### unit_state
Top-level switch on the unit's lifecycle. `nodes` is an object whose keys are states.

| `nodes` key | Active when |
|---|---|
| `being_built` | under construction (`builtFrac < 1`). |
| `living` | built and `health > 0`. |
| `dead` | built and `health ≤ 0`. |
| `ghost` | unit is a recon ghost (highest priority). |

Priority: ghost → being_built → living → dead. Each value is a node.

### sequence
A state machine of named entries with transition rules.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `type` | string | — | `"sequence"`. |
| `entries` | array | — | Sequence entries (below). The **first entry** is the start state. Empty → bind_pose. |
| `transition_seek` | object | — | How to pick the entry when seeked on load/state re-entry. |

A sequence is "busy" whenever its current entry's `name` ≠ `"idle"` (the reserved
not-busy name).

#### Sequence entry
The entry's own `"type"` string is **not checked** — shipped content uses
`"sequence_entry"`, `"item"`, etc. interchangeably. Only these keys matter:

| Key | Type | Default | Meaning |
|---|---|---|---|
| `name` | string | — | **Required.** Unique entry name; transition target. `"idle"` means "not busy". |
| `node` | node | — | The inner pose node (usually `playback` or `bind_pose`). |
| `scale_to_move_speed` | bool | `false` | Advance the inner node at `dt · speed / walk_speed`. |
| `transitions` | array | `[]` | Transition objects (below). First match per tick wins. |
| `reset` | string | — | `playback_reset`, `turning_reset`, or `null` when this entry becomes active. |

#### Transition object
Each has a `transition_forward` and `transition_reverse` sub-object:

| Key | Type | Default | Meaning |
|---|---|---|---|
| `func` | string | — | A [transition func](#enum-quick-reference). When true, switch to `target`. |
| `target` | string | — | **Required.** Entry name to switch to. |
| `duration` | number (s) | `0.1` | Cross-fade time into the target. |
| `anim_complete` | bool | `false` | Also require the entry's `playback` to finish (disables looping to allow completion). |
| `speed` | number | `0` | Threshold for `is_moving_faster_than`. |
| `turn_rate` | number (deg/s) | `0` | Threshold for `is_turning_faster_than`. |

```jsonc
"transitions": [{
    "transition_forward": { "func": "anim_complete", "target": "build_loop", "duration": 0.2 },
    "transition_reverse": { "func": "anim_complete", "target": "idle" }
}]
```

#### transition_seek

| Key | Type | Default | Meaning |
|---|---|---|---|
| `func` | string | — | `has_build_target`, `is_attached`, `intro`, or `true_func`. |
| `true_target` | string | `"idle"` | Entry to seek to when func is true. |
| `false_target` | string | `"idle"` | Entry to seek to when func is false. |
| `time` | number | `0` | For `intro` only: intro duration (auto-derived from clip length). |

### slotted_build_target
Picks one of several build animations by the angular slot the build target sits in
(so a multi-armed factory plays the correct arm).

| Key | Type | Default | Meaning |
|---|---|---|---|
| `type` | string | — | `"slotted_build_target"`. |
| `no_build_target` | node | — | **Required.** Node used when there is no build target. |
| `slots` | array[node] | — | **Required.** One node per angular slot, evenly distributed over 360° (slot 0 = forward). |

---

## skeleton_controls types

Applied after the blend tree, in array order, mutating bone matrices directly.

### fader
Fades its single `child` control in/out over ~0.1 s.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `type` | string | — | `"fader"`. |
| `lerp_func` | string | — | **Required.** `is_active` (built and not ghost), `not_being_built` (built), or `is_dead`. |
| `child` | control | — | **Required.** The wrapped control (usually `procedural_aim` or `giblet`). At weight 0 it's skipped. |

A bare `procedural_aim` aims even while under construction; wrap it in a
`not_being_built`/`is_active` fader to disable aiming until finished.

### procedural_aim
Rotates one bone about a single local axis to point a weapon at its target.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `type` | string | — | `"procedural_aim"`. |
| `rotation_bone` | string | — | **Required.** Bone to rotate (turret yaw bone or pitch bone). Missing → dropped. |
| `rotation_axis` | string | — | **Required.** `x`/`-x`/`y`/`-y`/`z`/`-z`. Convention: `z` for yaw, `x` for pitch. Invalid → dropped. |
| `weapon_index` | int | `0` | Which weapon's aim direction to track. |

Stack two (a `z` yaw bone + an `x` pitch bone) for a full turret.

### procedural_aim_yaw_pitch
Single-bone combined yaw+pitch aim (when one bone does both). No `rotation_axis`.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `type` | string | — | `"procedural_aim_yaw_pitch"`. |
| `rotation_bone` | string | — | **Required.** The single bone to yaw and pitch. |
| `weapon_index` | int | `0` | Weapon whose aim to follow. |

### recoil
Translates a bone backward on fire, then restores.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `type` | string | — | `"recoil"`. |
| `bone` | string | — | **Required.** Bone to translate. Missing → dropped. |
| `recoil_dist` | number | `0` | Distance the bone snaps back on fire. |
| `restore_time` | number (s) | `0` | Seconds to return to rest. |
| `recoil_dir` | string | `y` | `x`/`-x`/`y`/`-y`/`z`/`-z` (unrecognized → `+y`). |
| `unit_event` | string | `Fired` | Unit event that triggers a recoil pulse. Stock content uses per-weapon names `fired0`…`fired3`, matching each weapon tool's `fire_event`. |

### giblet
Detaches a bone as a physics-driven flying chunk (death effect; gate behind an
`is_dead` fader).

| Key | Type | Default | Meaning |
|---|---|---|---|
| `type` | string | — | `"giblet"`. |
| `bone` | string | — | **Required.** Bone to fling. Missing → dropped. |
| `velocity` | vec3 | `[0,0,0]` | Base launch velocity (local). |
| `velocity_range` | vec3 | `[0,0,0]` | Randomized ± range added to `velocity`. |
| `angular_velocity` | vec3 (deg/s) | `[0,0,0]` | Base spin (Euler). |
| `angular_velocity_range` | vec3 (deg) | `[0,0,0]` | Randomized ± spin range. |
| `gravity` | number | `0` | Acceleration toward the gravity source. |
| `drag` | number | `0` | Angular drag on spin. |

---

## Playback events

Inside a `playback` node, `events` is an array of timed triggers:

| Key | Type | Meaning |
|---|---|---|
| `time` | number (s) | Time within the clip at which the event fires. |
| `type` | string | `"audio"` or `"effect"`. |
| `parameters` | object | Type-specific payload (below). |

**`audio` parameters:** `cue` (string, **required** — FMOD path), `warmup` (number,
optional).

**`effect` parameters:** `spec` (string, **required** — PFX path), `bone` (string,
**required**), `offset` (vec3, world), `bone_offset` (vec3, local), `bone_orient`
(yaw/pitch/roll), `effect_scale` (number, `1.0`), `attached` (bool), `death_effect`
(bool).

---

## How anim_name maps to the model

`anim_name` in a `playback` node is a **key into the unit model spec's `animations`
object**, not a file path:

```jsonc
// in the unit's model spec
"animations": {
  "idle":   "/pa/units/.../foo_anim_idle.papaanim",
  "walk":   "/pa/units/.../foo_anim_walk.papaanim",
  "aim_up": "/pa/units/.../foo_anim_aim_up.papaanim",
  "death01":"/pa/units/.../foo_anim_death.papaanim"
}
```

At build time the node does `animations.find(anim_name)`; if the name isn't present
the node falls back to `bind_pose` (with an error log). So names like `idle`, `walk`,
`aim_up`, `aim_down`, `build_start`/`build_loop`/`build_end`, `death01`,
`fire_start`/`fire_loop`/`fire_end`, `deploy`/`open`/`closed` are **conventions the
modder chose in that unit's `animations` map** — not engine-fixed. The only special
name is `idle` (sequences treat it as "not busy"). `walk_speed` (default 10) is also a
model-spec field.

---

## How controls relate to weapons/tools

- `procedural_aim`, `procedural_aim_yaw_pitch`, and `aim_blend` all aim using the
  selected `weapon_index`'s simulated `weapon_yaw`/`weapon_pitch`. `rotation_bone` /
  `aim_bone_root` must match the artist's turret/pitch pivot bone.
- `recoil`'s `unit_event` corresponds to a weapon tool's `fire_event`
  (default `Fired`). Stock content names them `fired0`…`fired3` so each recoil bone
  reacts only to its own barrel.
- **Typical turret pattern:** a `z`-axis `procedural_aim` on the yaw bone + an
  `x`-axis `procedural_aim` (or pitch bone) + one or more `recoil` controls, often
  wrapped in a `not_being_built` / `is_active` fader so they only activate once built.

---

## Annotated example

A walker/turret combo (condensed from `bipedal_mech_anim_tree.json`):

```jsonc
{
  "blend_root": {
    "type": "unit_state",                       // switch on lifecycle state
    "nodes": {
      "being_built": { "type": "bind_pose" },   // frozen while < 100% built
      "living": {
        "type": "aim_blend",                    // layer vertical aim onto the body anim
        "aim_bone_root": "bone_turret",         // aim delta applies to bone_turret + children
        "weapon_index": 0,
        "node_aim_down":    { "type": "playback", "anim_name": "aim_down" },
        "node_aim_neutral": { "type": "bind_pose" },
        "node_aim_up":      { "type": "playback", "anim_name": "aim_up" },
        "child": {
          "type": "walk",                       // idle <-> walk by ground speed
          "node_idle": { "type": "playback", "anim_name": "idle" },
          "node_walk": { "type": "playback", "anim_name": "walk" }
        }
      },
      "dead":  { "type": "playback", "anim_name": "death01", "looping": false },
      "ghost": { "type": "bind_pose" }
    }
  },

  "skeleton_controls": [
    { "type": "fader", "lerp_func": "not_being_built",   // turret yaw, only once built
      "child": { "type": "procedural_aim", "rotation_bone": "bone_turret", "rotation_axis": "z" } },
    { "type": "recoil", "bone": "bone_leftRecoil",  "recoil_dist": 0.75, "restore_time": 0.5,
      "recoil_dir": "-y", "unit_event": "fired0" },
    { "type": "recoil", "bone": "bone_rightRecoil", "recoil_dist": 0.75, "restore_time": 0.5,
      "recoil_dir": "-y", "unit_event": "fired1" }
  ]
}
```
