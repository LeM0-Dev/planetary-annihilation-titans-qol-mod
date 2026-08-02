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
echo "copied runtime files to: $DEST"
echo "Re-run this script after every edit, then restart PA."
