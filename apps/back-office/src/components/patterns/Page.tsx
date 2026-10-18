import type { ReactNode } from "react";

import { Link, type LinkProps } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { cn } from "@effy/design-system";

/**
 * A page's head (Patterns board): title 24/32 semibold (20 on a phone), one muted line saying what
 * the page is for, actions on the right that go full width on a phone. An optional back link sits
 * above the title on a record page.
 */
export function PageHeader({
  title,
  description,
  actions,
  back,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { label: string; link: LinkProps };
  meta?: ReactNode;
}) {
  return (
    <div className="bo-page-head">
      <div className="bo-page-head__text">
        {back ? (
          <Link {...back.link} className="bo-back">
            <ArrowLeft aria-hidden="true" />
            {back.label}
          </Link>
        ) : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {meta ? <div className="bo-meta">{meta}</div> : null}
      </div>
      {actions ? <div className="bo-page-head__actions">{actions}</div> : null}
    </div>
  );
}

/**
 * Saved views of one list, as underlined tabs with counts (Patterns board). Views are links, so the
 * view is in the URL and its link opens the same list for anyone. For independent SECTIONS of one
 * record, use shadcn Tabs instead.
 */
export interface ViewTab {
  key: string;
  label: string;
  link: LinkProps;
  count?: number;
  /** A queue that needs a person: its count is blue. */
  attention?: boolean;
}

export function ViewTabs({ views, active, label }: { views: readonly ViewTab[]; active: string; label: string }) {
  return (
    <nav className="bo-tabs" aria-label={label}>
      {views.map((v) => (
        <Link
          key={v.key}
          {...v.link}
          className={cn("bo-tabs__tab", v.key === active && "is-active")}
          aria-current={v.key === active ? "page" : undefined}
        >
          {v.label}
          {typeof v.count === "number" ? (
            <span className={cn("bo-tabs__count", v.attention && v.key !== active && "bo-tabs__count--primary")}>{v.count}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
