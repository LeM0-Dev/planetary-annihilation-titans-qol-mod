"use strict";
// JavaScript completeness, levels 1-3.
//
// PA's UI runs on Coherent UI, which embeds Chromium 40. Node's parser accepts
// far more than that, so "it parses here" proves nothing. Every scan below runs
// on tokenised source (comments/strings/templates/regex masked out).
//
// Severity rationale:
//   syntax Chrome 40 rejects -> Blocker. The file fails to parse, so NOTHING in
//     it runs; this is not a style preference.
//   runtime API Chrome 40 lacks -> Bug. The file runs until the call is reached.
//   `const` -> Area of Concern. Chrome 40's `const` is the legacy V8 extension:
//     function-scoped, not block-scoped, so it does not create a fresh binding
//     per loop iteration. It parses and usually looks fine, which is what makes
//     it worth surfacing.

const vm = require("node:vm");
const { tokenise } = require("./tokenise.js");
const { offsetToLineCol } = require("./util.js");

// Chrome version in which each construct first shipped. Anything above 40 is
// unavailable to PA.
const SYNTAX_RULES = [
  {
    id: "let",
    re: /(^|[^\w.$])let\s+[A-Za-z_$[{]/g,
    offset: 1,
    severity: "BLOCKER",
    title: "`let` is not supported by Chrome 40",
    why:
      "Chrome 40 accepts `let` only in strict mode. PA scene files are classic, non-strict scripts, so this is a SyntaxError and the entire file fails to parse — nothing in it runs.",
    fix: "Use `var`.",
  },
  {
    id: "const",
    re: /(^|[^\w.$])const\s+[A-Za-z_$]/g,
    offset: 1,
    severity: "CONCERN",
    title: "`const` uses legacy function-scoped semantics in Chrome 40",
    why:
      "Chrome 40 implements `const` as the pre-ES6 V8 extension: function-scoped rather than block-scoped, so it does not create a fresh binding per iteration and is unreliable as a loop variable. Reassignment fails silently instead of throwing.",
    fix:
      "Use `var`, and confirm no `const` is declared inside a loop body or relied on for block scoping.",
  },
  {
    id: "arrow",
    re: /=>/g,
    offset: 0,
    severity: "BLOCKER",
    title: "Arrow function is not supported by Chrome 40",
    why:
      "Arrow functions shipped in Chrome 45. In Chrome 40 this is a SyntaxError and the whole file fails to parse.",
    fix: "Use `function () { ... }`, binding `this` via a `self` variable if needed.",
  },
  {
    id: "class",
    re: /(^|[^\w.$])class\s+[A-Za-z_$]/g,
    offset: 1,
    severity: "BLOCKER",
    title: "`class` is not supported by Chrome 40",
    why:
      "Class syntax shipped in Chrome 42. In Chrome 40 this is a SyntaxError and the whole file fails to parse.",
    fix: "Use a constructor function and prototype assignment.",
  },
  {
    id: "spread",
    re: /\.\.\./g,
    offset: 0,
    severity: "BLOCKER",
    title: "Spread/rest syntax is not supported by Chrome 40",
    why:
      "Array spread shipped in Chrome 46 and rest parameters in Chrome 47. In Chrome 40 this is a SyntaxError and the whole file fails to parse.",
    fix:
      "Use `arguments`, `Function.prototype.apply`, or `Array.prototype.slice.call`.",
  },
  {
    // `async` and `await` are NOT reserved words in ES5, and the base game uses
    // `async` as an ordinary identifier — `var async = function () {`,
    // `async : options.getAsync`. Matching the bare word reports six Blockers
    // against shipped, working code. Only the actual syntax counts.
    id: "async",
    re: /(^|[^\w.$])(async\s+function|async\s*\([^)]*\)\s*=>|await\s+[A-Za-z_$([{'"])/g,
    offset: 1,
    severity: "BLOCKER",
    title: "`async`/`await` is not supported by Chrome 40",
    why:
      "Async functions shipped in Chrome 55. In Chrome 40 this is a SyntaxError and the whole file fails to parse.",
    fix: "Use `Promise` chains, which Chrome 40 does support.",
  },
  {
    id: "destructuring",
    re: /(^|[^\w.$])var\s*[[{]/g,
    offset: 1,
    severity: "BLOCKER",
    title: "Destructuring assignment is not supported by Chrome 40",
    why:
      "Destructuring shipped in Chrome 49. In Chrome 40 this is a SyntaxError and the whole file fails to parse.",
    fix: "Assign each property or index to its own `var`.",
  },
];

// Unambiguous static references: the receiver is a built-in, so a hit is real.
const MISSING_STATIC_APIS = [
  ["Object.assign", 45],
  ["Object.entries", 54],
  ["Object.values", 54],
  ["Object.getOwnPropertyDescriptors", 54],
  ["Array.from", 45],
  ["Array.of", 45],
  ["String.raw", 41],
  ["Number.isSafeInteger", 41],
];

// There is deliberately NO prototype-method check.
//
// Chrome 40 genuinely lacks Array.prototype.find/includes/fill and
// String.prototype.repeat/padStart. But whether a call is dangerous depends
// entirely on the receiver's type, which cannot be established without full type
// analysis — and the names collide with jQuery and canvas:
//
//   $(content).find('a')          jQuery, fine
//   this.$element.find('input')   jQuery, fine
//   ctx.fill()                    canvas, fine
//
// Auditing the shipped base game, every single one of the 24 hits was a false
// positive of exactly this kind. A check that is wrong 24 times out of 24 on
// known-good code is worse than no check, so it was removed rather than tuned.
//
// Separately, String.prototype.startsWith and endsWith ARE safe in PA despite
// Chrome 40 lacking them: the game polyfills both in
// ui/main/shared/js/helpers.js:130-142, guarded by
// `typeof String.prototype.x !== 'function'`. That block contains exactly those
// two and nothing else.
//
// The static checks below survive because their receiver is a built-in
// namespace, so a hit is unambiguous. They produced zero findings across 347
// base-game scripts.

function scanSyntax(masked, push) {
  for (const rule of SYNTAX_RULES) {
    rule.re.lastIndex = 0;
    let m = rule.re.exec(masked);
    while (m) {
      const at = m.index + (m[1] ? m[1].length : rule.offset);
      push(rule, at);
      m = rule.re.exec(masked);
    }
  }
}

function scanDefaultParams(masked, push) {
  const re = /function\s*[\w$]*\s*\(([^()]*)\)/g;
  let m = re.exec(masked);
  while (m) {
    const params = m[1];
    // An `=` in a parameter list that is not part of a comparison operator.
    if (/[^=!<>]=[^=]/.test(params)) {
      push(
        {
          id: "default-params",
          severity: "BLOCKER",
          title: "Default parameter value is not supported by Chrome 40",
          why:
            "Default parameters shipped in Chrome 49. In Chrome 40 this is a SyntaxError and the whole file fails to parse.",
          fix:
            "Assign the fallback inside the function body: `if (x === undefined) { x = ...; }`.",
        },
        m.index
      );
    }
    m = re.exec(masked);
  }
}

function scanMissingApis(masked, push) {
  for (const entry of MISSING_STATIC_APIS) {
    const name = entry[0];
    const since = entry[1];
    const re = new RegExp("(^|[^\\w.$])" + name.replace(".", "\\.") + "\\s*\\(", "g");
    let m = re.exec(masked);
    while (m) {
      push(
        {
          id: "missing-api",
          severity: "BUG",
          title: name + "() does not exist in Chrome 40",
          why:
            name +
            " shipped in Chrome " +
            since +
            ". The file parses and runs until this line, then throws a TypeError.",
          fix:
            "Use the lodash 3.9.3 equivalent (PA ships lodash globally as `_`) or hand-roll it.",
        },
        m.index + (m[1] ? m[1].length : 0)
      );
      m = re.exec(masked);
    }
  }

}

/** Top-level `var` collisions. PA scene scripts share one global scope. */
function scanTopLevelVars(masked, push) {
  const seen = new Map();
  const re = /(^|[^\w.$])var\s+([A-Za-z_$][\w$]*)/g;
  let m = re.exec(masked);
  while (m) {
    // Only depth 0 matters: that is the shared global scope.
    const upto = masked.slice(0, m.index);
    let depth = 0;
    for (let i = 0; i < upto.length; i += 1) {
      if (upto[i] === "{") {
        depth += 1;
      } else if (upto[i] === "}") {
        depth -= 1;
      }
    }
    if (depth === 0) {
      const name = m[2];
      const line = offsetToLineCol(masked, m.index).line;
      if (seen.has(name)) {
        push(
          {
            id: "duplicate-top-level-var",
            severity: "BUG",
            title: "`" + name + "` is declared twice at file top level",
            why:
              "Declared on line " +
              seen.get(name) +
              " and again here. This is legal JavaScript and the last assignment silently wins. PA loads every scene script into one shared global scope, so a stale earlier declaration can be what other code sees.",
            fix: "Remove the redundant declaration, or rename one of them.",
          },
          m.index
        );
      } else {
        seen.set(name, line);
      }
    }
    m = re.exec(masked);
  }
}

// There is deliberately NO duplicate-object-key check for JavaScript.
//
// Tracking which object literal a key belongs to needs a real parser: counting
// braces conflates *sibling* objects at the same nesting level, so two unrelated
// entries that both have `minions:` read as a duplicate. That is exactly what it
// did to gw_faction_credits_writing.js in the shipped base game.
//
// The equivalent check for JSON data files in json-lint.js is correct — it keeps
// a proper stack of object frames — and that is where duplicate keys actually
// bite in PA, since specs are JSON.

/** Minified bundles have no useful line structure. */
function isMinified(src) {
  const lines = src.split("\n");
  if (lines.length === 0) {
    return false;
  }
  const longest = lines.reduce(function (max, l) {
    return Math.max(max, l.length);
  }, 0);
  return longest > 2000 || (src.length > 20000 && src.length / lines.length > 400);
}

/** Collapse repeated findings of one check into a single entry listing lines. */
function collapse(out, check, summarise) {
  const matching = out.filter(function (f) {
    return f.check === check;
  });
  if (matching.length < 2) {
    return;
  }
  const lines = matching
    .map(function (f) {
      return f.line;
    })
    .filter(function (l) {
      return typeof l === "number";
    });
  const summary = summarise(matching.length, lines);
  const first = matching[0];
  for (let i = out.length - 1; i >= 0; i -= 1) {
    if (out[i].check === check) {
      out.splice(i, 1);
    }
  }
  out.push({
    severity: first.severity,
    check: check,
    title: summary.title,
    line: first.line,
    col: null,
    detail: summary.detail,
    why: first.why,
    fix: first.fix,
  });
}

/**
 * @param {string} src   raw file contents
 * @param {string} relPath  mod-relative path, for reporting
 * @returns {Array<object>} findings, each {severity, check, title, line, col, why, fix, detail}
 */
function checkJs(src, relPath) {
  const out = [];

  // Level 1: does it parse at all? vm.Script gives an exact position.
  try {
    new vm.Script(src, { filename: relPath });
  } catch (err) {
    const line = err.lineNumber || 1;
    out.push({
      severity: "BLOCKER",
      check: "js.parse",
      title: "File is not valid JavaScript",
      line: typeof line === "number" ? line : 1,
      col: null,
      detail: String(err.message),
      why:
        "The file cannot be parsed, so none of it executes. PA injects scene scripts with document.createElement('script'), and a parse failure means every symbol the file was meant to define is absent.",
      fix: "Fix the syntax error at the reported position.",
    });
    // A file that will not parse cannot be meaningfully scanned further.
    return out;
  }

  const t = tokenise(src);
  const masked = t.masked;

  function push(rule, offset) {
    const pos = offsetToLineCol(masked, offset);
    out.push({
      severity: rule.severity,
      check: "js.chrome40." + rule.id,
      title: rule.title,
      line: pos.line,
      col: pos.col,
      detail: null,
      why: rule.why,
      fix: rule.fix,
    });
  }

  scanSyntax(masked, push);
  scanDefaultParams(masked, push);
  scanMissingApis(masked, push);

  // Scope- and depth-sensitive checks need real line structure. On a minified
  // bundle the whole file is one line, brace-depth tracking stops being
  // meaningful, and the reported line number is useless anyway. Mods routinely
  // ship minified third-party libraries, so these are skipped rather than
  // guessed at.
  if (!isMinified(src)) {
    scanTopLevelVars(masked, push);
  }

  // Advisory findings that can legitimately recur many times in one file are
  // collapsed to a single entry listing the lines, so one stylistic choice does
  // not bury the substantive findings.
  collapse(out, "js.chrome40.const", function (n, lines) {
    return {
      title: n + " `const` declarations use legacy function-scoped semantics",
      detail: "Lines " + lines.join(", ") + ".",
    };
  });
  collapse(out, "js.chrome40.missing-proto-api", function (n, lines) {
    return {
      title: n + " calls to methods that may not exist in Chrome 40",
      detail: "Lines " + lines.join(", ") + ".",
    };
  });

  // Template literals are recorded by the tokeniser, since they are masked out
  // before the syntax scan runs.
  for (const region of t.regions) {
    if (region.type === "template") {
      const pos = offsetToLineCol(src, region.start);
      out.push({
        severity: "BLOCKER",
        check: "js.chrome40.template-literal",
        title: "Template literal is not supported by Chrome 40",
        line: pos.line,
        col: pos.col,
        detail: null,
        why:
          "Template literals shipped in Chrome 41. In Chrome 40 this is a SyntaxError and the whole file fails to parse.",
        fix: "Use string concatenation with `+`.",
      });
    }
  }

  return out;
}

module.exports = { checkJs, SYNTAX_RULES };
