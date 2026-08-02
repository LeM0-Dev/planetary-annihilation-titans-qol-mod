# Mod Review — PA:T QoL

**Verdict: Loads cleanly.**
No blockers or bugs across 57 files; one Maintenance Risk (a deliberate, documented base-file shadow) and two advisory notes.

| | |
|---|---|
| Identifier | `com.lem0.pat-qol` |
| Version | 0.4.0 (unreleased working tree, staging) |
| Context | client |
| Files reviewed | 59 |
| Base-game files shadowed | 1 |
| Base game | `/mnt/nvme-2-4tb/SteamLibrary/steamapps/common/Planetary Annihilation Titans/media` (`--media`) |
| Reviewed | 2026-08-02 |

## Summary

| Severity | Count |
|---|---|
| Maintenance Risk | 1 |
| Code Quality | 2 (both resolved same day; see notes) |

| ID | Severity | Location | Finding |
|---|---|---|---|
| MNT-001 | Maintenance Risk | `ui/main/game/live_game/js/audio.js` | Whole-file shadow of a base-game script; PA's future changes to it are silently reverted until re-diffed |
| QUA-001 | Code Quality | `ui/mods/com.lem0.pat-qol/panels/window.js` | Per-spec caches (`specCache`, `maskProbe`, `brightCache`, tint filters) grow unbounded within a game |
| QUA-002 | Code Quality | `ui/mods/com.lem0.pat-qol/panels/window.js` | Own & Allied polling fans out `armies × planets` engine calls every 5 s |

## Maintenance Risk

> Correct today, fragile against a future PA patch.

### MNT-001 — Whole-file shadow of `live_game/js/audio.js` silently reverts future PA changes to that file

**Location:** `ui/main/game/live_game/js/audio.js`

**Found:** A byte-identical copy of the base-game file (base md5 `64c22eb2…`, build 124667) with one marked change: `priority_level_cooldown` — vanilla `30 * 1000` — is read lazily from `paqol.audioDecayMs` (default 3000, safe fallback if the mod's own JS never runs). The file header documents the change and the re-diff obligation; `docs/base-game-seams.md` repeats it with the md5.

**Why it matters:** Shadowing replaces the whole file, so every unrelated change PA ships to `audio.js` in a future patch is silently reverted for users of this mod — the classic silent-failure mode this review exists to catch. Note the CLI reported this as *Code Quality* ("the base file assigns functions to `self`, wrap instead"); that verdict is corrected here: the exposed `self.*` members (`processEvent`, `trigger`, music controls) do **not** reach the changed member. `priority_level_cooldown` and the decay timer that consumes it (`setAudioResponsePriorityLevel`) are closure-private with no interception point, which is precisely the skill's stated criterion for Maintenance Risk rather than avoidable shadowing. The mod's other audio behaviour (enable/priority filtering) correctly uses wrappers, not the shadow.

**Fix:** Mitigated mechanically since first written: `tools/check-modinfo.mjs` (run on every check/package/release) now md5-verifies the installed base file against the recorded fingerprint and fails when PA patches it, and `tools/rebuild-audio-shadow.sh` regenerates the shadow from the current base file via anchored replacement — failing loudly if PA restructures the file. Round-trip verified: the regenerated shadow differs from base by exactly the header and the two anchored edits. Residual risk: none beyond a PA restructure large enough to break the anchors, which the gate surfaces.

<sub>`shadow.unavoidable-closure` (reclassified from CLI `shadow.avoidable-js`)</sub>

---

## Code Quality

> Performance or general improvement.

### QUA-001 — Window-page caches grow without bound for the life of a game

**Location:** `ui/mods/com.lem0.pat-qol/panels/window.js` (`specCache`, `maskProbe`, `brightCache`, `tintFilters`)

**Found:** Four memoisation maps keyed on spec paths, icon URLs, and army colours, with no eviction.

**Why it matters:** In practice all four are bounded by game content — distinct unit specs (~hundreds), atlas icons, and army colours (≤10) — and the pages are torn down with the scene, so this cannot leak across games. It is worth a comment so a future feature does not key one of these on something genuinely unbounded (e.g. per-unit ids).

**Fix:** Done — each map now carries a `BOUNDING INVARIANT` comment naming its key domain.

<sub>`js.cache-unbounded`</sub>

### QUA-002 — Commander poll issues `armies × planets` engine calls per cycle

**Location:** `ui/mods/com.lem0.pat-qol/panels/window.js` (`pollCommanders`)

**Found:** Every 5 s, one `getArmyUnits` call per (own/allied army × planet) — e.g. 3 armies × 8 planets = 24 promises per cycle — plus one `getUnitState` batch; idle factories add one `getUnitState` batch every 3 s.

**Why it matters:** The per-planet fan-out is forced by the engine (`planetIndex -1` returns nothing — verified live), and the base game's own commander pipeline does the same loop at a 1 s cadence, so 5 s is conservative by comparison. Large systems (16+ planets) in FFAs would still multiply this; if it ever shows up in profiling, the cheap wins are skipping planets with no known presence or lengthening the interval when the window is minimized.

**Fix:** Done — both polls (`pollCommanders`, `pollIdleFactories`) return immediately while the window is minimized.

<sub>`js.poll-fanout`</sub>

---

## Unverified — needs clarification

- **Server-mod conduct restrictions** — not applicable; this is a client mod that issues no game-state mutations (`engine.call` uses are watch-list configuration only, a sanctioned client capability the base game itself exercises from the same seam).
- **Multiplayer-only paths** — allied `getArmyUnits` behaviour was verified in GW co-op; a human-vs-human session has not been observed (now a one-time item in `docs/manual-test-checklist.md`). Ping attribution was removed by design: pings render as plain white rows.
- **Ping recolour (white) and minimized-poll pause** — implemented after the live session ended; covered by lint/tests/release gate but not yet observed in-game.

## Not covered by this review

- `.papa` binary internals are not parsed — only existence checks (this mod ships none of its own).
- Base-game vocabulary snapshots (`references/pfx-keys.json`, scene list) date from build 124667; this mod ships no `.pfx`, so the staleness risk does not apply here.
- Unreferenced-file detection relies on the mod's own `tools/check-modinfo.mjs` gate (scene refs + `.html`-loaded scripts) — independently re-verified by the CLI pass with no orphans found.
- Runtime behaviour (camera jumps, audio arbitration, window interaction) is outside static review; it has been exercised live during development against build 124667, including via the Coherent debugger, but that is testing, not this review.

### Notes for the record (not findings)

- The identifier triangle (`modinfo.identifier` = `ui/mods/` directory = every `coui://` URL) is intact post-rename; the release gate enforces it.
- Licence and attribution obligations are handled: `LICENSE.md` ships in the release ZIP, credits PA Inc. for the shadowed file and game content.
- Chrome-40 compliance is enforced mechanically (ESLint `ecmaVersion: 5` + lexical bans on `const`/runtime-absent builtins) — zero violations in shipped code.
- The scenes map loads 25 resources across `live_game`, `live_game_unit_alert`, `settings`; panel pages correctly self-bootstrap `bundle://boot/boot.js`.

---

<sub>Generated by `pa-mod-review`. Findings marked Unverified could not be resolved against
the bundled references and are not verdicts — they need a human decision.</sub>
