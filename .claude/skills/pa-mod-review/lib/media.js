"use strict";
// Locates the Planetary Annihilation: TITANS `media` folder.
//
// The review reads the base game live rather than from a snapshot, so shadow
// detection and cross-reference resolution need this. If it cannot be found the
// review still runs; the checks that need it are skipped and reported as
// Unverified rather than silently passing.

const fs = require("node:fs");
const path = require("node:path");
const { exists } = require("./util.js");

const RELATIVE_STEAM = path.join(
  "steamapps",
  "common",
  "Planetary Annihilation Titans",
  "media"
);

function looksLikeMedia(dir) {
  return (
    exists(path.join(dir, "pa")) &&
    exists(path.join(dir, "ui", "main")) &&
    exists(path.join(dir, "pa_ex1"))
  );
}

/** Steam records extra library roots in libraryfolders.vdf; scrape the paths. */
function steamLibraryRoots(steamRoot) {
  const vdf = path.join(steamRoot, "steamapps", "libraryfolders.vdf");
  const roots = [steamRoot];
  try {
    const text = fs.readFileSync(vdf, "utf8");
    const re = /"path"\s*"([^"]+)"/g;
    let m = re.exec(text);
    while (m) {
      roots.push(m[1].replace(/\\\\/g, "\\"));
      m = re.exec(text);
    }
  } catch {
    /* no vdf; the default root is still worth probing */
  }
  return roots;
}

function candidates() {
  const list = [];
  const programFiles = [
    process.env["ProgramFiles(x86)"],
    process.env.ProgramFiles,
    "C:\\Program Files (x86)",
    "C:\\Program Files",
  ].filter(Boolean);

  for (const pf of programFiles) {
    for (const root of steamLibraryRoots(path.join(pf, "Steam"))) {
      list.push(path.join(root, RELATIVE_STEAM));
    }
  }

  // Non-default library drives.
  for (const drive of ["C", "D", "E", "F", "G"]) {
    list.push(path.join(drive + ":\\", "Steam", RELATIVE_STEAM));
    list.push(path.join(drive + ":\\", "SteamLibrary", RELATIVE_STEAM));
    list.push(
      path.join(drive + ":\\", "Games", "Steam", RELATIVE_STEAM)
    );
  }

  // Linux / macOS Steam.
  if (process.env.HOME) {
    list.push(
      path.join(process.env.HOME, ".steam", "steam", RELATIVE_STEAM),
      path.join(
        process.env.HOME,
        ".local",
        "share",
        "Steam",
        RELATIVE_STEAM
      ),
      path.join(
        process.env.HOME,
        "Library",
        "Application Support",
        "Steam",
        RELATIVE_STEAM
      )
    );
  }
  return list;
}

/**
 * @param {string} [explicit] value of --media
 * @returns {{path: string|null, source: string}}
 */
function findMedia(explicit) {
  if (explicit) {
    const resolved = path.resolve(explicit);
    if (looksLikeMedia(resolved)) {
      return { path: resolved, source: "--media" };
    }
    return { path: null, source: "--media (not a media folder: " + resolved + ")" };
  }

  if (process.env.PA_MEDIA && looksLikeMedia(path.resolve(process.env.PA_MEDIA))) {
    return { path: path.resolve(process.env.PA_MEDIA), source: "PA_MEDIA" };
  }

  for (const c of candidates()) {
    if (looksLikeMedia(c)) {
      return { path: c, source: "auto-detected" };
    }
  }
  return { path: null, source: "not found" };
}

/**
 * Resolve a mod-relative path against the base game, honouring the pa_ex1
 * overlay. TITANS content in pa_ex1 sits on top of pa; a file present in both
 * is taken from pa_ex1.
 * @returns {string|null} absolute path in media, or null
 */
function resolveInMedia(mediaPath, relPath) {
  if (!mediaPath) {
    return null;
  }
  const clean = relPath.replace(/^\/+/, "").split("/").join(path.sep);

  // pa/... may also exist as pa_ex1/...
  if (clean.startsWith("pa" + path.sep)) {
    const ex1 = path.join(mediaPath, "pa_ex1", clean.slice(3));
    if (exists(ex1)) {
      return ex1;
    }
  }
  const direct = path.join(mediaPath, clean);
  return exists(direct) ? direct : null;
}

module.exports = { findMedia, resolveInMedia, looksLikeMedia };
