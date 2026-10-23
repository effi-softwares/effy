# `@effy/shared-types`

The wire contracts every surface and the backend share: DTOs, closed vocabularies, and the pure rules
both ends must agree on (delivery wording, unit pricing, the scan rule, variant validation). Internal
package: it exports TypeScript source; nothing redeclares these per surface.

The mobile apps cannot import TypeScript, so their Kotlin DTOs are generated from the contract
aggregators and committed:

| Script | Entry | Output |
|---|---|---|
| `contract:gen` | `src/customer-contract.ts` | `contract/Dto.kt` |
| `commerce-contract:gen` | `src/customer-commerce-contract.ts` | `contract/CommerceDto.kt` |
| `driver-contract:gen` | `src/driver-contract.ts` | `contract-driver/DriverDto.kt` |

Each `*:check` script regenerates and fails on any difference. Rules the apps implement in Kotlin
(delivery words, windows, unit prices, the scan rule, package codes) are pinned to the shared
`*.fixtures.json` files by tests on both sides.
