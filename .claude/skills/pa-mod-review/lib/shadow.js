"use strict";
// File shadowing: shipping a file at a base-game-identical relative path so it
// overrides the original.
//
// A shadowed file is a whole copy, not a diff, so it silently drifts when PA
// patches. Every shadow is reported, but severity depends on whether shadowing
// was AVOIDABLE:
//
//   unavoidable -> Maintenance Risk. JSON has no interception point; nor does a
//     JS module whose members are only reachable by replacing the file. The
//     finding is a drift warning naming the path to re-diff after a patch.
//   avoidable -> Code Quality. If the base file exposes its functions on `self`,
//     `model` or the global scope, the mod could have hijacked them from its own
//     namespaced file and left the base file untouched.
//
// This encodes the preference order: inject into a scene -> hijack a function ->
// shadow only as a last resort.

const fs = require("node:fs");
const path = require("node:path");
const { rel } = require("./util.js");
const { tokenise } = require("./tokenise.js");

// Mod-relative roots that overlay the base game.
const SHADOW_ROOTS = ["pa/", "pa_ex1/", "ui/main/", "shaders/"];

function isShadowCandidate(relPath) {
  return SHADOW_ROOTS.some(function (r) {
    return relPath.startsWith(r);
  });
}

/** Where does this mod-relative path live in the base game, if anywhere? */
function baseGameCounterpart(mediaPath, relPath) {
  if (!mediaPath) {
    return null;
  }
  const native = relPath.split("/").join(path.sep);
  const direct = path.join(mediaPath, native);
  if (fs.existsSync(direct)) {
    return direct;
  }
  // A pa/** file may be shadowing the TITANS overlay copy in pa_ex1/**.
  if (relPath.startsWith("pa/")) {
    const ex1 = path.join(mediaPath, "pa_ex1", native.slice(3));
    if (fs.existsSync(ex1)) {
      return ex1;
    }
  }
  return null;
}

/**
 * Does this JS file expose its functions somewhere a mod could intercept?
 * @returns {{exposed: boolean, reason: string, symbol: string|null}}
 */
function analyseExposure(src) {
  const masked = tokenise(src).masked;

  // An AMD module's members are produced by its factory. Another mod cannot
  // reach in and replace one without replacing the module, so shadowing is the
  // only option. GW tech cards are the canonical case.
  if (/(^|[^\w.$])define\s*\(/.test(masked)) {
    return {
      exposed: false,
      reason:
        "the base file is an AMD `define(...)` module, whose members are produced by its factory and cannot be replaced individually",
      symbol: null,
    };
  }

  const patterns = [
    { re: /(^|[^\w.$])self\.([A-Za-z_$][\w$]*)\s*=\s*function/g, on: "self" },
    { re: /(^|[^\w.$])model\.([A-Za-z_$][\w$]*)\s*=\s*function/g, on: "model" },
    { re: /(^|[^\w.$])window\.([A-Za-z_$][\w$]*)\s*=\s*function/g, on: "window" },
  ];
  for (const p of patterns) {
    const m = p.re.exec(masked);
    if (m) {
      return {
        exposed: true,
        reason: "the base file assigns functions to `" + p.on + "`",
        symbol: p.on + "." + m[2],
      };
    }
  }

  // Top-level function declarations in a classic script become globals.
  const fnRe = /(^|[^\w.$])function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m = fnRe.exec(masked);
  while (m) {
    const upto = masked.slice(0, m.index);
    let depth = 0;
    for (let i = 0; i < upto.length; i += 1) {
      if (upto[i] === "{") {
        depth += 1;
      } else if (upto[i] === "}") {
        depth -= 1;
      }
    }
    if (depth === 0) {
      return {
        exposed: true,
        reason: "the base file declares functions at top level, which become globals in a classic script",
        symbol: m[2] + "()",
      };
    }
    m = fnRe.exec(masked);
  }

  return {
    exposed: false,
    reason: "the base file's functions are private to a closure, with no interception point",
    symbol: null,
  };
}

function checkShadowing(files, ctx) {
  const F = ctx.findings;
  const root = ctx.modRoot;

  if (!ctx.media) {
    return; // reported once as Unverified by the caller
  }

  for (const abs of files) {
    const relPath = rel(root, abs);
    if (!isShadowCandidate(relPath)) {
      continue;
    }
    const base = baseGameCounterpart(ctx.media, relPath);
    if (!base) {
      continue; // new file at a base-game-shaped path; additive, not a shadow
    }

    ctx.shadowCount += 1;

    // A byte-identical shadow does nothing except acquire drift risk.
    let identical = false;
    try {
      identical = fs.readFileSync(abs).equals(fs.readFileSync(base));
    } catch {
      identical = false;
    }
    if (identical) {
      F.add({
        severity: "QUALITY",
        check: "shadow.identical",
        file: relPath,
        title: "Shadows a base-game file without changing it",
        detail: "Byte-identical to " + base,
        why:
          "The file overrides the base game with an exact copy, so it has no effect today, but it will silently override — and revert — any change PA makes to this file in a future patch.",
        fix: "Delete the file and let the base game provide it.",
      });
      continue;
    }

    const ext = path.extname(relPath).toLowerCase();

    if (ext !== ".js") {
      F.add({
        severity: "MAINTENANCE",
        check: "shadow.data",
        file: relPath,
        title: "Shadows a base-game file that has no interception point",
        detail: "Overrides " + base,
        why:
          "A shadowed file is a whole copy, not a diff. This file type offers no way to override part of it, so shadowing is the only option — but when PA patches the original, this copy silently keeps the old content and the change is lost. Nothing reports the divergence.",
        fix:
          "Record this path in the mod's release checklist and re-diff it against the base game after each PA patch.",
      });
      continue;
    }

    let exposure;
    try {
      exposure = analyseExposure(fs.readFileSync(base, "utf8"));
    } catch {
      exposure = { exposed: false, reason: "the base file could not be read", symbol: null };
    }

    if (exposure.exposed) {
      F.add({
        severity: "QUALITY",
        check: "shadow.avoidable-js",
        file: relPath,
        title: "Shadows a base-game script whose functions could be hijacked instead",
        detail:
          "Overrides " +
          base +
          "; " +
          exposure.reason +
          (exposure.symbol ? " (eg `" + exposure.symbol + "`)" : "") +
          ".",
        why:
          "Shadowing replaces the whole file, so every unrelated change PA makes to it in future is silently reverted. Because the original exposes its functions, the same result can be achieved from your own namespaced file by wrapping the existing function and calling through to it, leaving the base file to be updated by PA normally.",
        fix:
          "Move the change into a scene script under ui/mods/<identifier>/, capture the original function, replace it with a wrapper, and delete the shadowed copy.",
      });
    } else {
      F.add({
        severity: "MAINTENANCE",
        check: "shadow.unavoidable-js",
        file: relPath,
        title: "Shadows a base-game script that cannot be hijacked",
        detail: "Overrides " + base + "; " + exposure.reason + ".",
        why:
          "Shadowing is the correct approach here, but the copy is whole rather than a diff: when PA patches the original, this file silently keeps the old content and nothing reports the divergence.",
        fix:
          "Record this path in the mod's release checklist and re-diff it against the base game after each PA patch.",
      });
    }
  }
}

module.exports = { checkShadowing, isShadowCandidate, analyseExposure, baseGameCounterpart };
