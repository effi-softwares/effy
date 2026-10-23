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
  /** Optional right-aligned controls. */
  actions?: ReactNode;
  /**
   * Replaces the breadcrumb with a title, a hairline and a subtitle (the screen's one-line context,
   * e.g. "8 waiting · 2 at risk"). A screen supplying it must not render its own heading.
   */
  title?: ReactNode;
  subtitle?: ReactNode;
  /**
   * A breadcrumb trail in place of the title, followed by the hairline and subtitle. It replaces the
   * `<h1>` rather than going inside it (links inside a heading read as one long title); the surface
   * owns the page's heading.
   */
  breadcrumb?: ReactNode;
}

export function ConsoleHeader<TRole extends string>({
  surfaceLabel,
  nav,
  actions,
  title,
  subtitle,
  breadcrumb,
}: ConsoleHeaderProps<TRole>) {
  const { pathname } = useLocation();
  const section = currentSection(nav, pathname);

  // 56px and sticky. A screen supplying `title` must not repeat it as its own heading.
  if (title !== undefined || breadcrumb !== undefined) {
    return (
      <header className="bg-background sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b px-[var(--pad)]">
        {/* The trigger, a hairline, then the trail. The trigger alone collapses the rail; below 1100px
            it opens the sheet. */}
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="!h-4" />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {breadcrumb !== undefined ? (
            // May shrink: a long product name truncates rather than widening the header.
            <div className="min-w-0">{breadcrumb}</div>
          ) : (
            <h1 className="shrink-0 text-sm font-semibold tracking-[-.01em] whitespace-nowrap">{title}</h1>
          )}
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
