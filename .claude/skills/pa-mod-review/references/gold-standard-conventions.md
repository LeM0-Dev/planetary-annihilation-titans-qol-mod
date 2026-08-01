# Gold-standard conventions

Distilled from four reference mods, recorded here because those folders are not assumed to
be available at review time.

| Mod | Role |
|---|---|
| `com.pa.legion-expansion-client` | Gold-standard client mod. ~1,356 files, additive, art/VFX/UI half of a pair |
| `com.pa.legion-expansion-server` | Gold-standard server mod. ~682 files, specs and AI data |
| `GW-AI-Overhaul` | Gold-standard tooling and structure. Full CI, 24 test files, 6 custom validators |
| `New-GW-Cards` | Template mod, deliberately full of placeholders |

## Layout

- Everything mod-owned lives under `ui/mods/<identifier>/`, organised by scene
  (`gw_play/`, `gw_start/`, `shared/`, …).
- `pa/**`, `pa_ex1/**`, `ui/main/**` and `shaders/**` are **shadow territory**. Adding a
  *new* file there is additive and fine; adding one at a path the base game already uses is
  a shadow.
- Keep testable logic in `shared/` modules, out of shadowed and DOM-glue files.

## The override preference order

1. **Inject into a scene** — your own file, listed in `scenes`
2. **Hijack a function** — capture the original off `self`, `model` or a global, replace it
   with a wrapper that calls through
3. **Shadow the file** — last resort only

This ordering is what drives the review's shadow classification. A shadowed JS file whose
base-game original exposes its functions could have used option 2, so it is reported as
**Code Quality**. JSON, and JS whose members are produced by an AMD `define(...)` factory,
have no interception point, so shadowing is correct and they are reported as
**Maintenance Risk** — a drift warning, not a criticism.

## Never ship a `pa_ex1/` directory

`content/` and `content_ex1/` are engine-side source directories that both mount to the
**same** virtual path, `/pa/` — the TITANS expansion overlays the base game rather than
sitting beside it. There is no `/pa_ex1/` mount point.

A mod shipping `pa_ex1/` therefore places files where nothing reads them: dead weight in the
download, and any override intended by putting them there silently does not apply.

To override a TITANS-only file, ship it under `pa/` at the same relative path. Legion
Expansion overrides `pa_ex1/units/air/strafer/strafer_ammo_trail.pfx` — a file that exists
only in the expansion tree — by shipping `pa/units/air/strafer/strafer_ammo_trail.pfx`.
None of the four reference mods ships a `pa_ex1` directory.

## Base-game content is not a style guide

The shipped game is the ground truth for *what the engine accepts*, but not for what is
correct. Auditing it turns up:

- misspelled particle keys that silently do nothing (`emissionBurts`, `velcotiyRangeZ`,
  `sizeRageY`, and the case variants `loopstart` and `velocityRangey`)
- `splash_damages_allies` set to a string where the parser expects a boolean, in
  `unit_cannon_deploy.json` and `orbital_launcher_deploy.json`
- a dangling texture reference: `pa_ex1/units/land/tank_hover/tank_hover_idle.pfx` names
  `/pa/effects/textures/particles/hover_ripple_01.papa`, which does not exist anywhere

Mods that copy a vanilla effect as a starting point inherit these. Legion Expansion carried
both the `hover_ripple_01.papa` reference and the `splash_damages_allies` strings.

## Shadowing costs

> A shadowed file is a full copy, not a diff.

When PA patches the original, the copy silently keeps the old content and **nothing reports
the divergence**. Every mod that shadows should keep a release-checklist entry listing the
shadowed paths to re-diff after each PA patch.

Observed shadow counts: Legion client 9, Legion server 42, GW-AI-Overhaul 86.

## Runtime idioms

- ES5 / Chrome 40 — see `chrome40.md`. `let` is fatal; `const` is unreliable.
- **Prefix every global** with the mod's short name. Scene scripts share one global scope.
- A **load guard** (`var myModLoaded`) is worth having, because a file listed in two scenes,
  or in a client/server pair sharing a namespace, can be evaluated twice.
- HTML belongs in its own file loaded via `loadHtml()` or `$.get()`, never inline in JS and
  never in `scenes` (which ignores non-`.js`/`.css` entries).
- Mark user-facing strings with the `!LOC:` prefix.
- Prefer rewriting a `data-bind` attribute (`$(sel).attr("data-bind", ...)`) over replacing
  markup wholesale, so other mods' bindings survive.
- `try`/`catch` around scene bodies is **gold plating, not required**.

## Server-mod specifics

- New units must be registered in `pa/units/unit_list.json` and commanders in
  `pa/units/commanders/commander_list.json`. Both are **whole-file overrides** — PA has no
  merge or append mechanism — so they need re-syncing after a PA patch.
- Faction tagging threads a custom unit type (Legion uses `UNITTYPE_Custom1`) through
  `unit_types`, `buildable_types` expressions, AI `unit_types` selectors and platoon
  template filters. Missing it anywhere leaves the unit unbuildable or invisible to the AI.
- AI data under `pa/ai/*/` is **additive** — PA scans the directory — so prefix new files
  rather than overriding stock ones.

## Tooling worth copying (GW-AI-Overhaul)

- ESLint flat config with a **separate Node override** for `scripts/**` and `test/**`, since
  the shipped code targets Chrome 40 but the tooling does not.
- **lodash pinned to 3.9.3 exactly** — the version PA ships. A newer lodash in
  `devDependencies` accepts calls the game will reject.
- `.gitattributes export-ignore` on every dev artifact, so the release ZIP is a clean
  installable mod.
- Custom validators covering what no off-the-shelf linter can: JSON parses, manifest ↔
  filesystem agreement, module export contracts, declarative-data schemas, cross-references.
- A release-consistency check asserting `modinfo.json` `version` equals the release tag and
  that the changelog has a matching heading.

## Template hygiene (New-GW-Cards)

A template's placeholders — `com.pa.YOURNAME.MODNAME`, `#.#.#`, `yyyy-mm-dd` — are
**intentional**. Reviewing a template will legitimately report them; that is the template
working as designed, not a defect. What matters is that the placeholders remain *internally
consistent*: the identifier, the `ui/mods/<dir>` folder and the `coui://` URLs must still
agree with each other even while unfilled.
