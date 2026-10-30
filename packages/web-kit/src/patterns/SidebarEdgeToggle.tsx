import { ChevronLeft } from "lucide-react";

import { cn } from "@effy/design-system";
import { Button, useSidebar } from "@effy/design-system/ui";

/**
 * Hides and shows a page's right sidebar (the product form's preview, a record page's side panel): a blue circle on
 * the sidebar's edge. Open, it sits on the sidebar's left border, mostly outside it, with its arrow pointing in; closed, it waits at the
 * window's right edge, most of it showing, the arrow turned to point out. It moves with the sidebar, on the console's
 * own timing (the shell slides every sidebar on `--dur-emphasised` / `--ease-move`), and lines up with the sidebar's
 * title: a sidebar that has one gives it a row as tall as the circle, 20px under the header.
 */
export function SidebarEdgeToggle({ showLabel, hideLabel }: { showLabel: string; hideLabel: string }) {
  const { state, isMobile, openMobile, toggleSidebar } = useSidebar();
  const open = isMobile ? openMobile : state === "expanded";
  const docked = open && !isMobile;
  return (
    <Button
      type="button"
      size="icon-lg"
      aria-expanded={open}
      aria-label={open ? hideLabel : showLabel}
      title={open ? hideLabel : showLabel}
      onClick={toggleSidebar}
      // Open, mostly outside the sidebar's border (10px in, so it clears the sidebar's title); closed, two-thirds of it
      // out from the window's edge.
      style={{ right: docked ? "calc(var(--sidebar-width) - 10px)" : "-14px" }}
      className={cn(
        "fixed top-[calc(var(--header-h)+20px)] z-20 rounded-full shadow-lg ring-4 ring-background transition-[right,translate] duration-(--dur-emphasised) ease-(--ease-move)",
        !docked && "hover:-translate-x-1.5",
      )}
    >
      <ChevronLeft
        aria-hidden="true"
        // Closed, part of the circle is past the window's edge: the arrow moves into what shows.
        className={cn(
          "size-5 transition-transform duration-(--dur-emphasised) ease-(--ease-move)",
          docked ? "rotate-180" : "-translate-x-1.5",
        )}
      />
    </Button>
  );
}
