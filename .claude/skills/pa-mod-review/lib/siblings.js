"use strict";
// Paired mods.
//
// PA mods routinely ship as a client/server pair that share one virtual file
// namespace: the server half carries unit specs and AI data, the client half
// carries the models, effects and UI those specs reference. Legion Expansion is
// the canonical case — its server specs point at .papa models that only exist in
// the client mod, and its server `scenes` map references a script that only
// exists in the client mod.
//
// Resolving references against the reviewed mod plus the base game alone
// therefore reports hundreds of false Blockers on a perfectly correct mod. The
// declared `dependencies` and `companions` identify the partner, so they are
// located on disk and searched too.

const fs = require("node:fs");
const path = require("node:path");
const { exists } = require("./util.js");

/**
 * Mods install under <PA user data>/client_mods/<id> and server_mods/<id>.
 * Given the mod root, probe the usual sibling locations for each declared
 * partner identifier.
 * @returns {Array<{identifier: string, root: string, relation: string}>}
 */
function findSiblings(modRoot, info) {
  const wanted = new Map();
  for (const key of ["dependencies", "companions"]) {
    const list = info && info[key];
    if (Array.isArray(list)) {
      for (const id of list) {
        if (typeof id === "string" && id.length) {
          wanted.set(id, wanted.has(id) ? wanted.get(id) + "/" + key : key);
        }
      }
    }
  }
  if (wanted.size === 0) {
    return [];
  }

  const parent = path.dirname(modRoot); // .../client_mods, or .../src
  const grandparent = path.dirname(parent);
  const searchRoots = [
    parent,
    path.join(grandparent, "client_mods"),
    path.join(grandparent, "server_mods"),
  ];

  // Installed mods live in a folder named for their identifier; source repos do
  // not — Legion Expansion's halves sit in src/client and src/server. So match on
  // the identifier each candidate *declares*, falling back to the folder name.
  const byIdentifier = new Map();
  for (const root of searchRoots) {
    let entries = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const candidate = path.join(root, entry.name);
      if (candidate === modRoot) {
        continue;
      }
      const manifest = path.join(candidate, "modinfo.json");
      if (!exists(manifest)) {
        continue;
      }
      let declared = null;
      try {
        declared = JSON.parse(fs.readFileSync(manifest, "utf8")).identifier;
      } catch {
        declared = null;
      }
      for (const key of [declared, entry.name].filter(Boolean)) {
        if (!byIdentifier.has(key)) {
          byIdentifier.set(key, candidate);
        }
      }
    }
  }

  const found = [];
  for (const [id, relation] of wanted) {
    // A -dev suffix on an installed copy is a common development convention, so
    // try the declared identifier and its -dev variants too.
    const names = [id, id + "-dev", id.replace(/-dev$/, "")];
    let hit = null;
    for (const name of names) {
      if (hit === null && byIdentifier.has(name)) {
        hit = byIdentifier.get(name);
      }
    }
    found.push({ identifier: id, root: hit, relation: relation });
  }
  return found;
}

/** Is `relPath` present in any located sibling mod? */
function resolveInSiblings(siblings, relPath) {
  const native = relPath.replace(/^\/+/, "").split("/").join(path.sep);
  for (const s of siblings) {
    if (!s.root) {
      continue;
    }
    const candidate = path.join(s.root, native);
    if (fs.existsSync(candidate)) {
      return s;
    }
  }
  return null;
}

module.exports = { findSiblings, resolveInSiblings };
