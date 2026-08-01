# Defects in the shipped base game

Found by running the review's own rules across PA:TITANS build 124667 — 2,158 spec JSON,
238 `.pfx` and 347 scripts. Every entry was verified by hand before being listed.
(First recorded against build 124666, which held 2,156 spec JSON; the 124667 patch added
two and changed none of the findings below.)

Recorded for two reasons:

1. **Mods inherit them.** A mod that starts from a vanilla effect or spec copies the defect
   with it. Legion Expansion carries both the `hover_ripple_01.papa` reference and the
   `splash_damages_allies` strings.
2. **They are the calibration baseline.** A `calibrate` run should reproduce exactly these
   counts. Anything more is a checker regression; anything less means PA patched something.

None of these break the game — they fail silently, which is precisely why they survived.

## 1. Dangling texture reference — 1 file

`pa_ex1/units/land/tank_hover/tank_hover_idle.pfx`, `emitter[2].spec.baseTexture`:

```
/pa/effects/textures/particles/hover_ripple_01.papa
```

That file does not exist anywhere in `pa/` or `pa_ex1/`. The hover-tank idle effect names a
texture the game does not ship.

Legion Expansion's `l_hover_tank_adv/hover.pfx` carried the same reference in release
1.32.1, having copied the vanilla effect. It has since been deleted on the mod's `develop`
branch.

## 2. `splash_damages_allies` typed as a string — 3 files

The ammo schema, derived from the C++ parser, expects a boolean. These ship a string:

- `pa/units/land/unit_cannon/unit_cannon_deploy.json`
- `pa/units/orbital/orbital_launcher/orbital_launcher_deploy.json`
- `pa_ex1/units/land/unit_cannon/unit_cannon_deploy.json`

Whether the parser coerces or ignores the value cannot be settled without the engine source.
If it ignores it, the setting silently does nothing. Legion Expansion has the same pattern in
`l_orbital_dropper_ammo.json` and `l_orbital_launcher_deploy.json`.

## 3. Mistyped particle keys — 20 files

PA's parsers read only keys they recognise and silently ignore the rest, so each of these
does nothing at all. Nothing is logged.

| Key as written | Intended | Files |
|---|---|---|
| `sixeY` | `sizeY` | `pa_ex1/units/air/titan_air/titan_air_death.pfx`, `pa_ex1/units/land/titan_bot/titan_bot_death.pfx`, `pa_ex1/units/land/titan_structure/titan_structure_death.pfx`, `pa_ex1/units/land/titan_vehicle/titan_vehicle_death.pfx`, `pa_ex1/units/orbital/titan_orbital/titan_orbital_death.pfx` |
| `sixeX` | `sizeX` | `pa_ex1/effects/specs/titan_orbital_smoke.pfx`, `pa_ex1/effects/specs/titan_smoke_01.pfx` |
| `emissionBurts` | `emissionBursts` | `pa/effects/specs/shell_proj_trail.pfx`, `pa/effects/specs/tank_light_proj.pfx`, `pa_ex1/units/land/tank_laser_adv/tank_laser_adv_proj_trail.pfx` |
| `velocityRangey` | `velocityRangeY` | `pa/units/land/bot_bomb/bot_bomb_ammo_explosion.pfx`, `pa_ex1/units/orbital/orbital_mine/orbital_mine_ammo_explosion.pfx` |
| `sizeRangeYY` | `sizeRangeY` | `pa/units/land/unit_cannon/unit_cannon_fire.pfx`, `pa_ex1/units/land/artillery_unit_launcher/artillery_unit_launcher_fire.pfx` |
| `sizeRageY` | `sizeRangeY` | `pa/units/land/land_mine/land_mine_ammo_explosion.pfx` |
| `velcotiyRangeZ` | `velocityRangeZ` | `pa/units/air/missile_orbital/missile_orbital_trail.pfx` |
| `camera_push` | `cameraPush` | `pa_ex1/units/air/solar_drone/solar_drone_ammo_beam.pfx` |
| `rotationRateX` | `rotationRate` | `pa_ex1/effects/specs/orbital_railgun_beam.pfx` |
| `sizeZ` | `size` | `pa_ex1/units/orbital/orbital_probe/orbital_probe_on.pfx` |
| `loopstart` | `loopStart` | `pa/effects/specs/default_launch_target.pfx` |

The five `sixeY` cases are all Titan death effects, so the same file was evidently copied
between units with the typo intact — the single clearest illustration of why a mod that
starts from a vanilla effect should be checked rather than trusted.

**Caveat on `loopstart`:** the checker suggests the documented `startLoop`, but the base game
uses the undocumented `loopStart` in 15 files against `startLoop`'s 8. `loopStart` is
therefore the more likely intent. Both spellings appear to work; only the all-lowercase form
is definitely wrong.

## 4. Effect with no emitters — 1 file

`pa/effects/specs/default_radius_indicator.pfx` has an empty `emitters` array, so it loads
and produces nothing.

## What this means for the vocabulary snapshot

`references/pfx-keys.json` records the keys PA actually uses, but **quarantines the ones
above** so that a mod repeating them is still reported. Without that, `emissionBurts` would
have been absorbed as legitimate vocabulary and never flagged again.

Quarantine is decided by relative frequency, not an absolute count: `emissionBurts` appears
in 3 files against `emissionBursts`'s 183 (1.6%, a typo), whereas `loopStart` appears in 15
against `startLoop`'s 8 (187%, real vocabulary). An absolute threshold gets `loopStart`
wrong.
