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

# Version policy:
#  - on staging (or any non-main branch): NEVER bump — the version moves once,
#    via tools/promote.sh, when staging is PR'd onto main.
#  - directly on main: bump once per push cycle (first change since the last
#    push); later reinstalls before the next push reuse the number.
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
LOCAL_V=$(node -p 'JSON.parse(require("fs").readFileSync("modinfo.json","utf8")).version')
REMOTE_V=$(git show origin/main:modinfo.json 2>/dev/null | node -p 'JSON.parse(require("fs").readFileSync(0,"utf8")).version' 2>/dev/null || echo "")
if [ "$BRANCH" != "main" ]; then
    echo "on branch '$BRANCH': version stays $LOCAL_V (bumped by tools/promote.sh on release)"
elif [ -n "$REMOTE_V" ] && [ "$LOCAL_V" != "$REMOTE_V" ]; then
    echo "version already bumped this push cycle ($LOCAL_V, origin has $REMOTE_V)"
else
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
fi
mkdir -p "$DEST"
rsync -a --delete \
    --include='/modinfo.json' \
    --include='/ui/***' \
    --exclude='*' \
    "$REPO/" "$DEST/"
echo "copied runtime files to: $DEST"
echo "Re-run this script after every edit, then restart PA."
