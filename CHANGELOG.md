# Changelog

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
