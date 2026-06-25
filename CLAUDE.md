# Effy — Greenfield Rewrite (CLAUDE.md)

This repo (`effy`) is a **greenfield rewrite** of the existing Effy platform (which lives at
`/Users/janith/Projects/ef/ef/`). The new repo lives at `/Users/janith/Projects/effy/`.
We are using **spec-driven development via GitHub Spec Kit**. Read this before doing anything.

## Why this rewrite exists
- Driven primarily by a **business/product pivot** (NOT because the old code is bad — the
  existing platform is modern and intentional). Also: tech-debt cleanup + adopting a
  disciplined spec-driven process.
- Greenfield: production is ignored for now. No live cutover/migration is in scope yet.
- Stack stays *similar* to today — the pivot is product + architecture, not languages.

## The existing platform (what we're rewriting — keep as reference)
- **Mobile:** Kotlin Multiplatform + Compose (shared iOS/Android), Clean Architecture + MVI, Ktor.
- **Web:** React 19 — Next.js 16 (customer-web), Vite (store-web, back-office). shadcn/ui,
  Tailwind v4, TanStack Query/Router, Zustand.
- **Backend (dual-path):** Go 1.25 + Gin + pgx/v5 on Fargate for the latency-sensitive HOT path;
  Node 20 + TS Lambdas (Serverless Framework) for the ops/admin COLD path.
- **Data:** PostgreSQL 16, raw SQL, Goose migrations (no ORM).
- **Auth:** 4 isolated AWS Cognito pools (customer / driver / store / admin), per-pool JWT
  validation, EMAIL_OTP. Frontends talk to Cognito directly; backends validate (no proxy).
- **Infra:** Terraform, multi-env, remote state (S3 + DynamoDB).

## Decisions locked for effy
- **Repo shape:** MONOREPO (Turborepo + pnpm for JS/TS; Go lives alongside with its own go.mod).
  Reason: solo/small team + pivot = consistency across surfaces is the #1 need; shared packages
  (design-system, api-client, shared-types) are the whole point.
- **Methodology:** Spec Kit (official CLI), with a BMAD-style discovery Brief up front.
- **Mode of work:** the USER creates/scaffolds; Claude TEACHES and REVIEWS. Don't scaffold
  for the user unless asked.

## Workflow (the method)
```
Brief (product pivot, user-authored)  →  /constitution (technical law, once)
   →  /specify <feature>  (WHAT/WHY, zero tech)
   →  /plan <feature>     (HOW, tech, cites constitution)
   →  /tasks <feature>    (ordered, checkable)
   →  /implement          (build task by task, verify vs acceptance criteria)
```
Discipline: specs have ZERO tech. A gap found later sends you BACK to fix the earlier artifact.

## Order of operations
1. Author the **Brief** (platform-brief.md) — capture the pivot. (Template provided.)
2. Run **/constitution** — encode the technical law (dual-path, monorepo, no-ORM,
   native-feel mobile, Jade brand #0FB57E / fill #047857, 4-pool auth isolation).
3. First slice: **Auth + customer onboarding** end-to-end (proves 4-pool auth + dual-path +
   monorepo, and unblocks everything else). Catalog browse is the recommended second slice.
4. Do NOT pre-build the monorepo scaffold before the constitution — let the plan drive what
   gets scaffolded.

## Design system (carry over)
Jade brand #0FB57E / fill #047857, shared across all surfaces via one design-system package.
Dark mode required. Mobile must feel native (iOS HIG / Android Material), fat-finger targets +
micro-animations are requirements. Design refs: Uber / Bolt / foodpanda / eBay.

<!-- SPECKIT START -->
## Active feature

- **001-customer-auth-onboarding** — Customer Auth & Onboarding (passwordless EMAIL_OTP).
  Plan: [specs/001-customer-auth-onboarding/plan.md](specs/001-customer-auth-onboarding/plan.md)
  Stack this slice: KMP + Compose Multiplatform (Android+iOS), Go hot-path `GET /v1/profile`
  (Gin + pgx, JWKS validation), Cognito customer pool w/ custom-auth Lambda triggers, RDS
  Postgres + Goose, Terraform (bootstrap + dev) + SSM, all AWS under `AWS_PROFILE=ef` +
  `AWS_REGION=ap-southeast-1` (Singapore — isolates from `ef` in `ap-southeast-2`; revertable).
<!-- SPECKIT END -->

