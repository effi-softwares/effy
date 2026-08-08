import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@effy/design-system/ui";

/**
 * The shared operator-console overview landing (feature 041). Adopts the shadcn `dashboard-01`
 * shape: a row of summary cards, an optional chart region, and a table/detail region below.
 *
 * ⚠ Principle V normally biases AWAY from metric cards. The internal operator consoles are the
 * recorded exception (specs/041-monochrome-console-redesign/plan.md § "card-layout justification"):
 * an at-a-glance operator overview is the demonstrably-right use of a summary layout, and it does
 * NOT extend to customer-facing surfaces. Everything variable is a prop, so both consoles use one
 * scaffold rather than two copies (Principle II).
 */
export interface OverviewStat {
  /** Short caption above the figure, e.g. "Orders to pick". */
  label: string;
  /** The headline figure. */
  value: ReactNode;
  /** Optional one-line context under the figure. */
  hint?: ReactNode;
}

export interface DashboardOverviewProps {
  /** The greeting/heading row. */
  title: ReactNode;
  description?: ReactNode;
  /** Summary cards (the section-cards row). */
  stats: readonly OverviewStat[];
  /** Optional chart region (compose with `@effy/design-system/ui` chart primitive + --chart-* tokens). */
  chart?: ReactNode;
  /** The table/detail region below the summary. */
  children?: ReactNode;
}

export function DashboardOverview({
  title,
  description,
  stats,
  chart,
  children,
}: DashboardOverviewProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-muted-foreground">{description}</p> : null}
      </div>

      {stats.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <CardDescription>{s.label}</CardDescription>
                <CardTitle className="text-3xl font-semibold tabular-nums">{s.value}</CardTitle>
              </CardHeader>
              {s.hint ? (
                <CardContent className="text-muted-foreground text-sm">{s.hint}</CardContent>
              ) : null}
            </Card>
          ))}
        </div>
      ) : null}

      {chart}
      {children}
    </div>
  );
}
