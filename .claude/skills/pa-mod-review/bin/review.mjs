#!/usr/bin/env node
// pa-mod-review — deterministic checks for a Planetary Annihilation: TITANS mod.
//
// Zero dependencies: Node built-ins only, so this runs anywhere without an
// npm install, including in someone else's CI.
//
//   node review.mjs <mod-path> [--format=md|json] [--media=<path>] [--out=<file>]
//
// Exit codes: 0 clean or advisory only, 1 blockers or bugs found, 2 bad usage.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.join(HERE, "..", "lib");

const { Findings, walk, rel, readText, exists, JSON_EXTENSIONS } = require(path.join(LIB, "util.js"));
const { findMedia } = require(path.join(LIB, "media.js"));
const { lintJson } = require(path.join(LIB, "json-lint.js"));
const { checkJs } = require(path.join(LIB, "chrome40.js"));
const { checkModinfo, checkScenes } = require(path.join(LIB, "modinfo.js"));
const { checkPfx } = require(path.join(LIB, "pfx.js"));
const { checkShadowing } = require(path.join(LIB, "shadow.js"));
const { checkSpec, checkUnitRegistration } = require(path.join(LIB, "specs.js"));
const { checkPackaging, checkConduct, checkExpansionDir } = require(path.join(LIB, "compliance.js"));
const { findSiblings } = require(path.join(LIB, "siblings.js"));
const { detectSourceLayout, composeManifest } = require(path.join(LIB, "layout.js"));
const { checkUnreferenced } = require(path.join(LIB, "unreferenced.js"));
const { renderMarkdown, renderJson } = require(path.join(LIB, "report.js"));

const USAGE = `
pa-mod-review — review a Planetary Annihilation: TITANS mod

Usage:
  node review.mjs <mod-path> [options]

Arguments:
  <mod-path>        Folder containing modinfo.json

Options:
  --format=md|json  Output format (default: md)
  --media=<path>    Path to the base game 'media' folder.
                    Auto-detected from Steam if omitted; PA_MEDIA is also read.
  --out=<file>      Write the report to a file as well as stdout
  -h, --help        Show this help

Exit codes:
  0  no blockers or bugs
  1  blockers or bugs found
  2  usage error
`.trim();

function parseArgs(argv) {
  const opts = { format: "md", media: null, out: null, modPath: null, help: false };
  for (const arg of argv) {
    if (arg === "-h" || arg === "--help") {
      opts.help = true;
    } else if (arg.startsWith("--format=")) {
      opts.format = arg.slice(9);
    } else if (arg.startsWith("--media=")) {
      opts.media = arg.slice(8);
    } else if (arg.startsWith("--out=")) {
      opts.out = arg.slice(6);
    } else if (!arg.startsWith("-") && opts.modPath === null) {
      opts.modPath = arg;
    }
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help || !opts.modPath) {
    process.stdout.write(USAGE + "\n");
    process.exit(opts.help ? 0 : 2);
  }
  if (opts.format !== "md" && opts.format !== "json") {
    process.stderr.write("error: --format must be md or json\n");
    process.exit(2);
  }

  const modRoot = path.resolve(opts.modPath);
  if (!exists(modRoot) || !fs.statSync(modRoot).isDirectory()) {
    process.stderr.write("error: not a directory: " + modRoot + "\n");
    process.exit(2);
  }

  const modinfoPath = path.join(modRoot, "modinfo.json");
  const media = findMedia(opts.media);

  const ctx = {
    modRoot: modRoot,
    modName: path.basename(modRoot),
    media: media.path,
    mediaSource: media.source,
    findings: new Findings(),
    modinfo: null,
    fileCount: 0,
    shadowCount: 0,
    specCount: 0,
    timestamp: new Date().toISOString().slice(0, 10),
  };
  const F = ctx.findings;

  // modinfo.json must exist at the top level of the package.
  if (!exists(modinfoPath)) {
    F.add({
      severity: "BLOCKER",
      check: "modinfo.missing",
      file: "modinfo.json",
      title: "No modinfo.json at the top level of the mod",
      why:
        "PA identifies a mod by a modinfo.json at the root of the package. Without it there is no mod to load. If the manifest sits in a subfolder, that subfolder is the mod root, not this one.",
      fix: "Add modinfo.json here, or point the review at the folder that contains it.",
    });
    emit(ctx, opts);
    return;
  }

  const files = walk(modRoot);
  ctx.fileCount = files.length;

  if (!ctx.media) {
    F.add({
      severity: "UNVERIFIED",
      check: "media.not-found",
      title: "Base game not found, so cross-reference and shadow checks were skipped",
      detail: "Searched Steam's default and library locations. Status: " + media.source + ".",
      why:
        "Shadow detection, base_spec and ammo_id resolution, texture resolution and the shader list all read the live base game. Without it these checks cannot run, and their absence from this report is not evidence the mod is clean.",
      fix:
        "Re-run with --media=\"<path to>\\Planetary Annihilation Titans\\media\", or set PA_MEDIA.",
    });
  }

  // --- modinfo -----------------------------------------------------------
  const modinfoRaw = readText(modinfoPath);
  const modinfoLint = lintJson(modinfoRaw);
  reportJsonIssues(modinfoLint.issues, "modinfo.json", F, true);

  if (!modinfoLint.ok) {
    emit(ctx, opts); // nothing downstream is meaningful without a manifest
    return;
  }
  // A source repository may compose its shipped manifest from a shared base
  // layer plus a per-context override, and merge in files from sibling folders
  // at build time. Detect that before validating anything, or the keys held in
  // the base layer are reported as missing and the shared files as absent.
  const layout = detectSourceLayout(modRoot);
  ctx.overlayRoots = layout.overlayRoots;
  ctx.modinfo = composeManifest(layout.baseManifest, modinfoLint.data);

  if (layout.baseManifest) {
    F.add({
      severity: "UNVERIFIED",
      check: "layout.source-tree",
      file: rel(modRoot, layout.baseManifestPath) || layout.baseManifestPath,
      title: "Reviewed as a source tree, not a packaged mod",
      detail:
        "Merged " +
        layout.baseManifestPath +
        " beneath this mod's own modinfo.json" +
        (layout.overlayRoots.length
          ? ", and treated " +
            layout.overlayRoots.length +
            " sibling folder(s) as build-time overlays: " +
            layout.overlayRoots.map((r) => path.basename(r)).join(", ")
          : "") +
        ".",
      why:
        "This folder is not what ships — a build script assembles the packaged mod from these parts. The manifest and file resolution here are an approximation of that build, so findings about missing keys or missing files are less reliable than they would be against a packaged mod.",
      fix:
        "For an authoritative review, run the build and point the review at the packaged output, or at the installed copy.",
    });
  }

  // Locate paired mods before anything resolves a reference: a client/server
  // pair shares one namespace, and half its files live in the partner.
  ctx.siblings = findSiblings(modRoot, ctx.modinfo);
  for (const s of ctx.siblings) {
    if (!s.root) {
      F.add({
        severity: "UNVERIFIED",
        check: "siblings.not-installed",
        file: "modinfo.json",
        title: 'Declared ' + s.relation + ' "' + s.identifier + '" is not installed alongside this mod',
        why:
          "References that this mod expects the partner to satisfy cannot be resolved, so any that point into the partner are reported as missing below. This is not evidence they are broken.",
        fix:
          "Install the partner mod next to this one and re-run, or ignore reference findings that name paths the partner provides.",
      });
    }
  }

  checkModinfo(ctx.modinfo, ctx);
  checkScenes(ctx.modinfo, ctx);

  // --- every file --------------------------------------------------------
  for (const abs of files) {
    const relPath = rel(modRoot, abs);
    const ext = path.extname(abs).toLowerCase();

    if (JSON_EXTENSIONS.has(ext)) {
      if (relPath === "modinfo.json") {
        continue; // already done
      }
      let raw;
      try {
        raw = readText(abs);
      } catch (err) {
        F.add({
          severity: "BLOCKER",
          check: "file.unreadable",
          file: relPath,
          title: "File could not be read",
          detail: String(err.message),
          why: "A file that cannot be read cannot be loaded by the game either.",
          fix: "Check the file's permissions and encoding.",
        });
        continue;
      }
      if (raw.trim().length === 0) {
        F.add({
          severity: "BLOCKER",
          check: "file.empty",
          file: relPath,
          title: "File is empty",
          why: "An empty JSON-format file cannot be parsed and provides nothing.",
          fix: "Populate the file, or remove it and any references to it.",
        });
        continue;
      }

      const lint = lintJson(raw);
      reportJsonIssues(lint.issues, relPath, F, false);
      if (!lint.ok) {
        continue;
      }

      if (ext === ".pfx") {
        checkPfx(lint.data, relPath, ctx);
      } else if (ext === ".json") {
        checkSpec(lint.data, relPath, ctx);
      }
      continue;
    }

    if (ext === ".js") {
      let src;
      try {
        src = readText(abs);
      } catch {
        continue;
      }
      for (const finding of checkJs(src, relPath)) {
        F.add({
          severity: finding.severity,
          check: finding.check,
          file: relPath,
          line: finding.line,
          col: finding.col,
          title: finding.title,
          detail: finding.detail,
          why: finding.why,
          fix: finding.fix,
        });
      }
    }
  }

  checkShadowing(files, ctx);
  checkUnreferenced(files, ctx);
  checkUnitRegistration(files, ctx);
  checkPackaging(files, ctx.modinfo, ctx);
  checkExpansionDir(files, ctx);
  checkConduct(files, ctx.modinfo, ctx);

  emit(ctx, opts);
}

function reportJsonIssues(issues, relPath, F, isManifest) {
  for (const issue of issues) {
    if (issue.kind === "parse") {
      F.add({
        severity: "BLOCKER",
        check: "json.parse",
        file: relPath,
        line: issue.line,
        col: issue.col,
        title: isManifest
          ? "modinfo.json is not valid JSON"
          : "File is not valid JSON",
        detail: issue.message,
        why: isManifest
          ? "The manifest cannot be parsed, so PA cannot identify or mount the mod at all. Nothing else in this review could be checked."
          : "PA parses this file at load. A syntax error means the file is dropped, and depending on where it is used the game can fail outright. Trailing commas and missing commas are the usual causes.",
        fix: "Fix the syntax error at the reported position.",
      });
    } else if (issue.kind === "bom") {
      F.add({
        severity: "BLOCKER",
        check: "json.bom",
        file: relPath,
        line: 1,
        col: 1,
        title: "File begins with a UTF-8 byte order mark",
        why:
          "A BOM appears before the opening brace, so a strict JSON parser rejects the document. The file looks correct in an editor, which makes this hard to spot.",
        fix: "Re-save the file as UTF-8 without BOM.",
      });
    } else if (issue.kind === "encoding") {
      F.add({
        severity: "BLOCKER",
        check: "json.encoding",
        file: relPath,
        line: issue.line,
        col: issue.col,
        title: "File is not valid UTF-8",
        detail: issue.message,
        why: "PA reads mod JSON as UTF-8. An unmappable byte corrupts the value or breaks the parse.",
        fix: "Re-save the file as UTF-8.",
      });
    } else if (issue.kind === "duplicate-key") {
      F.add({
        severity: "BUG",
        check: "json.duplicate-key",
        file: relPath,
        line: issue.line,
        col: issue.col,
        title: 'Duplicate key "' + issue.key + '"',
        detail: "First defined on line " + issue.firstLine + ".",
        why:
          "Duplicate keys are legal JSON and every parser keeps the LAST one silently. The earlier definition is dead, so an edit made to the wrong copy appears to have no effect — and no tool reports it, because the file is valid.",
        fix:
          "Remove one of the two definitions, keeping the value you intend to apply.",
      });
    }
  }
}

function emit(ctx, opts) {
  const output = opts.format === "json" ? renderJson(ctx) : renderMarkdown(ctx);
  process.stdout.write(output + "\n");

  if (opts.out) {
    try {
      fs.writeFileSync(path.resolve(opts.out), output + "\n", "utf8");
      process.stderr.write("Report written to " + path.resolve(opts.out) + "\n");
    } catch (err) {
      process.stderr.write("warning: could not write --out file: " + err.message + "\n");
    }
  }

  const bad = ctx.findings.count("BLOCKER") + ctx.findings.count("BUG");
  process.exit(bad > 0 ? 1 : 0);
}

main();
