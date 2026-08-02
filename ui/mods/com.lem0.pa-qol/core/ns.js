// PA QoL — namespace root. ES5 only (Coherent UI / Chrome 40).
// Must be the first mod file loaded in every scene.
var paqol = window.paqol || {};
window.paqol = paqol;

paqol.MOD_ID = 'com.lem0.pa-qol';
paqol.VERSION = '0.2.3';
paqol.URL = 'coui://ui/mods/com.lem0.pa-qol/';

// Per-scene load guard (Rule 3: idempotent initialization).
// Returns true exactly once per scene name per page.
paqol.claimScene = function (name) {
    var GUARD = '__comLem0PaQolScenes';
    var map = window[GUARD] || (window[GUARD] = {});
    if (map[name]) {
        if (window.console && console.warn)
            console.warn('[' + paqol.MOD_ID + '] Duplicate boot for scene "' + name + '" skipped.');
        return false;
    }
    map[name] = true;
    return true;
};

// Localization helper: uses the game's loc() when present, otherwise
// strips the '!LOC:' prefix so text is still readable.
paqol.loc = function (s) {
    if (typeof s !== 'string') return '';
    if (typeof window.loc === 'function') {
        try { return window.loc(s); } catch (e) { /* fall through */ }
    }
    return s.indexOf('!LOC:') === 0 ? s.slice(5) : s;
};
