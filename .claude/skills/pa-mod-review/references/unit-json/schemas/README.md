# Unit JSON Schemas

Machine-readable [JSON Schema](https://json-schema.org/) (draft-07) for the four unit
JSON file types. Use them for editor autocomplete/validation and CI linting of content.

| Schema | Validates | Reference doc |
|--------|-----------|---------------|
| [unit.schema.json](unit.schema.json) | Unit specs (`<unit>.json`, `base_*.json`) | [unit-spec-reference.md](../unit-spec-reference.md) |
| [tool.schema.json](tool.schema.json) | Weapon & build-arm tools (`*_tool_weapon.json`, `*_build_arm.json`) | [tool-weapon-reference.md](../tool-weapon-reference.md) |
| [ammo.schema.json](ammo.schema.json) | Ammo (`*_ammo.json`) | [ammo-reference.md](../ammo-reference.md) |
| [anim_tree.schema.json](anim_tree.schema.json) | Animation trees (`*_anim_tree.json`) | [animation-tree-reference.md](../animation-tree-reference.md) |

## Important caveats

- **These are advisory, not the engine's own validators.** They encode what the C++
  parsers read, but the engine itself does not validate against them.
- **`additionalProperties` is `true`** on every object. The engine **silently ignores
  unknown keys**, so a typo'd or stale key passes both the engine and this schema. The
  schemas type-check the keys they *know*; they do not catch unknown keys by design,
  to mirror engine behaviour.
- **`base_spec` inheritance is not resolved.** A child file that relies on its parent
  for a required field (e.g. a tool with no `tool_type` because the base supplies it)
  will not satisfy the schema on its own. Validate the *merged* spec, or treat
  required-field failures on partial child files as expected.
- **Enum prefixes:** the schemas list both prefixed and unprefixed spellings where the
  engine strips an optional prefix (`UNITTYPE_`, `WL_`, `AT_`, …). For enums with a
  very large value set (`unit_types`, `armor_type`, `world layers`) the schema accepts
  any string rather than enumerating every value — consult
  [enums-and-vocabulary.md](../enums-and-vocabulary.md) for the authoritative lists.

## Validating with a `$schema` reference

Most editors (VS Code with a JSON plugin) pick up a per-file schema association. You
can either configure a glob mapping in your editor settings, or add a `$schema` key to
a file (the engine ignores it as an unknown key):

```json
{
    "$schema": "../../../../docs/modding/unit-json/schemas/unit.schema.json",
    "base_spec": "/pa/units/land/base_bot/base_bot.json",
    "...": "..."
}
```

### Batch validation example

Using [`ajv-cli`](https://github.com/ajv-validator/ajv-cli):

```bash
ajv validate -s docs/modding/unit-json/schemas/ammo.schema.json \
  -d "content/**/*_ammo.json" --spec=draft7 --all-errors
```

(Expect partial child files that defer required fields to a `base_spec` to report
missing-required errors — see the caveat above.)
