# Distribution and conduct rules

Recorded from the palobby wiki *Planetary Annihilation Modding* page (archived 2021-09-05).
These do not stop a mod loading — they stop it being accepted, or breach published conduct
standards. Hence the separate **Compliance** severity.

## Before submitting

- **Mods must not output errors to the client or server logs.** This is a hard gate, and it
  is the reason several checks in this review target silent-but-logged failures.
- Post in the appropriate forum: Titans Released / Work-In-Progress, or Classic PA Released
  / Work-In-Progress.
- Released mods need a Steam Discussions post prefixed `[MOD]`, or `[MOD][TITANS]` for
  TITANS-only mods.

## Technical requirements

- Downloadable **ZIP archive**
- `modinfo.json` at the **top level** of the archive
- GitHub release branches with static download links preferred
- Dropbox links require `dl=1`
- Use `.gitattributes` to exclude development files from the archive

## Submission process

Join the official Discord and post in `#mod-submissions` with a **direct ZIP link** — not a
download page. GitHub links are preferred.

## Updating

> "Existing mods will update automatically if you update the existing zip without changing
> the URL or mod identifier."

When updating: revise `version` and `date`, post to the forum and Steam, and update the
original post with changelog information.

## Security and privacy — prohibited

- remote harvesting, collecting or tracking of user information
- associating or tracking **IP addresses**
- storing excessive personally identifiable information

> "Violating mods result in removal and permanent creator bans."

### Identifying players correctly

| Mechanism | Status |
|---|---|
| Display names | Unreliable — easily changed, and public |
| **UberIds** | **Correct choice.** Unique numbers that identify a user without carrying PII |
| UberNames | Legacy, replaced by UberIds |

The CLI flags references to external IP-lookup services, `RTCPeerConnection` (commonly used
for local IP discovery) and IP-shaped field names as **Compliance** findings. Outbound HTTP
and fingerprinting-adjacent `navigator` reads are flagged as **Areas of Concern** instead —
they are legitimate for fetching mod data, so they need confirming rather than accusing.

## Server mod conduct

See `client-server-mods.md`. Reported as **Unverified** for any server mod, since none of
the five restrictions can be established statically.

## Packaging casing

File and directory names must be **lowercase**. Windows resolves paths case-insensitively,
so an uppercase path works for the author and can fail for players on Linux and macOS.

**Exception — every shadow follows its origin.** A shadow must match the casing of the file
it overrides, whatever that casing is. This applies to **mod shadows as much as base-game
shadows**: overriding another mod's `weapon_Minigun.json` means shipping
`weapon_Minigun.json`, because a path that does not match exactly overrides nothing on a
case-sensitive filesystem — the player silently gets the original file and the mod appears
to do nothing for that unit. **If the origin mod cannot be found, assume lowercase.**

The CLI resolves the origin for real rather than guessing from the tree prefix: it looks in
sibling mods, then source overlays, then the base game (honouring the `pa/` → `pa_ex1/`
overlay), and reads the casing back off the directory entry — `exists()` succeeding on
Windows proves nothing about casing. Three outcomes:

| Origin | Casing | Severity |
|---|---|---|
| found | matches | not reported |
| found | differs | **Area of Concern** — names the origin's spelling |
| none found | — | **Compliance** — the lowercase rule applies |

**Exception — documentation.** Never report casing on documentation, at any severity.
`README.md`, `LICENSE.txt`, `CHANGELOG.md`, `CREDITS_AND_LICENSES.txt` and their kin are not
shipped mod assets — PA resolves mod content only under `pa/`, `pa_ex1/`, `ui/`, `shaders/`
and `effects/`, so nothing ever resolves a path to them, and uppercase is the near-universal
convention. The CLI exempts the conventional stems anywhere in the tree, plus any
`.md`/`.txt`/`.rst`/`.adoc` file at the archive root whatever it is named.

**When the casing is self-consistent, say so.** An uppercase path with no origin is only a
*failure* when something references it with different casing. If the mod both writes and
references `weapon_Minigun_2x.json` in its own namespace, it resolves everywhere, and the
finding is a convention violation with no runtime effect — report it, but state plainly that
nothing breaks rather than reaching for "silently fails for players". Check the extension
too: an uppercase `.json` that resolves is cosmetic, whereas a `.papa` that does *not*
resolve can crash the game rather than degrade, so uppercase asset references deserve an
explicit resolution check before being written off.
