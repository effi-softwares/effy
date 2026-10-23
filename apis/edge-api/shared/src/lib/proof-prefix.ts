// The S3 prefix every delivery proof is written under, shared by driver (writing) and fleet (reading).
// The media bucket also holds the catalogue and promotions, and the lifecycle rule archiving proof is
// scoped to this prefix; `proof-prefix.guard.test.ts` holds the two together.
export const PROOF_MEDIA_PREFIX = "proof";
