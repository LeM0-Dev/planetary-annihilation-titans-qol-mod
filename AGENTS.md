# Mandatory Instructions for All AI Agents

These instructions apply to every AI agent, coding assistant, automated reviewer, sub-agent, and tool that works in this repository.

## Required Reading

Before planning, answering questions, editing files, writing code, reviewing code, debugging, testing, or generating documentation, you **must read both of the following files in full**:

1. [`OFFICIAL-DEV-INFO.md`](./OFFICIAL-DEV-INFO.md)
2. [`PA-MOD-CODING-RULES.md`](./PA-MOD-CODING-RULES.md)

Do not begin implementation until both files have been reviewed.

## Mandatory Behavior

1. Treat `OFFICIAL-DEV-INFO.md` as the primary project reference for Planetary Annihilation: TITANS mod structure, supported workflows, file locations, APIs, packaging, testing, and publishing.

2. Treat `PA-MOD-CODING-RULES.md` as mandatory engineering policy. Its rules are requirements, not suggestions.

3. Re-read the relevant sections of both files before changing any related system, including:
   - `modinfo.json`
   - client or server mod loading
   - UI injection
   - unit, weapon, build, AI, or asset definitions
   - JavaScript hooks and overrides
   - error handling, validation, assertions, logging, and tests
   - packaging or release configuration

4. Never rely on an assumption when it can be verified from:
   - these two files,
   - the current game files,
   - an existing maintained mod,
   - a schema, API, or documented source.

5. If repository code conflicts with either guide, stop and identify the conflict before proceeding. Do not silently copy an existing pattern that violates the documented rules.

6. If documentation is incomplete or ambiguous:
   - state the uncertainty,
   - inspect the relevant source files,
   - validate the assumption with evidence,
   - use the safest compatible implementation.

7. Every implementation must follow the coding rules for:
   - explicit validation,
   - actionable error handling,
   - verified assumptions,
   - safe initialization,
   - namespacing,
   - logging,
   - testing,
   - release readiness.

8. Do not remove assertions, validation, error checks, or diagnostic logging merely to make code shorter or suppress an error.

9. Before declaring work complete, verify that:
   - both required files were consulted,
   - the implementation follows their guidance,
   - referenced paths and identifiers exist,
   - failure cases are handled,
   - relevant tests or manual checks were performed,
   - no known console, loading, or packaging errors remain.

## Required Agent Acknowledgement

At the start of substantial work, the agent should internally confirm:

> I have read `OFFICIAL-DEV-INFO.md` and `PA-MOD-CODING-RULES.md`, and I will follow them throughout this task.

This acknowledgement does not need to be shown to the user unless requested, but the reading and compliance are mandatory.

## Instruction Priority

When instructions conflict, use this priority order:

1. Safety and platform-level requirements
2. Explicit user requirements
3. This `AGENTS.md`
4. `PA-MOD-CODING-RULES.md`
5. `OFFICIAL-DEV-INFO.md`
6. Existing repository conventions

Existing code is not authoritative when it conflicts with the required documentation.

## Scope

These requirements apply to all contributors and agents, including but not limited to:

- ChatGPT
- Claude
- Gemini
- GitHub Copilot
- Cursor
- Windsurf
- local coding agents
- CI-based automated reviewers
- delegated sub-agents
- code-generation scripts

No agent may skip the required reading because a task appears small.