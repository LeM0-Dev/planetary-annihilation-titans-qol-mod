"use strict";
// Strips comments, string literals, template literals and regex literals from JS
// source so that syntax scanning cannot be fooled by code-like text inside them.
//
// This exists because of a real false positive: GW-AI-Overhaul ships the comment
//   // Don't let the Pelican carry the Manhattan
// in cards/gwaio_start_paratrooper.js. A regex for `let ` reports a Blocker against
// a gold-standard mod. Scanning raw source is not acceptable.
//
// Output preserves byte offsets: masked regions become spaces, newlines are kept,
// so line and column numbers computed on the masked text match the original file.

const IDENT_CHAR = /[A-Za-z0-9_$]/;

// After these, a `/` begins a regex literal rather than a division operator.
const REGEX_PRECEDERS = new Set([
  "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*",
  "%", "^", "~", "<", ">",
]);

// Keywords after which a `/` is a regex, despite ending in an identifier char.
const REGEX_KEYWORDS = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void",
  "throw", "case", "do", "else", "yield", "await",
]);

/**
 * @param {string} src
 * @returns {{masked: string, regions: Array<{type: string, start: number, end: number}>}}
 */
function tokenise(src) {
  const out = new Array(src.length);
  const regions = [];
  let i = 0;

  // Last significant (non-whitespace, non-comment) character emitted, and the
  // identifier word ending at it. Together these disambiguate `/`.
  let lastSignificant = "";
  let lastWord = "";

  function blank(from, to, type) {
    for (let k = from; k < to; k += 1) {
      out[k] = src[k] === "\n" ? "\n" : " ";
    }
    regions.push({ type: type, start: from, end: to });
  }

  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    // Line comment
    if (ch === "/" && next === "/") {
      let j = i + 2;
      while (j < src.length && src[j] !== "\n") {
        j += 1;
      }
      blank(i, j, "line-comment");
      i = j;
      continue;
    }

    // Block comment
    if (ch === "/" && next === "*") {
      let j = i + 2;
      while (j < src.length && !(src[j] === "*" && src[j + 1] === "/")) {
        j += 1;
      }
      j = Math.min(j + 2, src.length);
      blank(i, j, "block-comment");
      i = j;
      continue;
    }

    // String literal
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === ch) {
          j += 1;
          break;
        }
        // An unescaped newline terminates a bad string; stop so one broken
        // literal cannot swallow the remainder of the file.
        if (src[j] === "\n") {
          break;
        }
        j += 1;
      }
      blank(i, j, "string");
      lastSignificant = "x";
      lastWord = "";
      i = j;
      continue;
    }

    // Template literal (itself ES6 — recorded so chrome40 can report it)
    if (ch === "`") {
      let j = i + 1;
      let depth = 0;
      while (j < src.length) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === "$" && src[j + 1] === "{") {
          depth += 1;
          j += 2;
          continue;
        }
        if (depth > 0 && src[j] === "}") {
          depth -= 1;
          j += 1;
          continue;
        }
        if (depth === 0 && src[j] === "`") {
          j += 1;
          break;
        }
        j += 1;
      }
      blank(i, j, "template");
      lastSignificant = "x";
      lastWord = "";
      i = j;
      continue;
    }

    // Regex literal vs division
    if (ch === "/") {
      const isRegex =
        lastSignificant === "" ||
        REGEX_PRECEDERS.has(lastSignificant) ||
        REGEX_KEYWORDS.has(lastWord);
      if (isRegex) {
        let j = i + 1;
        let inClass = false;
        let closed = false;
        while (j < src.length) {
          const c = src[j];
          if (c === "\\") {
            j += 2;
            continue;
          }
          if (c === "\n") {
            break;
          }
          if (c === "[") {
            inClass = true;
          } else if (c === "]") {
            inClass = false;
          } else if (c === "/" && !inClass) {
            j += 1;
            closed = true;
            break;
          }
          j += 1;
        }
        if (closed) {
          while (j < src.length && IDENT_CHAR.test(src[j])) {
            j += 1; // trailing flags
          }
          blank(i, j, "regex");
          lastSignificant = "x";
          lastWord = "";
          i = j;
          continue;
        }
        // Unterminated: fall through and treat as an ordinary character.
      }
    }

    out[i] = ch;
    if (!/\s/.test(ch)) {
      lastSignificant = ch;
      if (IDENT_CHAR.test(ch)) {
        lastWord += ch;
      } else {
        lastWord = "";
      }
    }
    i += 1;
  }

  return { masked: out.join(""), regions: regions };
}

module.exports = { tokenise: tokenise };
