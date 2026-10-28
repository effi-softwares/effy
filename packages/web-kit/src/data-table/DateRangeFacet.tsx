import { useState } from "react";

import { CalendarDays } from "lucide-react";

import { cn } from "@effy/design-system";
import {
  Badge,
  Button,
  DateField,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
} from "@effy/design-system/ui";

const DAY_WORDS = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });
const words = (day: string) => DAY_WORDS.format(new Date(`${day}T00:00:00Z`));

/** "3 Oct – 9 Oct", "From 3 Oct", "Until 9 Oct". */
export function rangeWords(from?: string, to?: string): string | null {
  if (from && to) return `${words(from)} – ${words(to)}`;
  if (from) return `From ${words(from)}`;
  if (to) return `Until ${words(to)}`;
  return null;
}

/**
 * A date-range filter beside the other facets: dashed until set, then the range on the button. Both ends are
 * calendar days (`YYYY-MM-DD`) and either may be open.
 */
export function DateRangeFacet({
  label,
  from,
  to,
  onChange,
}: {
  label: string;
  from?: string;
  to?: string;
  onChange: (range: { from?: string; to?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ from: from ?? "", to: to ?? "" });
  const chosen = rangeWords(from, to);
  const invalid = Boolean(draft.from && draft.to && draft.from > draft.to);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDraft({ from: from ?? "", to: to ?? "" });
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn(!chosen && "border-dashed")}>
          <CalendarDays aria-hidden="true" className="text-muted-foreground" />
          {label}
          {chosen ? (
            <>
              <Separator orientation="vertical" className="mx-0.5 data-[orientation=vertical]:h-4" />
              <Badge variant="secondary" className="rounded-sm px-1.5 font-normal">
                {chosen}
              </Badge>
            </>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-72 flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dr-from">From</Label>
          <DateField id="dr-from" value={draft.from} max={draft.to || undefined} onChange={(v) => setDraft((d) => ({ ...d, from: v }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dr-to">To</Label>
          <DateField id="dr-to" value={draft.to} min={draft.from || undefined} onChange={(v) => setDraft((d) => ({ ...d, to: v }))} />
        </div>
        {invalid ? <p className="text-sm text-destructive">The first day must come before the last.</p> : null}
        <div className="flex justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange({});
              setOpen(false);
            }}
          >
            Clear
          </Button>
          <Button
            size="sm"
            disabled={invalid}
            onClick={() => {
              onChange({ from: draft.from || undefined, to: draft.to || undefined });
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
