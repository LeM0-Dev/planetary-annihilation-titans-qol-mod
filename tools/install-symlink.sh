#!/bin/sh
# PA QoL — dev install: symlink the repo into PA's client_mods dir.
# The repo root IS the mod root (modinfo.json + ui/ live at the top), so a
# single symlink is enough. If PA's VFS turns out not to follow symlinks on
# this system, use tools/install-copy.sh instead.
set -eu
REPO=$(cd "$(dirname "$0")/.." && pwd)
DEST="$HOME/.local/Uber Entertainment/Planetary Annihilation/client_mods/com.lem0.pa-qol"

if [ -e "$DEST" ] && [ ! -L "$DEST" ]; then
    echo "refusing: $DEST exists and is not a symlink" >&2
    exit 1
fi
mkdir -p "$(dirname "$DEST")"
rm -f "$DEST"
ln -s "$REPO" "$DEST"
echo "linked: $DEST -> $REPO"
echo "Now enable 'PA QoL' under Community Mods -> Installed and restart PA."
