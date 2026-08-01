# Particle system (.pfx) reference

Transcribed from *Planetary Annihilation Particle System Guide* by Ben Golus (updated
dom314, mikeyh). `.pfx` files are **JSON**.

Where the guide and the shipped base game disagree, the base game wins — see
"Vocabulary is wider than the guide" at the end.

## Structure

Three nested sections: the **system**, its **emitters**, and each emitter's **particle
spec**.

```json
{
  "emitters": [
    {
      "spec": {
        "shader": "particle_add",
        "alpha": [[0.0, 1.0], [1.0, 0.0]],
        "baseTexture": "/pa/effects/textures/particles/dot.papa"
      },
      "velocityRangeX": 0.5,
      "velocityZ": 1.0,
      "velocity": 10,
      "gravity": -9.8,
      "sizeX": 3,
      "emissionRate": 15,
      "lifetime": 1.0,
      "emitterLifetime": 3.5,
      "bLoop": false
    }
  ]
}
```

## The booleans trap

> "They should be written in the file just like the very first example system *without*
> quotes. **If you write "false" with the quotes that will actually get parsed as true**, so
> be careful!"

`"false"` is a non-empty string and therefore truthy. This does the exact opposite of what
it reads as, and nothing warns you.

## Particle system keys

| Key | Type | Description |
|---|---|---|
| `emitters` | array | The list of emitter objects |
| `color` | color, default `[1,1,1,1]` | System-wide RGBA linear float colour multiplier |

## Particle emitter keys

Position and movement. `emitter time curve` values are in real seconds against the emitter
lifetime.

| Key | Type (default) | Description |
|---|---|---|
| `spec` | object | The particle spec |
| `type` | string (`POSITION`) | Spawn shape; controls how `offsetRange*` is used |
| `linkIndex` | number (`-1`) | With type `EMITTER`, which emitter to attach to |
| `offsetX/Y/Z` | curve (`0`) | Starting spawn position in emitter space |
| `offsetRangeX/Y/Z` | curve (`0`) | Spawn position range +/- the start position |
| `offsetAllowNegZ` | bool (`true`) | If false, flips negative-Z spawns positive (dome shape) |
| `velocityX/Y/Z` | curve (`0`) | Initial velocity **direction** (normalised) |
| `velocityRangeX/Y/Z` | curve (`0`) | Direction range +/- |
| `useRadialVelocityDir` | bool (`false`) | Add the spawn position as a direction vector |
| `useShapeVelocityDir` | bool (`false`) | As above, but ignoring the offset values |
| `velocity` | curve (`1.0`) | Initial **speed** along the direction |
| `velocityRange` | curve (`0`) | Speed range +/- |
| `inheritedVelocity` | curve (`0`) | Fraction of the system's velocity to add |
| `gravity` | curve (`0`) | World units/sec towards the planet centre when negative |
| `accelX/Y/Z` | curve (`0`) | Absolute acceleration in emitter space |
| `drag` | curve (`0`) | Velocity multiplier. See the drag note below |
| `sizeX`, `sizeY` | curve (`1.0`) | Particle size in world units |
| `sizeRangeX`, `sizeRangeY` | curve (`0`) | Size range |
| `sizeRandomFlip`, `sizeRandomFlipX/Y` | bool (`false`) | Randomly negate size on an axis (texture flip) |
| `sizeSquareAspect` | bool (`false`) | Force square. Defaults true if no `sizeY` |
| `sizeConstantAspect` | bool (`false`) | Constant X:Y ratio. Defaults true if no `sizeRangeY` |
| `rotation` | curve (`0`) | Initial rotation, radians (6.2832 = one turn) |
| `rotationRange` | curve (`0`) | Rotation range, radians (3.1416 = full range) |
| `rotationRate` | curve (`0`) | Radians per second |
| `rotationRateRange` | curve (`0`) | Rate range |
| `snapToSurface` | bool (`false`) | Snap spawn to the ground mesh. **EXPENSIVE** |
| `snapToSurfaceOffset` | curve (`0`) | Distance from the ground, away from planet centre |
| `alignVelocityToSurface` | bool (`false`) | Align velocity to the surface when snapping |
| `red`, `green`, `blue`, `alpha` | curve (`1.0`) | Colour multiplier at spawn, linear float |
| `rgb` | rgb curve | sRGB colour + brightness. Overrides the four above |
| `useArmyColor` | number (`0`) | 0 system colour, 1 primary team, 2 secondary team |
| `rampV` | curve (`0`) | Ramp texture V; for strings, texture repeat distance |
| `rampRangeV` | curve (`0`) | Range of the above |
| `rampOffsetV` | bool (`false`) | Randomly offset string textures |
| `lifetime` | curve (`1.0`) | Particle lifetime, seconds |
| `lifetimeRange` | curve (`0`) | Lifetime range |
| `emitterLifetime` | number (`1.0`) | Emitter lifetime, seconds |
| `delay`, `delayRange` | number (`0`) | Delay before the first emitter lifetime |
| `bLoop` | bool (`true`) | Whether the emitter loops |
| `loopCount` | number (`0`) | 0 = forever; 1 behaves as `bLoop: false` |
| `startLoop`, `endLoop` | number (`0`) | Emitter time each loop restarts/ends at |
| `startDistance` | number (`0`) | Disable if the camera is closer than this |
| `endDistance` | number (`1.0`) | Disable if the camera is further than this |
| `useWorldSpace` | bool (`false`) | Leave particles behind on a moving emitter |
| `useArcLengthSpace` | bool (`false`) | Wrap positions around the planet surface |
| `interpolateSpawn` | bool (`true`) | Spread world-space spawns across the last frame's motion |
| `killOnDeactivate` | bool (`false`) | Remove all particles when the system is disabled |
| `emissionBursts` | bursts (`0`) | See below |
| `emissionRate` | curve (`20.0`) | Particles per second. **Defaults to 0.0 if `emissionBursts` is defined** |
| `maxParticles` | number | Cap on live particles. "Smart" if undefined |

## Particle spec keys

How particles are drawn. `particle time curve` values are normalised 0.0–1.0 over the
particle's own lifetime.

| Key | Type (default) | Description |
|---|---|---|
| `shader` | string (`particle_add`) | Draw shader |
| `shape` | string (`rectangle`) | `rectangle`, `string`, `beam`, `pointlight`, `mesh` |
| `facing` | string (`camera`) | `camera`, `velocity`, `emitterX/Y/Z`, `axialX/Y/Z` |
| `useInitialVelocityDir` | bool (`false`) | Keep the spawn-time direction for velocity facing |
| `useRandomDir` | bool (`false`) | Random facing instead of velocity |
| `size`, `sizeX`, `sizeY` | curve (`1.0`) | Size **scale** over the particle's life. `size` is shorthand for `sizeX` |
| `red`, `green`, `blue`, `alpha` | curve (`1.0`) | Colour multiplier over life |
| `rgb` | rgb curve | sRGB form; overrides the four above |
| `baseTexture` | string | Default `/pa/effects/textures/particles/default_particle.papa` |
| `rampTexture` | string | Default `.../uncompressed/no_ramp.papa` |
| `flipBookColumns`, `flipBookRows` | number (`0`) | Flip book grid |
| `flipBookFrames` | number (`0`) | Defaults to columns × rows |
| `flipBookRandomStart` | bool (`false`) | Start on a random frame |
| `frameCurve` | curve (`0.0`) | Animation timing; value × `flipBookFrames` |
| `cameraPush` | curve (`0`) | Push towards the camera; also softness for soft/lit shaders |
| `rotationRateMult` | curve (`1.0`) | Scale the rotation rate over life |
| `polyAdjustCenter` | curve (`0`) | Shift the pivot along Y. Usual range -0.5 to 0.5 |
| `beamSegmentLength` | float (`0`) | Beam tessellation: distance / this value |
| `panRate` | curve (`0`) | Texture pan rate on beams |
| `dataChannelFormat` | string (`Position`) | GPU data format; see below |
| `papa` | string | Mesh particles |
| `materialProperties` | material block | Mesh particles |

## Curves

```
"alpha": 1.0                                        shorthand
"alpha": [[0.0, 1.0]]                               basic
"alpha": {"keys": [[0.0, 1.0]], "stepped": false}   complete
"alpha": [[0.0, 1.0], [1.0, 0.0]]                   fade out over life
```

Keys are `[time, value]`, linearly interpolated. `"stepped": true` snaps instead.

**Emitter time curves** are in real seconds against the emitter lifetime.
**Particle time curves** are normalised 0.0–1.0 over each particle's own lifetime; values
outside that range are never reached.

Ranges apply as `value + (valueRange * random)` where random is -1.0 to 1.0.

## Emission bursts

```
"emissionBursts": 10                                                   shorthand
"emissionBursts": [[0.0, 10, 0, 1.0]]                                  basic
"emissionBursts": [{"time":0.0,"count":10,"countRange":0,"chance":1.0}] complete
```

`time` is the emitter lifetime at which the burst fires. `count` is how many. `countRange`
is clamped to zero after being applied. `chance` is 0.0 never to 1.0 always.

## Emitter types

`POSITION` (default, a box), `SPHEROID`, `SHELL` (surface only), `EMITTER`, `CYLINDER_X/Y/Z`,
`BOX_X/Y/Z`, `MESH`.

For cylinders, the named axis behaves like `POSITION`; the other two offsets define the
radius and wall thickness.

**`EMITTER` and `linkIndex`:** spawns particles at the positions of another emitter's
particles, chosen by array index. The particle count is this emitter's `emissionRate`
**multiplied by** the linked emitter's live particle count — the guide warns explicitly to
be careful here.

## Shaders

Common: `particle_add`, `particle_add_nohdr`, `particle_add_ramp`, `particle_add_soft`,
`particle_transparent`, `particle_transparent_nohdr`, `particle_transparent_ramp`,
`particle_transparent_soft`, `particle_transparent_lit`, `particle_clip`.

The authoritative list is `media/shaders/particle.json`, under `effects[].name` — 37 entries
in the current build.

| Blend word | Meaning |
|---|---|
| `add` | `scene + (particle colour × alpha)` |
| `transparent` | `scene × (1 - alpha) + (colour × alpha)` |
| `clip` | Blended with a hard edge; only useful with an alpha baseTexture |

| Suffix | Meaning |
|---|---|
| *(none)* | Basic. Exposed by HDR. Clips sharply against solid objects |
| `nohdr` | Rendered last, unaffected by HDR/exposure. Still clips against geometry |
| `ramp` | Enables `rampTexture` colour animation |
| `soft` | No hard edges; pairs with `cameraPush` |
| `lit` | Like soft, plus ambient and sun light. Use dark colours and rely on the texture |

## Drag

Applied as `currentVelocity *= drag ^ (60 * time)`.

- `1.0` = no drag. **`0.0` = drag off**, which is the same thing — not a full stop.
- Useful values are close to 1.0, "maybe no lower than 0.8".
- `0.9` brings a particle at 10 u/s to nearly a halt in about 1.5 seconds.
- `0.98851` halves velocity after 1 second.
- Above 1.0 accelerates.

## Data channel format

`Position` (default), `PositionWithAlpha`, `PositionAndColor`, `PositionColorAndFlipbook`,
`PositionColorAndAlignVector`.

The known failure: a particle **uncoloured in the spec but coloured by the emitter or
system** will pick `Position` or `PositionWithAlpha`, and the emitter's colour is discarded.
Set `PositionAndColor` explicitly. Do not set it globally — it prevents flip books and
aligned particles from working.

## Colour

Colours are **linear float**, not sRGB. `[127,127,127]` mid-grey is `0.2122` linear, not
`0.5`. Convert with `(binaryColorValue / 255) ^ 2.2`. Alpha is always linear.

The `rgb` curve takes sRGB 0–255 values and converts for you:

```
"rgb": [1.0, [255, 255, 255, 255]]          shorthand
"rgb": [[0.0, 1.0, [255, 255, 255]]]        basic, alpha curve kept separate
```

Final colour is `systemColor × emitterColor × particleColor`. The emitter colour is sampled
**at spawn** and fixed for that particle's life; the particle colour varies over its life.

## Flip books

`frameCurve` defaults to a single key of 0.0, so a flip book **never animates** unless you
supply a curve going 0.0 → 1.0, or set `flipBookRandomStart`.

## Vocabulary is wider than the guide

The guide's glossary is **not exhaustive**. The shipped base game uses keys it never
documents — `sort` in 49 base-game `.pfx` files, `label` in 17, `temp_gravity` in 2 — and
emitter types it never lists, notably **`TORUS`**.

`references/pfx-keys.json` therefore records every key, shader and enum value the base game
actually uses, regenerated with:

```
node bin/generate-pfx-keys.mjs "<path to>\Planetary Annihilation Titans\media"
```

The accepted vocabulary is the guide's glossary **union** that snapshot.

**Important:** spelling suggestions are drawn only from the *guide's documented* keys, never
from the base-game snapshot. The base game contains its own typos — `emissionBurts` is a
real key in a shipped `.pfx` — and suggesting one of those as a fix would be worse than
saying nothing.
