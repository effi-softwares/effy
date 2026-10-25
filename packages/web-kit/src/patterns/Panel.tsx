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
    <section className={cn("ef-panel", className)}>
      {title ? (
        <div className="ef-panel__head">
          <div className="min-w-0 flex-1">
            <h2 className="ef-panel__title">
              {icon}
              {title}
            </h2>
            {description ? <p className="ef-panel__desc">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {flush ? children : <div className="ef-panel__body">{children}</div>}
      {footer ? <div className={cn("ef-panel__foot", footerBetween && "ef-panel__foot--between")}>{footer}</div> : null}
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
    <dl className={cn("ef-dl", tight && "ef-dl--tight")}>
      {rows.map((r, i) => (
        <div key={r.key ?? i} className="ef-dl__row">
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
