# Finding the mod a file belongs to

A review constantly has to answer "whose file is this?" — to check a shadow's casing against
its origin (`compliance.md`), to judge whether a copy is a delta or a stale whole-file
snapshot, and to work out whose licence a redistributed spec carries.

Do not answer it from a hardcoded list. **PA publishes a complete index of every published
mod**, and it is authoritative, current, and machine-readable.

## The community mods index

```text
https://mods.planetaryannihilation.net/community-mods/mods
```

A JSON array — 560 mods as of 2026-07-30. No auth, no rate limit.

**If that host ever changes**, the base game always has the current one.
`ui/main/game/community_mods/community-mods-manager.js:3269` builds it as:

```js
var availableModsURL = gModsUrl + 'community-mods/mods';
```

`gModsUrl` is an engine-injected global, not defined anywhere under `media/ui`, so read the
host from a running client (or from the mod-manager debug log line on the next line, which
prints the full URL). The `community-mods/mods` path suffix is the durable part. The same
global drives `community-mods/downloads/` (line 3150) and `community-mods/units` (line 653).

### Fields worth knowing

| Field | Use |
|---|---|
| `identifier`, `display_name`, `version`, `author` / `authors` | naming a mod correctly in a finding |
| `url` | direct zip download — the actual files, so a shadow origin can be resolved for real rather than assumed |
| `unitList` | see below — the reverse index from unit spec path to owning mod |
| `dependencies`, `companions`, `conflicts` | the paired-mod graph, without guessing |
| `context`, `priority`, `build`, `date` | what the mod is and when it was last touched |
| `github` | present on only 37 of 560, so treat as a bonus, not a route |
| `md5`, `size` | identifying exactly which build a copied file came from |

**Licences are not in the index.** For those you still need the repository or the archive
itself. An absent licence means all rights reserved by default — redistribution needs
permission, not a notice.

## Identifying a unit by prefix

PA mods namespace units by filename prefix rather than directory, so the prefix is the route
to the owner. `unitList.info` maps every `/pa/units/**.json` path a mod ships; 49 of the 560
carry one, covering 1326 unit paths. Build the reverse index and look the prefix up:

```js
const mods = await (await fetch("https://mods.planetaryannihilation.net/community-mods/mods")).json();
const owners = new Map();
for (const m of mods) {
  for (const p of Object.keys(m.unitList?.info ?? {})) {
    owners.set(p, [...(owners.get(p) ?? []), m.identifier]);
  }
}
// who ships nsdf_turret?
[...owners].filter(([p]) => p.includes("nsdf_turret")).map(([, o]) => o);
```

Expect more than one owner sometimes — several mods legitimately override the same unit path,
which is itself worth reporting when the mod under review is one of them.

### Prefixes seen so far

Resolved through the index above. Extend as reviews turn up more; do not treat as complete.

| Prefix or tree | Owner | Identifier |
|---|---|---|
| `l_*` | Legion Expansion | `com.pa.legion-expansion-server` (+ `-client`) |
| `bug_*` | Bug Faction | `com.pa.ferretmaster.bugs` |
| `nsdf_*`, `cca_*` | Battlezone: RTS Tactics | `com.pa.bz-overhaul-server` |
| `r2_*` | Red Line 2 | `com.pa.gb6.redline2` |
| `pa/units/thorosmen/**` | Osmech (formerly Thorosmen) | `com.pa.loloares.thorosmen` |
| `pa/units/paeiou/**` | Section 17 — Endgame Units | `com.pa.daedelus.experimentals` |
| `pa/units/addon/`, `b_addon/`, `l_addon/` | Second Wave Expansion | `pa.mla.unit.addon` |

## Repositories, where they exist

Useful for licences and for diffing a copied file against its upstream. The index's `github`
field is the first place to look; these are the ones confirmed by hand.

| Mod | Repository | Licence |
|---|---|---|
| Legion Expansion | `Legion-Expansion/Legion-Expansion` (branch `develop`) | CC BY-NC-SA 4.0 |
| Bug Faction | `Ferret-Master/Bug-Faction` | MIT |
| Replicate | `BotWhan/com.pa.replicate` | MIT |
| Exiles | `NikolaMX/Exiles-Faction` | MIT |
| Assimilation Expansion | `Lenetis/Assimilation-Expansion` | none declared |
| Section 17 | `DAEDALUS-Modding/Section-17` | none declared |
| Second Wave Expansion | `Anonemous2/pa.mla.unit.addon` (branch `master`) | none declared |
| Osmech | `ATLASLORD/Thorosmen` | none declared |

Reading a repository tree:

```bash
br=$(gh api "repos/<owner>/<repo>" --jq .default_branch)
gh api "repos/<owner>/<repo>/git/trees/$br?recursive=1" --jq '.tree[].path' | grep '<prefix>'
```

`gh api repos/<owner>/<repo> --jq .license.spdx_id` gives the licence, but **read the LICENSE
file when it returns `NOASSERTION`** — GitHub cannot classify CC licences, and Legion's is
CC BY-NC-SA 4.0 despite reporting as unclassified.

## Resolving a reference against its parent mod

The reason this matters most. The CLI cannot see a mod that is not installed, so a mod that ships
copies of another mod's units generates a wall of false `spec.unresolved-ref` blockers. The test
that gives the right answer:

> A base-game unit resolves normally. A modded unit may reference anything in **this mod** or in
> **its own parent mod** — including that parent's declared `dependencies` and `companions`.
> Only a reference that resolves in none of those is a defect.

The parent's closure matters: a server mod's `.papa` models routinely ship in its client half, so
resolving against the server archive alone under-reports. Walk `dependencies` + `companions`
transitively.

Working procedure:

1. Fetch the index. For each copied file, find its owner — the mod that ships the *same relative
   path*. That is more direct than prefix matching and handles files `unitList` does not cover.
2. Download each owner's `url` (plus its closure) and read the zip's entry list. GitHub archive
   zips nest everything under `<repo>-<branch>/`; some mods nest again under an `export/` folder,
   so strip up to the directory containing `modinfo.json`.
3. Re-test each flagged reference against this mod → the owner's closure → the base game.
4. Report the survivors, and state the resolved count for the rest so the reader knows the check
   was done rather than skipped.

A reference the parent mod *also* fails to resolve is an **inherited upstream defect**. Report it
— a shipped dangling reference is worth knowing about — but say plainly that the mod under review
did not introduce it, and check the upstream repository to confirm before saying so.

### Diffing copies against upstream

The same archives answer the more valuable question: what does this mod actually change? Diff each
copied spec against the upstream original and two different findings fall out:

- **Systematic edits** — consistent ratios across many files (`max_range` ×2 on 95 of 96 tools) are
  the mod's own work, and are how you measure whether it does what it claims.
- **Drift** — arbitrary differences in unrelated fields are the copy being stale. Confirm with
  `gh api "repos/<owner>/<repo>/commits?path=<file>"`: if the upstream commit that introduced the
  difference is dated after the copy, it is drift, not a generator fault. That converts "these
  copies will drift" into a dated, evidenced finding.

**Watch the origin.** Several mods shadow the same base-game paths, so a naive "which mod ships
this path" lookup can match a *different* mod's override rather than vanilla. Exclude paths that
exist in the base game from the upstream diff and compare those against `media` instead.

## When the owner still cannot be found

Report it as unidentified rather than guessing, and say the index was checked. Under the
casing rule in `compliance.md`, a shadow with no findable origin falls back to the lowercase
requirement.
