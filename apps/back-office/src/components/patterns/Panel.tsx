import type { ReactNode } from "react";

import { cn } from "@effy/design-system";

/**
 * A titled section, flat with a hairline — never a metric tile (Patterns board, "Detail rows and
 * panels"). Head, body and an optional muted foot for the panel's own Cancel / Save.
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
    <section className={cn("bo-panel", className)}>
      {title ? (
        <div className="bo-panel__head">
          <div className="min-w-0">
            <h2 className="bo-panel__title">
              {icon}
              {title}
            </h2>
            {description ? <p className="bo-panel__desc">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {flush ? children : <div className="bo-panel__body">{children}</div>}
      {footer ? <div className={cn("bo-panel__foot", footerBetween && "bo-panel__foot--between")}>{footer}</div> : null}
    </section>
  );
}

/** Label / value rows: 180px labels, wrapping to one column on a phone. */
export function DetailRows({
  rows,
  tight = false,
}: {
  rows: readonly { label: ReactNode; value: ReactNode; key?: string }[];
  tight?: boolean;
}) {
  return (
    <dl className={cn("bo-dl", tight && "bo-dl--tight")}>
      {rows.map((r, i) => (
        <div key={r.key ?? i} className="bo-dl__row">
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
