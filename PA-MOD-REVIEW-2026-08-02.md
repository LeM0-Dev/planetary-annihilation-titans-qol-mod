# Mod Review — PA:T QoL

**Verdict: Loads cleanly.**
No blockers, bugs, concerns, or compliance issues across 58 files; one managed Maintenance Risk. One release-process item blocks the pending 0.4.1 release (by design).

| | |
|---|---|
| Identifier | `com.lem0.pat-qol` |
| Version | 0.4.1 (working tree, pre-release; 0.4.0 released 2026-08-02) |
| Context | client |
| Files reviewed | 58 |
| Base-game files shadowed | 1 |
| Base game | `/mnt/nvme-2-4tb/SteamLibrary/steamapps/common/Planetary Annihilation Titans/media` (`--media`) |
| Reviewed | 2026-08-02 |

## Summary

| Severity | Count |
|---|---|
| Maintenance Risk | 1 |
| Unverified | 3 |

| ID | Severity | Location | Finding |
|---|---|---|---|
| MNT-001 | Maintenance Risk | `ui/main/game/live_game/js/audio.js` | Whole-file base shadow; PA's future changes to it are reverted until re-synced (mechanically gated) |

### Release readiness (0.4.1)

The version was bumped to 0.4.1 in `modinfo.json` but `CHANGELOG.md` has no
`## 0.4.1` section yet — both `tools/promote.sh` and the release workflow
**reject** releases without notes, by design. `paqol.VERSION` (still 0.4.0)
is synced automatically by `promote.sh`. Content pending for 0.4.1: the
own-units "Allied" prefix fix and refreshed screenshots.

## Maintenance Risk

> Correct today, fragile against a future PA patch.

### MNT-001 — Whole-file shadow of `live_game/js/audio.js` silently reverts future PA changes to that file

**Location:** `ui/main/game/live_game/js/audio.js`

**Found:** A copy of the base-game file (base md5 `64c22eb2…`, build 124667) differing by exactly a header comment and two anchored edits: `priority_level_cooldown` (vanilla `30 * 1000`) reads `paqol.audioDecayMs` lazily, defaulting to 3000 with a safe fallback if the mod's JS never runs.

**Why it matters:** Any future PA change to this file is silently reverted for the mod's users until the shadow is re-synced. This finding is permanent by design — it exists as long as the shadow does. (The CLI labels it *avoidable Code Quality* because the base file exposes `self.*` functions; that file-level heuristic is wrong for this change — the modified member and its consuming timer are closure-private with no interception point, which is this skill's stated criterion for Maintenance Risk.)

**Fix:** Managed mechanically: `tools/check-modinfo.mjs` (every check/package/release) md5-verifies the installed base file against the recorded fingerprint and fails on mismatch; `tools/rebuild-audio-shadow.sh` regenerates the shadow from the current base file via anchored replacement — failing loudly if PA restructures the file — and re-syncs the fingerprint. Round-trip verified. Residual exposure: a PA restructure large enough to break the anchors, which the gate surfaces rather than hides.

<sub>`shadow.unavoidable-closure` (reclassified from CLI `shadow.avoidable-js`)</sub>

---

## Unverified — needs clarification

- **Not yet observed in-game:** combat rows appearing/expiring, idle-factory clearing via the state re-poll, the minimized-poll pause, the `rosterByIndex` fix (replay viewing), and the own-units prefix fix. (Observed since the last session, via screenshot: white ping rows, `[IDLE]` commander tag, idle-factory rows, dual icons, colour brightening.)
- **Human-vs-human multiplayer:** allied `getArmyUnits`/commander rows were verified against GW co-op AI allies only; the one-time human-MP checks are itemised in `docs/manual-test-checklist.md`.
- **`modinfo.forum`** points at the repository's `/discussions` URL — fine if GitHub Discussions is enabled for the repo, a 404 otherwise. Not statically checkable from here.

## Not covered by this review

- `.papa` binary internals are not parsed (the mod ships none of its own).
- `.pfx` rules are moot — the mod ships no particle effects.
- Unreferenced-file detection: cross-checked by both the CLI pass and the mod's own release gate (scene refs + `.html`-loaded scripts); no orphans.
- Runtime behaviour is testing, not static review; features were exercised live against build 124667 via the Coherent debugger during development, except the items listed under Unverified.

### Findings resolved earlier in this review cycle (verified fixed)

- **Bug:** roster resolved by array position where the engine supplies an army index — could misattribute players in replay viewing. Fixed with `rosterByIndex`.
- **Bug (screenshot-found):** own units prefixed "Allied" in history (the engine sets `is_allied` on own units). Fixed via `player_data.army_index`, verified against live_game.js:815-880.
- **Code Quality:** dead `model.rows` shell for the units role deleted; combat expiry moved out of a computed into a dedicated sweep.
- Cache bounding-invariant comments; polls paused while minimized; shadow drift gate + rebuild tooling (see MNT-001).

### Notes for the record (not findings)

- Identifier triangle intact; Chrome-40 rules mechanically enforced (zero violations).
- Licence ships in the release ZIP with PA Inc. attribution for the shadowed file and game content.
- Packaging gate verifies ZIP-root `modinfo.json`, case-exactness, orphans, and the shadow fingerprint.

---

<sub>Generated by `pa-mod-review`. Findings marked Unverified could not be resolved against
the bundled references and are not verdicts — they need a human decision.</sub>
