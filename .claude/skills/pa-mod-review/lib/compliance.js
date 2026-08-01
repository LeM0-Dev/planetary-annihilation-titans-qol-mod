"use strict";
// Distribution and conduct rules. These do not stop the mod loading; they stop
// it being accepted, or breach the published conduct standards.

const fs = require("node:fs");
const path = require("node:path");
const { rel } = require("./util.js");
const { tokenise } = require("./tokenise.js");
const { resolveInSiblings } = require("./siblings.js");
const { resolveInOverlays } = require("./layout.js");
const { resolveInMedia } = require("./media.js");

// palobby wiki, Modding: prohibited activities. Violating mods are removed and
// their creators permanently banned, so these are worth surfacing loudly.
const PRIVACY_PATTERNS = [
  {
    re: /\b(?:ipify|ipinfo\.io|api\.ipify|ip-api\.com|whatismyip|myexternalip|ipapi\.co)\b/i,
    what: "an external IP-address lookup service",
  },
  {
    re: /\bRTCPeerConnection\b/,
    what: "WebRTC, which is commonly used to discover a user's local IP address",
  },
  {
    re: /\b(?:remoteAddr|clientIp|client_ip|userIp|user_ip|ipAddress|ip_address)\b/,
    what: "an IP-address field",
  },
];

const EXFIL_PATTERNS = [
  {
    re: /\b(?:XMLHttpRequest|fetch)\s*\(/,
    what: "an outbound HTTP request",
  },
  {
    re: /\bnavigator\.(?:userAgent|platform|language|hardwareConcurrency)\b/,
    what: "browser fingerprinting data",
  },
];

// Conventionally uppercase development and documentation files. These are not
// shipped mod assets — the game never resolves a path to them — and they are
// normally stripped from the release archive via .gitattributes export-ignore.
const UPPERCASE_BY_CONVENTION =
  /^(CLAUDE|README|LICENSE|LICENCE|CHANGELOG|CONTRIBUTING|CODEOWNERS|AUTHORS|NOTICE|SECURITY|MEMORY)(\.[A-Za-z]+)?$/;

// Documentation extensions. Authors name these freely — CREDITS_AND_LICENSES.txt,
// INSTALL_NOTES.md — so an allowlist of stems will always miss some. PA resolves
// mod content only under pa/, pa_ex1/, ui/, shaders/ and effects/, so a prose file
// at the archive root is documentation whatever it is called.
const DOC_EXTENSION = /\.(md|txt|rst|adoc)$/i;

function isConventionalDoc(relPath) {
  const segments = relPath.split("/");
  const base = segments.pop();
  if (UPPERCASE_BY_CONVENTION.test(base)) {
    return true;
  }
  return segments.length === 0 && DOC_EXTENSION.test(base);
}

/**
 * The real on-disk casing of the last `depth` segments of `abs`.
 *
 * Windows resolves paths case-insensitively, so `exists()` succeeding proves
 * nothing about casing — the name has to be read back off the directory entry.
 *
 * @returns {string|null} slash-joined real path tail, or null if any segment is gone
 */
function tailCasing(abs, depth) {
  const segments = [];
  let cur = abs;
  for (let i = 0; i < depth; i += 1) {
    const dir = path.dirname(cur);
    if (dir === cur) {
      break;
    }
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return null;
    }
    const want = path.basename(cur).toLowerCase();
    const real = entries.find((e) => e.toLowerCase() === want);
    if (!real) {
      return null;
    }
    segments.unshift(real);
    cur = dir;
  }
  // TITANS content is addressed as /pa/... but lives in media/pa_ex1/, so the
  // real tail carries pa_ex1 where the mod path carries pa. Same virtual path.
  if (segments[0] === "pa_ex1") {
    segments[0] = "pa";
  }
  return segments.join("/");
}

/**
 * Where a shadowed path comes from, if it is a shadow at all.
 *
 * A shadow must match its origin's casing exactly, whatever that casing is —
 * that applies to another mod's files as much as to the base game's. Only a
 * path with no origin is held to the lowercase rule.
 *
 * @returns {{casing: string, what: string}|null}
 */
function shadowOrigin(relPath, ctx) {
  const clean = relPath.replace(/^\/+/, "");
  const depth = clean.split("/").length;
  const native = clean.split("/").join(path.sep);
  const candidates = [];

  const sibling = resolveInSiblings(ctx.siblings || [], clean);
  if (sibling) {
    candidates.push({ abs: path.join(sibling.root, native), what: "the mod " + sibling.identifier });
  }
  const overlayRoot = resolveInOverlays(ctx.overlayRoots || [], clean);
  if (overlayRoot) {
    candidates.push({ abs: path.join(overlayRoot, native), what: "the source overlay" });
  }
  const inMedia = ctx.media ? resolveInMedia(ctx.media, clean) : null;
  if (inMedia) {
    candidates.push({ abs: inMedia, what: "the base game" });
  }

  for (const c of candidates) {
    const casing = tailCasing(c.abs, depth);
    if (casing) {
      return { casing: casing, what: c.what };
    }
  }
  return null;
}

/**
 * Why a value is not a usable web link, or null if it is one.
 *
 * Parsed with the WHATWG URL parser rather than matched against a pattern, so
 * "https://" and "forums.planetaryannihilation.com" are both rejected for the
 * right reason and can be reported as such.
 *
 * @returns {{title: string, why: string}|null}
 */
function urlProblem(value) {
  if (typeof value !== "string") {
    return {
      title: "not a string",
      why: "Found " + (value === null ? "null" : typeof value) + " instead.",
    };
  }
  if (value.length === 0) {
    return { title: "empty", why: "An empty string carries no address." };
  }
  if (value.trim().length === 0) {
    return { title: "whitespace only", why: "A blank string carries no address." };
  }
  if (value !== value.trim()) {
    return {
      title: "padded with whitespace",
      why: "The URL itself is fine, but the surrounding whitespace is almost certainly unintended.",
    };
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return {
      title: "not a URL",
      why: "It does not parse as one — a link needs a scheme, eg https://.",
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      title: "not an http(s) URL",
      why: 'The scheme is "' + parsed.protocol.replace(":", "") + '", which a browser will not open as a forum link.',
    };
  }
  // A public forum post lives on a domain. A schemeless host, or a hostname with
  // no dot, cannot be one.
  if (!parsed.hostname.includes(".")) {
    return {
      title: "not pointing at a domain",
      why: '"' + parsed.hostname + '" is not a domain name, so the link resolves nowhere for other players.',
    };
  }

  return null;
}

function checkPackaging(files, info, ctx) {
  const F = ctx.findings;
  const root = ctx.modRoot;

  for (const abs of files) {
    const relPath = rel(root, abs);
    if (isConventionalDoc(relPath)) {
      continue;
    }
    // The casing rule applies to mod-owned paths. A shadow instead has to match
    // whatever its origin uses — another mod's casing counts as much as the base
    // game's, since a shadow that does not match overrides nothing on a
    // case-sensitive filesystem. With no origin found, assume lowercase.
    if (/[A-Z]/.test(relPath)) {
      const origin = shadowOrigin(relPath, ctx);
      if (origin && origin.casing === relPath) {
        // Matches its origin exactly. Correct as it stands.
        continue;
      }
      if (origin) {
        F.add({
          severity: "CONCERN",
          check: "packaging.uppercase-path",
          file: relPath,
          title: "Shadow does not match the casing of the file it overrides",
          detail: origin.what + " spells it " + origin.casing + ".",
          why:
            "A shadow only overrides the original when the path matches exactly. Windows resolves paths case-insensitively, so this works for the author and silently overrides nothing for players on Linux and macOS — they get the original file, and the mod appears to do nothing for this unit.",
          fix: "Rename to " + origin.casing + " to match " + origin.what + ".",
        });
        continue;
      }
      F.add({
        severity: "COMPLIANCE",
        check: "packaging.uppercase-path",
        file: relPath,
        title: "Path contains uppercase characters",
        why: "The Mod Structure reference requires mod files to use lowercase names. Windows resolves paths case-insensitively, so an uppercase path works for the author and can fail for players on Linux and macOS. No origin file was found for this path, so the lowercase rule applies rather than the shadow-casing exception — if it does shadow a mod that is not installed here, confirm the casing against that mod.",
        fix: "Rename to lowercase, and update every reference to it.",
      });
    }
  }

  // `forum` is a link the mod browser renders, so the only correct value is a
  // working URL. Anything else — empty, whitespace, a bare domain, a forum name
  // in prose — loads and runs perfectly well; what it costs is acceptance, which
  // is what Compliance covers. The key being absent altogether stays with
  // modinfo.required-key, so one defect is still one finding.
  if (info.forum !== undefined) {
    const problem = urlProblem(info.forum);
    if (problem) {
      F.add({
        severity: "COMPLIANCE",
        check: "packaging.forum-url",
        file: "modinfo.json",
        title: "`forum` is " + problem.title,
        detail: "Found " + JSON.stringify(info.forum) + ".",
        why:
          "The Mod Structure reference lists `forum` as Required and types it as the URL to the mod's forum post in the mods section. " +
          problem.why +
          " The in-game mod browser links to this value, and a mod submitted without a reachable forum post is rejected.",
        fix: 'Set "forum" to the full https:// URL of the release post, eg "https://forums.planetaryannihilation.com/threads/your-mod.12345/".',
      });
    }
  }

  if (typeof info.icon === "string" && info.icon.length && !/^https?:\/\//i.test(info.icon)) {
    F.add({
      severity: "COMPLIANCE",
      check: "packaging.icon-url",
      file: "modinfo.json",
      title: "`icon` is not a URL",
      detail: info.icon,
      why:
        "`icon` is documented as a URL to a 300x300px image (PNG8/alpha, GIF or JPG). A local path does not render in the mod browser.",
      fix: "Host the icon and use its https:// URL, eg the raw URL from your GitHub repository.",
    });
  }

  if (typeof info.github === "string" && info.github.length && !/^https?:\/\//i.test(info.github)) {
    F.add({
      severity: "COMPLIANCE",
      check: "packaging.github-url",
      file: "modinfo.json",
      title: "`github` is not a URL",
      detail: info.github,
      why: "`github` is documented as a URL to the GitHub repository.",
      fix: "Use the full https:// repository URL.",
    });
  }
}

/**
 * A mod should never ship a `pa_ex1/` directory.
 *
 * `content/` and `content_ex1/` are both engine-side source directories that
 * mount to the SAME virtual path, `/pa/` — the expansion overlaying the base.
 * There is no `/pa_ex1/` mount point, so files a mod ships under `pa_ex1/` sit
 * at a path nothing ever reads.
 *
 * Overriding a TITANS-only file is done by shipping it under `pa/` at the same
 * relative path. Legion Expansion overrides the TITANS-only
 * pa_ex1/units/air/strafer/strafer_ammo_trail.pfx by shipping
 * pa/units/air/strafer/strafer_ammo_trail.pfx — and none of the four reference
 * mods ships a pa_ex1 directory at all.
 */
function checkExpansionDir(files, ctx) {
  const F = ctx.findings;
  const offenders = files
    .map(function (abs) {
      return rel(ctx.modRoot, abs);
    })
    .filter(function (r) {
      return r.startsWith("pa_ex1/");
    });

  if (offenders.length === 0) {
    return;
  }

  const shown = offenders.slice(0, 6);
  F.add({
    severity: "QUALITY",
    check: "packaging.pa-ex1-directory",
    file: "pa_ex1",
    title:
      offenders.length +
      " file" +
      (offenders.length === 1 ? "" : "s") +
      " shipped under `pa_ex1/`, which the game does not mount",
    detail:
      shown.join(", ") +
      (offenders.length > shown.length
        ? ", and " + (offenders.length - shown.length) + " more"
        : ""),
    why:
      "The base game's content/ and content_ex1/ directories both mount to the same virtual path, /pa/ — the TITANS expansion overlays the base rather than sitting beside it. There is no /pa_ex1/ mount, so a mod's pa_ex1/ folder places files where nothing reads them. They are dead weight in the download, and any override intended by putting them there does not take effect.",
    fix:
      "Move these under `pa/` at the same relative path. That is how a TITANS-only file is overridden: Legion Expansion overrides pa_ex1/units/air/strafer/strafer_ammo_trail.pfx by shipping pa/units/air/strafer/strafer_ammo_trail.pfx.",
  });
}

function checkConduct(files, info, ctx) {
  const F = ctx.findings;
  const root = ctx.modRoot;
  const fs = require("node:fs");

  for (const abs of files) {
    if (path.extname(abs).toLowerCase() !== ".js") {
      continue;
    }
    const relPath = rel(root, abs);
    let masked;
    try {
      masked = tokenise(fs.readFileSync(abs, "utf8")).masked;
    } catch {
      continue;
    }

    for (const p of PRIVACY_PATTERNS) {
      if (p.re.test(masked)) {
        F.add({
          severity: "COMPLIANCE",
          check: "conduct.privacy",
          file: relPath,
          title: "References " + p.what,
          why:
            "The published modding standards prohibit remotely harvesting, collecting or tracking user information, and specifically prohibit associating or tracking IP addresses. Violating mods are removed and their creators permanently banned. Player identity should use UberIds, which identify a user without carrying personal information.",
          fix:
            "Remove the IP handling. If you need to identify a player, use their UberId.",
        });
        break;
      }
    }

    // Outbound requests are legitimate in many mods, so this is a prompt to
    // confirm what is being sent rather than an accusation.
    for (const p of EXFIL_PATTERNS) {
      if (p.re.test(masked)) {
        F.add({
          severity: "CONCERN",
          check: "conduct.outbound",
          file: relPath,
          title: "Uses " + p.what,
          why:
            "Outbound requests are legitimate for fetching mod data, but the modding standards prohibit sending user information off the client. This needs confirming rather than assuming either way.",
          fix:
            "Confirm no user-identifying data is transmitted, and document what the request sends and to where.",
        });
        break;
      }
    }
  }

  if (info.context === "server") {
    F.add({
      severity: "UNVERIFIED",
      check: "conduct.server-restrictions",
      file: "modinfo.json",
      title: "Server mod conduct rules need manual confirmation",
      why:
        "Server mods must not install outside the current game, change user settings or data without permission, take over PA (eg fullscreen with no cancel), prevent players leaving a game, or show inappropriate content. Badly behaved server mods are terminated by administrators. None of these can be established by static analysis.",
      fix:
        "Confirm each of the five restrictions by inspection before submitting.",
    });
  }
}

module.exports = { checkPackaging, checkConduct, checkExpansionDir };
