# Client mods, server mods, and pairing

Recorded from the palobby wiki *Planetary Annihilation Client Mods* and *Server Mods* pages
(archived 2021-09-05).

## Client mods

Mounted on the client; they change the local experience for one player.

> "Client mods are NOT mounted for all players and cannot change units or unit specs in a
> game."

Four basic types:

- **user interface (UI)** — eg adding chat rooms to the uberbar scene, or shared maps to
  the load planet scene
- **effects** — eg altering weapon effects for clearer visibility of incoming fire
- **unit build** — eg changing mine area build from circular to a four-wide strip
- **map packs** — currently a special type of UI client mod

## Server mods

> "uploaded to the server then downloaded and mounted (loaded) on each client"

> "only server mods can change the unit roster or unit specs in a multiplayer game"

Four categories: UI modifications, simple unit changes, complex balance overhauls, and
biome/map adjustments.

### Conduct restrictions — server mods must NOT

- install outside of the current game
- make changes to user settings or data without permission
- "take over PA in any way eg full screen with no cancel option"
- prevent players from leaving a game
- show inappropriate content

> "badly behaved server mods will be killed" — terminated by administrators.

None of these can be established by static analysis, so the review raises them as an
**Unverified** item for any server mod, to be confirmed by inspection.

### Development aids

Testing supports replacing specific server script files, and `--allow-cheats` enables
development mode. The default republishing hotkey is **control-alt-p**.

## Companion mods

A specialised client mod category that a **server mod** designates to load automatically
when a player connects to a game.

- automatically downloaded if absent, updated if outdated
- activated **only for that session**
- declared via the `companions` key on the server mod

Two motivating cases:

- **Large server mods** — splitting client-side files out into a companion shrinks the
  server mod, so upload and download are faster. Trade-off: **replays require the companion
  mod** to view.
- **Biome server mods** — lets a biome server mod require a specific client mod.

The recommended architecture for a large mod is a host server mod, an optional companion
client mod, and an optional UI/branding client mod. Merge dependencies that do not need to
be independent.

## The paired-mod pattern, and why it matters for review

Legion Expansion is the canonical example, and it breaks naive reference checking.

- `com.pa.legion-expansion-server` carries unit specs, ammo, tools and AI data
- `com.pa.legion-expansion-client` carries the models (`.papa`), effects (`.pfx`) and UI
- **both** mount into `coui://ui/mods/com.pa.legion-expansion/` — no `-client`/`-server`
  suffix — so the two mods merge into one virtual folder
- each declares the other in `dependencies`; the server also declares the client in
  `companions`

Two consequences a reviewer must account for:

1. Server-mod specs reference `.papa` models that exist **only in the client mod**.
   Resolving references against the reviewed mod plus the base game alone reports ~141 false
   Blockers on a perfectly correct mod.
2. The server mod's `icon_atlas` scene points at
   `coui://ui/mods/com.pa.legion-expansion/icon_atlas.js`, a file that exists **only in the
   client mod**. It resolves at runtime through the shared namespace.

The CLI therefore locates mods named in `dependencies` and `companions` — probing
`client_mods/<id>`, `server_mods/<id>` and the `-dev` variants — and searches them before
declaring a reference broken. When a partner is declared but not installed, that is reported
as **Unverified** so its absence is not mistaken for the mod being clean.

## Galactic War

**Galactic War does not support server mods.** A GW mod can only modify units the game
already ships, via client-side spec modification.
