// ⚠ MOVED TO `@effy/edge-shared` BY 064 (its second consumer is `edge-api/driver`).
//
// Re-exported here rather than deleted outright so the existing container tests in this service keep
// their import path and their expectations unmodified — which is the proof the extraction changed no
// behaviour. 028 used exactly this test when it promoted the S3 presign helper: shop's existing media
// tests had to pass against the shared version WITHOUT edits, and if they needed editing then the
// extraction was wrong.
export { migrationSql } from "@effy/edge-shared";
