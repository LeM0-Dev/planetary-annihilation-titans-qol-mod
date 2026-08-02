# Mod Review — PA:T QoL

**Verdict: Loads cleanly.** No blockers or bugs. 2 maintenance risks (both known and gated/documented), 1 code-quality item, 2 unverified items. A large share of this pass's features were verified LIVE against a running game during development (threat formula, intel labels, menu injection, ammo alerts) — those are listed as verified, not unverified.

| | |
|---|---|
| Identifier | `com.lem0.pat-qol` |
| Version | 0.5.0 (staging, unpushed) |
| Context | client |
| Files reviewed | 75 |
| Base-game files shadowed | 1 |
| Base game | `/mnt/nvme-2-4tb/SteamLibrary/steamapps/common/Planetary Annihilation Titans/media` (--media) |
| Reviewed | 2026-08-03 (fourth pass; adds three-window split, nuke/anti ammo status, GW map intel + travel boost, in-game Game Info popup, `gw_play` scene) |

## Summary

| Severity | Count |
|---|---|
| Maintenance Risk | 2 |
| Code Quality | 1 |
| Unverified | 2 |

| ID | Severity | Location | Finding |
|---|---|---|---|
| MNT-001 | Maintenance Risk | `ui/main/game/live_game/js/audio.js` | Whole-file shadow of the voice-queue script |
| MNT-002 | Maintenance Risk | `ui/mods/com.lem0.pat-qol/features/gw_travel/intel.js` | GW-AI-Overhaul's threat formula is reimplemented and will drift if GWO changes it |
| QUA-001 | Code Quality | `ui/mods/com.lem0.pat-qol/panels/window.js` | Per-window worldview polls overlap (own-army scans in Own Units and Own Structures) |
| UNV-001 | Unverified | `ui/mods/com.lem0.pat-qol/panels/window.js` | CSS zoom (scale ≠ 100%) vs drag coordinates on Chrome 40 |
| UNV-002 | Unverified | — | Remaining play-test one-timers |

## Maintenance Risk

> Correct today, fragile against a future patch.

### MNT-001 — Whole-file shadow of `js/audio.js`

Unchanged from prior passes: sole shadow, one marked change (`paqol.audioDecayMs`), unavoidable (`priority_level_cooldown` is closure-private), md5-gated in the release pipeline (`64c22eb2…`), regenerated via `tools/rebuild-audio-shadow.sh`. Re-diff after every PA patch.

<sub>`shadow.avoidable-js` — reclassified (no interception point)</sub>

### MNT-002 — GWO threat formula reimplemented

**Location:** `ui/mods/com.lem0.pat-qol/features/gw_travel/intel.js` (`threatOf`, `numCommanders`, `BUFF_MULT`)

**Found:** The map intel labels and the in-game Game Info popup compute threat with a line-for-line ES5 port of GW-AI-Overhaul's `measureThreat` (`section_of_foreign_intelligence.js:282`): per-army eco scaled by `(commanderCount+1)/2`, +0.4·eco per extra foe commander, ally division, buff multipliers {1.3, 1.2, 1.1, 1.5}, ×3 guardians. Verified live to match GWO's displayed value exactly (20.29 on the same star).

**Why it matters:** GWO is actively developed; if quitch changes the formula or the buff enum, this mod's numbers silently diverge from GWO's intel screen — same class of risk as a mod-file shadow, without a file to diff-gate. There is no exposed function to call instead (GWO computes it inside its own scene module; this mod's labels also work WITHOUT GWO installed, where no formula exists at all).

**Fix:** None structural. Re-check against GWO's `section_of_foreign_intelligence.js` when GWO updates; the download cache zip (`com.pa.quitch.gwaioverhaul.zip`) is the reference.

<sub>`judgment.formula-port`</sub>

---

## Code Quality

### QUA-001 — Overlapping own-army worldview scans across windows

**Location:** `ui/mods/com.lem0.pat-qol/panels/window.js` (Own Units: `pollCommanders` 5 s + `pollStuck` 8 s; Own Structures: `pollNukes` 2 s + `pollIdleFactories` 3 s)

**Found:** After the three-window split, each window polls only what it renders (good), but Own Units and Own Structures both run per-planet `getArmyUnits` scans of the same own army on independent timers. Total engine traffic ≈ the old combined window, so this is unchanged in magnitude — noted for the record, mitigations intact (minimize-pause, caps, hollow-state pruning).

**Fix:** Optional; a shared scan would need cross-panel messaging and is likely not worth it.

<sub>`judgment.performance`</sub>

---

## Verified live this pass (running game, Coherent debugger)

- **Threat numbers match GWO exactly** (star "First Seeker Osiris": both show 20.29).
- **Intel labels render on every star with a living AI** (9 of 9 in the test galaxy), survive travel-past, and vanish on conquest (conquest clears `star.ai()` — 27 of 34 visited stars had no ai; the 7 with ai were unfought).
- **Ammo alerts** (`watch_type 14`) carry exact `ammo_count`/`max_ammo_count`; ammo units are INVISIBLE to `getArmyUnits`/`getUnitState` (hollow `{}` even for a live missile id) — counts must come from alerts, and no missile build-% exists anywhere in the UI layer.
- **Game Info menu entry** injects via `menuConfigGenerator` wrap (verified in the live menu list) — gated on `model.gameType() === 'Galactic War'`; `model.isGalaticWar` does NOT exist on the main VM (first attempt failed on that).
- **`built_frac`** gates construction states everywhere it matters (stuck detection, idle rows, commander rows, launcher Building %); patrol-building fabbers (`build_target` set) are never "stuck".
- **GW travel boost** re-applies per rebuilt player VM (post-battle) via a persistent watcher; `gw_play` scene registration confirmed post-restart.
- **Favorites** verified in armory + GW (stock and GWO picker) + lobby; lobby index remap does not resend `update_commander`.

## Unverified — needs clarification

### UNV-001 — Window scale ≠ 100% vs drag coordinates (Chrome 40)

Unchanged: at 150%, verify the titlebar tracks the cursor during drag/resize; if it drifts, multiply streamed coordinates by the effective zoom in `stream()`.

### UNV-002 — Remaining play-test one-timers

Three-window split's first full game (geometry defaults, per-window polls); Game Info popup fed by a map visit under the new raw-localStorage persist (the store.js-less `gw_play` scene was the original "no intel" cause); `docs/manual-test-checklist.md` sections H–J and the MP one-timers.

## Known gaps

- `.papa` internals not parsed; `.pas` checked as JSON only.
- Unreferenced-file detection honors `.gitattributes export-ignore` (fixed this session) and scans the base game only around each candidate.
- Server-mod conduct rules do not apply (client mod).
