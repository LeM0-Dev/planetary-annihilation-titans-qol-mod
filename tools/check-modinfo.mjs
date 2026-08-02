#!/usr/bin/env node
// PA QoL release gate. Zero dependencies. Checks:
//  - modinfo.json parses as strict JSON with the required keys/types
//  - identifier matches the single directory under ui/mods/
//  - every scenes URL points into the mod, resolves to a file CASE-EXACTLY,
//    and ends .js or .css (anything else is silently ignored by loadMods)
//  - every shipped .js/.css under ui/mods/ is referenced by some scene
//  - no uppercase characters in shipped paths
//  - modinfo version matches the newest CHANGELOG.md heading (if present)
// Exits non-zero on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const fail = (m) => problems.push(m);

// ---- modinfo.json ----------------------------------------------------------
const modinfoPath = path.join(root, 'modinfo.json');
let modinfo;
try {
    modinfo = JSON.parse(fs.readFileSync(modinfoPath, 'utf8'));
} catch (e) {
    console.error(`FAIL: modinfo.json does not parse: ${e.message}`);
    process.exit(1);
}

const requiredStrings = ['context', 'identifier', 'display_name', 'description', 'author', 'version', 'build', 'date'];
for (const key of requiredStrings) {
    if (typeof modinfo[key] !== 'string' || modinfo[key] === '')
        fail(`modinfo.json: required key "${key}" is missing or empty`);
}
if (modinfo.context !== 'client') fail(`modinfo.json: context is "${modinfo.context}", expected "client"`);
if (!/^[a-z0-9.-]+$/.test(modinfo.identifier ?? '')) fail('modinfo.json: identifier must be lowercase reverse-domain');
if (!modinfo.scenes || typeof modinfo.scenes !== 'object') fail('modinfo.json: scenes map is missing');
if (modinfo.priority === 0) fail('modinfo.json: priority 0 is falsy and silently becomes 100 — omit it instead');

// ---- ui/mods directory -----------------------------------------------------
const uiMods = path.join(root, 'ui', 'mods');
const modDirs = fs.existsSync(uiMods) ? fs.readdirSync(uiMods) : [];
if (modDirs.length !== 1) fail(`ui/mods/ must contain exactly one directory, found: ${modDirs.join(', ') || '(none)'}`);
else if (modDirs[0] !== modinfo.identifier) fail(`ui/mods/${modDirs[0]} does not match identifier ${modinfo.identifier}`);

// Case-exact existence check (the repo may sit on a case-insensitive mount).
function existsCaseExact(rel) {
    let dir = root;
    for (const part of rel.split('/')) {
        if (!fs.existsSync(dir)) return false;
        if (!fs.readdirSync(dir).includes(part)) return false;
        dir = path.join(dir, part);
    }
    return fs.statSync(dir).isFile();
}

// ---- scenes URLs -----------------------------------------------------------
const prefix = `coui://ui/mods/${modinfo.identifier}/`;
const referenced = new Set();
for (const [scene, urls] of Object.entries(modinfo.scenes ?? {})) {
    if (!Array.isArray(urls)) { fail(`scenes.${scene}: expected an array`); continue; }
    for (const url of urls) {
        if (typeof url !== 'string') { fail(`scenes.${scene}: non-string entry`); continue; }
        if (!url.startsWith(prefix)) { fail(`scenes.${scene}: ${url} does not start with ${prefix}`); continue; }
        if (!/\.(js|css)$/.test(url)) fail(`scenes.${scene}: ${url} is neither .js nor .css (loadMods ignores it)`);
        const rel = url.slice('coui://'.length);
        referenced.add(rel);
        if (!existsCaseExact(rel)) fail(`scenes.${scene}: ${url} does not resolve to a file (case-exact)`);
    }
}

// ---- references from shipped .html (panel pages load scripts themselves) ---
function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p, out);
        else out.push(p);
    }
    return out;
}

if (fs.existsSync(uiMods)) {
    for (const file of walk(uiMods).filter((f) => f.endsWith('.html'))) {
        const html = fs.readFileSync(file, 'utf8');
        for (const m of html.matchAll(/coui:\/\/(ui\/mods\/[^"' )]+\.(?:js|css))/g)) {
            referenced.add(m[1]);
            if (!existsCaseExact(m[1]))
                fail(`${path.relative(root, file)}: references missing file coui://${m[1]}`);
        }
    }

    for (const file of walk(uiMods)) {
        const rel = path.relative(root, file).split(path.sep).join('/');
        if (/[A-Z]/.test(rel)) fail(`uppercase character in shipped path: ${rel}`);
        // .html files are loaded at runtime via loadHtml(); only .js/.css must
        // be referenced from the scenes map.
        if (/\.(js|css)$/.test(rel) && !referenced.has(rel))
            fail(`orphan: ${rel} is shipped but referenced by no scene`);
        if (!/\.(js|css|html|png)$/.test(rel))
            fail(`unexpected file type shipped: ${rel}`);
    }
}

// ---- changelog -------------------------------------------------------------
const changelogPath = path.join(root, 'CHANGELOG.md');
if (fs.existsSync(changelogPath)) {
    // Dev reinstalls auto-bump the patch version past the changelog heading;
    // only a REGRESSION (modinfo older than the newest changelog entry) fails.
    const m = fs.readFileSync(changelogPath, 'utf8').match(/^##\s+\[?v?([0-9]+\.[0-9]+\.[0-9]+)/m);
    const toNum = (v) => v.split('.').reduce((a, x) => a * 100000 + Number(x), 0);
    if (m && toNum(modinfo.version) < toNum(m[1]))
        fail(`modinfo version ${modinfo.version} is older than CHANGELOG.md newest heading ${m[1]}`);
}

// ---- chrome-40 lexical bans -------------------------------------------------
// ecmaVersion:5 in eslint catches syntax; these are RUNTIME absences that
// parse fine but explode in Coherent, plus `const` (parses, but is
// function-scoped with silent reassignment failure there).
const BANNED = [
    [/\bconst\b/, 'const'],
    [/\bObject\.assign\b/, 'Object.assign'],
    [/\bObject\.entries\b/, 'Object.entries'],
    [/\bObject\.values\b/, 'Object.values'],
    [/\bArray\.from\b/, 'Array.from'],
    [/\bArray\.of\b/, 'Array.of']
];
if (fs.existsSync(uiMods)) {
    for (const file of walk(uiMods).filter((f) => f.endsWith('.js'))) {
        const rel = path.relative(root, file).split(path.sep).join('/');
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
            const noComment = line.replace(/\/\/.*$/, '');
            for (const [re, name] of BANNED) {
                if (re.test(noComment)) fail(`${rel}:${i + 1}: "${name}" is not Chrome-40 safe`);
            }
        });
    }
}

// ---- verdict ---------------------------------------------------------------
if (problems.length) {
    console.error(`check-modinfo: ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
}
console.log(`check-modinfo: OK (${referenced.size} scene resources verified for ${modinfo.identifier} v${modinfo.version})`);
