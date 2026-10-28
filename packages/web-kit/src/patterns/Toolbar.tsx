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
} from "@effy/design-system/ui";

/** The row above a list: search, faceted filters, and the list's own controls (Patterns board). */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>;
}

export function ToolbarSpacer() {
  return <span className="flex-auto" />;
}

/** The list's search. "/" focuses it from anywhere on the page (not while typing in another field). */
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
    <label className="relative flex w-80 max-w-full items-center max-md:w-full">
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

/** Clears every facet and the search — shown only while something is set. */
export function ResetFilters({ onReset }: { onReset: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onReset}>
      Reset
      <X aria-hidden="true" />
    </Button>
  );
}

/** Keyset paging: Back / Next, a rows-per-page choice, and what is on screen. */
export function Pager({
  summary,
  canBack,
  canNext,
  onBack,
  onNext,
  rows,
  onRows,
}: {
  summary: ReactNode;
  canBack: boolean;
  canNext: boolean;
  onBack: () => void;
  onNext: () => void;
  rows?: number;
  onRows?: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t px-4 py-3 text-sm text-muted-foreground">
      <span>{summary}</span>
      <div className="flex items-center gap-4">
        {rows !== undefined && onRows ? (
          <div className="flex items-center gap-2 max-md:hidden">
            Rows
            <Select value={String(rows)} onValueChange={(v) => onRows(Number(v))}>
              <SelectTrigger size="sm" aria-label="Rows per page" className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[25, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={!canBack} onClick={onBack}>
            Back
          </Button>
          <Button variant="outline" size="sm" disabled={!canNext} onClick={onNext}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
