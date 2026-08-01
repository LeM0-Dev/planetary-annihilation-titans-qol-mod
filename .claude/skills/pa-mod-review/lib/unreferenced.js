"use strict";
// Files the mod ships that nothing appears to reference.
//
// Dead files inflate the download, and more usefully, an unreferenced file is
// often the *symptom* of a rename that left a dangling reference behind.
//
// The hard part is not finding unreferenced files — it is not crying wolf. PA
// reaches files by several routes that are invisible to static analysis:
//
//   directory scanning  pa/ai*/** is enumerated wholesale, never named
//   base-game shadowing a file at a base-game path is referenced by the game
//   binary references   a .papa model names its own textures inside the binary
//   dynamic paths       "icon_si_" + name + ".png"
//
// So this reports only what it can justify, excludes those four routes, and
// matches on basename as well as full path. Under-reporting is the correct
// failure mode here.

const fs = require("node:fs");
const path = require("node:path");
const { rel, walk } = require("./util.js");
const { baseGameCounterpart, isShadowCandidate } = require("./shadow.js");

// Any path- or identifier-shaped token. Deliberately wider than "filename with
// an extension", because PA content is routinely referenced without one:
// Galactic War loads a card from the bare id "gwaio_anti_air", and assets are
// built by concatenation such as "icon_faction_" + index + ".png".
const TOKEN_LIKE = /[A-Za-z0-9_\-./]{3,}/g;

// Shortest token allowed to satisfy a reference by prefix. Below this, a token
// matches so much that the check stops meaning anything.
const MIN_PREFIX = 5;

// Directories PA enumerates rather than references. AI build data is loaded by
// scanning the directory, so no file in it is ever named.
const SCANNED_DIRS = [/^pa\/ai[^/]*\//, /^pa_ex1\/ai[^/]*\//];

// Loaded by convention with dynamically built names, eg "icon_si_" + unit.
const CONVENTION_DIRS = [/^ui\/main\/atlas\//];

// Not shipped content: manifests, documentation and development tooling. These
// are normally stripped from the release archive via .gitattributes
// export-ignore, so their being unreferenced says nothing.
const DOC_NAMES =
  /^(README|LICENSE|LICENCE|CHANGELOG|CONTRIBUTING|CLAUDE|CODEOWNERS|AUTHORS|NOTICE|SECURITY|MEMORY)(\.[A-Za-z]+)?$/i;
const TOOLING_NAMES =
  /^(package(-lock)?\.json|package\.nls\.json|tsconfig.*\.json|sonar-project\.properties|eslint\.config\.[cm]?js|\.?eslintrc.*|\.?prettierrc.*|\.?stylelintrc.*|\.?markdownlint.*|jsconfig\.json|Readme!\.txt)$/i;

function isNotContent(relPath) {
  const base = relPath.split("/").pop();
  if (relPath === "modinfo.json") {
    return true;
  }
  if (base.startsWith(".") || relPath.split("/").some((s) => s.startsWith("."))) {
    return true;
  }
  return DOC_NAMES.test(base) || TOOLING_NAMES.test(base);
}

const TEXT_EXTENSIONS = new Set([
  ".js", ".css", ".html", ".htm", ".json", ".pfx", ".pas",
  ".fs", ".vs", ".glsl", ".txt", ".md", ".mjs", ".cjs", ".properties", ".yml", ".yaml",
]);

/** Every path-like token appearing in any text file the mod ships. */
function collectReferences(files, ctx) {
  const paths = new Set();
  const basenames = new Set();
  const stems = new Set(); // basename without extension: "gwaio_anti_air"
  const prefixes = new Set(); // for names built by concatenation

  function record(token) {
    const clean = token.replace(/^\/+/, "").toLowerCase();
    paths.add(clean);
    const base = clean.split("/").pop();
    basenames.add(base);
    const dot = base.lastIndexOf(".");
    stems.add(dot > 0 ? base.slice(0, dot) : base);
    if (base.length >= MIN_PREFIX) {
      prefixes.add(base);
    }
  }

  // modinfo scenes are references even though modinfo is not content.
  const scenes = ctx.modinfo && ctx.modinfo.scenes;
  if (scenes && typeof scenes === "object") {
    for (const key of Object.keys(scenes)) {
      const entries = scenes[key];
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          if (typeof entry === "string") {
            record(entry.replace(/^coui:\/\//, ""));
          }
        }
      }
    }
  }

  // A client/server pair shares one namespace and routinely splits reference
  // from referent: Legion's client ships the .pfx effects that the server's ammo
  // specs name via effect_spec. Scanning only this mod reports every one of them
  // as unreferenced. Source-tree overlays are read for the same reason.
  const extraRoots = []
    .concat((ctx.siblings || []).map((s) => s.root).filter(Boolean))
    .concat(ctx.overlayRoots || []);
  const allSources = files.concat(
    extraRoots.reduce(function (acc, root) {
      return acc.concat(walk(root));
    }, [])
  );

  for (const abs of allSources) {
    if (!TEXT_EXTENSIONS.has(path.extname(abs).toLowerCase())) {
      continue;
    }
    let text;
    try {
      text = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    let m = TOKEN_LIKE.exec(text);
    while (m) {
      record(m[0]);
      m = TOKEN_LIKE.exec(text);
    }
    TOKEN_LIKE.lastIndex = 0;
  }

  return { paths: paths, basenames: basenames, stems: stems, prefixes: prefixes };
}

/**
 * A mod file can be referenced by the BASE GAME rather than by the mod. GWO
 * ships icon_faction_4.png, which nothing in GWO names; the base game builds the
 * path at gw_play.js:614 as
 *   'coui://.../icon_faction_' + factionIndex.toString() + '.png'
 *
 * Indexing all ~10,000 base-game files would be wasteful, so this scans only the
 * base-game directory tree the orphan lives in, cached per ancestor.
 */
function baseGameTokens(ancestorDir, cache) {
  if (cache.has(ancestorDir)) {
    return cache.get(ancestorDir);
  }
  const tokens = new Set();
  for (const file of walk(ancestorDir)) {
    if (!TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) {
      continue;
    }
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    let m = TOKEN_LIKE.exec(text);
    while (m) {
      const base = m[0].toLowerCase().split("/").pop();
      if (base.length >= MIN_PREFIX) {
        tokens.add(base);
      }
      m = TOKEN_LIKE.exec(text);
    }
    TOKEN_LIKE.lastIndex = 0;
  }
  cache.set(ancestorDir, tokens);
  return tokens;
}

function referencedByBaseGame(relPath, ctx, cache) {
  if (!ctx.media) {
    return false;
  }
  const parts = relPath.split("/");
  if (parts.length < 3) {
    return false;
  }
  const base = relPath.toLowerCase().split("/").pop();
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;

  // The referencing file is often a sibling *branch*, not an ancestor: the path
  // for ui/main/game/galactic_war/shared/img/icon_faction_4.png is built in
  // ui/main/game/galactic_war/gw_play/gw_play.js. So widen the scope in steps
  // rather than scanning only the immediate parent — while stopping well short
  // of indexing the whole base game.
  const depths = [];
  for (const d of [parts.length - 1, 4, 3]) {
    if (d >= 2 && d <= parts.length - 1 && !depths.includes(d)) {
      depths.push(d);
    }
  }

  for (const depth of depths) {
    const ancestorAbs = path.join(ctx.media, parts.slice(0, depth).join(path.sep));
    if (!fs.existsSync(ancestorAbs)) {
      continue;
    }
    for (const t of baseGameTokens(ancestorAbs, cache)) {
      if (base === t || stem === t || base.startsWith(t) || stem.startsWith(t)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Is this file reached by any route we can see? Checked from cheapest and most
 * certain to broadest, because a false positive here is worse than a miss.
 */
function isReferenced(relPath, refs) {
  const lower = relPath.toLowerCase();
  if (refs.paths.has(lower)) {
    return true;
  }
  const base = lower.split("/").pop();
  if (refs.basenames.has(base)) {
    return true;
  }
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  // Loaded by bare id: Galactic War resolves the card "gwaio_anti_air" to
  // cards/gwaio_anti_air.js without the extension ever appearing.
  if (refs.stems.has(stem)) {
    return true;
  }
  // Built by concatenation: "icon_faction_" + index + ".png". Any recorded token
  // that is a prefix of this filename counts.
  for (const p of refs.prefixes) {
    if (base.startsWith(p) || stem.startsWith(p)) {
      return true;
    }
  }
  return false;
}

function isExcluded(relPath) {
  if (isNotContent(relPath)) {
    return "documentation or tooling, not shipped content";
  }
  for (const re of SCANNED_DIRS) {
    if (re.test(relPath)) {
      return "PA enumerates this directory rather than referencing its files";
    }
  }
  for (const re of CONVENTION_DIRS) {
    if (re.test(relPath)) {
      return "loaded by naming convention with a dynamically built path";
    }
  }
  return null;
}

// Texture maps named from inside a .papa model, never in any text file. A
// referenced model l_mex.papa carries l_mex_diffuse/_mask/_material.papa with it.
const MATERIAL_SUFFIX =
  /_(diffuse|mask|material|normal|spec|specular|emissive|glow|ao|height|lookup)$/i;

// Binaries name their own textures and sub-models INSIDE the binary, which
// cannot be read here. An absent textual reference therefore proves nothing, so
// these are not reported at all rather than reported with a caveat — an
// uncertain finding is not worth the reader's time for orphaned files.
const UNPROVABLE_EXTENSIONS = new Set([".papa", ".fbx"]);

/**
 * Is this a companion asset of a referenced file in the same directory?
 * l_mex_diffuse.papa sits beside l_mex.papa, which the unit spec does name.
 */
function isCompanionAsset(relPath, refs, shipped) {
  const dir = relPath.includes("/") ? relPath.slice(0, relPath.lastIndexOf("/")) : "";
  const base = relPath.toLowerCase().split("/").pop();
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";

  if (!MATERIAL_SUFFIX.test(stem)) {
    return false;
  }
  const owner = stem.replace(MATERIAL_SUFFIX, "");
  if (owner.length < 3) {
    return false;
  }
  // The owning model must actually be shipped here and be referenced itself.
  const ownerPath = (dir ? dir + "/" : "") + owner + ext;
  return shipped.has(ownerPath.toLowerCase()) && isReferenced(ownerPath, refs);
}

function checkUnreferenced(files, ctx) {
  const F = ctx.findings;
  const root = ctx.modRoot;
  const refs = collectReferences(files, ctx);

  // PA texture sidecars: foo.png.settings configures foo.png and is found by the
  // importer, never named by anything.
  const shipped = new Set(files.map((f) => rel(root, f).toLowerCase()));
  const baseCache = new Map();

  const orphans = [];

  for (const abs of files) {
    const relPath = rel(root, abs);
    const lower = relPath.toLowerCase();

    if (isExcluded(relPath)) {
      continue;
    }

    if (lower.endsWith(".settings") && shipped.has(lower.slice(0, -".settings".length))) {
      continue;
    }

    // A file at a base-game path is referenced by the base game itself.
    if (isShadowCandidate(relPath) && ctx.media && baseGameCounterpart(ctx.media, relPath)) {
      continue;
    }

    if (isReferenced(relPath, refs)) {
      continue;
    }
    if (referencedByBaseGame(relPath, ctx, baseCache)) {
      continue;
    }
    if (isCompanionAsset(relPath, refs, shipped)) {
      continue;
    }
    if (UNPROVABLE_EXTENSIONS.has(path.extname(relPath).toLowerCase())) {
      continue;
    }

    orphans.push(relPath);
  }

  if (orphans.length === 0) {
    return;
  }

  // Group by directory, and separate binaries: a .papa can be named inside
  // another .papa, so the same evidence means much less for those.
  const groups = new Map();
  for (const o of orphans) {
    const dir = o.includes("/") ? o.slice(0, o.lastIndexOf("/")) : ".";
    const binary = false;
    const key = (binary ? "bin " : "txt ") + dir;
    if (!groups.has(key)) {
      groups.set(key, { dir: dir, binary: binary, names: [] });
    }
    groups.get(key).names.push(o.split("/").pop());
  }

  for (const g of groups.values()) {
    const shown = g.names.slice(0, 8);
    const more = g.names.length - shown.length;
    F.add({
      severity: "QUALITY",
      check: g.binary ? "unreferenced.binary" : "unreferenced.file",
      file: g.dir === "." ? g.names[0] : g.dir,
      title:
        (g.names.length === 1
          ? "`" + g.names[0] + "` is not referenced"
          : g.names.length + (g.binary ? " binary assets" : " files") + " here are not referenced") +
        (g.binary ? " by any text file" : " anywhere in the mod"),
      detail: shown.join(", ") + (more > 0 ? ", and " + more + " more" : ""),
      why: g.binary
        ? "No text file in this mod, its paired mods, or the surrounding base-game tree names these. A .papa model names its own textures and sub-models *inside the binary*, which cannot be read here, so this is weaker evidence than for a script or stylesheet — treat it as a prompt to check, not a conclusion."
        : "No path or filename matching these appears in any manifest, spec, script, stylesheet or effect shipped by this mod, its paired mods, or the surrounding base-game tree. They add to the download without being used. More usefully, an unreferenced file is often the leftover half of a rename, so check whether something should have been pointing at it. Directories PA scans (pa/ai*), base-game shadows and texture companions are excluded.",
      fix: g.binary
        ? "Confirm nothing loads these, then remove them, or correct whatever should have referenced them."
        : "Remove the files, or correct whatever should have referenced them.",
    });
  }
}

module.exports = {
  checkUnreferenced,
  collectReferences,
  isReferenced,
  isExcluded,
  isCompanionAsset,
};
