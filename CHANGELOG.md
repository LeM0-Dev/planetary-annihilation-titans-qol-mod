# Changelog

## 0.3.0 — 2026-08-02

First public release of **PA:T QoL** (`com.lem0.pat-qol`).

### Notification history window

- Movable, resizable, minimizable in-game window listing every notification
  of the match, newest first, stamped with **game time**.
- Click a row to jump the camera to where it happened.
- Nothing expires (configurable length, 100–2000 rows), and alerts that
  arrive while you are alt-tabbed are kept — the stock 5-slot strip drops
  both.
- Battle anti-spam: repeats of the same notification within 15 s coalesce
  into one row with a ×N counter. **Pings are exempt** — two pings are two
  messages, each with its own row and jump location. (Pings render without a
  sender: the engine strips that information before it reaches any client.)
- Duplicate suppression: derived voice events that mirror a visual alert
  (e.g. "enemy commander under attack" next to the commander's own red row)
  render once, keeping the row that carries the name and location.
- Rows are prefixed Enemy/Allied and hostile rows are tinted red.

### Enemy targets window

- Movable, resizable, minimizable window tracking every spotted enemy
  high-value target; click an entry to jump there.
- Categories, each individually toggleable in settings: Commanders,
  **Colonels** (support commanders) and **Angels** (support platforms) —
  grouped with Commanders since some enemies field them in that role —
  Titans, nuke launchers, anti-nuke launchers, unit cannons, Catalysts,
  Halleys, and teleporters.
- Entries update on re-sighting, disappear on confirmed kill, and dim when
  the sighting is older than five minutes.
- The engine's watch lists are widened only for enabled categories the base
  game does not already track.

### Voice notification priority

- Every voice notification can be disabled or given a priority (0–6) in
  settings; visual alerts are never touched.
- **Priority window** (default 3000 ms): while a higher-priority line is in
  flight, lower-priority lines are dropped instead of consuming the game's
  single voice slot.
- **Priority decay** (default 3000 ms, vanilla behaviour restorable at
  30000): vanilla PA keeps suppressing lower-priority lines for 30 s per
  priority level after a line plays — a commander alarm could mute economy
  lines for minutes. Ships as the mod's only base-file shadow
  (`js/audio.js`, one marked change).
- Everything fails open: unknown events always play, and a runaway filter
  disables itself for the session rather than silencing the game.

### Settings

- A **PA QOL** tab in the game's settings screen (main menu and in-game),
  with a search box that filters every option.
- Window layout (position/size/minimized) persists across games; settings
  are stored per-user in namespaced local storage and survive updates.
  Settings saved under the mod's previous identifier (`com.lem0.pa-qol`,
  before 0.3.0) are migrated automatically — if you still have that older
  version installed, remove its folder to avoid running both.
