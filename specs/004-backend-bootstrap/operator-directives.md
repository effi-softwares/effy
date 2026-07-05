# Operator Directives (plan-phase input)

**Source**: user input to `/speckit-specify`, 2026-07-05. **Binding technical directives**
for the plan phase of `004-backend-bootstrap`. Kept out of [spec.md](./spec.md) per the
zero-tech discipline (constitution Principle I); `/speckit-plan` MUST honor them (or
return here if one proves impossible).

## Verbatim mandate

> as for the next spec we need to boostrap the backend. for this platfrom i am thinking of
> having two separate backends. 1) go server --> which i hope to call core-api 2) aws
> lambda serverelss functions behind the AWS API Gateway --> i hope to call it edge-api.
>
> core-api: this api will be use to serve the apis that is MUST be resolve very fast for
> lot's of users. reliable high preformace, low latency apis. for example loading all the
> prodcuts in customer app/webapp, serching and filter.
>
> edge-api: will be use to serve the apis that not nessary server very fast, which we can
> compromize the speed over cost. the apis that does not need work in low latency MUST
> written in edge-api. for example: changing profile data, or all the back-office tasks
> etc...
>
> for the core-api: we should use a go with following technolgoies: go, Gin,
> gin-contrib/cors, go.uber.org/zap, google/uuid, joho/godotenv, caarlos0/env/v11,
> MicahParks/keyfunc/v3, golang-jwt/jwt/v5, pgx/v5, AWS SDK for Go v2, AWS SDK — Cognito
> Identity Provider
>
> for the edge-api: we should use serverless framework 3.4 with TypeScript, postgres,
> pino, and with AWS api gateway.
>
> both core-api and edge-api services should be strictly use clean architecture, and
> should separate concern into files in nessary places.
>
> for core-api, we can initailly run in locally in a docker and in later i hope to deploy
> to fargate. but we do not need to setup it right now! but we can deploy the edge-api in
> AWS Lambda and use API gateway to do the REST api calls.
>
> NOTE that both core and edge apis are REST apis. do a deep dive in internet and find
> good architectures, industry practices and write the spec to create very professional,
> industry ready, standard codebases.

**Addendum (same session, mid-specify):**

> also we need to think about how we can have versioning for each and every api endpoint
> in both core and edage api. sincce we have mobile app we need to have api versionning
> so that backend can serve all the apps that are updated or not updated at same time

> so research on ow industry do api verssioning and follow that architecture here!

## Decoded, itemized

| # | Directive | Concrete meaning |
|---|---|---|
| 1 | **Two named services** | Hot path = **`core-api`** (Go server); cold path = **`edge-api`** (Lambda functions behind AWS API Gateway). These names are the operator's chosen, binding service names. Plan decides monorepo placement (e.g. `services/core-api`, `services/edge-api`) per Principle II. |
| 2 | Path assignment semantics | `core-api`: MUST-be-fast, high-concurrency customer reads (catalog listing, search, filter). `edge-api`: latency-tolerant, cost-over-speed (profile changes, ALL back-office tasks). Anything that does not need low latency MUST go to `edge-api`. This becomes the spec's Path Assignment Rule (FR-014); the plan writes the concrete rule text. |
| 3 | **`core-api` stack (pinned)** | Go + **Gin**; `gin-contrib/cors`; `go.uber.org/zap` (logging); `google/uuid`; `joho/godotenv` + `caarlos0/env/v11` (config); `MicahParks/keyfunc/v3` + `golang-jwt/jwt/v5` (per-pool JWKS/JWT validation); `pgx/v5` (raw SQL, no ORM); AWS SDK for Go v2 incl. the Cognito Identity Provider client. Constitution locks Go 1.25 / Gin / pgx/v5. Plan pins exact versions. Note: Principle VII requires a Prometheus `/metrics` endpoint — the mandate lists no metrics library, so the plan MAY add one (allowed: new library within locked standards). |
| 4 | **`edge-api` stack (pinned)** | **Serverless Framework 3.x** (operator wrote "3.4"; constitution/CLAUDE.md lock v3 — plan pins the exact 3.x version and records the reading) + TypeScript; PostgreSQL driver (plan picks, e.g. `pg` — raw SQL, no ORM); `pino` (logging); **AWS API Gateway** as the REST front. Constitution locks Node 20 + TS + Lambda on arm64. |
| 5 | Strict clean architecture | Both services strictly follow Clean Architecture with concerns separated into files "in necessary places" — i.e. the three-layer slice + explicit wiring of ARCHITECTURE.md (Principle VI), expressed idiomatically per language. The plan MUST document each service's directory layout. |
| 6 | `core-api` runtime scope | Local **Docker** only in this slice. Fargate deployment is explicitly **deferred** ("we do not need to setup it right now"). Plan MUST NOT include Fargate/ECS provisioning; keeping the image Fargate-ready (ARM64-friendly) is a plan-level nicety, not scope. |
| 7 | `edge-api` runtime scope | **Deploy now**: AWS Lambda + API Gateway REST endpoints in the dev environment. Operator runs the deploy (mode of work). |
| 8 | REST | Both services are REST APIs. Plan encodes the REST conventions (resource naming, status semantics, versioning stance, shared error envelope). |
| 9 | **Research mandate** | "do a deep dive in internet and find good architectures, industry practices" → the plan phase MUST include genuine internet research (`research.md`): current industry-standard Go REST service layout (e.g. `golang-standards/project-layout` debate, real-world Gin + Clean Architecture repos), Serverless Framework v3 TypeScript project structure, Lambda + API Gateway best practices (incl. Postgres connection handling from Lambda), and per-pool Cognito JWT validation patterns — distilled into the two codebase layouts. Plus the API-versioning research of #10. Goal: "very professional, industry ready, standard codebases". |
| 10 | **API versioning — every endpoint, both services** | Every externally consumed endpoint on `core-api` AND `edge-api` carries an explicit version from day one; the backend MUST serve updated and non-updated app builds **simultaneously** (a mobile fleet can never be force-updated in lockstep). The plan MUST research how industry does REST API versioning and **follow that architecture**: URI-path versioning (`/v1/...`) vs header/media-type negotiation; whole-surface vs per-endpoint version granularity; how coexisting versions are routed and organized in code (both in a Gin server and across Lambda functions/API Gateway stages or paths); deprecation & retirement signaling (e.g. `Deprecation`/`Sunset` headers) and min-supported-app-version practice at mobile-first companies (Uber/Bolt-class). The chosen scheme, the policy text, the code-layout consequences, and the unsupported-version rejection behavior are recorded in `plan.md` + the conventions docs. Spec-level encoding: US4, FR-015/FR-016, SC-009/SC-010. |

## Constitution/platform constraints that also apply

- **Locked standards** (constitution): Hot path Go 1.25 / Gin / pgx/v5 / raw SQL, no ORM;
  Cold path Node 20 + TypeScript / Serverless Framework / **Lambda on arm64**; PostgreSQL 16.
  The mandate is consistent with all of them.
- **Principle III**: the plan MUST state the path justification — this feature IS the
  two paths, so it must encode the decision rule (spec FR-014).
- **Principle IV**: four isolated Cognito pools, passwordless EMAIL_OTP, per-pool JWT
  validation with pinned issuer, no auth proxy; cross-pool tokens structurally rejected.
  The keyfunc/jwt libraries (core) and the API Gateway/Lambda-side equivalent (edge) are
  the implementation vehicles; the plan decides pool-to-service wiring per endpoint.
- **Principle VI / ARCHITECTURE.md**: three-layer slice, repository pattern with raw SQL,
  wire shapes never leak past the data layer, **no DI framework** — explicit, greppable
  wiring.
- **Principle VII**: structured logs + `/metrics` (Prometheus) on the hot path; Lambda
  metrics via CloudWatch; no PII beyond the auth subject id; low-cardinality labels.
- **002/003 contracts**: DB connection info comes from the `/effy/<env>/db/*` SSM contract
  + Secrets Manager at runtime — never on disk, never in the repo; operator IP allowlist
  applies to local `core-api` runs. Any proving-slice schema object ships as a Goose
  forward migration through the 003 workflow.
- **Mode of work**: Claude authors all source, Serverless/IaC config, Dockerfiles, and
  docs; the **operator runs** `serverless deploy`, any AWS-mutating command, and any
  migration. Local `docker` runs of `core-api` are developer-side and fine to run.
- **Monorepo (Principle II)**: both services live in the monorepo; shared contracts
  (error envelope shape, event envelope later) must be single-source-of-truth. How much
  JS/TS workspace tooling (Turborepo/pnpm) this slice introduces for `edge-api` is a plan
  decision to record.
