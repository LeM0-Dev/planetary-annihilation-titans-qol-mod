# modinfo.json reference

Recorded from the palobby wiki *Planetary Annihilation Mod Structure* page (archived
2021-09-05), and corrected/extended from the shipped engine where the wiki is silent or
wrong. The wiki may go offline; this file is the durable copy.

Engine sources cited below are relative to the base game `media` folder.

## Mod identifiers

Every mod must have a unique identifier in **lowercase reverse domain name notation**:

- `com.palobby.some-mod-name` — if you own a domain
- `com.pa.handle.some-mod-name` — if you do not

## Keys

| Key | Type | Required | Default | Description |
|---|---|---|---|---|
| `author` | string | **Yes** | — | space delimited uber forum name(s) |
| `build` | string | **Yes** | — | last build number tested against, eg `94684` |
| `category` | array of strings | **Yes** | — | keywords for searching |
| `context` | string | **Yes** | — | `client` or `server` |
| `date` | string | **Yes** | — | `YYYY-MM-DD` UTC date updated |
| `description` | string | **Yes** | — | short description |
| `display_name` | string | **Yes** | — | easily identifiable name |
| `forum` | string | **Yes** | — | URL to forum post in the mods section; must be a real `http(s)://` link |
| `identifier` | string | **Yes** | — | see above |
| `signature` | string | **Yes** | — | must contain a non-empty string, eg `" "` |
| `version` | string | **Yes** | — | `major.minor.revision` or `major.minor.revision-suffix` |
| `authorised` | array of strings | No | — | uberIds who can see this mod |
| `authors` | array of strings | No | — | uber forum names; overrides `author` if present |
| `companions` | array of strings | No (server mods) | — | zero or more mod identifiers |
| `dependencies` | array of strings | No | — | zero or more mod identifiers |
| `framework` | boolean | No | — | `true` for frameworks used only by other mods |
| `github` | string | No | — | URL to GitHub repository |
| `icon` | string | No | — | URL for a 300x300px icon (PNG8/alpha, GIF or JPG) |
| `priority` | number | No | `100` | see below; "should only be specified in special cases" |
| `scenes` | map of arrays | No | — | scene name to array of local URLs |
| `titansOnly` | boolean | No | — | *undefined in the wiki*; observed use is to restrict a mod to TITANS |
| `classicOnly` | boolean | No | — | *undefined in the wiki*; the Classic PA counterpart |

### Keys the wiki does not document but shipped mods use

These appear in gold-standard mods. Their meaning is inferred from usage, not from
documentation, so treat conclusions about them as provisional.

| Key | Observed use |
|---|---|
| `hidden` | `true` on the client half of a client/server pair, so only one entry shows in the mod list |
| `galacticWarMod` | `true` on mods that modify Galactic War |

## `priority` — verified from the engine, not the wiki

The wiki gives no ordering semantics. The engine does:

- `ui/main/game/community_mods/community-mods-manager.js:276` —
  `if (!mod.priority) mod.priority = 100;`
- `ui/main/game/community_mods/community-mods-manager.js:1399` —
  `mods = _.sortBy(mods, 'priority');` inside `activeInstalledClientMods`

lodash `_.sortBy` is **ascending**, and that list is the client mod load order. Therefore:

> **Lower `priority` loads first. Higher loads later.**

This is why New-GW-Cards uses `priority: 100` while GW-AI-Overhaul uses `200`: the card mod
must register its cards into `model.gwoCards` *before* GWO reads that array.

**Trap:** the default is applied with a falsy test, so `priority: 0` is indistinguishable
from absent and silently becomes `100`. Use `1` if you need to load before everything else.

## Prohibited `category` values

Rejected at submission: `mod`, `client`, `client-mod`, `server`, `server-mod`, `map`,
`planet`, `planets`, `system`, `systems`.

Suggested values: `classic`, `titans`, `ai`, `biomes`, `browser`, `effects`, `editor`,
`fix`, `gameplay`, `gw`, `icons`, `lobby`, `maps`, `replays`, `shaders`, `textures`,
`tournaments`, `ui`, `units`, `settings`. This list is not exhaustive — categories are
search keywords, and mods legitimately add their own (GW-AI-Overhaul ships `ki`, `ia`, `si`,
`ИИ`, `电脑`, `電腦` for non-English searches).

## The identifier triangle

Three things must agree:

1. `identifier` in modinfo.json
2. the `ui/mods/<dir>` folder name
3. the directory inside every `coui://ui/mods/<dir>/...` URL in `scenes`

If they disagree and the folder does not exist, **the game loads nothing and reports
nothing**. This is the single most common silent failure in PA modding.

The one legitimate exception is a client/server pair deliberately sharing one namespace:
Legion Expansion ships both `com.pa.legion-expansion-client` and
`com.pa.legion-expansion-server`, but both use `coui://ui/mods/com.pa.legion-expansion/`
(no suffix) so the two mods merge into a single virtual folder. The server mod's
`icon_atlas` scene then resolves into a file that exists only in the client mod.

## Packaging

- Mods are distributed as **zip archives** with `modinfo.json` at the top level.
- File and directory names must be **lowercase**. Windows is case-insensitive, so an
  uppercase path works for the author and silently fails for players on Linux and macOS.
- GitHub release branches with static download links are preferred. Dropbox links need
  `dl=1`.
- Use `.gitattributes export-ignore` to keep dev files out of the release archive.
- Mods update automatically if you replace the zip at the same URL without changing the
  identifier. Bump `version` and `date` when you do.
