import type { SchemaStatus } from "@effy/shared-types";
import { SCHEMA_STATUSES } from "@effy/shared-types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@effy/design-system/ui";

// Client-side status filter shared by all three schema tabs. The catalog list endpoints return
// unpaginated arrays with no query params, so the filter narrows the already-loaded rows.
export type StatusFilterValue = SchemaStatus | "all";

export function StatusFilter({
  value,
  onChange,
}: {
  value: StatusFilterValue;
  onChange: (value: StatusFilterValue) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as StatusFilterValue)}>
      <SelectTrigger size="sm" className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All statuses</SelectItem>
        {SCHEMA_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
