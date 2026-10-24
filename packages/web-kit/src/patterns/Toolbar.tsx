import { useEffect, useRef, type ReactNode } from "react";

import { Check, CirclePlus, Search, X } from "lucide-react";

import { cn } from "@effy/design-system";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
} from "@effy/design-system/ui";

import { Kbd } from "./Kbd";

/** The row above a list: search, faceted filters, and the list's own controls (Patterns board). */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("bo-toolbar", className)}>{children}</div>;
}

export function ToolbarSpacer() {
  return <span className="bo-toolbar__spacer" />;
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
    <label className="bo-toolbar__search">
      <Search aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <Input
        ref={ref}
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8! pr-8! pl-[34px]! text-[13px]!"
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
        <button type="button" className={cn("bo-facet", chosen && "is-set", className)}>
          <CirclePlus aria-hidden="true" />
          {label}
          {chosen ? (
            <>
              <span className="bo-facet__sep" aria-hidden="true" />
              <span className="bo-facet__val">{chosen.label}</span>
            </>
          ) : null}
        </button>
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
    <div className="bo-pager">
      <span>{summary}</span>
      <div className="bo-pager__right">
        {rows !== undefined && onRows ? (
          <label className="bo-pager__rows flex items-center gap-2">
            Rows
            <select
              aria-label="Rows per page"
              value={rows}
              onChange={(e) => onRows(Number(e.target.value))}
              className="h-8 rounded-md border border-input bg-background px-2 text-[13px] shadow-xs"
            >
              {[25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="bo-pager__btns">
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
