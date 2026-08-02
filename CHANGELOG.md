# Changelog

## 0.3.0 — 2026-08-02

- **Angels and Colonels** join the enemy target window: Colonels
  (support commanders) via their unit type, Angels (support platforms) by
  spec match — grouped right under Commanders in the settings and in the
  window's ordering, since some enemies field them in a commander-like role.
  Both on by default, individually toggleable; saved settings migrate.
- Ping rows render plain again — the short-lived "Ping — You" heuristic was
  unreliable (the engine strips the sender from pings) and has been removed.
- Release hygiene: releases now require a changelog section for the exact
  version, and the version is set manually per release.

## 0.2.14 — 2026-08-02

- Ping rows in the notification history are attributed to their sender when
  the engine provides one (it usually does not — pings arrive with no owner),
  and the player roster is pulled at window load so attribution has data.
- Fixed the first roster broadcast racing the window pages' registration.

## 0.2.13 — 2026-08-02

- Search box in the PA QOL settings tab: filters every row by keywords and
  visible text; section headings match too.
- Configurable voice **priority decay**: after a voice line plays, its
  priority keeps suppressing lower-priority lines, stepping down one level
  per interval. Vanilla hardcodes 30 s (a commander alarm could mute economy
  lines for minutes); PA QoL defaults to 3 s, selectable up to the vanilla
  30 s. (First and only whole-file shadow: `js/audio.js`, one marked change.)
- Fixed the PA QOL settings pane appearing on every settings tab.
- Per-category enemy target toggles (see 0.2.9) merged into the release.
- `modinfo.json` carries the spec-mandated non-empty `signature`/`forum`.

## 0.2.10 — 2026-08-02

- Pings are never coalesced: two pings are two messages — each keeps its own
  row, timestamp and camera-jump location.

## 0.2.9 — 2026-08-02

- Settings **Windows** section restructured: Notification history (enable +
  length) and Target window (enable + a Targets sub-list with individual
  toggles for commanders, Titans, nuke launchers, anti-nukes, unit cannons,
  Catalysts, Halleys, teleporters). Engine watch lists widen only for the
  enabled categories that need it.

## 0.2.8 — 2026-08-02

- Fixed mousewheel over the QoL windows zooming the game camera; the lists
  scroll themselves now.
- Fixed unreadable dark-on-dark text in the settings selectors.
- Widened target tracking (teleporters/Catalysts/Halleys) on by default.

## 0.2.3 — 2026-08-02

- Notification history de-spam: repeats of the same notification within 15 s
  coalesce into one row with a ×N counter; derived-event rows that duplicate
  a watch alert (e.g. "enemy commander under attack" next to the commander's
  own red damage row) are dropped in favour of the alert row, which carries
  the name and clickable location. Alert rows are prefixed Enemy/Allied.
- Fixed window panel pages missing the engine boot bundle
  (`bundle://boot/boot.js`) — 0.2.1's windows rendered unbound templates and
  captured no data.
- Release notes now embed the changelog section for the released version.

## 0.2.0 — 2026-08-02

Architecture fix: the notification-history and enemy-target windows are now
real engine-composited `<panel>` views. 0.1.x mounted them as DOM inside the
`live_game` page, which turned out to be a coordinator page whose own pixels
are never drawn — the windows existed, laid out, and were simply never
rendered. Each window is now its own small panel page
(`panels/window.html`); the live_game host owns its position and size, and
drag/resize/minimize work by the child streaming cursor positions to the
host. Alert and clock data reach the windows directly via the engine's
`watch_list`/`custom_alert`/`time` broadcasts. Icons dropped for now (text
rows); strategic icons return in a later version.

## 0.1.0 — 2026-08-02

Initial release.

- **Notification priority** — per-notification enable/disable and priority
  (0–6) for voice lines, with stomp protection so a low-value line no longer
  eats the queue slot of "commander under attack". Fails open everywhere;
  visual alerts unchanged.
- **Notification history** — floating, draggable, resizable window listing
  past notifications with game-time stamps; click a row to jump the camera.
  Captures alerts even while alt-tabbed (the stock alert strip drops them).
- **Enemy targets** — persistent list of spotted enemy commanders, Titans,
  nuke launchers, anti-nukes, unit cannons, Catalysts, Halleys (and
  optionally teleporters); click to jump. Entries removed on confirmed death,
  dimmed when stale.
- **Settings tab** — "PA QOL" tab in the game's settings screen; everything
  persisted in namespaced localStorage.
