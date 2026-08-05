# Changelog

## 0.6.0 — 2026-08-05

- Fixed disabled voice notifications leaking back mid-game: the audio
  arbiter's fail-open circuit breaker counted explicit user-disables as
  "runaway denials", so a busy battle with several muted chatty events
  (e.g. continuous build on/off) tripped it and un-muted everything for
  the session. Explicit disables no longer count toward the breaker — it
  now guards only the heuristic priority-stomping path.
- Fixed the in-game **Game Info** popup always saying no intel was
  available: the GW map read the current system from the wrong observable
  (`model.currentStar` instead of the game object's), so the intel was
  never persisted for the battle to read.
- **Co-op**: every player now has their own guaranteed tech per system.
  Each partner's pin starts as the system's originally listed tech and is
  guaranteed in their post-win card offer (host-side); when a player
  acquires that tech elsewhere, only THEIR pin re-rolls (to the system's
  current tech, else a random unowned card) — the partner who still wants
  the original keeps it. The map's Available Tech panel lists each
  partner's pinned tech by name. Persisted per campaign; treasure-planet
  loadout grants untouched. Toggleable in settings, on by default.
- **Deck editor** (settings toggle, OFF by default): a button on the war
  map opens an editor for any player's cards — yours or a co-op partner's
  saved record — to fix misclicked picks. Adding uses a searchable card
  grid with icons, source sections (base game / GW AI Overhaul / other
  mods) and filters; Apply writes into the campaign save (partner edits
  take effect from their next battle).
- **Tech card browser & ban list**: the TECHS label below the war-map
  inventory is now clickable — browse every card with search, source
  sections (base game / GW AI Overhaul / other mods) and a loadout-card
  toggle. Clicking a card there **bans/unbans** it: banned cards' deal
  weight is zeroed for every future star card, offer and reroll (held
  copies keep working; unbanning restores them). Always available, no
  setting needed.
- The in-game **Game Info** popup is fixed-size and closable (✕), and its
  menu entry appears only in Galactic War games.
- **Unit cannons** join Own Structures with the same status treatment as
  the launchers: Building n%, stored-pod count **n/16** with a green tint
  while loaded, and "(loading)" while units are being built into the pods.

## 0.5.0 — 2026-08-02

### Armory info

Locked commanders in the Armory now carry a **?** badge next to the Locked
label when the community knows how they are obtained — hover it for the
details:

- **Calyx, Gamma, Ajax** — awarded for playing in community tournaments.
- **Kapowaz** — awarded for consistently participating in PTE / LABS test
  builds.
- **Beast** — finishing #1 at the end of a ranked season; **Beast King** —
  that, plus beating the current holder in a Bo7/Bo9 tournament.
- **Alpha, Delta, Theta, Progenitor** — Kickstarter backer rewards, no
  longer obtainable.
- Personal Kickstarter-backer commanders are labelled with their backer's
  name, no longer obtainable.

Locked commanders with no known acquisition path read "Obtainability
unknown".

Commanders you own because you bought them read **Purchased** instead of
Owned (free and granted ones keep Owned).

### Armory cart quick-add

Every for-sale commander tile carries a green **Add to cart** button next
to its price tag that adds it to the cart in place — no tab switch, the
cart pill's counter ticks up, and the button flips to a red **Remove from
cart** while the commander sits in the cart.

The commander footer is reworked: a **Buy All Available ($total)** button
drops every purchasable commander you don't own into the cart at once,
flipping to a red **Remove All (n)** that empties the cart while anything
is in it, and a **Checkout** button appears beside it taking you to the
cart. The stock Add To Cart button and the "Item is already in cart."
notice are gone — the per-tile buttons replace both.

### Favorite commanders

Every commander tile carries a **star** (top right): click to favorite, and
favorites sort to the top of the list — on top of the game's built-in
default-commander preference. Stored per-user; survives updates and catalog
refreshes.

The default-commander flow moves onto the tiles too: the stock star overlay
and the footer Set-As-Default button are replaced by a blue **DEFAULT**
pill on the current default (click it to clear) and a **Set default**
button on every other usable commander, both in the tile's price row. The
current default always sorts first, above favorites.

Favorites carry into **Galactic War setup**: the commander list there is
sorted favorites-first (both the stock prev/next carousel and the
GW-AI-Overhaul picker walk the same list), and with the Overhaul's picker
grid the favorite tiles show a gold star. The stock carousel gets a toggle
star between its arrows for the commander on display.

Same in the **game lobby** (skirmish and multiplayer): the commander picker
sorts default → favorites → rest, and every tile carries a toggle star —
all three screens share one favorites list.

### Badges info

The Badges tab now shows **Obtained** and **Not obtained** sections; the
missing badges render greyed out with a tooltip explaining how each was
granted (all shipped badges are legacy-era: alpha/beta participation,
Kickstarter tiers, Uber VIP, Founding Commander).

### Windows

- New **Text & icon size (%)** setting (Windows section) scales the content
  of all three in-game windows — type any value from 50 to 300 or nudge it
  with the arrows; changes apply to running windows within a couple of
  seconds, mid-game included. A live preview beside the input shows exactly
  how window rows will look at the chosen size.

### Own & Allied — now three windows

The single OWN/ALLIED window is split into **Own Units** (commander with
[IDLE] tag, stuck groups, idle fabbers, units in combat), **Own
Structures** (idle factories, nuke & anti-nuke status) and **Allies**
(allied commanders and combat) — each independently movable, resizable and
minimizable; one settings toggle covers all three.

### Own & Allied additions

- Clicking a row now also **selects** what it points at: your commander,
  an idle factory, a planet's idle-fabber group, or a stuck group — so
  re-tasking is one order away.
- **Idle fabricators** are detected and shown grouped per planet
  ("Idle fabbers — <planet> ×N"); rows clear when the fabbers get work.
- Idle commanders are excluded from the fabber rows — the commander row's
  [IDLE] tag already covers them.

### Galactic War map travel & intel

Node-to-node travel on the GW map moves 3× faster — long hops no longer
take several seconds. Every reachable, unconquered system shows an intel
label under its star: planet count, threat (the AI's economy multiplier),
and how many enemy and allied commanders await.

While fighting a GW battle, the ESC menu gains a **Game Info** entry — a
small window with the same intel for the system you are in: planets,
threat, enemy roster, allies, and active modifiers (sudden death, bounty,
eradication, AI buffs).

### Nuke & anti-nuke launcher status

Your nuclear missile launchers appear under OWN with live status:
**Building n%** (the launcher itself), **Preparing** (missile in
production), or a green **READY**. Anti-nuke launchers show their missile stock —
**n/3** — and turn green while at least one interceptor is stored. Counts
come from the engine's ammo alerts (the missile itself exposes no build
percentage). Clicking a Preparing/READY row selects the launcher without
moving the camera — double-click to jump there too (Building rows jump on
single click). Toggleable in settings (on by default).

### Stuck-unit detection

The pathfinder itself cannot be fixed by a mod, but stuck units can be
DETECTED: a unit holding a move/patrol order whose position has not changed
for ~16 s appears under OWN in the Own & Allied window as
"<Unit> stuck ×N" — click to jump there with the units selected, right-click to
dismiss that group until those units move again. Ground units only (air
hover-jitter false-positives are excluded by design); capped at 600 tracked
units per cycle; paused while the window is minimized.

## 0.4.2 — 2026-08-02

- Added the mod icon (shown in the Community Mods manager).

## 0.4.1 — 2026-08-02

- Fixed the player's own units being prefixed "Allied" in the notification
  history (the engine flags own units as allied; rows for your own units now
  render unprefixed).
- Refreshed README screenshots showing all three windows.

## 0.4.0 — 2026-08-02

Row presentation overhaul for both in-game windows:

- **Icons**: every row now carries the unit's build-bar icon and its
  strategic ("orbit view") icon — the strategic icon rendered exactly like
  the game does zoomed out: filled in the owning player's army colour with
  the black glyph preserved.
- **Names**: rows use the unit's actual in-game name (Ragnarok, Angel,
  Air Factory) instead of file-derived labels. Commander rows read
  "[player name] Commander" — the player is the information, not the
  commander model.
- **Colours**: row text is tinted the owning player's army colour whenever
  the roster knows the army (your own units included), falling back to red
  for enemies and white for allies.
- **Layout**: larger text and icons; timestamp pinned to the far right.
- **Right-click a row** to dismiss that entry (history and targets).
- Continuous-build on/off chatter no longer clutters the history (its voice
  settings are unaffected).

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
