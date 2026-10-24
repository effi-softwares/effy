import type { SchemaStatus } from "@effy/shared-types";

import { StatusWord } from "@effy/web-kit/patterns";

// A schema entity's lifecycle (product type / attribute / category) as a word: active → done (green),
// retired → inert (grey).
export function SchemaStatusBadge({ status }: { status: SchemaStatus }) {
  return <StatusWord tone={status === "active" ? "done" : "quiet"}>{status === "active" ? "Active" : "Retired"}</StatusWord>;
}
