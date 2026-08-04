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
    commander, Colonel, Angel, Catalyst, Halley, teleporter → each appears
    once, correctly categorised, ordered commander-role first.
14. Kill each one → the entry disappears.
15. Re-sight a previously seen unit → no duplicate; "last seen" updates;
    unseen-for-5-min entries dim.
16. Own/allied units never appear.
17. Disable a target category (Settings → Target window → Targets) → that
    category stops appearing next game; the widened engine watch lists only
    include enabled categories; the stock alert strip is not flooded.
18. Click an entry → camera jumps. Mousewheel over either window scrolls the
    list and does NOT zoom the game camera.

## D2. Own & Allied window

18a. Your commander is ALWAYS listed under OWN, named "[you] Commander" in
     your army colour, and cannot be right-click dismissed. With no orders
     it reads `[IDLE]`; give it any order → the tag clears within ~5 s.
18b. Allied commanders appear under ALLIED with their players' colours;
     click → camera jumps to the commander (correct planet in multi-planet
     systems — planet ids, not indices).
18c. Get units into a fight → an "In combat" row appears under OWN with the
     fight's game time; it expires on its own after the fight ends.
18d. Let a factory go idle → an idle row appears; give it something to
     build → the row clears within ~3 s; killing the factory also clears it.
18e. Right-click a combat or idle row → just that row disappears.
18f. Minimize the window → the worldview polling stops (no getArmyUnits
     traffic in the debugger); restore → rows refresh.
18g. Rows show build icon + army-coloured strategic icon; dark army colours
     (purple/navy) render brightened and readable.
18h. Pings in the history are plain white "Ping" rows, never merged.

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

## H. Armory (0.5.0)

34. Locked commanders show the **?** badge; hover explains acquisition
    (known ones specific, rest "Obtainability unknown."). Owned/free show no
    badge.
35. Bought commanders read **Purchased** (green pill); free/granted keep
    **Owned**.
36. Badges tab: Obtained and Not obtained sections; locked badges greyed
    with tooltips.
37. Tile **Add to cart** → cart pill count ticks up, no tab switch; button
    flips to red **Remove from cart**; clicking that removes it again.
38. **Buy All Available ($total)** adds every buyable commander in one go;
    flips to **Remove All (n)**; **Checkout ($total)** appears and jumps to
    the cart tab. Purchase flow itself unchanged.
39. Stars: favorite a commander → sorts to the top under the default;
    unfavorite the last favorite → order returns to stock. **DEFAULT** pill
    on the current default (click clears); **SET DEFAULT** on other usable
    tiles works; stock footer button and star overlay are gone.

## I. Commander favorites across screens (0.5.0)

40. GW setup (stock): carousel order = default, favorites, rest; star
    between the arrows toggles the shown commander.
41. GW setup (GW AI Overhaul enabled): picker grid sorted the same; every
    tile has a toggle star.
42. Game lobby (skirmish/MP): picker sorted the same; tile stars toggle;
    selecting a commander then toggling any star keeps the same commander
    selected (no update_commander resent).
43. Favorite toggled in ANY of the three screens shows up in the other two.

## J. Window scale (0.5.0)

44. Settings: type "5" → error note shows, preview renders at 50, nothing
    saved; complete to "90" → error clears, preview at 90, saved.
45. Mid-game: change the size → all the mod's windows re-zoom within ~2 s.
46. At 150%: drag and resize each window — the titlebar must track the
    cursor exactly (Chrome 40 zoom/event-coordinate interaction is
    unverified; if it drifts, coordinates need multiplying by the zoom
    factor in window.js stream()).

## First human-vs-human multiplayer session (once, when it happens)

- An ally pings → the row appears (plain white "Ping" — sender attribution
  is impossible; the engine strips it).
- Allied human commanders appear under OWN & ALLIED with working jumps
  (worldview for human allies was only verified against GW co-op AI allies).

## Resolved spikes (answers baked into the design)

- **S1 — symlink**: PA's VFS does NOT follow symlinks (`api.file.list` skips
  them) — `tools/install-copy.sh` is the dev loop.
- **S2 — mouse capture**: floating DOM inside `live_game` is never even
  composited (coordinator page); windows are real `<panel>` views with
  region-based input — drag/click containment is inherent. Wheel events must
  be consumed by the page or they zoom the camera (handled in window.js).
- **S3 — alert id stability**: confirmed stable — sight and death alerts for
  the same unit share `alert.id`; the target window keys on it.

## K. Galactic War extras (0.5.0)

47. GW map: travel between nodes is visibly fast (3×), including after
    returning from a battle (the boost re-applies to the rebuilt player).
48. Every star with a living enemy shows the intel label; the number matches
    GW-AI-Overhaul's intel screen when GWO is enabled; labels persist on
    systems you travelled past and disappear once conquered.
49. In a GW battle: ESC menu shows **Game Info** (GW games only, absent in
    skirmish); the popup lists system, planets/threat, enemies (with
    commander counts and names), allies, modifiers; ✕ closes it; it is
    fixed-size and draggable.
50. Own Structures: nuke launcher flips Building → Preparing → green READY
    the moment the missile completes; anti-nuke shows n/3 and only shows
    "(building)" below full stock.

## L. GW co-op & deck tools (0.6.0)

51. Co-op: partner's post-win 3-card offer contains their pinned tech for
    that system; the Available Tech panel lists every player's pin by name;
    a partner running the mod sees the same listing (host broadcast).
52. A player acquiring their pinned tech elsewhere re-rolls only THEIR pin
    (others keep the original); pins persist across sessions.
53. TECHS label above the inventory highlights on hover and opens the card
    browser; banning a card there stops it appearing in any future offer,
    star card or reroll; unbanning restores it.
54. Deck editor (setting ON): edit own cards → effects apply immediately;
    edit a partner's record → applies from their next battle; host appears
    once ("You"), not twice.
