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
}

export function ConsoleHeader<TRole extends string>({
  surfaceLabel,
  nav,
}: ConsoleHeaderProps<TRole>) {
  const { pathname } = useLocation();
  const section = currentSection(nav, pathname);

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
    </header>
  );
}
