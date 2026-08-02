#!/bin/sh
# PA:T QoL — regenerate the ui/main/game/live_game/js/audio.js shadow after a
# PA patch: copy the CURRENT base-game file and re-apply the mod's single
# change (priority_level_cooldown read lazily from paqol.audioDecayMs).
# Fails loudly if the anchors are gone (PA restructured the file — hand-diff).
#
#   PA_MEDIA=/path/to/PA/media tools/rebuild-audio-shadow.sh
set -eu
cd "$(dirname "$0")/.."

MEDIA="${PA_MEDIA:-/mnt/nvme-2-4tb/SteamLibrary/steamapps/common/Planetary Annihilation Titans/media}"
REL="ui/main/game/live_game/js/audio.js"
BASE="$MEDIA/$REL"
[ -f "$BASE" ] || { echo "FAIL: base file not found: $BASE (set PA_MEDIA)"; exit 1; }

NEW_MD5=$(md5sum "$BASE" | cut -d' ' -f1)

node - "$BASE" "$REL" "$NEW_MD5" <<'EOF'
const fs = require('fs');
const [base, rel, md5] = process.argv.slice(2);
let src = fs.readFileSync(base, 'utf8');

// anchor 1: the constant declaration
const declAnchor = /(    var priority_level_cooldown = 30 \* 1000[^\n]*\n)/;
// anchor 2: its single use site
const useAnchor = /(\}, priority_level_cooldown\);)/;
if (!declAnchor.test(src) || !useAnchor.test(src)) {
    console.error('FAIL: anchors not found — PA restructured audio.js; re-apply the change by hand.');
    process.exit(1);
}

src = src.replace(declAnchor,
`    /* PA:T QoL: was \`var priority_level_cooldown = 30 * 1000;\`. Read lazily so
       the mod (which loads after this file) can supply the configured value,
       and so this file still works stand-alone if the mod's JS never runs. */
    var priority_level_cooldown = function () {
        var v = window.paqol && window.paqol.audioDecayMs;
        return (typeof v === 'number' && v >= 500) ? v : 3000;
    };
`);
src = src.replace(useAnchor, '}, priority_level_cooldown()); /* PA:T QoL: was the constant */');

const header =
`/* PA:T QoL (com.lem0.pat-qol) SHADOW of the base game's
   ${rel} (md5 ${md5}).
   The ONLY change: priority_level_cooldown (how long a played voice line's
   priority keeps suppressing lower-priority lines; vanilla hardcodes 30 s)
   is read lazily from the mod's settings, default 3 s. Everything else is
   byte-identical — regenerate with tools/rebuild-audio-shadow.sh after
   every PA patch. */
`;
fs.writeFileSync(rel, header + src);

// keep the drift gate's recorded fingerprint in sync
const gate = 'tools/check-modinfo.mjs';
let g = fs.readFileSync(gate, 'utf8');
g = g.replace(/const SHADOW_BASE_MD5 = '[0-9a-f]{32}'[^\n]*/,
    "const SHADOW_BASE_MD5 = '" + md5 + "'; // synced by rebuild-audio-shadow.sh");
fs.writeFileSync(gate, g);
console.log('shadow rebuilt from base md5 ' + md5 + '; drift gate updated');
EOF

node tools/check-modinfo.mjs
