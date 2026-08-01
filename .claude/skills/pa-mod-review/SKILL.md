---
name: pa-mod-review
description: Review a Planetary Annihilation TITANS mod and produce a severity-tagged markdown report. Use when asked to review, audit, check or validate a PA mod, modinfo.json, a client or server mod, GW tech cards, unit specs, or .pfx particle effects. Also runs maintenance after a PA patch — "calibrate", "audit the base game", "refresh particle keys", "recheck the scene list".
---

# PA:TITANS mod review

Produce a professional, actionable markdown report on a Planetary Annihilation: TITANS mod.

## Modes

| Invocation | Does |
|---|---|
| `/pa-mod-review <path-to-mod>` | Review a mod. The default. |
| `/pa-mod-review calibrate` | Re-audit every rule against the shipped base game |
| `/pa-mod-review refresh` | Regenerate the particle vocabulary and re-derive the scene list |

For a review, if no path is given, ask for one. Do not guess which mod is meant.

For `calibrate` and `refresh`, see **Maintenance** at the end — run those after a PA patch.

## Why this exists

PA fails silently. The engine ignores unknown JSON keys, missing scene files, mistyped scene
names and mismatched identifiers without logging anything. A broken mod almost never
announces itself — it just does nothing. This review exists to make those failures visible.

## Procedure

### 1. Run the deterministic pass first

```
node "<skill-dir>/bin/review.mjs" "<mod-path>" --format=json
```

It is zero-dependency, so it needs no install. It reads the base game live; if that is not
auto-detected, pass `--media="<path to>\Planetary Annihilation Titans\media"`.

This covers everything mechanically decidable: manifest keys, the identifier triangle,
scene validity, JSON and JS completeness, particle semantics, schema and cross-reference
resolution, shadow classification, packaging and privacy patterns.

**Do not re-do by hand what the CLI already checked.** Its findings go into the report as-is —
with one exception, below.

#### Unresolved references in copied third-party content

The CLI resolves a reference against this mod, its siblings, and the base game. It has no way to
reach a mod that is not installed, so **a mod that ships copies of another mod's units will
produce a wall of false `spec.unresolved-ref` blockers**. A Legion turret referencing a Legion
`.pfx` is not dangling: the turret can only be built when Legion is installed, and Legion
supplies the `.pfx`.

When `spec.unresolved-ref` blockers land in files the mod did not author, re-test them:

> A base-game unit resolves normally. A modded unit may reference anything in **this mod** or in
> **its own parent mod** — including that parent's declared `dependencies` and `companions`,
> since a server mod's models routinely ship in its client half. Only a reference that resolves
> in none of those is a defect.

`third-party-mods.md` has the mechanics: the community mods index maps unit paths to owning mods
and gives a download `url` for each, so the parent's real archive can be checked rather than
guessed at. Report the survivors; state the resolved count for the rest, and say the check was
done. A reference the parent mod also fails to resolve is an **inherited upstream defect** —
report it, but say plainly that the mod did not introduce it.

Do the same for content: diffing each copied spec against its upstream original is the only way
to separate the mod's own edits from staleness in the copy, and it turns "these copies will drift"
into a dated, evidenced finding.

### 2. Judge what the CLI cannot

Read the mod's scene scripts and any spec files the CLI flagged, and assess:

- **Correctness of intent** — does the code do what the mod's description claims?
- **Shadow avoidability** — the CLI classifies by whether the *base-game* file exposes
  functions. Confirm its verdict on anything it marked Code Quality, since the judgement is
  what separates "should have hijacked" from "had to shadow".
- **AI data** — build-list entries need `name`, `instance_count`, `priority`,
  `build_conditions`; platoon templates need `units`; unit-map entries need **exactly one**
  of `unit_types` or `spec_id`.
- **GW cards** — if the mod ships cards, they need `visible`, `describe`, `summarize`,
  `icon`, `deal`, `buff`, `dull`; tech cards additionally `audio` and `getContext`; start
  cards `hint` instead.
- **Balance and spec values** that look unintentional (a cost or range order of magnitude
  out from comparable units).
- **Performance** — work in render loops, unbounded particle counts, repeated DOM queries.

Consult `references/` only as needed; each file is self-contained:

| File | For |
|---|---|
| `modinfo-reference.md` | Every manifest key, `priority` semantics, the identifier triangle |
| `scenes-reference.md` | All 59 scene keys and the loading mechanics |
| `chrome40.md` | What the JS engine accepts, and what it does not |
| `particle-system.md` | The full `.pfx` guide |
| `unit-json/` | Unit, tool, ammo and anim-tree specs, plus draft-07 schemas |
| `client-server-mods.md` | Client vs server, companions, the paired-mod pattern |
| `compliance.md` | Distribution, packaging and privacy rules |
| `maps-reference.md` | System and planet `.pas` format |
| `gold-standard-conventions.md` | What good looks like, distilled from four reference mods |
| `third-party-mods.md` | Upstream repos and licences for the mods a shadow may belong to |

### 3. Write the report

Follow `assets/report-template.md`. Emit the CLI's markdown and add your own findings in the
same shape, renumbering so IDs stay sequential. Write it to a file next to the mod and give
the user the path.

## Severity model

| Severity | Meaning |
|---|---|
| **Blocker** | Prevents loading, or crashes/halts JSON or JS processing |
| **Bug** | Loads, but does not behave as intended |
| **Area of Concern** | May be a bug; needs author confirmation |
| **Compliance** | Works, but violates a documented distribution or conduct rule |
| **Maintenance Risk** | Correct today, fragile against a future PA patch |
| **Code Quality** | Performance or general improvement |
| **Unverified** | Could not be resolved against the references. **Not a verdict** |

### Classifying a shadowed file

Every shadowed file is reported. Severity depends on whether shadowing was *avoidable*:

- **JSON**, or **JS whose members come from an AMD `define(...)` factory or a private
  closure** → no interception point exists → **Maintenance Risk**. The finding is a drift
  warning naming the path to re-diff after a PA patch.
- **JS that exposes its functions** on `self`, `model` or the global scope → the mod could
  have hijacked them from its own namespaced file → **Code Quality**, citing the exposed
  symbol.

**Shadowing is never itself a Blocker or a Bug.** A server mod that changes an existing
unit's stats has no other mechanism — unit and tool specs are JSON, and PA offers no merge —
so shipping a replacement file is the only option available, and the finding is the drift
warning, not a criticism of the design. This holds for **mod shadows as well as base-game
shadows**; a mod shadow is the more urgent Maintenance Risk of the two, because an actively
developed mod changes far more often than the base game, and a stale whole-file copy silently
reverts everything the origin has shipped since.

The one thing that *does* raise the severity is scope: a shadow that reaches a unit outside
what the mod claims to affect — a mobile unit in a structures-only mod, say — is a Bug or an
Area of Concern about intent, not a maintenance note.

Use `third-party-mods.md` to identify which mod a shadowed path belongs to.

## Rules

**What you are reviewing is the mod's final form.** No build step is assumed to fill
anything in later, so a required key that is absent or valueless here is absent in the
shipped mod, and is reported at full severity. Do not downgrade a finding on the theory
that a build script supplies it.

**Never guess.** If a property cannot be resolved against the references, put it under
**Unverified — needs clarification**, stating what was found and what could not be
confirmed. Do not invent a verdict, and do not infer a rule from one mod's linter config —
`chrome40.md` records a case where doing so produced the wrong answer.

**`try`/`catch` around scene scripts is gold plating, not a requirement.** Never report its
absence, at any severity. Legion Expansion's own `CLAUDE.md` mandates the idiom; that is
house style, not a platform rule.

**Template placeholders are intentional.** In a template mod, `com.pa.YOURNAME.MODNAME` and
`#.#.#` are the design. Report them, but note they are expected, and never report the
identifier triangle as broken when the placeholders agree with each other.

**Aggregate repetition.** The same defect across twenty emitters is one finding with a count,
not twenty findings.

**Never report casing on documentation.** `README.md`, `LICENSE.txt`,
`CREDITS_AND_LICENSES.txt` and their kin are not shipped assets — PA never resolves a path to
them — and uppercase is the convention for them. Elsewhere, a shadow must match its origin's
casing, whichever mod or base-game file that origin is; only a path with **no findable
origin** is held to the lowercase rule. See `compliance.md`.

**Be realistic about modders.** These are hobbyists, not a release engineering team. Practices
that are merely *best* are not defects: a monolithic package instead of split optional layers,
an absent `dependencies` or `companions` declaration covering a "might have" rather than a
"must have", no CI, no changelog discipline. Mention them once as an improvement if they are
worth mentioning at all, and never as Compliance. Reserve that severity for rules that are
actually published — and for licence and attribution obligations, which are not optional
however small the mod.

## Unreferenced files

Reported as **Code Quality**: files the mod ships that nothing appears to reach. Useful less
for the download size than as a signal — an orphan is often the leftover half of a rename
that left a dangling reference somewhere else.

PA reaches files by routes static analysis cannot see, so the check excludes them rather
than guessing. Under-reporting is the correct failure mode here.

| Route | Handling |
|---|---|
| `pa/ai*/**`, `pa_ex1/ai*/**` | Excluded — PA enumerates these directories, never names the files |
| Base-game shadows | Excluded — the base game references them |
| Bare ids (`"gwaio_anti_air"`) | Matched on filename stem, no extension needed |
| Concatenated names (`"icon_faction_" + n`) | Matched on prefix, minimum 5 characters |
| Referenced by the **base game** | Scanned in the surrounding base-game tree |
| Referenced by a **paired mod** | Sibling and overlay mods are scanned too |
| Texture companions (`x_diffuse.papa`) | Excluded when the owning `x.papa` is referenced |
| `.png.settings` sidecars | Excluded when the file they configure is shipped |
| Docs and dev tooling | Excluded — normally stripped by `.gitattributes export-ignore` |

Binary assets (`.papa`, `.fbx`) are **not reported at all**: a model names its own textures
and sub-models inside the binary, so an absent textual reference proves nothing. An uncertain
finding is not worth the reader's time for orphaned files.

## Calibrated against the base game

Every rule has been audited against the shipped game — 2,158 spec JSON, 238 `.pfx` and 347
scripts — on the principle that content which demonstrably works must not be reported as
broken. That audit removed four rules or variants that were wrong on known-good code:

| Rule | Why it was wrong |
|---|---|
| `.find()`/`.includes()`/`.fill()` | 24 of 24 hits were jQuery or canvas receivers |
| `startsWith`/`endsWith` missing | PA polyfills both in `helpers.js:130-142` |
| `async`/`await` as bare words | Not reserved in ES5; the base game uses `async` as a variable |
| Duplicate JS object keys | Brace counting conflates sibling objects |

Re-run it after a PA patch with `scratchpad/audit-base-game.mjs`, or rebuild the equivalent:
run `lintJson`, `checkPfx`, `checkSpec` and `checkJs` across `media` and tally by check. The
current expected result is **zero Blockers and zero Bugs** from the JavaScript rules.

Two Blocker/Bug findings do survive against the base game, and both are genuine PA defects
rather than checker faults — a dangling `hover_ripple_01.papa` reference, and
`splash_damages_allies` set to a string. Mods that copy vanilla effects inherit them.

## Known gaps

State these in the report rather than letting silence imply coverage:

- `.pas` map/system files are checked as JSON only; the structural rules in
  `maps-reference.md` are not machine-checked.
- `.papa` binary internals are not parsed — only existence and non-zero length.
- Server-mod conduct restrictions cannot be established statically and are always raised as
  Unverified.
- Base-game vocabulary snapshots (`references/pfx-keys.json`) and the scene list go stale
  after a PA patch. Regeneration commands are in `particle-system.md` and
  `scenes-reference.md`.
- Unreferenced-file detection cannot see inside `.papa` binaries, and scans the base game
  only in the tree surrounding each candidate rather than exhaustively. A file listed is a
  prompt to confirm, not proof it is dead.

## Maintenance

Run after a PA patch. Both modes are reachable from the slash command so they do not get
forgotten.

### `/pa-mod-review calibrate`

```
node "<skill-dir>/bin/audit-base-game.mjs" "<media-path>"
```

Runs every content and JavaScript rule across the shipped base game and tallies findings by
check. The base game is, by definition, content that works, so **a rule that fires heavily
here would fire on a correct mod too**. This is the false-positive test.

Read the output against this expectation:

- **Zero Blockers and zero Bugs from the `js.chrome40.*` rules.** Anything else is a
  regression in the checker, not a defect in PA.
- The content findings below are expected and are **genuine PA defects, not checker faults**.
  The full list with file names is in `base-game-defects.md`.

  | Check | Expected | What it is |
  |---|---|---|
  | `pfx.misspelled-key` | 20 | Mistyped particle keys in shipped effects |
  | `spec.schema.ammo` | 3 | `splash_damages_allies` set to a string |
  | `pfx.asset-missing` | 1 | Dangling `hover_ripple_01.papa` reference |
  | `pfx.empty-emitters` | 1 | An effect with no emitters |

- `pfx.unknown-key` should be **0**. If it rises, a key exists that the checker cannot
  name — either PA added vocabulary (run `refresh`) or the near-miss matching regressed.
- Advisory checks (`pfx.emitter-linked-count` 19, `snap-to-surface-cost` 16,
  `js.chrome40.const` 6) fire in the teens and are fine there.

If a rule starts firing on the base game, **drop or narrow it rather than tuning around the
symptom**. Four rules were removed this way; `chrome40.md` records which and why.

### `/pa-mod-review refresh`

```
node "<skill-dir>/bin/generate-pfx-keys.mjs" "<media-path>"
```

Rebuilds `references/pfx-keys.json`: the particle keys, shaders and enum values PA actually
ships, with PA's own typos quarantined by relative frequency. Then re-derive the scene list
with the two greps in `scenes-reference.md` and confirm it still yields 59 keys.

Finish either mode with `node --test` (61 tests).

### The test that matters most

The tokeniser regression uses a real comment from GW-AI-Overhaul —
`// Don't let the Pelican carry the Manhattan` — which a naive regex reports as a `let`
Blocker against a gold-standard mod. If that test ever fails, the tool is about to start
crying wolf.
