#!/bin/sh
# PA QoL — dev install fallback: rsync only the runtime files into PA's
# client_mods dir. Use when the symlink install is not picked up by PA.
set -eu
REPO=$(cd "$(dirname "$0")/.." && pwd)
DEST="$HOME/.local/Uber Entertainment/Planetary Annihilation/client_mods/com.lem0.pat-qol"

if [ -L "$DEST" ]; then
    echo "removing existing symlink $DEST" >&2
    rm "$DEST"
fi

# No version logic here: the version is set manually on staging before a
# release (see tools/promote.sh). Just keep the runtime banner in sync in
# case modinfo was edited by hand.
node -e '
const fs = require("fs");
const m = JSON.parse(fs.readFileSync("modinfo.json", "utf8"));
const ns = "ui/mods/com.lem0.pat-qol/core/ns.js";
const src = fs.readFileSync(ns, "utf8");
const out = src.replace(/paqol\.VERSION = \x27[^\x27]*\x27/, "paqol.VERSION = \x27" + m.version + "\x27");
if (out !== src) { fs.writeFileSync(ns, out); console.log("synced paqol.VERSION to " + m.version); }
'
mkdir -p "$DEST"
rsync -a --delete \
    --include='/modinfo.json' \
    --include='/ui/***' \
    --exclude='*' \
    "$REPO/" "$DEST/"

# The mod is on the Community Mods index now, and CMM force-disables any
# filesystem mod sharing an available identifier (community-mods-manager.js
# :3329). Official guidance: local dev copies must use a DIFFERENT
# identifier. Rewrite it in the INSTALLED copy only — the repo and releases
# stay canonical. File paths (coui://ui/mods/com.lem0.pat-qol/...) are
# unaffected; only the manifest identity changes.
node -e '
const fs = require("fs");
const p = process.argv[1] + "/modinfo.json";
const m = JSON.parse(fs.readFileSync(p, "utf8"));
m.identifier = "com.lem0.pat-qol.dev";
m.display_name = m.display_name + " (dev)";
fs.writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
' "$DEST"
echo "copied runtime files to: $DEST (identifier: com.lem0.pat-qol.dev)"
echo "Re-run this script after every edit, then restart PA."
echo "NOTE: do not ALSO install the community version on this machine."
