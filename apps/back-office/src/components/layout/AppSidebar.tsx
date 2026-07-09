import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { sessionQuery } from "@/features/auth/queries";
import { NavMain } from "./NavMain";
import { NavUser } from "./NavUser";
import { TeamSwitcher } from "./TeamSwitcher";

// Block-07 app-sidebar. Header = brand (TeamSwitcher), content = role-aware NavMain, footer =
// NavUser. Single-brand platform → no team switching, no projects group.
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data } = useQuery(sessionQuery);
  const roles = data?.status === "signed-in" ? data.identity.roles : [];

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain roles={roles} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
