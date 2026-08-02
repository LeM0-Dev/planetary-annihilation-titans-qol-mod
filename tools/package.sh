#!/bin/sh
# PA QoL — build the release ZIP. Include-list, not exclude-list: the archive
# contains modinfo.json at its root plus ui/, nothing else.
set -eu
cd "$(dirname "$0")/.."

node tools/check-modinfo.mjs
node --test "test/"*.test.mjs > /dev/null 2>&1 || { echo 'FAIL: tests failing; not packaging'; exit 1; }

V=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync("modinfo.json","utf8")).version)')
mkdir -p dist
OUT="dist/com.lem0.pa-qol-$V.zip"
rm -f "$OUT"
zip -r -X -q "$OUT" modinfo.json ui

unzip -Z1 "$OUT" | grep -qx 'modinfo.json' \
  || { echo 'FAIL: modinfo.json is not at ZIP root'; exit 1; }
if unzip -Z1 "$OUT" | grep -q '[A-Z]'; then
  echo 'FAIL: uppercase path in archive'; exit 1
fi

echo "ok: $OUT"
