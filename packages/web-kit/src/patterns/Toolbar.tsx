import { useEffect, useRef, type ReactNode } from "react";

import { Check, CirclePlus, Search, X } from "lucide-react";

import { cn } from "@effy/design-system";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Kbd,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  TabsCount,
} from "@effy/design-system/ui";

/** The row above a list: search, faceted filters, and the list's own controls (Patterns board). */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>;
}

export function ToolbarSpacer() {
  return <span className="flex-auto" />;
}

/**
 * The list's search, always at the right end of the toolbar (after any filters, with the gap between them);
 * full width on a phone. "/" focuses it from anywhere on the page (not while typing in another field).
 */
export function SearchBox({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <label className="relative flex w-72 max-w-full items-center max-md:w-full md:order-last md:ml-auto">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
      <span className="sr-only">{label}</span>
      <Input
        ref={ref}
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pr-9 pl-9"
      />
      {value ? null : <Kbd className="absolute right-2 max-md:hidden">/</Kbd>}
    </label>
  );
}

/**
 * A faceted filter: dashed until set, then solid with the chosen value beside its name. One choice
 * at a time; "Any" clears it.
 */
export function Facet<T extends string>({
  label,
  value,
  options,
  onChange,
  anyLabel = "Any",
  className,
}: {
  label: string;
  value: T | null;
  options: readonly { value: T; label: string; group?: string }[];
  onChange: (value: T | null) => void;
  anyLabel?: string;
  className?: string;
}) {
  const chosen = options.find((o) => o.value === value);
  let lastGroup: string | undefined;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn(!chosen && "border-dashed", className)}>
          <CirclePlus aria-hidden="true" className="text-muted-foreground" />
          {label}
          {chosen ? (
            <>
              <Separator orientation="vertical" className="mx-0.5 data-[orientation=vertical]:h-4" />
              <Badge variant="secondary" className="rounded-sm px-1.5 font-normal">
                {chosen.label}
              </Badge>
            </>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuItem onSelect={() => onChange(null)}>
          {anyLabel}
          {value === null ? <Check aria-hidden="true" className="ml-auto size-4 text-foreground!" /> : null}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {options.map((o) => {
          const header = o.group && o.group !== lastGroup ? o.group : null;
          lastGroup = o.group;
          return (
            <div key={o.value}>
              {header ? <DropdownMenuLabel>{header}</DropdownMenuLabel> : null}
              <DropdownMenuItem onSelect={() => onChange(o.value)}>
                {o.label}
                {o.value === value ? <Check aria-hidden="true" className="ml-auto size-4 text-foreground!" /> : null}
              </DropdownMenuItem>
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One view of a list ("Needs a driver", "Archived"): its words, its count, and whether it needs a person. */
export interface ViewOption<T extends string> {
  value: T;
  label: string;
  /** A number, or words such as "25+" when the list stops counting. */
  count?: number | string;
  /** A queue that needs a person: its count is blue, and the closed select shows a dot while it has any. */
  attention?: boolean;
}

/**
 * Which slice of a list is on screen, as a select beside the other filters (not tabs: tabs are for the
 * sections of one record). Counts show in the menu; a view that needs a person and has items puts a blue
 * dot on the closed select, so the queue is not hidden behind it.
 */
export function ViewSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: readonly ViewOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const has = (o: ViewOption<T>) => Number.parseInt(String(o.count ?? 0), 10) > 0;
  const waiting = options.some((o) => o.value !== value && o.attention && has(o));
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger aria-label={label} className={cn("min-w-44 font-medium", className)}>
        <SelectValue />
        {waiting ? (
          <span aria-label="Another view needs attention" className="ml-auto size-2 shrink-0 rounded-full bg-primary-fill" />
        ) : null}
      </SelectTrigger>
      <SelectContent align="start" className="min-w-56">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
            {o.count !== undefined ? (
              <TabsCount tone={o.attention && has(o) ? "primary" : undefined} className="ml-auto">
                {o.count}
              </TabsCount>
            ) : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Clears every facet and the search — shown only while something is set. */
export function ResetFilters({ onReset }: { onReset: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onReset}>
      Reset
      <X aria-hidden="true" />
    </Button>
  );
}
