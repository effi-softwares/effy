import { Link } from "@tanstack/react-router";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

// Block-07's team switcher, reduced to a single brand mark (Effy is single-brand — no team/org
// switching). Same structure as the block so the collapsed icon rail centers correctly.
export function TeamSwitcher() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          asChild
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <Link to="/">
            <div className="flex aspect-square size-8 items-center justify-center rounded-full bg-sidebar-primary font-semibold text-sidebar-primary-foreground">
              E
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">Effy</span>
              <span className="truncate text-xs">Back-Office</span>
            </div>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
