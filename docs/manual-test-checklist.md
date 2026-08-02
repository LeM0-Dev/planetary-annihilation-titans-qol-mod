# Manual test checklist

Per PA-MOD-CODING-RULES Rule 9: **a test is not complete until the console
log has been read** — for both the `live_game` scene and the `unit_alert`
panel context (Coherent debugger, `--coherent_port=9999`).

## A. Load

1. Clean restart, mod enabled, no other mods → exactly one
   `[com.lem0.pat-qol] scene "...": N feature(s) started, 0 failed` per scene;
   zero errors/warnings attributable to us.
2. Install from the release ZIP (not the symlink) and repeat.
3. With pachat + Galactic War Overhaul also enabled → still clean.
4. Temporarily give `features/enemy_hvt/feature.js` a syntax error → ONLY
   enemy_hvt is missing; history and priority still work; one clear error.
   (Proves registry isolation.) Revert after.

## B. Clock

5. Start a game → history rows show a time that advances and matches the time
   bar. Pause → new rows show the paused time. If time is unavailable, rows
   show `--:--`, never wall clock.

## C. Notification history

6. Build a factory, lose a unit, get attacked → rows appear newest-first with
   labels and icons.
7. **Alt-tab for 60 s while things happen, come back → those alerts are in
   the history.** (The `model.active()` regression test — the base game drops
   alerts while unfocused; we must not.)
8. Click a row → camera jumps to the right planet and location. Click a row
   with no location → nothing happens, no error.
9. Exceed the cap (settings → history length) → oldest rows drop, "+N older"
   shows, no lag.
10. Drag/resize/minimize the window; restart PA → geometry and minimized
    state restored.
11. Change resolution/UI scale so saved geometry would be off-screen;
    restart → window clamped back on-screen.
12. Start a second game → history is cleared.

## D. Enemy targets

13. Scout an enemy nuke launcher, anti-nuke, unit cannon, each Titan,
    commander, Catalyst, Halley → each appears once, correctly categorised.
14. Kill each one → the entry disappears.
15. Re-sight a previously seen unit → no duplicate; "last seen" updates;
    unseen-for-5-min entries dim.
16. Own/allied units never appear.
17. Enable "also track teleporters..." → teleporters appear next game;
    disable → back to baseline; check the stock alert strip is not flooded.
18. Click an entry → camera jumps.

## E. Notification priority

19. Disable "Commander under attack" → no voice line; the visual alert still
    appears (we gate audio only).
20. Disable everything → notification silence, but **UI click/rollover sounds
    and music still play** (proves `api.audio.playSound` untouched).
21. Re-enable everything → identical to vanilla; no doubled voice lines.
22. Trigger `full_metal` within ~1 s after `commander_low_health` → commander
    line plays, metal line does not.
23. Reverse the order → both play (high after low is never blocked).
24. Console: `paqol.arbiter.bypass = true` → behaviour is exactly vanilla.
25. After ~10 min of play, `localStorage['com.lem0.pat-qol/cuemap']` has
    learned entries and stays under the 200 cap.

## F. Settings

26. Settings → "PA:T QOL" tab exists, opens, renders all groups; other tabs
    unaffected.
27. Change a notification toggle in the in-game settings panel → takes effect
    in the live game within ~2 s, no restart.
28. Shared footer "restore defaults" while on our tab → resets OUR settings
    only; other tabs' state untouched.
29. Restart PA → settings persisted.
30. Hand-corrupt `localStorage['com.lem0.pat-qol/notifications']` to `{{{` →
    one error logged, defaults used, a `.corrupt.<ts>` backup key exists,
    nothing crashes.

## G. Other scenes

31. Spectator and replay → no errors; panels either work or are cleanly
    absent.
32. Galactic War (`gw_play` → live game) → no errors.
33. Disable the mod, restart → no residue; settings opens on a valid tab.

## Open spikes (do these FIRST on a fresh install)

- **S1 — symlink**: after `tools/install-symlink.sh`, does PA list the mod
  under Community Mods → Installed? If not, use `tools/install-copy.sh`.
- **S2 — mouse capture**: drag inside a panel — camera must not pan, units
  must not deselect underneath. If events leak, the floating-panel
  `stopPropagation` list in `core/ui/floating_panel.js` needs widening.
- **S3 — alert id stability**: scout then kill an enemy nuke launcher; the
  HVT entry must disappear. If `alert.id` is not stable between sight and
  death, switch `enemy_hvt` keying to `(planet_id, rounded location,
  category)` — the change is contained in `feature.js`.
