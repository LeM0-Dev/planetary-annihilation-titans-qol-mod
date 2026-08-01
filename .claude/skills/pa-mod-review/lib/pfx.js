"use strict";
// .pfx particle system validation, per the Planetary Annihilation Particle
// System Guide (Ben Golus; updated dom314, mikeyh).
//
// .pfx files are JSON, so json-lint already covered parse errors. This layer
// covers the semantics the guide documents.

const fs = require("node:fs");
const path = require("node:path");
const { resolveInMedia } = require("./media.js");
const { resolveInSiblings } = require("./siblings.js");
const { resolveInOverlays } = require("./layout.js");

const EMITTER_TYPES = new Set([
  "POSITION", "SPHEROID", "SHELL", "EMITTER",
  "CYLINDER_X", "CYLINDER_Y", "CYLINDER_Z",
  "BOX_X", "BOX_Y", "BOX_Z", "MESH",
]);

const SHAPES = new Set(["rectangle", "string", "beam", "pointlight", "mesh"]);

const FACINGS = new Set([
  "camera", "velocity",
  "emitterx", "emittery", "emitterz",
  "axialx", "axialy", "axialz",
]);

const DATA_CHANNEL_FORMATS = new Set([
  "Position",
  "PositionWithAlpha",
  "PositionAndColor",
  "PositionColorAndAlignVector",
  "PositionColorAndFlipbook",
]);

// Guide, "Common particle shaders". The authoritative list lives in
// media/shaders/particle.json, which is read at runtime when available.
const COMMON_SHADERS = new Set([
  "particle_add",
  "particle_add_nohdr",
  "particle_add_ramp",
  "particle_add_soft",
  "particle_transparent",
  "particle_transparent_nohdr",
  "particle_transparent_ramp",
  "particle_transparent_soft",
  "particle_transparent_lit",
  "particle_clip",
]);

const EMITTER_BOOLS = new Set([
  "offsetAllowNegZ", "useRadialVelocityDir", "useShapeVelocityDir",
  "sizeRandomFlip", "sizeRandomFlipX", "sizeRandomFlipY",
  "sizeSquareAspect", "sizeConstantAspect", "snapToSurface",
  "alignVelocityToSurface", "rampOffsetV", "bLoop", "useWorldSpace",
  "useArcLengthSpace", "interpolateSpawn", "killOnDeactivate",
]);

const SPEC_BOOLS = new Set([
  "useInitialVelocityDir", "useRandomDir", "flipBookRandomStart",
]);

const EMITTER_KEYS = new Set([
  "spec", "type", "linkIndex",
  "offsetX", "offsetY", "offsetZ",
  "offsetRangeX", "offsetRangeY", "offsetRangeZ", "offsetAllowNegZ",
  "velocityX", "velocityY", "velocityZ",
  "velocityRangeX", "velocityRangeY", "velocityRangeZ",
  "useRadialVelocityDir", "useShapeVelocityDir",
  "velocity", "velocityRange", "inheritedVelocity",
  "gravity", "accelX", "accelY", "accelZ", "drag",
  "sizeX", "sizeY", "sizeRangeX", "sizeRangeY",
  "sizeRandomFlip", "sizeRandomFlipX", "sizeRandomFlipY",
  "sizeSquareAspect", "sizeConstantAspect",
  "rotation", "rotationRange", "rotationRate", "rotationRateRange",
  "snapToSurface", "snapToSurfaceOffset", "alignVelocityToSurface",
  "red", "green", "blue", "alpha", "rgb", "useArmyColor",
  "rampV", "rampRangeV", "rampOffsetV",
  "lifetime", "lifetimeRange", "emitterLifetime",
  "delay", "delayRange", "bLoop", "loopCount", "startLoop", "endLoop",
  "startDistance", "endDistance",
  "useWorldSpace", "useArcLengthSpace", "interpolateSpawn", "killOnDeactivate",
  "emissionBursts", "emissionRate", "maxParticles",
]);

const SPEC_KEYS = new Set([
  "shader", "shape", "facing", "useInitialVelocityDir", "useRandomDir",
  "size", "sizeX", "sizeY",
  "red", "green", "blue", "alpha", "rgb",
  "baseTexture", "rampTexture",
  "flipBookColumns", "flipBookRows", "flipBookFrames", "flipBookRandomStart",
  "frameCurve", "cameraPush", "rotationRateMult", "polyAdjustCenter",
  "beamSegmentLength", "panRate", "dataChannelFormat",
  "papa", "materialProperties",
]);

// The guide's glossary is not exhaustive. PA's own effects use keys it never
// documents — `sort` appears in 49 base-game .pfx files, `label` in 17,
// `temp_gravity` in 2. Treating the guide as the whole vocabulary flags
// thousands of false positives on any mod derived from stock effects. The
// accepted vocabulary is therefore the guide's glossary UNION every key the
// shipped base game actually uses, captured in references/pfx-keys.json.
let generated = null;
function loadGenerated() {
  if (generated !== null) {
    return generated;
  }
  try {
    generated = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "references", "pfx-keys.json"), "utf8")
    );
  } catch {
    generated = { emitterKeys: [], specKeys: [], shaders: [] };
  }
  return generated;
}

/**
 * Shader names live under effects[].name in media/shaders/particle.json.
 * Prefer the live file; fall back to the generated snapshot, then the guide.
 */
function loadShaderNames(mediaPath) {
  if (mediaPath) {
    try {
      const doc = JSON.parse(
        fs.readFileSync(path.join(mediaPath, "shaders", "particle.json"), "utf8")
      );
      if (Array.isArray(doc.effects)) {
        const names = new Set();
        for (const e of doc.effects) {
          if (e && typeof e.name === "string") {
            names.add(e.name);
          }
        }
        if (names.size) {
          return names;
        }
      }
    } catch {
      /* fall through to the snapshot */
    }
  }
  const snap = loadGenerated().shaders;
  return snap && snap.length ? new Set(snap) : null;
}

function knownEmitterKeys() {
  const set = new Set(EMITTER_KEYS);
  (loadGenerated().emitterKeys || []).forEach(function (k) {
    set.add(k);
  });
  return set;
}

function knownSpecKeys() {
  const set = new Set(SPEC_KEYS);
  (loadGenerated().specKeys || []).forEach(function (k) {
    set.add(k);
  });
  return set;
}

/**
 * Accepted values for an enum: the guide's documented list, plus whatever the
 * shipped base game actually uses. The guide is incomplete — TORUS is a real
 * emitter type used by a base-game effect and documented nowhere.
 * Comparison is case-insensitive, matching PA's enum handling.
 */
function knownEnum(name, documented) {
  const set = new Set();
  documented.forEach(function (v) {
    set.add(String(v).toLowerCase());
  });
  const gen = loadGenerated().enums;
  if (gen && Array.isArray(gen[name])) {
    gen[name].forEach(function (v) {
      set.add(String(v).toLowerCase());
    });
  }
  return set;
}

function checkPfx(doc, relPath, ctx) {
  const F = ctx.findings;
  const shaderNames = ctx._pfxShaders !== undefined
    ? ctx._pfxShaders
    : (ctx._pfxShaders = loadShaderNames(ctx.media));

  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    F.add({
      severity: "BLOCKER",
      check: "pfx.root-type",
      file: relPath,
      title: "Particle system root is not a JSON object",
      why: "A .pfx file must be a JSON object containing an `emitters` array.",
      fix: 'Wrap the content in { "emitters": [ ... ] }.',
    });
    return;
  }

  if (!Array.isArray(doc.emitters)) {
    F.add({
      severity: "BLOCKER",
      check: "pfx.no-emitters",
      file: relPath,
      title: "Particle system has no `emitters` array",
      why:
        "The guide defines a particle system as a group of emitters; `emitters` is the list of emitter objects. Without it the system spawns nothing.",
      fix: 'Add "emitters": [ { ... } ].',
    });
    return;
  }

  const emitterKeySet = knownEmitterKeys();
  const specKeySet = knownSpecKeys();
  const emitterCount = doc.emitters.length;
  // Aggregated per file: reporting these per emitter buries the report.
  const snapEmitters = [];
  const linkedEmitters = [];
  if (emitterCount === 0) {
    F.add({
      severity: "CONCERN",
      check: "pfx.empty-emitters",
      file: relPath,
      title: "`emitters` is empty",
      why: "The particle system loads but produces nothing visible.",
      fix: "Add an emitter, or delete the file and its references.",
    });
  }

  for (let i = 0; i < emitterCount; i += 1) {
    const em = doc.emitters[i];
    const where = relPath + " emitter[" + i + "]";
    if (em === null || typeof em !== "object" || Array.isArray(em)) {
      F.add({
        severity: "BLOCKER",
        check: "pfx.emitter-type",
        file: relPath,
        title: "emitter[" + i + "] is not an object",
        why: "Each entry in `emitters` must be an emitter object.",
        fix: "Replace with an object.",
      });
      continue;
    }

    checkQuotedBooleans(em, EMITTER_BOOLS, where, relPath, F);
    checkUnknownKeys(em, emitterKeySet, where, relPath, F, "emitter", EMITTER_KEYS, SPEC_KEYS);

    if (em.type !== undefined) {
      const allowed = knownEnum("type", EMITTER_TYPES);
      if (typeof em.type !== "string" || !allowed.has(em.type.toLowerCase())) {
        const hint = enumNearMiss(em.type, allowed);
        F.add({
          severity: "BUG",
          check: "pfx.emitter-type-enum",
          file: relPath,
          title: hint
            ? "emitter[" + i + "] `type` looks like a misspelling of `" + hint + "`"
            : "emitter[" + i + "] has an unrecognised `type`",
          detail: "Found " + JSON.stringify(em.type) + ".",
          why:
            "Documented types are POSITION, SPHEROID, SHELL, EMITTER, CYLINDER_X/Y/Z, BOX_X/Y/Z, MESH, and the base game additionally uses TORUS. An unrecognised value falls back to the POSITION default, so the emitter silently becomes a box and the shape you authored is lost.",
          fix: hint ? "Change the value to `" + hint + "`." : "Use a recognised type value.",
        });
      }
    }

    // EMITTER type <-> linkIndex
    const isEmitterType = typeof em.type === "string" && em.type.toUpperCase() === "EMITTER";
    if (isEmitterType) {
      if (em.linkIndex === undefined) {
        F.add({
          severity: "BUG",
          check: "pfx.emitter-linkindex-missing",
          file: relPath,
          title: 'emitter[' + i + '] uses type "EMITTER" but declares no `linkIndex`',
          why:
            "The EMITTER shape spawns particles at the positions of another emitter's particles, named by linkIndex. The default is -1, which links to nothing, so the emitter produces no particles.",
          fix: "Set `linkIndex` to the array index of the emitter to attach to.",
        });
      } else if (
        typeof em.linkIndex !== "number" ||
        em.linkIndex < 0 ||
        em.linkIndex >= emitterCount ||
        Math.floor(em.linkIndex) !== em.linkIndex
      ) {
        F.add({
          severity: "BUG",
          check: "pfx.emitter-linkindex-range",
          file: relPath,
          title: "emitter[" + i + "] has an out-of-range `linkIndex`",
          detail:
            "Found " + JSON.stringify(em.linkIndex) + "; valid indices are 0.." + (emitterCount - 1) + ".",
          why:
            "linkIndex is an index into this system's `emitters` array. Out of range links to nothing and the emitter produces no particles.",
          fix: "Point linkIndex at a valid emitter index.",
        });
      } else if (em.linkIndex === i) {
        F.add({
          severity: "BUG",
          check: "pfx.emitter-linkindex-self",
          file: relPath,
          title: "emitter[" + i + "] links to itself",
          why: "An EMITTER-type emitter linked to itself has no source particle positions to spawn from.",
          fix: "Point linkIndex at a different emitter.",
        });
      } else if (em.maxParticles === undefined) {
        linkedEmitters.push(i);
      }
    } else if (em.linkIndex !== undefined) {
      F.add({
        severity: "CONCERN",
        check: "pfx.linkindex-without-emitter-type",
        file: relPath,
        title: 'emitter[' + i + '] sets `linkIndex` but its type is not "EMITTER"',
        detail: "type is " + JSON.stringify(em.type === undefined ? "POSITION (default)" : em.type) + ".",
        why: "linkIndex is only used by the EMITTER shape type; elsewhere it has no effect.",
        fix: 'Set "type": "EMITTER", or remove linkIndex.',
      });
    }

    if (em.drag !== undefined && typeof em.drag === "number" && em.drag > 0 && em.drag < 0.8) {
      F.add({
        severity: "CONCERN",
        check: "pfx.drag-extreme",
        file: relPath,
        title: "emitter[" + i + "] has a very low `drag` value",
        detail: "Found " + em.drag + ".",
        why:
          "Drag is a per-frame multiplier applied as drag^(60*time). The guide advises useful values are close to 1.0 and no lower than about 0.8; 0.9 already halts a particle in roughly 1.5 seconds. Note 0.0 means drag off, not total stop.",
        fix: "Confirm this is intended; typical values sit between 0.98 and 1.0.",
      });
    }

    if (em.snapToSurface === true) {
      snapEmitters.push(i);
    }

    if (em.spec !== undefined) {
      const spec = em.spec;
      if (spec === null || typeof spec !== "object" || Array.isArray(spec)) {
        F.add({
          severity: "BLOCKER",
          check: "pfx.spec-type",
          file: relPath,
          title: "emitter[" + i + "].spec is not an object",
          why: "The particle spec defines how particles are displayed and must be an object.",
          fix: "Replace with an object.",
        });
      } else {
        checkQuotedBooleans(spec, SPEC_BOOLS, where + ".spec", relPath, F);
        checkUnknownKeys(spec, specKeySet, where + ".spec", relPath, F, "particle spec", SPEC_KEYS, EMITTER_KEYS);
        checkSpecEnums(spec, i, relPath, F, shaderNames);
        checkSpecTextures(spec, i, relPath, F, ctx);
      }
    }
  }

  if (snapEmitters.length) {
    F.add({
      severity: "QUALITY",
      check: "pfx.snap-to-surface-cost",
      file: relPath,
      title:
        snapEmitters.length +
        " emitter" +
        (snapEmitters.length === 1 ? "" : "s") +
        " use `snapToSurface`, which is expensive",
      detail: "emitter[" + snapEmitters.join("], emitter[") + "]",
      why:
        'The guide marks this "THIS IS EXPENSIVE, USE ONLY WHEN NEEDED!" — every spawning particle traces a line towards the planet centre against the ground mesh. It is intended for very large effects only.',
      fix:
        "Confirm the effect is large enough to justify the cost; for smaller effects use a fixed offset instead.",
    });
  }

  if (linkedEmitters.length) {
    F.add({
      severity: "CONCERN",
      check: "pfx.emitter-linked-count",
      file: relPath,
      title:
        linkedEmitters.length +
        " linked emitter" +
        (linkedEmitters.length === 1 ? "" : "s") +
        " multiply particle count with no `maxParticles` cap",
      detail: "emitter[" + linkedEmitters.join("], emitter[") + "]",
      why:
        "For EMITTER-type emitters the number of particles spawned is this emitter's emissionRate multiplied by the linked emitter's live particle count. The guide warns explicitly to be careful with particle counts here, and no cap is set.",
      fix: "Set `maxParticles` on these emitters, or confirm the product is bounded.",
    });
  }
}

/**
 * The guide's most explicit trap: 'If you write "false" with the quotes that
 * will actually get parsed as true, so be careful!'
 */
function checkQuotedBooleans(obj, boolKeys, where, relPath, F) {
  for (const key of Object.keys(obj)) {
    if (!boolKeys.has(key)) {
      continue;
    }
    const v = obj[key];
    if (typeof v === "string") {
      const looksFalse = v.toLowerCase() === "false";
      F.add({
        severity: looksFalse ? "BUG" : "CONCERN",
        check: "pfx.quoted-boolean",
        file: relPath,
        title:
          "`" + key + "` is a quoted string, not a boolean" + (looksFalse ? ' — "false" evaluates to TRUE' : ""),
        detail: where + ": " + key + " = " + JSON.stringify(v),
        why: looksFalse
          ? 'The guide warns explicitly: "If you write \\"false\\" with the quotes that will actually get parsed as true, so be careful!" This does the exact opposite of what it reads as.'
          : "Boolean keys must be written without quotes. A non-empty string is truthy.",
        fix: "Write the value unquoted: " + key + ": " + (looksFalse ? "false" : "true") + ".",
      });
    }
  }
}

// Annotation keys that authoring workflows add. Harmless, and never a typo for
// anything, so reporting them is pure noise.
const ANNOTATION_KEYS = new Set([
  "description", "comment", "_comment", "note", "notes", "label", "name", "sort",
]);

// PA's own artists disable a key by prefixing it, rather than deleting it:
// `_emissionRate`, `_snapToSurface`, `temp_gravity`, `temp_sizeRangeX` all
// appear in shipped effects. This idiom only works because key lookup is exact,
// and it is the clearest evidence that it is. Treat them as intentional.
const DISABLED_KEY_PREFIX = /^(_|temp_)/;

function anagramKey(s) {
  return s.toLowerCase().split("").sort().join("");
}

/** True when a and b differ by at most one insertion, deletion or substitution. */
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
 * Work out what the author probably meant.
 *
 * Suggestions are drawn ONLY from the guide's documented glossary, never from
 * the base-game-derived vocabulary. The base game contains its own typos —
 * `emissionBurts` is a real key in a shipped .pfx — and suggesting one of those
 * as the fix would be worse than saying nothing.
 *
 * @param {string} key            the unrecognised key
 * @param {Set} documentedHere    documented keys for this section
 * @param {Set} documentedOther   documented keys for the other section
 */
function nearMiss(key, documentedHere, documentedOther) {
  const lower = key.toLowerCase();

  // Right name, wrong section: emitter keys placed inside `spec` and vice versa.
  for (const candidate of documentedOther) {
    if (candidate.toLowerCase() === lower) {
      return { key: candidate, kind: "wrong-section", sameName: candidate === key };
    }
  }
  // Capitalisation only: lifetimerange, VelocityRangeX, OffsetY.
  for (const candidate of documentedHere) {
    if (candidate !== key && candidate.toLowerCase() === lower) {
      return { key: candidate, kind: "capitalisation", sameName: false };
    }
  }
  // Transposition: sizeXRange for sizeRangeX.
  const sorted = anagramKey(key);
  for (const candidate of documentedHere) {
    if (candidate.length === key.length && anagramKey(candidate) === sorted) {
      return { key: candidate, kind: "transposition", sameName: false };
    }
  }
  // One insertion, deletion or substitution: sixeX for sizeX, emissionBurts for
  // emissionBursts, sizeRangeYY for sizeRangeY. The vocabulary generator uses
  // the same rule to quarantine PA's own typos, so without it here the reporter
  // would flag those keys but be unable to say what they were meant to be.
  for (const candidate of documentedHere) {
    if (within1(candidate, key)) {
      return { key: candidate, kind: "typo", sameName: false };
    }
  }
  return null;
}

const SILENT_IGNORE =
  "PA's parsers only read keys they recognise and silently ignore the rest, so this key does nothing at all — the value you set is never applied, and nothing is logged. The effect behaves exactly as if the key were absent.";

function article(noun) {
  return /^[aeiou]/i.test(noun) ? "an " : "a ";
}

function checkUnknownKeys(obj, known, where, relPath, F, kind, documentedHere, documentedOther) {
  const otherName = kind === "emitter" ? "particle spec" : "emitter";
  for (const key of Object.keys(obj)) {
    if (known.has(key) || ANNOTATION_KEYS.has(key) || DISABLED_KEY_PREFIX.test(key)) {
      continue;
    }
    const hint = nearMiss(key, documentedHere, documentedOther || new Set());

    if (!hint) {
      F.add({
        severity: "CONCERN",
        check: "pfx.unknown-key",
        file: relPath,
        title: "Unrecognised " + kind + " key `" + key + "`",
        detail: where,
        why:
          "The key is neither in the Particle System Guide's glossary nor used anywhere in the shipped base game. " +
          SILENT_IGNORE,
        fix: "Check the spelling against the guide, or remove the key if it is vestigial.",
      });
      continue;
    }

    if (hint.kind === "wrong-section") {
      F.add({
        severity: "BUG",
        check: "pfx.key-wrong-section",
        file: relPath,
        title:
          "`" +
          key +
          "` is " +
          article(otherName) +
          otherName +
          " key but appears on the " +
          kind +
          (hint.sameName ? "" : " (as `" + hint.key + "`)"),
        detail: where,
        why:
          "`" +
          hint.key +
          "` is documented for the " +
          otherName +
          ", not the " +
          kind +
          ". " +
          SILENT_IGNORE,
        fix:
          kind === "emitter"
            ? "Move `" + key + "` inside this emitter's `spec` object."
            : "Move `" + key + "` out of `spec` and onto the emitter itself.",
      });
      continue;
    }

    F.add({
      severity: "BUG",
      check: "pfx.misspelled-key",
      file: relPath,
      title: "`" + key + "` looks like a misspelling of `" + hint.key + "`",
      detail:
        where +
        " — " +
        (hint.kind === "capitalisation"
          ? "differs only in capitalisation, and these keys are case sensitive"
          : hint.kind === "transposition"
            ? "the same characters in a different order"
            : "differs by a single character"),
      why: SILENT_IGNORE,
      fix: "Rename `" + key + "` to `" + hint.key + "`.",
    });
  }
}

function enumNearMiss(value, allowedLower) {
  if (typeof value !== "string") {
    return null;
  }
  const squashed = value.toLowerCase().replace(/[_\s-]/g, "");
  for (const candidate of allowedLower) {
    if (candidate.replace(/[_\s-]/g, "") === squashed) {
      return candidate.toUpperCase();
    }
  }
  return null;
}

const SPEC_ENUMS = [
  {
    key: "shape",
    documented: SHAPES,
    check: "pfx.shape-enum",
    why: "Documented shapes are rectangle, string, beam, pointlight, mesh. Anything else falls back to the rectangle default.",
  },
  {
    key: "facing",
    documented: FACINGS,
    check: "pfx.facing-enum",
    why: "Documented facings are camera, velocity, emitterX/Y/Z, axialX/Y/Z. Anything else falls back to the camera default.",
  },
  {
    key: "dataChannelFormat",
    documented: DATA_CHANNEL_FORMATS,
    check: "pfx.datachannel-enum",
    why: "Documented formats are Position, PositionWithAlpha, PositionAndColor, PositionColorAndAlignVector, PositionColorAndFlipbook. An unrecognised value means the wrong particle data is sent to the GPU, so colour or flipbook settings are dropped.",
  },
];

function checkSpecEnums(spec, i, relPath, F, shaderNames) {
  for (const e of SPEC_ENUMS) {
    const value = spec[e.key];
    if (typeof value !== "string") {
      continue;
    }
    const allowed = knownEnum(e.key, e.documented);
    if (allowed.has(value.toLowerCase())) {
      continue;
    }
    const hint = enumNearMiss(value, allowed);
    F.add({
      severity: "BUG",
      check: e.check,
      file: relPath,
      title: hint
        ? "emitter[" + i + "].spec `" + e.key + "` looks like a misspelling of `" + hint + "`"
        : "emitter[" + i + "].spec has an unrecognised `" + e.key + "`",
      detail: "Found " + JSON.stringify(value) + ".",
      why: e.why,
      fix: hint ? "Change the value to `" + hint + "`." : "Use a recognised " + e.key + " value.",
    });
  }

  if (typeof spec.shader === "string") {
    const known = shaderNames || COMMON_SHADERS;
    if (!known.has(spec.shader)) {
      F.add({
        severity: shaderNames ? "BUG" : "CONCERN",
        check: "pfx.shader-unknown",
        file: relPath,
        title: "emitter[" + i + "].spec references an unknown shader",
        detail:
          "Found " +
          JSON.stringify(spec.shader) +
          (shaderNames
            ? "; not present in media/shaders/particle.json."
            : "; not among the guide's common shaders, and media/shaders/particle.json was not readable to confirm."),
        why:
          "The shader controls how the emitter's data is rendered. An unknown name means the particle does not draw.",
        fix: "Use a shader defined in shaders/particle.json, eg particle_add or particle_transparent.",
      });
    }
  }

  // Flip book coherence.
  const hasGrid = spec.flipBookColumns !== undefined || spec.flipBookRows !== undefined;
  if (hasGrid && spec.frameCurve === undefined && spec.flipBookRandomStart !== true) {
    F.add({
      severity: "CONCERN",
      check: "pfx.flipbook-static",
      file: relPath,
      title: "emitter[" + i + "].spec defines a flip book that will never animate",
      why:
        "frameCurve defaults to a single key of 0.0, so only the first frame is ever shown. The guide notes you need either a frameCurve going 0.0 -> 1.0 over the particle's life, or flipBookRandomStart, for the grid to be used.",
      fix: 'Add "frameCurve": [[0.0, 0.0], [1.0, 1.0]], or set flipBookRandomStart to true.',
    });
  }
}

function checkSpecTextures(spec, i, relPath, F, ctx) {
  for (const key of ["baseTexture", "rampTexture", "papa"]) {
    const value = spec[key];
    if (typeof value !== "string" || value.length === 0) {
      continue;
    }
    const clean = value.replace(/^\/+/, "");
    const modPath = path.join(ctx.modRoot, clean.split("/").join(path.sep));
    if (fs.existsSync(modPath)) {
      continue;
    }
    // A client/server pair shares one namespace: the client half often ships the
    // assets the server half's specs name, and vice versa.
    if (resolveInSiblings(ctx.siblings || [], clean)) {
      continue;
    }
    if (resolveInOverlays(ctx.overlayRoots || [], clean)) {
      continue;
    }
    if (!ctx.media) {
      continue; // reported once, globally, as Unverified
    }
    if (resolveInMedia(ctx.media, value)) {
      continue;
    }
    F.add({
      severity: "BLOCKER",
      check: "pfx.asset-missing",
      file: relPath,
      title: "emitter[" + i + "].spec `" + key + "` points at a file that does not exist",
      detail: value,
      why:
        "The path was found neither in this mod, nor in any paired mod, nor in the base game. A path that resolves to nothing is no safer than a malformed one — a missing .papa asset can crash the game rather than degrade gracefully.",
      fix: "Correct the path, or ship the asset at that path inside the mod.",
    });
  }
}

module.exports = { checkPfx };
