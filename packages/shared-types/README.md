# `@effy/shared-types`

The single source of truth for web-facing **wire types** (constitution Principle II): the RFC 9457
`ProblemJSON` shape and the back-office DTOs/domain types (`BackOfficeRole`, `StaffRecord`,
`StaffRecordDTO`, `BackOfficePingDTO`, `BackOfficeAdminPingDTO`, `AdminPingResult`). Every web
surface imports these — never re-declares them per surface.

These mirror the backend contracts in `docs/api/` and `specs/005-back-office-web/contracts/`
(documents-as-contracts, since Go/TS backends can't share a package). Internal package: exports
TypeScript source.
