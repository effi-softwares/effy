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

## Where backend code goes

**Every API is written in `apis/edge-api/`** — serverless TypeScript services behind one gateway,
one service per audience and domain. There is no other backend. Put a new endpoint in the service
that already owns its audience and domain, or add a new `apis/edge-api/<service>/`
(`docs/api/path-assignment.md` decides which). Logic more than one service needs lives in the
shared library `apis/edge-api/shared`, never copied; money logic lives only in its `payments`
module. Every client — web and mobile — calls the one gateway.

Do not add a second backend runtime, a container service, a load balancer or any always-on
compute: the constitution (Principle III) forbids it without an amendment. An earlier Go backend
was retired in feature 070; `docs/archive/core-api.md` records it for reference only. "Hot path"
and "cold path" in older specs are history, not rules.

The one standing-connection component is managed and permitted (constitution v3.1.0, feature 071):
AWS AppSync Events carries live updates. An update says only what kind of thing changed; the app
re-reads through the gateway. Only the backend publishes, after its transaction has committed.

## Safety boundary

Agents may author code, Terraform, migrations, and deployment instructions, but must not run
deployments, `terraform apply`, database migrations, or commands that provision or mutate live cloud
state. Hand those operations to the user with exact commands.
