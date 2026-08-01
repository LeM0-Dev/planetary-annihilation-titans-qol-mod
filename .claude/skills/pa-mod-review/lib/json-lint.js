"use strict";
// Levels 1 and 2 of file completeness for every JSON-format file.
//
// Level 1 (parses at all) is JSON.parse with the error position recovered.
// Level 2 (parses but is wrong) needs a raw scan, because JSON.parse accepts a
// duplicate key silently and keeps the LAST value — so an edited spec can look
// correct while a stale earlier key is the one that actually applies.

const { offsetToLineCol } = require("./util.js");

/** Recover a character offset from V8's JSON.parse message across versions. */
function parseErrorOffset(message, text) {
  let m = /at position (\d+)/.exec(message);
  if (m) {
    return Number(m[1]);
  }
  // Newer V8: "... at line 3 column 5 (char 42)"
  m = /\(char (\d+)\)/.exec(message);
  if (m) {
    return Number(m[1]);
  }
  m = /at line (\d+) column (\d+)/.exec(message);
  if (m) {
    const targetLine = Number(m[1]);
    const targetCol = Number(m[2]);
    let line = 1;
    for (let i = 0; i < text.length; i += 1) {
      if (line === targetLine) {
        return i + targetCol - 1;
      }
      if (text.charCodeAt(i) === 10) {
        line += 1;
      }
    }
  }
  return null;
}

/**
 * Scan raw JSON for duplicate keys within the same object literal.
 * @returns {Array<{key: string, line: number, col: number, firstLine: number}>}
 */
function findDuplicateKeys(text) {
  const dupes = [];
  const stack = [];
  let i = 0;
  let expectKey = false;

  while (i < text.length) {
    const ch = text[i];

    if (ch === "{") {
      stack.push(new Map());
      expectKey = true;
      i += 1;
      continue;
    }
    if (ch === "}") {
      stack.pop();
      expectKey = false;
      i += 1;
      continue;
    }
    if (ch === "[") {
      stack.push(null); // array frame: no keys
      expectKey = false;
      i += 1;
      continue;
    }
    if (ch === "]") {
      stack.pop();
      i += 1;
      continue;
    }
    if (ch === ",") {
      const top = stack[stack.length - 1];
      expectKey = Boolean(top instanceof Map);
      i += 1;
      continue;
    }
    if (ch === ":") {
      expectKey = false;
      i += 1;
      continue;
    }

    if (ch === '"') {
      const start = i;
      let j = i + 1;
      let value = "";
      while (j < text.length) {
        if (text[j] === "\\") {
          value += text[j + 1] || "";
          j += 2;
          continue;
        }
        if (text[j] === '"') {
          break;
        }
        value += text[j];
        j += 1;
      }
      const top = stack[stack.length - 1];
      if (expectKey && top instanceof Map) {
        if (top.has(value)) {
          const pos = offsetToLineCol(text, start);
          dupes.push({
            key: value,
            line: pos.line,
            col: pos.col,
            firstLine: top.get(value),
          });
        } else {
          top.set(value, offsetToLineCol(text, start).line);
        }
      }
      i = j + 1;
      continue;
    }

    i += 1;
  }
  return dupes;
}

/**
 * @param {string} raw file contents as read with utf8 encoding
 * @returns {{ok: boolean, data: any, issues: Array<object>}}
 */
function lintJson(raw) {
  const issues = [];
  let text = raw;

  // Level 2: a BOM ahead of the first `{`. JSON.parse rejects it outright, and
  // PA's parser will not see a document at all.
  if (text.charCodeAt(0) === 0xfeff) {
    issues.push({
      kind: "bom",
      line: 1,
      col: 1,
      message:
        "File begins with a UTF-8 byte order mark, which appears before the opening brace.",
    });
    text = text.slice(1);
  }

  // A lone replacement char indicates the file is not valid UTF-8.
  const badEncoding = text.indexOf("�");
  if (badEncoding !== -1) {
    const pos = offsetToLineCol(text, badEncoding);
    issues.push({
      kind: "encoding",
      line: pos.line,
      col: pos.col,
      message:
        "File is not valid UTF-8 (contains an unmappable byte). PA reads mod JSON as UTF-8.",
    });
  }

  let data = null;
  try {
    data = JSON.parse(text);
  } catch (err) {
    const offset = parseErrorOffset(err.message, text);
    const pos = offset === null ? { line: 1, col: 1 } : offsetToLineCol(text, offset);
    issues.push({
      kind: "parse",
      line: pos.line,
      col: pos.col,
      message: err.message,
    });
    return { ok: false, data: null, issues: issues };
  }

  for (const d of findDuplicateKeys(text)) {
    issues.push({
      kind: "duplicate-key",
      line: d.line,
      col: d.col,
      key: d.key,
      firstLine: d.firstLine,
      message:
        'Duplicate key "' +
        d.key +
        '" (first defined on line ' +
        d.firstLine +
        ").",
    });
  }

  return { ok: true, data: data, issues: issues };
}

module.exports = { lintJson, findDuplicateKeys };
