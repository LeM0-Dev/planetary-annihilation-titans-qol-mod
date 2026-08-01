// Runs the review's checkers over the SHIPPED BASE GAME.
//
// The base game is, by definition, content that works. Any rule that fires
// heavily here is a rule that would fire heavily on a correct mod. This is the
// false-positive calibration test.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const LIB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib");

const { Findings, walk } = require(path.join(LIB, "util.js"));
const { lintJson } = require(path.join(LIB, "json-lint.js"));
const { checkJs } = require(path.join(LIB, "chrome40.js"));
const { checkPfx } = require(path.join(LIB, "pfx.js"));
const { checkSpec } = require(path.join(LIB, "specs.js"));

// Auto-detect the base game the same way the review does, so the slash command
// needs no argument.
const { findMedia } = require(path.join(LIB, "media.js"));
const located = findMedia(process.argv[2] || null);
const MEDIA = located.path;
if (!MEDIA) {
  process.stderr.write(
    "error: base game not found (" +
      located.source +
      ")\nusage: node audit-base-game.mjs [<media-path>]\n"
  );
  process.exit(2);
}
process.stdout.write("Base game: " + MEDIA + " (" + located.source + ")\n");

const ctx = {
  modRoot: MEDIA,
  media: MEDIA,
  siblings: [],
  overlayRoots: [],
  findings: new Findings(),
  specCount: 0,
  shadowCount: 0,
};

const counts = new Map();
function tally(check) {
  counts.set(check, (counts.get(check) || 0) + 1);
}

let jsonFiles = 0;
let pfxFiles = 0;
let jsFiles = 0;

// --- pa/ and pa_ex1/: JSON, specs, particles -----------------------------
for (const root of ["pa", "pa_ex1"]) {
  for (const abs of walk(path.join(MEDIA, root))) {
    const ext = path.extname(abs).toLowerCase();
    const rel = path.relative(MEDIA, abs).split(path.sep).join("/");

    if (ext !== ".json" && ext !== ".pfx") {
      continue;
    }
    let raw;
    try {
      raw = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    if (!raw.trim()) {
      continue;
    }

    const before = ctx.findings.items.length;
    const lint = lintJson(raw);
    for (const issue of lint.issues) {
      tally("json." + issue.kind);
    }
    if (!lint.ok) {
      continue;
    }

    if (ext === ".pfx") {
      pfxFiles += 1;
      checkPfx(lint.data, rel, ctx);
    } else {
      jsonFiles += 1;
      checkSpec(lint.data, rel, ctx);
    }
    for (const f of ctx.findings.items.slice(before)) {
      tally(f.check);
    }
    ctx.findings.items.length = before;
    ctx.findings._index.clear();
  }
}

// --- ui/main: JavaScript against the Chrome 40 rules ---------------------
for (const abs of walk(path.join(MEDIA, "ui", "main"))) {
  if (path.extname(abs).toLowerCase() !== ".js") {
    continue;
  }
  const rel = path.relative(MEDIA, abs).split(path.sep).join("/");
  let src;
  try {
    src = fs.readFileSync(abs, "utf8");
  } catch {
    continue;
  }
  jsFiles += 1;
  for (const f of checkJs(src, rel)) {
    tally(f.check + "  [" + f.severity + "]");
  }
}

process.stdout.write(
  "\nScanned: " + jsonFiles + " spec JSON, " + pfxFiles + " .pfx, " + jsFiles + " .js\n\n"
);
const rows = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
for (const [check, n] of rows) {
  process.stdout.write("  " + String(n).padStart(6) + "  " + check + "\n");
}
if (rows.length === 0) {
  process.stdout.write("  (no findings)\n");
}
