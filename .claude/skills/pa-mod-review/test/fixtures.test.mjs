// Regression tests. Run with:  node --test
//
// Two things are being protected here:
//   1. that real defects are caught, with the right severity
//   2. that the tokeniser does NOT flag code-shaped text inside comments and
//      strings — the failure mode that would destroy trust in the tool fastest

import { test, describe } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const LIB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib");

const { checkJs } = require(path.join(LIB, "chrome40.js"));
const { lintJson, findDuplicateKeys } = require(path.join(LIB, "json-lint.js"));
const { tokenise } = require(path.join(LIB, "tokenise.js"));
const { VALID_SCENES, GLOBAL_MOD_LIST } = require(path.join(LIB, "scenes.js"));
const { checkModinfo } = require(path.join(LIB, "modinfo.js"));
const { checkPackaging } = require(path.join(LIB, "compliance.js"));
const { Findings } = require(path.join(LIB, "util.js"));

function checks(findings) {
  return findings.map(function (f) {
    return f.check;
  });
}

function severityOf(findings, check) {
  const hit = findings.find(function (f) {
    return f.check === check;
  });
  return hit ? hit.severity : null;
}

describe("tokeniser — must not flag code-shaped text in comments or strings", () => {
  test("the real GW-AI-Overhaul comment does not report a `let` Blocker", () => {
    // Verbatim from cards/gwaio_start_paratrooper.js:90 in a gold-standard mod.
    // A naive regex reports a Blocker here. It must stay silent.
    const src = [
      "define([], function () {",
      "  // Don't let the Pelican carry the Manhattan",
      "  var x = 1;",
      "  return x;",
      "});",
    ].join("\n");
    assert.deepStrictEqual(checkJs(src, "t.js"), []);
  });

  test("arrow, let, const and backticks inside strings are ignored", () => {
    const src = [
      'var a = "() => {} let x const y `tpl`";',
      "var b = 'let z = 1';",
      "// var c = () => 1; let q;",
      "/* let r = `x`; */",
    ].join("\n");
    assert.deepStrictEqual(checkJs(src, "t.js"), []);
  });

  test("a regex literal containing a slash does not swallow the file", () => {
    const src = ["var re = /a\\/b[/]c/g;", "var arrow = 1;"].join("\n");
    assert.deepStrictEqual(checkJs(src, "t.js"), []);
  });

  test("division is not mistaken for a regex", () => {
    const src = "var a = 10; var b = 2; var c = a / b; var d = (a + b) / 2;";
    assert.deepStrictEqual(checkJs(src, "t.js"), []);
  });

  test("offsets are preserved so line numbers stay accurate", () => {
    const src = ["// comment", "/* block", "   comment */", "var x = () => 1;"].join("\n");
    const found = checkJs(src, "t.js");
    const arrow = found.find(function (f) {
      return f.check === "js.chrome40.arrow";
    });
    assert.strictEqual(arrow.line, 4);
  });
});

describe("Chrome 40 syntax", () => {
  test("`let` is a Blocker", () => {
    const found = checkJs("let x = 1;", "t.js");
    assert.strictEqual(severityOf(found, "js.chrome40.let"), "BLOCKER");
  });

  test("`const` is an Area of Concern, not a Blocker", () => {
    const found = checkJs("const x = 1;", "t.js");
    assert.strictEqual(severityOf(found, "js.chrome40.const"), "CONCERN");
  });

  test("arrow functions and template literals are Blockers", () => {
    assert.strictEqual(severityOf(checkJs("var f = () => 1;", "t.js"), "js.chrome40.arrow"), "BLOCKER");
    assert.strictEqual(
      severityOf(checkJs("var s = `hi`;", "t.js"), "js.chrome40.template-literal"),
      "BLOCKER"
    );
  });

  test("Object.assign is a Bug, not a Blocker — the file still parses", () => {
    const found = checkJs("Object.assign({}, {});", "t.js");
    assert.strictEqual(severityOf(found, "js.chrome40.missing-api"), "BUG");
  });

  test("lodash receivers are not reported as missing prototype methods", () => {
    assert.deepStrictEqual(checkJs("_.find(list, fn); _.includes(list, x);", "t.js"), []);
  });

  test("a syntax error is a Blocker and suppresses further scanning", () => {
    const found = checkJs("function broken( {", "t.js");
    assert.strictEqual(found.length, 1);
    assert.strictEqual(found[0].check, "js.parse");
    assert.strictEqual(found[0].severity, "BLOCKER");
  });

  test("duplicate top-level var is a Bug; the same name in separate functions is not", () => {
    assert.ok(checks(checkJs("var a = 1;\nvar a = 2;", "t.js")).includes("duplicate-top-level-var")
      || checks(checkJs("var a = 1;\nvar a = 2;", "t.js")).includes("js.chrome40.duplicate-top-level-var"));
    assert.deepStrictEqual(
      checkJs("function f() { var a = 1; }\nfunction g() { var a = 2; }", "t.js"),
      []
    );
  });

  test("missing try/catch is never reported", () => {
    const found = checkJs("var x = 1; doSomething();", "t.js");
    assert.deepStrictEqual(found, []);
  });
});

describe("JSON completeness", () => {
  test("a trailing comma is caught with a line number", () => {
    const r = lintJson('{\n  "a": 1,\n}');
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.issues[0].kind, "parse");
    assert.ok(r.issues[0].line >= 1);
  });

  test("a missing comma is caught", () => {
    const r = lintJson('{\n  "a": 1\n  "b": 2\n}');
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.issues[0].kind, "parse");
  });

  test("a UTF-8 BOM is caught even though the JSON is otherwise valid", () => {
    const r = lintJson('﻿{"a": 1}');
    assert.ok(r.issues.some((i) => i.kind === "bom"));
  });

  test("a duplicate key is caught even though JSON.parse accepts it", () => {
    const text = '{\n  "a": 1,\n  "b": 2,\n  "a": 3\n}';
    assert.strictEqual(JSON.parse(text).a, 3); // parses fine, last wins, silently
    const r = lintJson(text);
    assert.strictEqual(r.ok, true);
    const dupe = r.issues.find((i) => i.kind === "duplicate-key");
    assert.strictEqual(dupe.key, "a");
    assert.strictEqual(dupe.firstLine, 2);
    assert.strictEqual(dupe.line, 4);
  });

  test("the same key name in sibling objects is not a duplicate", () => {
    assert.deepStrictEqual(findDuplicateKeys('{"x": {"a": 1}, "y": {"a": 2}}'), []);
  });

  test("a key name repeated inside an array of objects is not a duplicate", () => {
    assert.deepStrictEqual(findDuplicateKeys('{"list": [{"a": 1}, {"a": 2}]}'), []);
  });

  test("a key-like string used as a value is not a duplicate", () => {
    assert.deepStrictEqual(findDuplicateKeys('{"a": "a", "b": "a"}'), []);
  });
});

describe("packaging casing — a shadow follows its origin, everything else is lowercase", () => {
  // Real directories, because the check reads casing back off the directory
  // entry rather than trusting exists(): on Windows a case-insensitive hit
  // would otherwise pass for a name that does not actually match.
  function tree(spec) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pa-mod-review-"));
    for (const relPath of spec) {
      const abs = path.join(root, relPath.split("/").join(path.sep));
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "{}");
    }
    return root;
  }

  function casing(modFiles, ctx) {
    const modRoot = tree(modFiles);
    const F = new Findings();
    checkPackaging(
      modFiles.map((f) => path.join(modRoot, f.split("/").join(path.sep))),
      {},
      Object.assign({ findings: F, modRoot: modRoot }, ctx)
    );
    return F.items.filter((f) => f.check === "packaging.uppercase-path");
  }

  test("a mod shadow matching another mod's casing is not reported", () => {
    const origin = tree(["pa/units/land/nsdf_turret/weapon_Minigun.json"]);
    const hits = casing(["pa/units/land/nsdf_turret/weapon_Minigun.json"], {
      siblings: [{ identifier: "com.pa.someone.nsdf", root: origin }],
    });
    assert.deepStrictEqual(hits, []);
  });

  test("a mod shadow whose casing differs from the origin is an Area of Concern", () => {
    const origin = tree(["pa/units/land/nsdf_turret/weapon_minigun.json"]);
    const hits = casing(["pa/units/land/nsdf_turret/weapon_Minigun.json"], {
      siblings: [{ identifier: "com.pa.someone.nsdf", root: origin }],
    });
    assert.strictEqual(hits.length, 1);
    assert.strictEqual(hits[0].severity, "CONCERN");
    assert.ok(hits[0].fix.includes("weapon_minigun.json"));
  });

  test("an uppercase path with no origin anywhere is held to the lowercase rule", () => {
    // The mod's own generated namespace. Nothing to match, so lowercase applies.
    const hits = casing(["pa/units/my_generated/weapon_Minigun_2x.json"], { siblings: [] });
    assert.strictEqual(hits.length, 1);
    assert.strictEqual(hits[0].severity, "COMPLIANCE");
  });

  test("a base-game shadow matching the base game's casing is not reported", () => {
    const media = tree(["pa/units/land/x/anim_aimUp.papa"]);
    const hits = casing(["pa/units/land/x/anim_aimUp.papa"], { media: media });
    assert.deepStrictEqual(hits, []);
  });

  test("the pa_ex1 overlay counts as an origin for a pa/ path", () => {
    // TITANS content is addressed as /pa/... but ships in media/pa_ex1/.
    const media = tree(["pa_ex1/units/land/x/anim_aimUp.papa"]);
    const hits = casing(["pa/units/land/x/anim_aimUp.papa"], { media: media });
    assert.deepStrictEqual(hits, []);
  });

  test("documentation is exempt whatever it is called", () => {
    const hits = casing(["CREDITS_AND_LICENSES.txt", "INSTALL_NOTES.md", "README.md"], {});
    assert.deepStrictEqual(hits, []);
  });

  test("an uppercase name under a content tree is not exempted by a doc extension", () => {
    const hits = casing(["ui/mods/x/Notes.md"], {});
    assert.strictEqual(hits.length, 1);
  });
});

describe("modinfo `forum` — the only valid value is a working URL", () => {
  function forumSeverity(forum) {
    const F = new Findings();
    checkPackaging([], { forum: forum }, { findings: F, modRoot: "." });
    return severityOf(F.items, "packaging.forum-url");
  }

  const BAD = [
    ["an empty string", ""],
    ["whitespace only", "   "],
    ["a URL padded with whitespace", " https://forums.planetaryannihilation.com/threads/x.1/ "],
    ["a bare domain with no scheme", "forums.planetaryannihilation.com/threads/x.1/"],
    ["a scheme with no host", "https://"],
    ["a non-http scheme", "ftp://forums.planetaryannihilation.com/x"],
    ["a host that is not a domain", "https://localhost/threads/x.1/"],
    ["prose rather than a link", "see the Titans Released forum"],
    ["null", null],
    ["a number", 42],
  ];

  for (const [what, value] of BAD) {
    test(what + " is a Compliance finding", () => {
      // A dead forum link loads and runs. What it costs is acceptance.
      assert.strictEqual(forumSeverity(value), "COMPLIANCE");
    });
  }

  test("a real forum URL is clean", () => {
    assert.strictEqual(
      forumSeverity("https://forums.planetaryannihilation.com/threads/gw-ai-overhaul.68907/"),
      null
    );
  });

  test("http is accepted as well as https", () => {
    assert.strictEqual(forumSeverity("http://forums.planetaryannihilation.com/threads/x.1/"), null);
  });

  test("an absent `forum` is reported once, as a missing required key", () => {
    const F = new Findings();
    checkModinfo({}, { findings: F });
    checkPackaging([], {}, { findings: F, modRoot: "." });
    assert.strictEqual(severityOf(F.items, "packaging.forum-url"), null);
    assert.ok(checks(F.items).includes("modinfo.required-key"));
  });

  test("`forum` is not also reported by the modinfo pass", () => {
    // One defect, one finding. checkModinfo deliberately leaves the value's
    // shape to the compliance pass.
    const F = new Findings();
    checkModinfo({ forum: "" }, { findings: F });
    assert.deepStrictEqual(
      checks(F.items).filter((c) => c.includes("forum")),
      []
    );
  });
});

describe("the manifest under review is the mod's final form", () => {
  test("a missing required key is a Blocker even in a source tree", () => {
    // No build script is assumed to inject anything later, so the presence of
    // overlay roots must not downgrade the finding.
    const F = new Findings();
    checkModinfo({}, { findings: F, overlayRoots: ["/some/shared"], isSourceTree: true });
    assert.strictEqual(severityOf(F.items, "modinfo.required-key"), "BLOCKER");
  });
});

describe("scene list", () => {
  test("holds the 59 engine-derived scene keys", () => {
    assert.strictEqual(VALID_SCENES.size, 59);
  });

  test("includes keys from both call forms", () => {
    // loadMods(scene_mod_list['x'])
    assert.ok(VALID_SCENES.has("gw_play"));
    assert.ok(VALID_SCENES.has("live_game_players"));
    // loadSceneMods('x')
    assert.ok(VALID_SCENES.has("start"));
    assert.ok(VALID_SCENES.has("new_game"));
    assert.ok(VALID_SCENES.has("gw_coop_per_player_loadout"));
  });

  test("global_mod_list is not treated as a scene", () => {
    assert.ok(!VALID_SCENES.has(GLOBAL_MOD_LIST));
  });

  test("panel-level names are distinct from their parent scene", () => {
    assert.ok(VALID_SCENES.has("live_game"));
    assert.ok(VALID_SCENES.has("live_game_build_bar"));
  });
});

describe("particle vocabulary — documented keys, base-game additions, base-game typos", () => {
  const keys = require(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "references", "pfx-keys.json")
  );

  test("documented camelCase keys are accepted", () => {
    for (const k of ["lifetimeRange", "offsetY", "emissionBursts", "sizeRangeX"]) {
      assert.ok(keys.emitterKeys.includes(k), k + " should be accepted vocabulary");
    }
  });

  test("case variants of documented keys are NOT accepted", () => {
    // The base game uses camelCase exclusively: lifetimeRange appears in 113
    // files and lifetimerange in 0. Key lookup is exact — which is why PA's own
    // artists disable a key by prefixing it `_` or `temp_`.
    for (const k of ["lifetimerange", "OffsetY", "emissionbursts", "velocityRangey"]) {
      assert.ok(!keys.emitterKeys.includes(k), k + " must not be accepted vocabulary");
    }
  });

  test("undocumented keys the base game genuinely uses ARE accepted", () => {
    for (const k of ["sort", "label", "panRate", "pathRadius", "loopStart"]) {
      assert.ok(keys.emitterKeys.includes(k), k + " is real base-game vocabulary");
    }
  });

  test("the base game's own typos are quarantined, not absorbed", () => {
    // Absorbing these would mean never catching them in a mod.
    for (const k of ["emissionBurts", "velcotiyRangeZ", "sizeRageY", "loopstart"]) {
      assert.ok(
        keys.suspectKeys.emitter.includes(k),
        k + " is a base-game typo and must be quarantined"
      );
      assert.ok(!keys.emitterKeys.includes(k), k + " must not be accepted vocabulary");
    }
    for (const k of ["sixeX", "sixeY", "camera_push"]) {
      assert.ok(keys.suspectKeys.spec.includes(k), k + " is a base-game spec typo");
    }
  });

  test("loopStart is kept because it outnumbers the documented startLoop", () => {
    // 15 base-game files vs 8 for startLoop. An absolute-count threshold would
    // wrongly call the more common spelling a mistake.
    assert.ok(keys.emitterKeys.includes("loopStart"));
    assert.ok(!keys.suspectKeys.emitter.includes("loopStart"));
  });

  test("TORUS is accepted as an emitter type despite being undocumented", () => {
    assert.ok(keys.enums.type.map((t) => t.toUpperCase()).includes("TORUS"));
  });
});

describe("unreferenced files — must not cry wolf", () => {
  const {
    collectReferences,
    isReferenced,
    isExcluded,
    isCompanionAsset,
  } = require(path.join(LIB, "unreferenced.js"));

  // Minimal in-memory harness: collectReferences reads real files, so build the
  // reference sets by hand to test the matching rules in isolation.
  function refsFrom(tokens) {
    const paths = new Set();
    const basenames = new Set();
    const stems = new Set();
    const prefixes = new Set();
    for (const t of tokens) {
      const clean = t.replace(/^\/+/, "").toLowerCase();
      paths.add(clean);
      const base = clean.split("/").pop();
      basenames.add(base);
      const dot = base.lastIndexOf(".");
      stems.add(dot > 0 ? base.slice(0, dot) : base);
      if (base.length >= 5) {
        prefixes.add(base);
      }
    }
    return { paths, basenames, stems, prefixes };
  }

  test("a full path reference counts", () => {
    const refs = refsFrom(["ui/mods/x/foo.js"]);
    assert.ok(isReferenced("ui/mods/x/foo.js", refs));
  });

  test("a bare id with no extension counts — GW loads cards this way", () => {
    // GW-AI-Overhaul's 168 gwaio_* cards are named only as "gwaio_anti_air".
    const refs = refsFrom(["gwaio_anti_air"]);
    assert.ok(isReferenced("ui/main/game/galactic_war/cards/gwaio_anti_air.js", refs));
  });

  test("a concatenated prefix counts — 'icon_faction_' + n + '.png'", () => {
    const refs = refsFrom(["icon_faction_"]);
    assert.ok(isReferenced("ui/main/game/galactic_war/shared/img/icon_faction_4.png", refs));
  });

  test("a short token does not match everything", () => {
    const refs = refsFrom(["ico"]);
    assert.ok(!isReferenced("ui/img/icon_faction_4.png", refs));
  });

  test("an unrelated file is still reported", () => {
    const refs = refsFrom(["ui/mods/x/foo.js"]);
    assert.ok(!isReferenced("ui/mods/x/orphan.png", refs));
  });

  test("pa/ai* is excluded — PA enumerates it rather than referencing it", () => {
    assert.ok(isExcluded("pa/ai/fabber_builds/legion_x.json"));
    assert.ok(isExcluded("pa/ai_penchant/unit_maps/x.json"));
    assert.ok(isExcluded("pa_ex1/ai_queller/x.json"));
    assert.ok(!isExcluded("pa/units/land/x/x.json"));
  });

  test("documentation and dev tooling are excluded", () => {
    for (const f of ["README.md", "CLAUDE.md", "package.json", "eslint.config.mjs",
                     "sonar-project.properties", ".gitignore", "modinfo.json"]) {
      assert.ok(isExcluded(f), f + " should be excluded");
    }
  });

  test("texture companions of a referenced model are excluded", () => {
    const refs = refsFrom(["/pa/units/land/l_mex/l_mex.papa"]);
    const shipped = new Set(["pa/units/land/l_mex/l_mex.papa"]);
    assert.ok(isCompanionAsset("pa/units/land/l_mex/l_mex_diffuse.papa", refs, shipped));
    assert.ok(isCompanionAsset("pa/units/land/l_mex/l_mex_material.papa", refs, shipped));
    // ...but not when the owning model is itself absent or unreferenced.
    assert.ok(!isCompanionAsset("pa/units/land/l_other/l_other_diffuse.papa", refs, new Set()));
  });
});

describe("calibration against the shipped base game", () => {
  // Every rule below was wrong until audited against PA's own content. The base
  // game is by definition code that works, so a rule that fires on it heavily
  // would fire on a correct mod too. These lock in the corrections.

  test("`async` as an ordinary identifier is not a Blocker", () => {
    // async/await are not reserved in ES5. The base game has all of these.
    assert.deepStrictEqual(checkJs("var async = function () { return 1; };", "t.js"), []);
    assert.deepStrictEqual(checkJs("var o = { async : opts.getAsync };", "t.js"), []);
    assert.deepStrictEqual(
      checkJs('this.async = typeof async == "boolean" ? async : true;', "t.js"),
      []
    );
  });

  test("real async syntax is still a Blocker", () => {
    assert.strictEqual(
      severityOf(checkJs("async function f() {}", "t.js"), "js.chrome40.async"),
      "BLOCKER"
    );
  });

  test("startsWith and endsWith are not reported — PA polyfills them", () => {
    // ui/main/shared/js/helpers.js:130-142 defines both, guarded by
    // `typeof String.prototype.x !== 'function'`. The base game relies on them.
    assert.deepStrictEqual(checkJs("if (s.startsWith('!LOC:')) { x(); }", "t.js"), []);
    assert.deepStrictEqual(checkJs("if (s.endsWith('.png')) { x(); }", "t.js"), []);
  });

  test("jQuery and canvas method names are not reported", () => {
    // These were 24 out of 24 false positives against the base game.
    assert.deepStrictEqual(checkJs("$(content).find('a').each(fn);", "t.js"), []);
    assert.deepStrictEqual(checkJs("this.$element.find('input');", "t.js"), []);
    assert.deepStrictEqual(checkJs("ctx.fill();", "t.js"), []);
  });

  test("unambiguous static APIs are still Bugs", () => {
    assert.strictEqual(
      severityOf(checkJs("Object.assign({}, x);", "t.js"), "js.chrome40.missing-api"),
      "BUG"
    );
    assert.strictEqual(
      severityOf(checkJs("Array.from(x);", "t.js"), "js.chrome40.missing-api"),
      "BUG"
    );
  });

  test("scope-sensitive checks are skipped on minified bundles", () => {
    // Brace-depth tracking is meaningless on one 3000-character line, and it
    // produced false duplicate-var findings against easeljs.min.js.
    const minified = "var a=1;" + "var b=function(c){return c};".repeat(200);
    const found = checkJs(minified, "lib.min.js").map((f) => f.check);
    assert.ok(!found.includes("js.chrome40.duplicate-top-level-var"));
  });
});

describe("tokenise output shape", () => {
  test("masked text has the same length as the source", () => {
    const src = 'var a = "hello"; // note\n/* b */ var c = 1;';
    assert.strictEqual(tokenise(src).masked.length, src.length);
  });

  test("newlines survive masking so line numbers hold", () => {
    const src = "/* one\ntwo\nthree */\nvar x = 1;";
    const masked = tokenise(src).masked;
    assert.strictEqual((masked.match(/\n/g) || []).length, 3);
  });
});
