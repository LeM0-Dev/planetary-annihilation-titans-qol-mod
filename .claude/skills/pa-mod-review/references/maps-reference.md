# Maps and systems

Recorded from the palobby wiki *Planetary Annihilation Maps* page (archived 2021-09-05).

> "System (map) pas files are JSON."

`.pas` files are therefore subject to the same JSON completeness checks as `.json` and
`.pfx`: a missing comma breaks them exactly the same way.

## System structure

| Key | Required | Type | Notes |
|---|---|---|---|
| `name` | **Yes** | string | Map identifier. There is currently no unique identifier for maps. |
| `creator` | **Yes** | string | Used for system sharing |
| `planets` | **Yes** | array | Planet objects |
| `players` | No | array | `[minPlayers, maxPlayers]`; minPlayers is normally the number of starting planets |
| `description` | No | string | Used for system sharing |
| `version` | No | string | Used for system sharing |

```json
{
    "name": "Name",
    "creator": "palobby.com",
    "version": "1",
    "description": "Description",
    "planets": [ ... ]
}
```

## Planet structure

| Key | Required | Type | Notes |
|---|---|---|---|
| `name` | **Yes** | string | |
| `mass` | **Yes** | integer | |
| `position_x`, `position_y` | **Yes** | float | |
| `velocity_x`, `velocity_y` | **Yes** | float | |
| `required_thrust_to_move` | **Yes** | number | `0`, or the number of halleys needed to move the planet |
| `starting_planet` | **Yes** | boolean | |
| `planet` | **Yes** | object | Procedural generator specification |
| `landing_zones` | No | object | See below |
| `metal_spots` | No | array | `[x, y, z]` locations |
| `planetCSG` | No | array | CSG objects |

## Landing zones

Rules-based:

```json
"landing_zones": {
    "list": [[800, 0, 0], [-800, 0, 0], ...],
    "rules": [
        {"min": 2, "max": 6},
        ...
    ]
}
```

> "The first two landing zones are available for 1v1 on opposite sides. Remaining four
> landing zones are available with 3 or more players."

## Allocation

> "Landing zones are currently allocated to armies in army / landing zone order"

Sequentially. Shared team armies are "considered a single army so will be allocated
identically to FFA". Unshared team armies are problematic:

> "Until scenarios are implemented the current recommendation is a separate version of maps
> for unshared team armies."

## Map packs

Map packs ship as a special type of **UI client mod**. System sharing is implemented through
Map Pack Client Mods.

## Review coverage

The CLI treats `.pas` as JSON for parse, BOM and duplicate-key checking. The structural
requirements above are **not** currently machine-checked — a map-heavy mod should have its
`.pas` files reviewed against this table by hand, and that gap is stated in `SKILL.md`
rather than left implicit.
