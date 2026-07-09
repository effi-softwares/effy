import { useLocation } from "@tanstack/react-router";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { NAV } from "./nav";

// Breadcrumb label for the active route, derived from the router (never hand-held).
function currentSection(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  const match = NAV.find((item) => item.to !== "/" && pathname.startsWith(item.to));
  return match?.label ?? "Dashboard";
}

// Inset header (Amendment D1 / FR-023): the sidebar collapse trigger + a route breadcrumb.
export function AppHeader() {
  const { pathname } = useLocation();
  const section = currentSection(pathname);

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 !h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="hidden md:block">
            <BreadcrumbPage className="text-muted-foreground">Effy Back-Office</BreadcrumbPage>
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
