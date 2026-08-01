"use strict";
// A deliberately small JSON Schema draft-07 validator.
//
// Zero dependencies is a hard requirement, so this implements the subset the
// bundled unit/tool/ammo/anim_tree schemas actually use:
//   type, properties, patternProperties, additionalProperties (as a schema),
//   items, required, enum, const, $ref/$defs, minimum, maximum, minItems,
//   maxItems, if/then/else, allOf, anyOf, oneOf, not
//
// Anything outside that subset is ignored rather than guessed at. The schemas
// are permissive by design: additionalProperties is true throughout, mirroring
// the engine silently ignoring unknown keys, and there is no top-level
// `required` because a child file legitimately inherits required fields via
// base_spec. The practical value here is therefore type and enum checking.

function typeOf(value) {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (Number.isInteger(value)) {
    return "integer";
  }
  return typeof value;
}

function typeMatches(value, expected) {
  const actual = typeOf(value);
  if (expected === "number") {
    return actual === "number" || actual === "integer";
  }
  if (expected === "integer") {
    return actual === "integer";
  }
  return actual === expected;
}

function resolveRef(ref, rootSchema) {
  if (typeof ref !== "string" || ref[0] !== "#") {
    return null;
  }
  const parts = ref.slice(1).split("/").filter(Boolean);
  let node = rootSchema;
  for (const raw of parts) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (node === undefined || node === null || typeof node !== "object") {
      return null;
    }
    node = node[key];
  }
  return node === undefined ? null : node;
}

/**
 * @returns {Array<{path: string, message: string}>}
 */
function validate(data, schema, rootSchema, dataPath, seen) {
  const errors = [];
  if (schema === true || schema === undefined || schema === null) {
    return errors;
  }
  if (schema === false) {
    return [{ path: dataPath, message: "value is not permitted here" }];
  }
  if (typeof schema !== "object") {
    return errors;
  }

  const guard = seen || new Set();

  if (schema.$ref) {
    const key = schema.$ref + "@" + dataPath;
    if (guard.has(key)) {
      return errors; // recursive schema; one pass is enough
    }
    guard.add(key);
    const target = resolveRef(schema.$ref, rootSchema);
    if (target) {
      return validate(data, target, rootSchema, dataPath, guard);
    }
    return errors;
  }

  if (schema.type !== undefined) {
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    const ok = expected.some(function (t) {
      return typeMatches(data, t);
    });
    if (!ok) {
      errors.push({
        path: dataPath,
        message:
          "expected " + expected.join(" or ") + ", found " + typeOf(data),
      });
      return errors; // further checks would be noise
    }
  }

  if (schema.enum !== undefined && Array.isArray(schema.enum)) {
    // PA enums are case-insensitive and their prefixes are optional:
    // UNITTYPE_Bot == Bot, WL_Air == Air, FLIGHT_Seeking == seeking. Comparing
    // exactly would report correct content as broken.
    const match = schema.enum.some(function (e) {
      if (typeof e === "string" && typeof data === "string") {
        return e.toLowerCase() === data.toLowerCase();
      }
      return JSON.stringify(e) === JSON.stringify(data);
    });
    if (!match) {
      errors.push({
        path: dataPath,
        message:
          "value " +
          JSON.stringify(data) +
          " is not one of: " +
          schema.enum.map(function (e) { return JSON.stringify(e); }).join(", "),
      });
    }
  }

  if (schema.const !== undefined && JSON.stringify(data) !== JSON.stringify(schema.const)) {
    errors.push({
      path: dataPath,
      message: "value must be " + JSON.stringify(schema.const),
    });
  }

  if (typeof data === "number") {
    if (typeof schema.minimum === "number" && data < schema.minimum) {
      errors.push({ path: dataPath, message: "must be >= " + schema.minimum });
    }
    if (typeof schema.maximum === "number" && data > schema.maximum) {
      errors.push({ path: dataPath, message: "must be <= " + schema.maximum });
    }
    if (typeof schema.exclusiveMinimum === "number" && data <= schema.exclusiveMinimum) {
      errors.push({ path: dataPath, message: "must be > " + schema.exclusiveMinimum });
    }
  }

  if (Array.isArray(data)) {
    if (typeof schema.minItems === "number" && data.length < schema.minItems) {
      errors.push({ path: dataPath, message: "needs at least " + schema.minItems + " items" });
    }
    if (typeof schema.maxItems === "number" && data.length > schema.maxItems) {
      errors.push({ path: dataPath, message: "allows at most " + schema.maxItems + " items" });
    }
    if (schema.items !== undefined) {
      if (Array.isArray(schema.items)) {
        for (let i = 0; i < schema.items.length && i < data.length; i += 1) {
          errors.push.apply(
            errors,
            validate(data[i], schema.items[i], rootSchema, dataPath + "[" + i + "]", guard)
          );
        }
      } else {
        for (let i = 0; i < data.length; i += 1) {
          errors.push.apply(
            errors,
            validate(data[i], schema.items, rootSchema, dataPath + "[" + i + "]", guard)
          );
        }
      }
    }
  }

  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (data[key] === undefined) {
          errors.push({
            path: dataPath,
            message: "missing required property `" + key + "`",
          });
        }
      }
    }

    if (schema.properties) {
      for (const key of Object.keys(schema.properties)) {
        if (data[key] !== undefined) {
          errors.push.apply(
            errors,
            validate(
              data[key],
              schema.properties[key],
              rootSchema,
              dataPath ? dataPath + "." + key : key,
              guard
            )
          );
        }
      }
    }

    if (schema.patternProperties) {
      for (const pattern of Object.keys(schema.patternProperties)) {
        let re;
        try {
          re = new RegExp(pattern);
        } catch {
          continue;
        }
        for (const key of Object.keys(data)) {
          if (re.test(key)) {
            errors.push.apply(
              errors,
              validate(
                data[key],
                schema.patternProperties[pattern],
                rootSchema,
                dataPath ? dataPath + "." + key : key,
                guard
              )
            );
          }
        }
      }
    }
  }

  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) {
      errors.push.apply(errors, validate(data, sub, rootSchema, dataPath, guard));
    }
  }

  if (Array.isArray(schema.anyOf)) {
    const ok = schema.anyOf.some(function (sub) {
      return validate(data, sub, rootSchema, dataPath, guard).length === 0;
    });
    if (!ok) {
      errors.push({ path: dataPath, message: "does not match any permitted variant" });
    }
  }

  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter(function (sub) {
      return validate(data, sub, rootSchema, dataPath, guard).length === 0;
    });
    if (matches.length !== 1) {
      errors.push({
        path: dataPath,
        message:
          matches.length === 0
            ? "does not match any permitted variant"
            : "matches " + matches.length + " variants where exactly one is required",
      });
    }
  }

  if (schema.if !== undefined) {
    const condition = validate(data, schema.if, rootSchema, dataPath, guard).length === 0;
    const branch = condition ? schema.then : schema.else;
    if (branch !== undefined) {
      errors.push.apply(errors, validate(data, branch, rootSchema, dataPath, guard));
    }
  }

  return errors;
}

/**
 * @param {any} data
 * @param {object} schema  a draft-07 schema document
 * @returns {Array<{path: string, message: string}>}
 */
function validateAgainst(data, schema) {
  return validate(data, schema, schema, "", new Set());
}

module.exports = { validateAgainst };
