import type { ReactNode } from "react";

import { Link, type LinkProps } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { cn } from "@effy/design-system";

import { useHeaderBack, type HeaderBack } from "../console/StaffHeader";

/**
 * A page's head (Patterns board): title 24/32 semibold (20 on a phone), one muted line saying what
 * the page is for, actions on the right that go full width on a phone. A record page's back link goes
 * in the console header, before the breadcrumb; outside a console it sits above the title.
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
  back?: HeaderBack;
  meta?: ReactNode;
}) {
  const inHeader = useHeaderBack(back);
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-1">
        {back && !inHeader ? (
          <Link
            {...back.link}
            className="-mt-2.5 -mb-1.5 inline-flex min-h-11 w-fit items-center gap-1.5 text-[15px] text-muted-foreground no-underline hover:text-foreground [&_svg]:size-4"
          >
            <ArrowLeft aria-hidden="true" />
            {back.label}
          </Link>
        ) : null}
        <h1 className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[26px] leading-[32px] font-semibold tracking-[-0.02em] max-md:text-[22px] max-md:leading-[28px]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-[72ch] text-[15px] leading-[22px] text-pretty text-muted-foreground">{description}</p>
        ) : null}
        {meta ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[14px] text-muted-foreground [&_svg]:size-3.5 [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1.5">
            {meta}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 max-md:w-full max-md:[&>[data-slot=button]]:grow">{actions}</div>
      ) : null}
    </div>
  );
}

/**
 * Saved views of one list, as underlined tabs with counts (Patterns board). Views are links, so the
 * view is in the URL and its link opens the same list for anyone. For independent sections of one
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
    <nav className="ef-tabs" aria-label={label}>
      {views.map((v) => (
        <Link
          key={v.key}
          {...v.link}
          className={cn("ef-tabs__tab", v.key === active && "is-active")}
          aria-current={v.key === active ? "page" : undefined}
        >
          {v.label}
          {typeof v.count === "number" ? (
            <span className={cn("ef-tabs__count", v.attention && v.key !== active && "ef-tabs__count--primary")}>{v.count}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
