import { Columns3 } from "lucide-react";

import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@effy/design-system/ui";

export interface ColumnChoice {
  id: string;
  label: string;
  visible: boolean;
  /** The identifying column: listed, ticked, not changeable. */
  locked: boolean;
}

/**
 * Show or hide a list's columns (103 FR-014); the choice is kept on this device. `compact` is an icon button with its
 * name as a tooltip, for a toolbar that must stay on one row (the activity drawer, 104).
 */
export function ColumnMenu({
  columns,
  onToggle,
  compact = false,
}: {
  columns: readonly ColumnChoice[];
  onToggle: (id: string, visible: boolean) => void;
  compact?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <Button variant="outline" size="icon" className="max-md:hidden" aria-label="Columns" title="Columns">
            <Columns3 aria-hidden="true" />
          </Button>
        ) : (
          <Button variant="outline" className="max-md:hidden">
            <Columns3 aria-hidden="true" />
            Columns
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuLabel>Show columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((c) => (
          <DropdownMenuCheckboxItem
            key={c.id}
            checked={c.visible}
            disabled={c.locked}
            onCheckedChange={(v) => onToggle(c.id, v === true)}
            onSelect={(e) => e.preventDefault()}
          >
            {c.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
