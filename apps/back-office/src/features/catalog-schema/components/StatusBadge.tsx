import type { SchemaStatus } from "@effy/shared-types"

import { StatusWord } from "@effy/web-kit/patterns"

export function SchemaStatusBadge({ status }: { status: SchemaStatus }) {
  return (
    <StatusWord tone={status === "active" ? "done" : "quiet"}>{status === "active" ? "Active" : "Retired"}</StatusWord>
  )
}
