#!/usr/bin/env node
// Regenerates references/pfx-keys.json from the shipped base game.
//
// The Particle System Guide's glossary is not exhaustive: PA's own effects use
// keys it never documents (`sort` in 49 base-game .pfx files, `label` in 17,
// `temp_gravity` in 2). Treating the guide as the whole vocabulary produces
// thousands of false positives on any mod derived from stock effects.
//
// So the accepted vocabulary is the union of:
//   - the guide's documented glossary (in lib/pfx.js)
//   - every key actually used by the shipped base game (this file)
//
// Run after a PA patch:
//   node bin/generate-pfx-keys.mjs "<path to>\Planetary Annihilation Titans\media"

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "references", "pfx-keys.json");

// Auto-detect the base game so the slash command needs no argument.
const { createRequire } = await import("node:module");
const { findMedia } = createRequire(import.meta.url)(
  path.join(HERE, "..", "lib", "media.js")
);
const located = findMedia(process.argv[2] || null);
if (!located.path) {
  process.stderr.write(
    "error: base game not found (" +
      located.source +
      ")\nusage: node generate-pfx-keys.mjs [<media-path>]\n"
  );
  process.exit(2);
}
const media = located.path;
process.stdout.write("Base game: " + media + " (" + located.source + ")\n");

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, out);
    } else if (e.isFile() && full.toLowerCase().endsWith(".pfx")) {
      out.push(full);
    }
  }
  return out;
}

const emitterKeys = new Set();
const specKeys = new Set();
// How many distinct files use each key. Frequency is what separates real
// vocabulary from a one-off typo nobody noticed.
const emitterFileCounts = new Map();
const specFileCounts = new Map();
// Enum values the engine actually accepts. The guide's lists are incomplete —
// TORUS is a real emitter type used by a shipped effect but documented nowhere.
const enums = { type: new Set(), shape: new Set(), facing: new Set(), dataChannelFormat: new Set() };
let parsed = 0;
let failed = 0;

for (const root of ["pa", "pa_ex1", "stockmods"]) {
  for (const file of walk(path.join(media, root), [])) {
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(file, "utf8"));
      parsed += 1;
    } catch {
      failed += 1;
      continue;
    }
    if (!doc || !Array.isArray(doc.emitters)) {
      continue;
    }
    const seenEmitterKeys = new Set();
    const seenSpecKeys = new Set();
    for (const em of doc.emitters) {
      if (!em || typeof em !== "object" || Array.isArray(em)) {
        continue;
      }
      for (const k of Object.keys(em)) {
        emitterKeys.add(k);
        seenEmitterKeys.add(k);
      }
      if (typeof em.type === "string") {
        enums.type.add(em.type);
      }
      const spec = em.spec;
      if (spec && typeof spec === "object" && !Array.isArray(spec)) {
        for (const k of Object.keys(spec)) {
          specKeys.add(k);
          seenSpecKeys.add(k);
        }
        for (const e of ["shape", "facing", "dataChannelFormat"]) {
          if (typeof spec[e] === "string") {
            enums[e].add(spec[e]);
          }
        }
      }
    }
    for (const k of seenEmitterKeys) {
      emitterFileCounts.set(k, (emitterFileCounts.get(k) || 0) + 1);
    }
    for (const k of seenSpecKeys) {
      specFileCounts.set(k, (specFileCounts.get(k) || 0) + 1);
    }
  }
}

// Shader names live under effects[].name in shaders/particle.json.
const shaders = [];
try {
  const doc = JSON.parse(fs.readFileSync(path.join(media, "shaders", "particle.json"), "utf8"));
  if (Array.isArray(doc.effects)) {
    for (const e of doc.effects) {
      if (e && typeof e.name === "string") {
        shaders.push(e.name);
      }
    }
  }
} catch (err) {
  process.stderr.write("warning: could not read shaders/particle.json: " + err.message + "\n");
}

// The base game contains its own typos — `emissionBurts`, `velcotiyRangeZ`,
// `sizeRageY`, and the case variants `loopstart` and `velocityRangey`. Absorbing
// those into the accepted vocabulary would mean never catching them in a mod, so
// any base-game key that is a near-miss of a documented key is quarantined as
// suspect rather than accepted.
//
// Documented glossary, mirrored from lib/pfx.js. Kept here rather than imported
// so this generator stays a standalone script.
const DOC_EMITTER = new Set(["spec","type","linkIndex","offsetX","offsetY","offsetZ","offsetRangeX","offsetRangeY","offsetRangeZ","offsetAllowNegZ","velocityX","velocityY","velocityZ","velocityRangeX","velocityRangeY","velocityRangeZ","useRadialVelocityDir","useShapeVelocityDir","velocity","velocityRange","inheritedVelocity","gravity","accelX","accelY","accelZ","drag","sizeX","sizeY","sizeRangeX","sizeRangeY","sizeRandomFlip","sizeRandomFlipX","sizeRandomFlipY","sizeSquareAspect","sizeConstantAspect","rotation","rotationRange","rotationRate","rotationRateRange","snapToSurface","snapToSurfaceOffset","alignVelocityToSurface","red","green","blue","alpha","rgb","useArmyColor","rampV","rampRangeV","rampOffsetV","lifetime","lifetimeRange","emitterLifetime","delay","delayRange","bLoop","loopCount","startLoop","endLoop","startDistance","endDistance","useWorldSpace","useArcLengthSpace","interpolateSpawn","killOnDeactivate","emissionBursts","emissionRate","maxParticles"]);
const DOC_SPEC = new Set(["shader","shape","facing","useInitialVelocityDir","useRandomDir","size","sizeX","sizeY","red","green","blue","alpha","rgb","baseTexture","rampTexture","flipBookColumns","flipBookRows","flipBookFrames","flipBookRandomStart","frameCurve","cameraPush","rotationRateMult","polyAdjustCenter","beamSegmentLength","panRate","dataChannelFormat","papa","materialProperties"]);

const anagram = (s) => s.toLowerCase().split("").sort().join("");

/** Levenshtein distance, capped — only "is it <= 1" matters here. */
function within1(a, b) {
  if (Math.abs(a.length - b.length) > 1) {
    return false;
  }
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) {
      return false;
    }
    if (x.length > y.length) {
      i += 1;
    } else if (y.length > x.length) {
      j += 1;
    } else {
      i += 1;
      j += 1;
    }
  }
  return edits + (x.length - i) + (y.length - j) <= 1;
}

/**
 * Is this base-game key a typo of a documented key, or real vocabulary?
 *
 * RELATIVE frequency decides, not an absolute count. PA's content was authored by
 * many people over years, so a genuine key holds its own against the documented
 * spelling, while a typo is copy-pasted into a handful of files and nobody
 * notices because the engine ignores it silently.
 *
 * Worked examples from the shipped game:
 *   emissionBurts    3 files vs emissionBursts 183  ->  1.6%  -> typo
 *   loopStart       15 files vs startLoop        8  ->  187%  -> real vocabulary
 *   velcotiyRangeZ   1 file  vs velocityRangeZ  many ->  ~0%  -> typo
 *
 * An absolute threshold gets `loopStart` wrong, and asserting that a key PA uses
 * more than the documented one is a mistake would be worse than saying nothing.
 */
const TYPO_RATIO = 0.2;

function isSuspect(key, documented, counts, otherDocumented) {
  // `_x` and `temp_x` are a deliberate authoring idiom for disabling a key.
  if (/^_|^temp_/.test(key)) {
    return false;
  }
  // Documented for this section, so not a typo.
  if (documented.has(key)) {
    return false;
  }
  // Documented for the OTHER section: that is a misplaced key, reported at
  // review time by the wrong-section rule. Not a spelling mistake.
  if (otherDocumented.has(key)) {
    return false;
  }

  const mine = counts.get(key) || 0;
  const lower = key.toLowerCase();

  for (const d of documented) {
    const isNearMiss =
      d.toLowerCase() === lower ||
      (d.length === key.length && anagram(d) === anagram(key)) ||
      within1(d, key);
    if (!isNearMiss) {
      continue;
    }
    const theirs = counts.get(d) || 0;
    // Rare relative to the documented spelling => typo.
    if (theirs === 0 || mine / theirs < TYPO_RATIO) {
      return true;
    }
  }
  return false;
}

function partition(keys, documented, counts, otherDocumented) {
  const accepted = [];
  const suspect = [];
  for (const k of keys) {
    (isSuspect(k, documented, counts, otherDocumented) ? suspect : accepted).push(k);
  }
  return { accepted: accepted.sort(), suspect: suspect.sort() };
}

const emitterSplit = partition(Array.from(emitterKeys), DOC_EMITTER, emitterFileCounts, DOC_SPEC);
const specSplit = partition(Array.from(specKeys), DOC_SPEC, specFileCounts, DOC_EMITTER);

const payload = {
  _comment:
    "Generated by bin/generate-pfx-keys.mjs from the shipped base game. emitterKeys/specKeys are the accepted vocabulary: keys PA itself uses that the Particle System Guide does not fully document. suspectKeys are base-game keys that are near-misses of documented keys - PA's own typos - deliberately EXCLUDED from the accepted vocabulary so that a mod repeating them is still reported. Regenerate after a PA patch.",
  generated: new Date().toISOString().slice(0, 10),
  source_files_parsed: parsed,
  source_files_unparseable: failed,
  emitterKeys: emitterSplit.accepted,
  specKeys: specSplit.accepted,
  suspectKeys: {
    emitter: emitterSplit.suspect,
    spec: specSplit.suspect,
  },
  shaders: shaders.sort(),
  enums: {
    type: Array.from(enums.type).sort(),
    shape: Array.from(enums.shape).sort(),
    facing: Array.from(enums.facing).sort(),
    dataChannelFormat: Array.from(enums.dataChannelFormat).sort(),
  },
};

fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
process.stdout.write(
  "Wrote " +
    OUT +
    "\n  " +
    parsed +
    " .pfx parsed (" +
    failed +
    " unparseable)\n  " +
    emitterKeys.size +
    " emitter keys, " +
    specKeys.size +
    " spec keys, " +
    shaders.length +
    " shaders\n"
);
