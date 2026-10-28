import type { ReactNode } from "react";

import { cn } from "@effy/design-system";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@effy/design-system/ui";

/**
 * A titled section: shadcn's Card with a ruled head, a body and an optional foot for the panel's own
 * Cancel / Save — never a metric tile.
 */
export function Panel({
  title,
  description,
  icon,
  actions,
  footer,
  footerBetween = false,
  flush = false,
  className,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  footerBetween?: boolean;
  /** The body is a table or list that runs to the edges. */
  flush?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("min-w-0", className)}>
      <Card className="gap-0 overflow-hidden py-0">
        {title ? (
          <CardHeader className="border-b py-4 [.border-b]:pb-4">
            <CardTitle className="leading-6">
              <h2 className="flex items-center gap-2 [&_svg]:size-4 [&_svg]:text-muted-foreground">
                {icon}
                {title}
              </h2>
            </CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
            {actions ? <CardAction className="flex-wrap">{actions}</CardAction> : null}
          </CardHeader>
        ) : null}
        {flush ? children : <CardContent className="py-4">{children}</CardContent>}
        {footer ? (
          <CardFooter
            className={cn(
              "flex-wrap gap-2 border-t bg-muted/40 py-3 [.border-t]:pt-3",
              footerBetween ? "justify-between" : "justify-end",
            )}
          >
            {footer}
          </CardFooter>
        ) : null}
      </Card>
    </section>
  );
}

/** Label / value rows: a fixed label column, wrapping to one column on a phone. */
export function DetailRows({
  rows,
  tight = false,
}: {
  rows: readonly { label: ReactNode; value: ReactNode; key?: string }[];
  tight?: boolean;
}) {
  return (
    <dl className="flex flex-col">
      {rows.map((r, i) => (
        <div
          key={r.key ?? i}
          className={cn(
            "grid gap-x-4 gap-y-1 border-b py-2.5 text-sm last:border-b-0 max-sm:grid-cols-1",
            tight ? "grid-cols-[112px_minmax(0,1fr)]" : "grid-cols-[160px_minmax(0,1fr)]",
          )}
        >
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd className="m-0 min-w-0">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
