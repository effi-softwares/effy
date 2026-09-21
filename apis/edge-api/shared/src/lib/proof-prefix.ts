// The S3 key prefix every piece of delivery proof is written under (064).
//
// ⚠ IN `@effy/edge-shared` BECAUSE TWO DEPLOYABLE SERVICES NEED THE SAME VALUE. `edge-api/driver`
// mints the presigned PUT under this prefix; `edge-api/fleet` reads proof back for the back-office
// exception console. They are separate Lambda stacks and neither can import the other's `src/`, so
// the only honest home for a value they must agree on is the package they both already depend on
// (Principle II).
//
// ⚠ THIS CONSTANT IS LOAD-BEARING INFRASTRUCTURE, NOT A TIDY-UP. The bucket
// `effy-<env>-product-media` is shared: it holds `products/` (the live catalogue), `promotions/`
// (banner artwork) and now `proof/`. The Terraform lifecycle configuration that moves proof to
// archival storage after 90 days is scoped by `filter { prefix = "proof/" }`, so:
//
//   · an object written under ANY OTHER prefix is never archived, and sits in STANDARD for ever;
//   · and if the Terraform filter and this constant ever disagree, the platform is either archiving
//     the product catalogue — where every storefront read still works and silently bills a retrieval
//     fee on every page view — or archiving nothing at all.
//
// Neither failure raises an error anywhere. Both are invisible until a bill or a legal request
// arrives. So the value is written ONCE, here, and `proof-prefix.guard.test.ts` asserts that the
// live `infra/envs/dev/media.tf` filter matches it by reading that file.
export const PROOF_MEDIA_PREFIX = "proof";
