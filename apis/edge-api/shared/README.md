# `@effy/edge-shared`

The cross-cutting library + contracts for every Effy cold-path service (constitution Principle II
single-source-of-truth): `db` (pg pool, `query`, `withTransaction`, `pingDatabase`), `secrets`
(runtime fetch), `logger` (pino), `http` (preamble, response + RFC 9457 problem builders,
`ProblemType`), `claims` (JWT claims + `cognito:groups` parser + `hasAnyGroup`), `rds-ca`,
`validate`. Exports TS source; each service bundles it via esbuild. Never copy-paste these per
service — extend them here.
