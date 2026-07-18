# Effy agent instructions

This repository uses GitHub Spec Kit for spec-driven development with both Claude Code and Codex.

Before changing the project, read `CLAUDE.md` in full. Despite its filename, it is the shared,
authoritative project context for every coding agent: product model, architecture, locked decisions,
safety boundaries, workflow, and current feature status all live there. Also follow the binding
constitution at `.specify/memory/constitution.md` and the active feature's artifacts under `specs/`.

## Spec Kit with Codex

The Codex Spec Kit skills are installed in `.agents/skills/`. Invoke the appropriate skill for the
phase being performed:

- `$speckit-specify` — create or update a feature specification
- `$speckit-clarify` — resolve specification ambiguities
- `$speckit-plan` — create the implementation plan
- `$speckit-tasks` — generate ordered implementation tasks
- `$speckit-analyze` — check cross-artifact consistency
- `$speckit-implement` — implement the approved tasks

Do not skip phases or silently repair an upstream artifact during a later phase. If implementation
reveals a specification or plan gap, return to the appropriate earlier artifact first.

## Safety boundary

Agents may author code, Terraform, migrations, and deployment instructions, but must not run
deployments, `terraform apply`, database migrations, or commands that provision or mutate live cloud
state. Hand those operations to the user with exact commands.
