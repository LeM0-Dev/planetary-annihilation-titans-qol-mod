#!/bin/sh
# PA QoL — dev install fallback: rsync only the runtime files into PA's
# client_mods dir. Use when the symlink install is not picked up by PA.
set -eu
REPO=$(cd "$(dirname "$0")/.." && pwd)
DEST="$HOME/.local/Uber Entertainment/Planetary Annihilation/client_mods/com.lem0.pa-qol"

if [ -L "$DEST" ]; then
    echo "removing existing symlink $DEST" >&2
    rm "$DEST"
fi

# Bump the patch version on every reinstall so the game (and the Community
# Mods list) never shows a stale build as current.
node -e '
const fs = require("fs");
const p = "modinfo.json";
const m = JSON.parse(fs.readFileSync(p, "utf8"));
const v = m.version.split(".").map(Number);
v[2] += 1;
m.version = v.join(".");
m.date = new Date().toISOString().slice(0, 10);
fs.writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
const ns = "ui/mods/com.lem0.pa-qol/core/ns.js";
fs.writeFileSync(ns, fs.readFileSync(ns, "utf8")
    .replace(/paqol\.VERSION = \x27[^\x27]*\x27/, "paqol.VERSION = \x27" + m.version + "\x27"));
console.log("version bumped to " + m.version);
'
mkdir -p "$DEST"
rsync -a --delete \
    --include='/modinfo.json' \
    --include='/ui/***' \
    --exclude='*' \
    "$REPO/" "$DEST/"
echo "copied runtime files to: $DEST"
echo "Re-run this script after every edit, then restart PA."
