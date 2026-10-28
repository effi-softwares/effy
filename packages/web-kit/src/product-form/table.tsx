import type { ReactNode } from "react";

import { cn } from "@effy/design-system";
import { Table, TableCell, TableHead } from "@effy/design-system/ui";

/** The form's small table pieces, on shadcn's Table (shared by both consoles). */
export function MicroLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-sm font-medium whitespace-nowrap text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TableFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <Table>{children}</Table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  width,
}: {
  children?: ReactNode;
  align?: "left" | "right";
  width?: string;
}) {
  return (
    <TableHead
      numeric={align === "right"}
      style={width ? { width } : undefined}
    >
      {children}
    </TableHead>
  );
}

export function Td({
  children,
  align = "left",
  className,
}: {
  children?: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <TableCell numeric={align === "right"} className={className}>
      {children}
    </TableCell>
  );
}
