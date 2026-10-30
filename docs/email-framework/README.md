# Email framework - design pack

The plan for turning Effy's `packages/email-kit` into a standalone, open-source npm framework that any
TypeScript project can use to author, check and send transactional email.

> **Working name:** `email-kit` (the Effy package's name). Pick the final name before the first
> publish and check it is free on npm. Every code sample here uses `email-kit` as a placeholder.

## Status

Design only - nothing in this folder has been built. The behaviour described as "today" is what
`packages/email-kit` does on 2026-10-26; everything else is proposed.

## Reading order

| # | Document | What it answers |
|---|---|---|
| 1 | [01-overview.md](01-overview.md) | What it is, the problem, goals and non-goals, who it is for |
| 2 | [02-requirements.md](02-requirements.md) | Every functional and non-functional requirement, numbered |
| 3 | [03-architecture.md](03-architecture.md) | Layers, the build and send pipelines, packages, extension points |
| 4 | [04-technologies.md](04-technologies.md) | Every dependency, why it was chosen, and the alternatives |
| 5 | [05-api-design.md](05-api-design.md) | The public API: config, catalogue, render, send, transports, CLI, errors |
| 6 | [06-email-client-rules.md](06-email-client-rules.md) | The email-client knowledge the checks encode (Outlook, Gmail, dark mode, …) |
| 7 | [07-checks.md](07-checks.md) | Every build-time check, its rule, and its message |
| 8 | [08-testing-strategy.md](08-testing-strategy.md) | The test plan and the full list of test cases |
| 9 | [09-roadmap-and-release.md](09-roadmap-and-release.md) | Milestones, packaging, publishing, CI, versioning, open questions |
| 10 | [10-effy-mapping.md](10-effy-mapping.md) | What is generic and what is Effy-only in today's kit; how Effy moves onto the framework |
| 11 | [11-improvements.md](11-improvements.md) | Every improvement over today's kit, prioritised and placed on the roadmap |

## One-paragraph summary

You declare every email once in a typed **catalogue** (id, variables, subject, preheader, audiences,
category, failure policy). You author each email as an **MJML** file plus a hand-written **plain-text**
file, both with **Handlebars** placeholders. A **build step** generates a theme from your design
tokens, compiles every template into email-safe HTML, and writes one **committed, bundler-friendly
module**. A **check step** fails the build on anything that breaks in real inboxes - unsafe CSS,
size over Gmail's clip, poor contrast in forced dark mode, a missing text part, an undeclared
variable, drift between what was reviewed and what ships. At runtime, a pure **render** function fills
the placeholders (escaping every value), and a **send** function hands both parts to a pluggable
**transport** (Amazon SES first; Resend, Postmark, SMTP next).
