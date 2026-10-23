import type { SchemaStatus } from "@effy/shared-types";

import { cn } from "@effy/design-system";

// Client-side status filter shared by all three schema tabs (redesign: a segmented control
// Active · Retired · All). The catalog list endpoints return unpaginated arrays, so the filter
// narrows the already-loaded rows.
export type StatusFilterValue = SchemaStatus | "all";

const OPTIONS: readonly { value: StatusFilterValue; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "retired", label: "Retired" },
  { value: "all", label: "All" },
];

export function StatusFilter({ value, onChange }: { value: StatusFilterValue; onChange: (value: StatusFilterValue) => void }) {
  return (
    <div role="group" aria-label="Status" className="bo-seg">
      {OPTIONS.map((o) => (
        <button key={o.value} type="button" className={cn(value === o.value && "is-active")} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
