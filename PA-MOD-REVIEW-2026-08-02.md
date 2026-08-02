# Mod Review — PA:T QoL

**Verdict: Loads cleanly, with one conditional defect.**
No blockers; one Bug that only manifests in lobbies containing observer/replay armies, one managed Maintenance Risk, two Code Quality notes.

| | |
|---|---|
| Identifier | `com.lem0.pat-qol` |
| Version | 0.4.0 (unreleased working tree, staging) |
| Context | client |
| Files reviewed | 58 |
| Base-game files shadowed | 1 |
| Base game | `/mnt/nvme-2-4tb/SteamLibrary/steamapps/common/Planetary Annihilation Titans/media` (`--media`) |
| Reviewed | 2026-08-02 (second full review; supersedes the earlier same-day report) |

## Summary

| Severity | Count |
|---|---|
| Bug | 1 |
| Maintenance Risk | 1 |
| Code Quality | 2 |
| Unverified | 3 |

| ID | Severity | Location | Finding |
|---|---|---|---|
| BUG-001 | Bug | `ui/mods/com.lem0.pat-qol/panels/window.js:476,576` | Roster looked up by array position where the engine supplies an army index — misaligns when observer/replay armies are present |
| MNT-001 | Maintenance Risk | `ui/main/game/live_game/js/audio.js` | Whole-file base shadow; drift after a PA patch (mechanically gated) |
| QUA-001 | Code Quality | `ui/mods/com.lem0.pat-qol/panels/window.js` (~line 660) | Dead `model.rows` shell computed for the units role |
| QUA-002 | Code Quality | `ui/mods/com.lem0.pat-qol/panels/window.js` (`ownRows`) | Combat expiry is a side effect inside a `ko.computed`, and only on the OWN path |

## Bug

> Loads, but does not behave as intended.

### BUG-001 — `roster[ent.army_idx]` / `roster[st.army]` index by array position, not army index

**Location:** `ui/mods/com.lem0.pat-qol/panels/window.js:476` (`handlers.combat_list`) and `:576` (`refreshCommanderState`)

**Found:** The engine reports armies by **index into the sim's army list** (`damaged_entities[].army_idx`, `getUnitState().army`). The page resolves these with `roster[n]` — positional access into the forwarded roster array. But the host's `buildRosterPayload` **skips `p.replay` entries** while building that array, so whenever `model.players()` contains an observer/replay army, every roster position after it is shifted one left relative to the engine's indices.

**Why it matters:** In any lobby with an observer/replay army (casted games, replays with the units window enabled), combat rows and commander state resolve to the *wrong player* from that point in the list onward — an allied commander could be grouped as OWN, a hostile army's combat could appear in ALLIED, silently. Solo and GW co-op games have no replay entries, which is why live testing never tripped it. Each roster entry already carries the correct engine index in its `index` field; only the lookups are positional.

**Fix:** Replace both positional accesses with a lookup by field — e.g. build a `rosterByIndex` map in `handlers.paqol_roster` and use `rosterByIndex[ent.army_idx]` / `rosterByIndex[st.army]`. Two call sites, one map.

<sub>`js.index-vs-position`</sub>

---

## Maintenance Risk

> Correct today, fragile against a future PA patch.

### MNT-001 — Whole-file shadow of `live_game/js/audio.js` silently reverts future PA changes to that file

**Location:** `ui/main/game/live_game/js/audio.js`

**Found:** A copy of the base-game file (base md5 `64c22eb2…`, build 124667) differing by exactly a header comment and two anchored edits: `priority_level_cooldown` (vanilla `30 * 1000`) reads `paqol.audioDecayMs` lazily, defaulting to 3000 with a safe fallback if the mod's JS never runs.

**Why it matters:** Any future PA change to this file is silently reverted for the mod's users until the shadow is re-synced. The CLI labels this *avoidable Code Quality* ("the base file assigns functions to `self`"); that is a file-level heuristic and wrong for this change — the modified member and the timer consuming it are closure-private with no interception point, which is this skill's stated criterion for Maintenance Risk. This finding is permanent by design: it exists as long as the shadow does, which is as long as the feature does.

**Fix:** Already managed mechanically: `tools/check-modinfo.mjs` (every check/package/release) md5-verifies the installed base file against the recorded fingerprint and fails on mismatch; `tools/rebuild-audio-shadow.sh` regenerates the shadow from the current base file via anchored replacement, failing loudly if PA restructures the file, and re-syncs the fingerprint. Round-trip verified. Residual exposure: a PA restructure large enough to break the anchors — which the gate surfaces rather than hides.

<sub>`shadow.unavoidable-closure` (reclassified from CLI `shadow.avoidable-js`)</sub>

---

## Code Quality

> Performance or general improvement.

### QUA-001 — Dead `model.rows` shell for the units role

**Location:** `ui/mods/com.lem0.pat-qol/panels/window.js` (`model.rows = ko.computed(... return []; ...) // unused shell`)

**Found:** The `paqol_units` role defines a `model.rows` computed returning an empty array, marked "unused shell". The units template binds only `ownRows`/`alliedRows`; nothing reads `rows` for this role.

**Why it matters:** Harmless at runtime, but it subscribes to `rev`/`tick` and re-evaluates on every update for nothing, and "unused shell" comments are exactly the leftovers that confuse the next reader.

**Fix:** Delete the computed for the units role.

<sub>`js.dead-code`</sub>

### QUA-002 — Combat expiry is a side effect inside a `ko.computed`, and only on the OWN path

**Location:** `ui/mods/com.lem0.pat-qol/panels/window.js` (`model.ownRows`)

**Found:** Expired combats are deleted from the `combats` map inside the `ownRows` computed; `alliedRows` performs no expiry.

**Why it matters:** It works today because the template evaluates `ownRows` first and both computeds share the `rev`/`tick` dependencies — but mutating state inside a computed is a Knockout anti-pattern, and an allied-only combat's expiry currently depends on the OWN section also re-rendering. Reordering the template or splitting the sections would quietly break expiry.

**Fix:** Move the expiry sweep into the 5-second tick (or a dedicated interval) and leave both computeds pure.

<sub>`ko.computed-side-effect`</sub>

---

## Unverified — needs clarification

- **Units-window paths not yet observed in-game:** combat rows appearing/expiring, the reworked idle-factory clearing (state re-poll), white ping rows, and the minimized-poll pause were all implemented after the last live session ended. All pass lint/tests/gate; none has been eyeballed in a running game yet.
- **Human-vs-human multiplayer:** allied `getArmyUnits`/commander rows were verified against GW co-op AI allies only; the one-time human-MP checks are itemised in `docs/manual-test-checklist.md`.
- **`modinfo.forum`** points at the repository's `/discussions` URL — fine if GitHub Discussions is enabled for the repo, a 404 otherwise. Not statically checkable from here.

## Not covered by this review

- `.papa` binary internals are not parsed (the mod ships none of its own).
- `.pfx` rules are moot — the mod ships no particle effects.
- Unreferenced-file detection: cross-checked by both the CLI pass and the mod's own release gate (scene refs + `.html`-loaded scripts); no orphans.
- Runtime behaviour is testing, not static review; most features were exercised live against build 124667 via the Coherent debugger during development, except the items listed under Unverified.

### Notes for the record (not findings)

- Both Code Quality findings from the earlier same-day review (cache bounding, poll fan-out) were fixed and are not re-raised; this review's QUA items are new.
- Identifier triangle intact; Chrome-40 rules mechanically enforced (zero violations); licence ships in the ZIP with PA Inc. attribution; packaging gate verifies ZIP-root `modinfo.json`, case-exactness and the shadow fingerprint.

---

<sub>Generated by `pa-mod-review`. Findings marked Unverified could not be resolved against
the bundled references and are not verdicts — they need a human decision.</sub>
