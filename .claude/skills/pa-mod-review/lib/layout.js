"use strict";
// Source-tree layouts.
//
// A packaged mod is self-contained: one folder, a complete modinfo.json, every
// file it ships. A source repository often is not. Legion Expansion's repo keeps
//
//   src/base_modinfo.json   version, author, category, signature, forum, icon
//   src/client/modinfo.json identifier, context, scenes
//   src/server/modinfo.json identifier, context, scenes
//   src/shared/ui/mods/...  files merged into BOTH halves
//
// and a build script composes the shipped mods. Reviewing src/server directly
// without accounting for that reports the seven keys held in the base manifest as
// missing, and every shared file as absent — all false.
//
// This module detects that shape generically: a base manifest anywhere up the
// tree, and sibling directories that may supply files at build time. It does not
// try to emulate any particular build script, and says so in the report.

const fs = require("node:fs");
const path = require("node:path");
const { exists } = require("./util.js");

// Names seen in the wild for a shared/base manifest layer.
const BASE_MANIFEST_NAMES = [
  "base_modinfo.json",
  "modinfo.base.json",
  "modinfo_base.json",
];

/**
 * @returns {{
 *   baseManifest: object|null,
 *   baseManifestPath: string|null,
 *   sourceRoot: string|null,
 *   overlayRoots: string[]
 * }}
 */
function detectSourceLayout(modRoot) {
  const result = {
    baseManifest: null,
    baseManifestPath: null,
    sourceRoot: null,
    overlayRoots: [],
  };

  // Look for a base manifest in the mod root, its parent, and grandparent.
  let dir = modRoot;
  for (let depth = 0; depth < 3; depth += 1) {
    for (const name of BASE_MANIFEST_NAMES) {
      const candidate = path.join(dir, name);
      if (exists(candidate)) {
        try {
          result.baseManifest = JSON.parse(fs.readFileSync(candidate, "utf8"));
          result.baseManifestPath = candidate;
          result.sourceRoot = dir;
        } catch {
          /* a malformed base manifest is reported by the JSON pass */
        }
        break;
      }
    }
    if (result.baseManifest) {
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  if (!result.sourceRoot) {
    return result;
  }

  // Sibling directories under the source root may contribute files at build
  // time. `shared/` is the common case, but the name is not assumed.
  let entries = [];
  try {
    entries = fs.readdirSync(result.sourceRoot, { withFileTypes: true });
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const full = path.join(result.sourceRoot, entry.name);
    if (full === modRoot) {
      continue;
    }
    // Only directories that look like content overlays, ie that contain a
    // pa/, pa_ex1/, ui/ or shaders/ tree.
    const looksLikeContent = ["pa", "pa_ex1", "ui", "shaders"].some(function (d) {
      return exists(path.join(full, d));
    });
    if (looksLikeContent) {
      result.overlayRoots.push(full);
    }
  }

  return result;
}

/**
 * Compose the effective manifest: the base layer, with the mod's own manifest
 * on top. Mirrors how build scripts merge them.
 */
function composeManifest(base, own) {
  if (!base) {
    return own;
  }
  return Object.assign({}, base, own);
}

/** Is `relPath` present in any overlay root? */
function resolveInOverlays(overlayRoots, relPath) {
  const native = relPath.replace(/^\/+/, "").split("/").join(path.sep);
  for (const root of overlayRoots) {
    if (exists(path.join(root, native))) {
      return root;
    }
  }
  return null;
}

module.exports = { detectSourceLayout, composeManifest, resolveInOverlays };
