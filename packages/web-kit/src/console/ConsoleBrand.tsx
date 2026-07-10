import { Link } from "@tanstack/react-router";

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@effy/design-system/ui";

/**
 * The sidebar header's brand mark.
 *
 * Effy is single-brand, so this is where a multi-tenant console would put a team switcher. The
 * structure matches the shadcn block's so the collapsed icon rail still centers correctly.
 */
export interface ConsoleBrandProps {
  /** The letter in the brand tile, e.g. "E". */
  mark: string;
  /** The brand name, e.g. "Effy". */
  name: string;
  /** The surface name under it, e.g. "Shop" / "Back-Office". */
  surface: string;
}

export function ConsoleBrand({ mark, name, surface }: ConsoleBrandProps) {
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
              {mark}
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{name}</span>
              <span className="truncate text-xs">{surface}</span>
            </div>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
