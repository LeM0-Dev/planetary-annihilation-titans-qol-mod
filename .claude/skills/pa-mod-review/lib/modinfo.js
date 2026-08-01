"use strict";
// modinfo.json validation, and the scenes<->filesystem contract.
//
// Nearly every failure here is silent in game: PA does not report a mistyped
// scene key, a scenes entry pointing at a deleted file, or an identifier that
// disagrees with the ui/mods folder name. The mod simply does nothing.

const path = require("node:path");
const { exists, rel } = require("./util.js");
const { resolveInSiblings } = require("./siblings.js");
const { resolveInOverlays } = require("./layout.js");
const {
  VALID_SCENES,
  GLOBAL_MOD_LIST,
  DOCUMENTED_BUT_UNLOADED,
  LOADABLE_EXTENSIONS,
} = require("./scenes.js");

// palobby wiki, Mod Structure: all eleven are Required.
const REQUIRED_KEYS = [
  "author",
  "build",
  "category",
  "context",
  "date",
  "description",
  "display_name",
  "forum",
  "identifier",
  "signature",
  "version",
];

const KEY_MEANING = {
  author: "space delimited uber forum name(s)",
  build: "last build number tested against, eg 94684",
  category: "keywords for searching",
  context: "client or server",
  date: "YYYY-MM-DD format of UTC date updated",
  description: "short description",
  display_name: "easily identifiable name",
  forum: "URL to forum post in the mods section",
  identifier: "unique lowercase reverse domain name identifier",
  signature: "must contain a non empty string, eg ' '",
  version: "major.minor.revision or major.minor.revision-suffix",
};

// palobby wiki, Mod Structure: "Prohibited categories".
const PROHIBITED_CATEGORIES = new Set([
  "mod",
  "client",
  "client-mod",
  "server",
  "server-mod",
  "map",
  "planet",
  "planets",
  "system",
  "systems",
]);

const IDENTIFIER_RE = /^[a-z0-9]+(\.[a-z0-9][a-z0-9-]*)+$/;
const VERSION_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function checkModinfo(info, ctx) {
  const F = ctx.findings;
  const file = "modinfo.json";

  // The manifest under review is the mod's final form. Nothing is assumed to be
  // injected later, so a key absent here is absent in the shipped mod.
  for (const key of REQUIRED_KEYS) {
    if (info[key] === undefined) {
      F.add({
        severity: "BLOCKER",
        check: "modinfo.required-key",
        file: file,
        title: "Required key `" + key + "` is not present",
        detail: "Expected: " + KEY_MEANING[key] + ".",
        why:
          "The palobby Mod Structure reference lists `" +
          key +
          "` as Required; a mod missing it is rejected at submission and may not mount.",
        fix: 'Add `"' + key + '": ...` to modinfo.json.',
      });
    }
  }

  if (typeof info.identifier === "string" && !IDENTIFIER_RE.test(info.identifier)) {
    const hasUpper = /[A-Z]/.test(info.identifier);
    F.add({
      severity: "BLOCKER",
      check: "modinfo.identifier-format",
      file: file,
      title: hasUpper
        ? "`identifier` contains uppercase characters"
        : "`identifier` is not lowercase reverse domain name notation",
      detail: 'Found "' + info.identifier + '".',
      why: hasUpper
        ? "Identifiers must be lowercase reverse domain notation, eg com.palobby.some-mod-name, or com.pa.handle.some-mod-name if you have no domain. Windows resolves paths case-insensitively but Linux and macOS do not, so an uppercase identifier loads for you and silently fails for other players."
        : "Identifiers must be unique and in lowercase reverse domain notation, eg com.palobby.some-mod-name, or com.pa.handle.some-mod-name if you have no domain. A malformed identifier breaks path matching against ui/mods/<identifier>/.",
      fix:
        "Rename to eg com.pa.<yourhandle>.<mod-name>, and update the ui/mods folder and every coui:// URL to match.",
    });
  }

  if (info.context !== undefined && info.context !== "client" && info.context !== "server") {
    F.add({
      severity: "BLOCKER",
      check: "modinfo.context",
      file: file,
      title: "`context` must be exactly \"client\" or \"server\"",
      detail: "Found " + JSON.stringify(info.context) + ".",
      why:
        "The mod manager filters by `mod.context == 'client'`. Any other value means the mod is never placed in either the client or server active list.",
      fix: 'Set "context": "client" or "context": "server".',
    });
  }

  if (typeof info.version === "string" && !VERSION_RE.test(info.version)) {
    F.add({
      severity: "BUG",
      check: "modinfo.version-format",
      file: file,
      title: "`version` is not major.minor.revision",
      detail: 'Found "' + info.version + '".',
      why:
        "The documented format is major.minor.revision, optionally with a -suffix. Version comparison drives automatic updates, so a malformed version can stop players receiving updates.",
      fix: 'Use eg "1.0.0" or "1.0.0-beta".',
    });
  }

  if (typeof info.date === "string" && !DATE_RE.test(info.date)) {
    F.add({
      severity: "BUG",
      check: "modinfo.date-format",
      file: file,
      title: "`date` is not YYYY-MM-DD",
      detail: 'Found "' + info.date + '".',
      why:
        "The documented format is a YYYY-MM-DD UTC date. community-mods-manager.js passes this to `new Date(mod.date)`; an unparseable value yields Invalid Date in the mod listing.",
      fix: 'Use the UTC date the mod was last updated, eg "2026-07-26".',
    });
  }

  if (info.signature !== undefined) {
    if (typeof info.signature !== "string" || info.signature.length === 0) {
      F.add({
        severity: "BLOCKER",
        check: "modinfo.signature",
        file: file,
        title: "`signature` must be a non-empty string",
        detail: "Found " + JSON.stringify(info.signature) + ".",
        why:
          'The Mod Structure reference states signature "must contain a non empty string eg \' \'".',
        fix: 'Set "signature": " ".',
      });
    }
  }

  // The shape of `forum`'s value is a distribution rule, not a load-time one: a
  // dead link ships and runs. checkPackaging in compliance.js owns it, alongside
  // the other manifest URLs.

  if (info.category !== undefined) {
    if (!Array.isArray(info.category)) {
      F.add({
        severity: "BLOCKER",
        check: "modinfo.category-type",
        file: file,
        title: "`category` must be an array of strings",
        detail: "Found " + typeof info.category + ".",
        why: "The Mod Structure reference types `category` as an array of strings.",
        fix: 'Use eg "category": ["titans", "ui"].',
      });
    } else {
      if (info.category.length === 0) {
        F.add({
          severity: "COMPLIANCE",
          check: "modinfo.category-empty",
          file: file,
          title: "`category` is empty",
          why: "Categories are the search keywords for the in-game mod browser; with none, the mod is effectively unfindable.",
          fix: "Add at least one category, eg \"titans\".",
        });
      }
      for (const c of info.category) {
        if (typeof c === "string" && PROHIBITED_CATEGORIES.has(c.toLowerCase())) {
          F.add({
            severity: "COMPLIANCE",
            check: "modinfo.category-prohibited",
            file: file,
            title: 'Prohibited category "' + c + '"',
            why:
              "The Mod Structure reference lists this among prohibited categories: mod, client, client-mod, server, server-mod, map, planet, planets, system, systems. These are redundant with fields the browser already knows.",
            fix: 'Remove "' + c + '" and use a descriptive keyword instead.',
          });
        }
      }
    }
  }

  if (info.companions !== undefined && info.context === "client") {
    F.add({
      severity: "CONCERN",
      check: "modinfo.companions-on-client",
      file: file,
      title: "`companions` is declared on a client mod",
      why:
        "`companions` is documented as optional for server mods: it names client mods to auto-load when players connect to a game hosting this server mod. On a client mod it has no defined effect.",
      fix: "Remove `companions`, or move it to the paired server mod.",
    });
  }

  if (info.priority !== undefined) {
    if (typeof info.priority !== "number") {
      F.add({
        severity: "BUG",
        check: "modinfo.priority-type",
        file: file,
        title: "`priority` must be a number",
        detail: "Found " + JSON.stringify(info.priority) + ".",
        why: "community-mods-manager.js sorts with _.sortBy(mods, 'priority'); a non-number sorts unpredictably.",
        fix: "Use a number, eg 100.",
      });
    } else if (info.priority === 0) {
      F.add({
        severity: "BUG",
        check: "modinfo.priority-zero",
        file: file,
        title: "`priority: 0` is silently replaced with 100",
        why:
          "community-mods-manager.js applies the default with a falsy test — `if (!mod.priority) mod.priority = 100;` — so 0 is indistinguishable from absent and becomes 100.",
        fix: "Use 1 if you intend this mod to load before the default-priority mods.",
      });
    }
  }

  return info;
}

/**
 * The identifier triangle, and the scenes<->filesystem contract.
 * `identifier`, the ui/mods/<dir> folder, and the directory inside every
 * coui:// URL must all agree, or the game loads nothing and says nothing.
 */
function checkScenes(info, ctx) {
  const F = ctx.findings;
  const file = "modinfo.json";
  const root = ctx.modRoot;

  if (info.scenes === undefined) {
    return;
  }
  if (typeof info.scenes !== "object" || Array.isArray(info.scenes) || info.scenes === null) {
    F.add({
      severity: "BLOCKER",
      check: "modinfo.scenes-type",
      file: file,
      title: "`scenes` must be a map of scene name to array of URLs",
      why: "The Mod Structure reference types `scenes` as a map of arrays.",
      fix: 'Use eg "scenes": { "start": ["coui://ui/mods/<id>/start.js"] }.',
    });
    return;
  }

  const couiDirs = new Set();

  for (const sceneName of Object.keys(info.scenes)) {
    const entries = info.scenes[sceneName];

    if (sceneName !== GLOBAL_MOD_LIST) {
      if (DOCUMENTED_BUT_UNLOADED.has(sceneName)) {
        F.add({
          severity: "CONCERN",
          check: "modinfo.scene-unloaded",
          file: file,
          title: 'Scene "' + sceneName + '" has no loader in the current build',
          why:
            'It appears in the ui_mod_list.js template in media/ui/mods/readme.txt, but no loadMods or loadSceneMods call for it exists in the shipped UI. The related scene that does exist is "gw_lobby". Files listed here are likely never loaded.',
          fix: 'Confirm the scene is still live, or move these files to a scene that is.',
        });
      } else if (!VALID_SCENES.has(sceneName)) {
        F.add({
          severity: "BUG",
          check: "modinfo.scene-unknown",
          file: file,
          title: 'Unknown scene "' + sceneName + '"',
          why:
            "PA only loads scene mods for the 59 scene keys registered in the shipped UI. An unrecognised key is never looked up, so every file listed under it is silently never loaded and no error is reported.",
          fix:
            "Correct the scene name. Note scene keys are panel-level: eg live_game_players, not live_game.",
        });
      }
    }

    if (!Array.isArray(entries)) {
      F.add({
        severity: "BLOCKER",
        check: "modinfo.scene-not-array",
        file: file,
        title: 'Scene "' + sceneName + '" is not an array',
        detail: "Found " + typeof entries + ".",
        why:
          "loadMods() iterates the value with a numeric for loop and calls .match() on each element. A non-array yields no files, or throws.",
        fix: "Wrap the value in an array.",
      });
      continue;
    }

    for (const entry of entries) {
      if (typeof entry !== "string") {
        F.add({
          severity: "BLOCKER",
          check: "modinfo.scene-entry-type",
          file: file,
          title: 'Non-string entry in scene "' + sceneName + '"',
          detail: "Found " + JSON.stringify(entry) + ".",
          why: "loadMods() calls .match() on each entry; a non-string throws.",
          fix: "Use a coui:// URL string.",
        });
        continue;
      }

      if (!entry.startsWith("coui://")) {
        F.add({
          severity: "BLOCKER",
          check: "modinfo.scene-entry-not-coui",
          file: file,
          title: "Scene entry is not an absolute coui:// URL",
          detail: entry,
          why:
            'media/ui/mods/readme.txt: "File paths should be absolute." A relative path does not resolve and the file is never loaded.',
          fix: "Use coui://ui/mods/<identifier>/<file>.",
        });
        continue;
      }

      const ext = path.extname(entry).toLowerCase();
      if (LOADABLE_EXTENSIONS.indexOf(ext) === -1) {
        F.add({
          severity: "BUG",
          check: "modinfo.scene-entry-extension",
          file: file,
          title: "Scene entry is neither .js nor .css, so it is ignored",
          detail: entry,
          why:
            'loadMods() in media/ui/main/shared/js/helpers.js tests only /[.]js$/ and /[.]css$/ and does nothing with anything else. readme.txt confirms: "Only .css and .js files are currently supported".',
          fix:
            "Remove the entry. Load HTML with loadHtml() or $.get() from a .js file instead; images and fonts need no entry at all.",
        });
      }

      // coui://ui/mods/<dir>/...
      const rest = entry.slice("coui://".length);
      const m = /^ui\/mods\/([^/]+)\//.exec(rest);
      if (m) {
        couiDirs.add(m[1]);
      }

      const onDisk = path.join(root, rest.split("/").join(path.sep));
      if (!exists(onDisk)) {
        // In a source tree, a build script merges shared folders into the
        // packaged mod, so the file may live in a sibling overlay folder.
        const overlay = resolveInOverlays(ctx.overlayRoots || [], rest);
        if (overlay) {
          continue;
        }
        // A client/server pair shares one virtual namespace, so a scene entry
        // may legitimately resolve into the partner mod at runtime.
        const sibling = resolveInSiblings(ctx.siblings || [], rest);
        if (sibling) {
          F.add({
            severity: "CONCERN",
            check: "modinfo.scene-file-in-sibling",
            file: file,
            title: "Scene entry resolves into the paired mod, not this one",
            detail:
              entry +
              "  ->  found in " +
              sibling.identifier +
              " (declared in `" +
              sibling.relation +
              "`)",
            why:
              "The file is absent from this mod but present in the mod it pairs with, and both mount into the same coui:// namespace, so this resolves at runtime. It only works while the partner is installed and enabled — which `dependencies` enforces, but which makes the mod unusable standalone.",
            fix:
              "No change needed if the pairing is intentional; document it so the cross-mod reference is not mistaken for a bug.",
          });
        } else {
          F.add({
            severity: "BLOCKER",
            check: "modinfo.scene-file-missing",
            file: file,
            title: "Scene entry points at a file that does not exist",
            detail: entry + "  ->  " + rel(root, onDisk),
            why:
              "PA requests the URL, gets a failure, logs it, and carries on. Everything the file was meant to do simply does not happen. A renamed or deleted file left in `scenes` is invisible in game.",
            fix: "Correct the path, or remove the entry.",
          });
        }
      }
    }
  }

  // The identifier triangle.
  if (typeof info.identifier === "string" && couiDirs.size > 0) {
    for (const dir of couiDirs) {
      if (dir !== info.identifier) {
        const modsDir = path.join(root, "ui", "mods", dir);
        // The folder may be supplied by a build-time overlay (a source tree's
        // shared/ folder) or by the paired mod through the merged namespace.
        const resolvesElsewhere =
          Boolean(resolveInOverlays(ctx.overlayRoots || [], "ui/mods/" + dir)) ||
          Boolean(resolveInSiblings(ctx.siblings || [], "ui/mods/" + dir));
        F.add({
          severity: exists(modsDir) || resolvesElsewhere ? "CONCERN" : "BLOCKER",
          check: "modinfo.identifier-triangle",
          file: file,
          title:
            'coui:// directory "' + dir + '" does not match identifier "' + info.identifier + '"',
          detail: exists(modsDir)
            ? "ui/mods/" + dir + " exists on disk, so this resolves, but it is a deliberate namespace share rather than the default arrangement."
            : resolvesElsewhere
              ? "ui/mods/" + dir + " is absent here but supplied by a build-time overlay or the paired mod, so it resolves in the packaged form."
              : "ui/mods/" + dir + " does not exist in this mod.",
          why:
            "The identifier, the ui/mods/<dir> folder name and the directory inside every coui:// URL are conventionally the same. Where they disagree and the folder is absent, the game loads nothing and reports nothing.",
          fix: exists(modsDir)
            ? "If the shared namespace is intentional (as with a paired client/server mod), document it. Otherwise align the names."
            : "Rename so all three agree.",
        });
      }
    }
  }

  // ui/mods folders present on disk that nothing references.
  const modsRoot = path.join(root, "ui", "mods");
  if (exists(modsRoot)) {
    let dirs = [];
    try {
      dirs = require("node:fs")
        .readdirSync(modsRoot, { withFileTypes: true })
        .filter(function (d) {
          return d.isDirectory();
        })
        .map(function (d) {
          return d.name;
        });
    } catch {
      dirs = [];
    }
    for (const d of dirs) {
      if (!couiDirs.has(d) && typeof info.identifier === "string" && d !== info.identifier) {
        F.add({
          severity: "CONCERN",
          check: "modinfo.orphan-ui-mods-dir",
          file: "ui/mods/" + d,
          title: 'ui/mods/"' + d + '" is not referenced by any scene',
          why:
            "No coui:// entry in `scenes` points into this folder and it does not match the identifier. Its files are shipped but may never load. This is legitimate for a folder loaded on demand by another script, so it needs confirming.",
          fix: "Reference it from `scenes`, load it explicitly, or remove it from the package.",
        });
      }
    }
  }
}

module.exports = { checkModinfo, checkScenes, REQUIRED_KEYS, PROHIBITED_CATEGORIES };
