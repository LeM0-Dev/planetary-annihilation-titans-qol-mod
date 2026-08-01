"use strict";
// Unit / tool / ammo / anim-tree specs: schema validation (level 3) and
// cross-reference resolution (level 4).
//
// base_spec chains are followed through the live base game so an inherited key
// is never reported as missing. Arrays replace wholesale on merge; objects merge
// key by key. Setting an inherited block to {} erases it.

const fs = require("node:fs");
const path = require("node:path");
const { rel, exists } = require("./util.js");
const { resolveInMedia } = require("./media.js");
const { resolveInSiblings } = require("./siblings.js");
const { resolveInOverlays } = require("./layout.js");
const { validateAgainst } = require("./schema-validate.js");

const SCHEMA_DIR = path.join(__dirname, "..", "references", "unit-json", "schemas");

const schemaCache = new Map();

function loadSchema(name) {
  if (schemaCache.has(name)) {
    return schemaCache.get(name);
  }
  let schema = null;
  try {
    schema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, name + ".schema.json"), "utf8"));
  } catch {
    schema = null;
  }
  schemaCache.set(name, schema);
  return schema;
}

/**
 * Which of the four spec types is this file? Classification is by content,
 * because the wiring is by path reference and the naming convention is only a
 * convention.
 */
function classify(relPath, doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return null;
  }
  if (doc.blend_root !== undefined || /_anim_tree\.json$/i.test(relPath)) {
    return "anim_tree";
  }
  if (doc.tool_type !== undefined || doc.ammo_id !== undefined) {
    return "tool";
  }
  if (doc.ammo_type !== undefined || doc.flight_type !== undefined) {
    return "ammo";
  }
  if (
    doc.unit_types !== undefined ||
    doc.max_health !== undefined ||
    doc.tools !== undefined ||
    doc.navigation !== undefined
  ) {
    return "unit";
  }
  return null;
}

/** Resolve a /pa/... reference: this mod, then a paired mod, then the base game. */
function resolveRef(ref, ctx) {
  if (typeof ref !== "string" || ref.length === 0) {
    return { found: false, where: null };
  }
  const clean = ref.trim().replace(/^\/+/, "");
  const inMod = path.join(ctx.modRoot, clean.split("/").join(path.sep));
  if (exists(inMod)) {
    return { found: true, where: "mod" };
  }
  const sibling = resolveInSiblings(ctx.siblings || [], clean);
  if (sibling) {
    return { found: true, where: "sibling:" + sibling.identifier };
  }
  const overlay = resolveInOverlays(ctx.overlayRoots || [], clean);
  if (overlay) {
    return { found: true, where: "overlay" };
  }
  if (!ctx.media) {
    return { found: false, where: "unknown" };
  }
  return resolveInMedia(ctx.media, ref)
    ? { found: true, where: "base" }
    : { found: false, where: null };
}

/** Merge a base_spec chain so inherited keys are visible. */
function withInherited(doc, ctx, depth) {
  if (depth > 12 || !doc || typeof doc !== "object" || typeof doc.base_spec !== "string") {
    return doc;
  }
  const clean = doc.base_spec.replace(/^\/+/, "");
  let parentPath = path.join(ctx.modRoot, clean.split("/").join(path.sep));
  if (!exists(parentPath)) {
    parentPath = ctx.media ? resolveInMedia(ctx.media, doc.base_spec) : null;
  }
  if (!parentPath) {
    return doc;
  }
  let parent;
  try {
    parent = JSON.parse(fs.readFileSync(parentPath, "utf8"));
  } catch {
    return doc;
  }
  const merged = deepMerge(withInherited(parent, ctx, depth + 1), doc);
  return merged;
}

function deepMerge(base, child) {
  if (
    base === null ||
    typeof base !== "object" ||
    Array.isArray(base) ||
    child === null ||
    typeof child !== "object" ||
    Array.isArray(child)
  ) {
    return child; // arrays replace wholesale; scalars overwrite
  }
  const out = Object.assign({}, base);
  for (const key of Object.keys(child)) {
    out[key] = deepMerge(base[key], child[key]);
  }
  return out;
}

// Keys whose values are path references into /pa/.
const REF_KEYS = [
  { path: "base_spec", label: "base_spec" },
  { path: "ammo_id", label: "ammo_id" },
  { path: "model.filename", label: "model.filename" },
  { path: "model.animtree", label: "model.animtree" },
];

function getIn(obj, dotted) {
  const parts = dotted.split(".");
  let node = obj;
  for (const p of parts) {
    if (node === null || typeof node !== "object") {
      return undefined;
    }
    node = node[p];
  }
  return node;
}

/** effect_spec may carry a bone name, and even several effect+bone pairs. */
function effectSpecPaths(value) {
  if (typeof value !== "string") {
    return [];
  }
  return value
    .split(/\s+/)
    .filter(function (token) {
      return token.startsWith("/") && /\.(pfx|papa)$/i.test(token);
    });
}

function collectEffectSpecs(node, out) {
  if (node === null || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    node.forEach(function (n) {
      collectEffectSpecs(n, out);
    });
    return;
  }
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (key === "effect_spec" || key === "effect") {
      for (const p of effectSpecPaths(value)) {
        out.push({ key: key, ref: p });
      }
    } else {
      collectEffectSpecs(value, out);
    }
  }
}

function checkSpec(doc, relPath, ctx) {
  const F = ctx.findings;
  const kind = classify(relPath, doc);
  if (!kind) {
    return;
  }
  ctx.specCount += 1;

  // Level 3: schema, against the merged view so inheritance is honoured.
  const schema = loadSchema(kind);
  const merged = withInherited(doc, ctx, 0);
  if (schema) {
    const errors = validateAgainst(merged, schema);
    for (const e of errors.slice(0, 12)) {
      F.add({
        severity: "BUG",
        check: "spec.schema." + kind,
        file: relPath,
        title:
          (e.path ? "`" + e.path + "` " : "") +
          e.message.replace(/^expected/, "expected type"),
        detail: "Validated as a " + kind + " spec, with base_spec inheritance applied.",
        why:
          "The value does not match the engine's parser expectations recorded in the " +
          kind +
          " schema. PA's parsers read the key with a typed getter; a mistyped value falls back to the default and the setting silently does nothing.",
        fix: "Correct the value's type, or remove the key if it is vestigial.",
      });
    }
    if (errors.length > 12) {
      F.add({
        severity: "BUG",
        check: "spec.schema.truncated",
        file: relPath,
        title: errors.length - 12 + " further schema issues in this file",
        why: "Output truncated to keep the report readable.",
        fix: "Re-run with --format=json for the complete list.",
      });
    }
  }

  // Level 4: cross-references. Checked on the file's own keys, not the merged
  // view, so an inherited reference is attributed to the file that declares it.
  const refs = [];
  for (const r of REF_KEYS) {
    const value = getIn(doc, r.path);
    if (typeof value === "string" && value.length) {
      refs.push({ key: r.label, ref: value });
    }
  }
  if (Array.isArray(doc.tools)) {
    doc.tools.forEach(function (tool, i) {
      if (tool && typeof tool.spec_id === "string") {
        refs.push({ key: "tools[" + i + "].spec_id", ref: tool.spec_id });
      }
    });
  }
  collectEffectSpecs(doc, refs);

  for (const r of refs) {
    const resolved = resolveRef(r.ref, ctx);
    if (resolved.found) {
      continue;
    }
    if (!ctx.media) {
      continue; // reported once, globally, as Unverified
    }
    F.add({
      severity: "BLOCKER",
      check: "spec.unresolved-ref",
      file: relPath,
      title: "`" + r.key + "` points at a file that does not exist",
      detail: r.ref,
      why:
        "The path was found neither in this mod, nor in any paired mod, nor in the base game. A path that resolves to nothing is no safer than a malformed one: PA resolves these at load, a dangling " +
        r.key +
        " means the spec cannot be constructed, a missing base_spec fails the unit entirely, and a missing .papa asset can crash the game rather than degrade gracefully.",
      fix: "Correct the path, or ship the referenced file at that path inside the mod.",
    });
  }
}

/** New units must be registered, or they exist but can never be built. */
function checkUnitRegistration(files, ctx) {
  const F = ctx.findings;
  const root = ctx.modRoot;

  const unitLists = files.filter(function (f) {
    const r = rel(root, f);
    return /(^|\/)unit_list\.json$/.test(r) || /(^|\/)commander_list\.json$/.test(r);
  });

  const registered = new Set();
  for (const listFile of unitLists) {
    try {
      const doc = JSON.parse(fs.readFileSync(listFile, "utf8"));
      const units = doc.units || doc.commanders || [];
      if (Array.isArray(units)) {
        units.forEach(function (u) {
          if (typeof u === "string") {
            registered.add(u.replace(/^\/+/, ""));
          }
        });
      }
    } catch {
      /* json-lint already reported the parse failure */
    }
  }

  if (unitLists.length === 0) {
    return; // mod ships no unit list; nothing to cross-check against
  }

  for (const abs of files) {
    const relPath = rel(root, abs);
    if (!/^pa(_ex1)?\/units\/.+\.json$/.test(relPath)) {
      continue;
    }
    if (/(unit|commander)_list/.test(relPath)) {
      continue;
    }
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(abs, "utf8"));
    } catch {
      continue;
    }
    if (classify(relPath, doc) !== "unit") {
      continue;
    }
    // Only flag things that actually look buildable. Base templates, helper
    // specs (collision checks, sub-entities) and inherited fragments legitimately
    // never appear in unit_list.json, and flagging them buries the real case.
    if (/(^|\/)base_[^/]*\.json$/.test(relPath) || /_base\.json$/.test(relPath)) {
      continue;
    }
    const buildable =
      doc.display_name !== undefined &&
      (doc.build_metal_cost !== undefined || doc.si_name !== undefined);
    if (!buildable) {
      continue;
    }
    if (!registered.has(relPath) && !registered.has("/" + relPath)) {
      F.add({
        severity: "CONCERN",
        check: "spec.unregistered-unit",
        file: relPath,
        title: "Unit spec is not listed in the mod's unit_list.json",
        why:
          "unit_list.json is a whole-file override enumerating every buildable unit. A spec absent from it loads but can never be built or referenced by the AI. This is expected for a spec that is only ever inherited via base_spec.",
        fix:
          'Add "/' + relPath + '" to the units array in unit_list.json, or confirm the spec is a base template.',
      });
    }
  }
}

module.exports = { checkSpec, checkUnitRegistration, classify };
