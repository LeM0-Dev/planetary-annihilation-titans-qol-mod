#!/bin/sh
# PA QoL — promote staging to main. The version and changelog are set BY HAND
# on staging first; this script validates, syncs paqol.VERSION, and opens the
# release PR. Merging the PR into main triggers the release workflow, which
# fails if the version is not new.
#
# Release steps:
#   1. edit modinfo.json  -> new "version"
#   2. add a '## <version> — <date>' section to CHANGELOG.md
#   3. tools/promote.sh
set -eu
cd "$(dirname "$0")/.."

BRANCH=$(git rev-parse --abbrev-ref HEAD)
[ "$BRANCH" = "staging" ] || { echo "run this on the staging branch (currently on $BRANCH)"; exit 1; }

V=$(node -p 'JSON.parse(require("fs").readFileSync("modinfo.json","utf8")).version')

MAIN_V=$(git show origin/main:modinfo.json 2>/dev/null | node -p 'JSON.parse(require("fs").readFileSync(0,"utf8")).version' 2>/dev/null || echo "")
if [ "$V" = "$MAIN_V" ]; then
    echo "FAIL: modinfo version ($V) equals the version on origin/main."
    echo "Set the new release version in modinfo.json first."
    exit 1
fi

if ! grep -q "^## $V " CHANGELOG.md; then
    echo "FAIL: CHANGELOG.md has no '## $V' section — write the release notes first."
    exit 1
fi

# Keep the runtime banner in sync with modinfo (a manual edit forgets this).
node -e '
const fs = require("fs");
const v = process.argv[1];
const ns = "ui/mods/com.lem0.pa-qol/core/ns.js";
fs.writeFileSync(ns, fs.readFileSync(ns, "utf8")
    .replace(/paqol\.VERSION = \x27[^\x27]*\x27/, "paqol.VERSION = \x27" + v + "\x27"));
' "$V"

npm run check

if [ -n "$(git status --porcelain)" ]; then
    git add modinfo.json CHANGELOG.md ui/mods/com.lem0.pa-qol/core/ns.js
    git commit -m "release: v$V"
fi
git push origin staging

gh pr create --base main --head staging \
    --title "Release v$V" \
    --body "Promotes staging to main. Merging publishes the v$V release." \
    || echo "PR creation failed or already exists - open it manually: staging -> main"
