import type { ReactNode } from "react";

import { useLocation } from "@tanstack/react-router";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Separator,
  SidebarTrigger,
} from "@effy/design-system/ui";

import { currentSection, type NavItem } from "./nav";

/** The inset header: the sidebar collapse trigger + a route-derived breadcrumb. */
export interface ConsoleHeaderProps<TRole extends string> {
  /** e.g. "Effy Shop" — the static left crumb. */
  surfaceLabel: string;
  nav: readonly NavItem<TRole>[];
  /** 057 — optional right-aligned controls. Omitted = the header renders exactly as before. */
  actions?: ReactNode;
  /**
   * ⚠ 057 — when supplied, the breadcrumb is REPLACED by a title + hairline + subtitle, which is the
   * imported design's header. Omitted, the breadcrumb renders exactly as it always has, which is what
   * keeps back-office untouched by this feature (Principle II: one shell, per-surface chrome).
   *
   * The subtitle is where the mockup puts the screen's one-line context ("8 waiting · 2 at risk"), so
   * the page below it does not need to repeat a description under its own heading.
   */
  title?: ReactNode;
  subtitle?: ReactNode;
}

export function ConsoleHeader<TRole extends string>({
  surfaceLabel,
  nav,
  actions,
  title,
  subtitle,
}: ConsoleHeaderProps<TRole>) {
  const { pathname } = useLocation();
  const section = currentSection(nav, pathname);

  // ⚠ 057's header is 56px, not 64px, and sticky. The imported design puts the page's identity here
  // rather than repeating it as an <h1> on every screen — so a screen supplying `title` must NOT also
  // render its own heading, or the same words appear twice.
  if (title !== undefined) {
    return (
      <header className="bg-background sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b px-[var(--pad)]">
        <SidebarTrigger className="-ml-1 md:hidden" />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="shrink-0 text-sm font-semibold tracking-[-.01em] whitespace-nowrap">{title}</h1>
          {subtitle ? (
            <>
              <span aria-hidden="true" className="bg-border h-4 w-px shrink-0" />
              <p className="text-muted-foreground min-w-0 truncate text-[13px]">{subtitle}</p>
            </>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
    );
  }

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 !h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="hidden md:block">
            <BreadcrumbPage className="text-muted-foreground">{surfaceLabel}</BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem>
            <BreadcrumbPage>{section}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
