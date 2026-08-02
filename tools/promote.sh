#!/bin/sh
# PA QoL — promote staging to main: bump the version ONCE, push staging, and
# open the release PR. Merging that PR into main triggers the release
# workflow, which publishes the GitHub release.
#
#   tools/promote.sh          # patch bump (0.2.13 -> 0.2.14)
#   tools/promote.sh minor    # minor bump (0.2.13 -> 0.3.0)
#   tools/promote.sh major    # major bump (0.2.13 -> 1.0.0)
set -eu
cd "$(dirname "$0")/.."

BRANCH=$(git rev-parse --abbrev-ref HEAD)
[ "$BRANCH" = "staging" ] || { echo "run this on the staging branch (currently on $BRANCH)"; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "working tree not clean; commit or stash first"; exit 1; }

KIND=${1:-patch}
node -e '
const fs = require("fs");
const kind = process.argv[1];
const m = JSON.parse(fs.readFileSync("modinfo.json", "utf8"));
const v = m.version.split(".").map(Number);
if (kind === "major") { v[0]++; v[1] = 0; v[2] = 0; }
else if (kind === "minor") { v[1]++; v[2] = 0; }
else v[2]++;
m.version = v.join(".");
m.date = new Date().toISOString().slice(0, 10);
fs.writeFileSync("modinfo.json", JSON.stringify(m, null, 2) + "\n");
const ns = "ui/mods/com.lem0.pa-qol/core/ns.js";
fs.writeFileSync(ns, fs.readFileSync(ns, "utf8")
    .replace(/paqol\.VERSION = \x27[^\x27]*\x27/, "paqol.VERSION = \x27" + m.version + "\x27"));
console.log("version -> " + m.version);
' "$KIND"

V=$(node -p 'JSON.parse(require("fs").readFileSync("modinfo.json","utf8")).version')

# Releases without notes are how the changelog rotted once already: refuse to
# promote unless CHANGELOG.md has a section for the version being released.
if ! grep -q "^## $V " CHANGELOG.md; then
    echo ""
    echo "FAIL: CHANGELOG.md has no '## $V' section."
    echo "Write the release notes first, commit them, then re-run promote."
    git checkout -- modinfo.json ui/mods/com.lem0.pa-qol/core/ns.js
    exit 1
fi

npm run check

git add modinfo.json ui/mods/com.lem0.pa-qol/core/ns.js
git commit -m "release: v$V"
git push origin staging

gh pr create --base main --head staging \
    --title "Release v$V" \
    --body "Promotes staging to main. Merging publishes the v$V release." \
    || echo "PR creation failed or already exists - open it manually: staging -> main"
