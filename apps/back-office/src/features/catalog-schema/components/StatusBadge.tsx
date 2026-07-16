import type { SchemaStatus } from "@effy/shared-types";
import { Badge } from "@effy/design-system/ui";

// Renders a schema entity's lifecycle (product type / attribute / category) as a semantically-
// colored Badge. active reads as success, retired as muted.
const SCHEMA_VARIANT: Record<SchemaStatus, "success" | "muted"> = {
  active: "success",
  retired: "muted",
};

export function SchemaStatusBadge({ status }: { status: SchemaStatus }) {
  return <Badge variant={SCHEMA_VARIANT[status]}>{status}</Badge>;
}
