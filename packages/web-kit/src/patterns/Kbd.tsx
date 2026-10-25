import type { ComponentProps } from "react";

import { cn } from "@effy/design-system";

/** A key cap — ⌘K, /, G D. Geist Mono 11px on the muted well (Foundations, "Other signals"). */
export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center gap-1 rounded-sm border border-border bg-muted px-1 font-mono text-xs leading-none font-medium whitespace-nowrap text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
