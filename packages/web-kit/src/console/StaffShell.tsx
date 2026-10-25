import { useEffect, useState, type ReactNode } from "react";

import { SidebarInset, SidebarProvider } from "@effy/design-system/ui";

import { HeaderDetailProvider, StaffHeader } from "./StaffHeader";
import { StaffSidebar } from "./StaffSidebar";
import type { DefaultTabs, StaffNavGroup } from "./staff-nav";

/**
 * The authenticated frame BOTH consoles render inside — back-office and shop-web are one shell, one
 * scale, one theme. shadcn sidebar-07 dressed as the redesign's "Foundations and shell" boards; styles
 * in @effy/design-system/backoffice/shell.css. Everything that differs is a prop. Wired by hand; no DI.
 *
 * Breakpoints: ≥1024 the 256px sidebar (folds to the 96px labelled rail with ⌘B, remembered per
 * person); 768–1023 always the rail, whatever was remembered; <768 the sidebar is a sheet behind the
 * header's menu button.
 */
export interface StaffShellProps {
  brand: { name: string; surface: string };
  /** The header's fallback where the nav names no page, e.g. "Effy Back-Office". */
  title: string;
  /** Already filtered for the person (`visibleStaffGroups`). */
  groups: readonly StaffNavGroup[];
  defaultTabs?: DefaultTabs;
  counts: Readonly<Partial<Record<string, number>>>;
  onOpenSearch: () => void;
  searchPrompt: string;
  headerActions?: ReactNode;
  /** The record on screen, when the surface derives it itself; otherwise pages call `useHeaderDetail`. */
  headerDetail?: string | null;
  /** The account menu (StaffUserMenu) — the header's right corner. */
  userMenu: ReactNode;
  /** Controlled fold — held in the surface's client store. */
  sidebarOpen: boolean;
  onSidebarOpenChange: (open: boolean) => void;
  /** Dialogs and palettes that sit outside the scroll region. */
  overlays?: ReactNode;
  children: ReactNode;
}

const TABLET = "(min-width: 768px) and (max-width: 1023px)";

function useMatches(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export function StaffShell({
  brand,
  title,
  groups,
  defaultTabs,
  counts,
  onOpenSearch,
  searchPrompt,
  headerActions,
  headerDetail,
  userMenu,
  sidebarOpen,
  onSidebarOpenChange,
  overlays,
  children,
}: StaffShellProps) {
  const tablet = useMatches(TABLET);
  // In the tablet range the rail is the default; the trigger can still open it for the moment.
  const [tabletOpen, setTabletOpen] = useState(false);

  useEffect(() => {
    if (!tablet) setTabletOpen(false);
  }, [tablet]);

  return (
    <SidebarProvider
      open={tablet ? tabletOpen : sidebarOpen}
      onOpenChange={tablet ? setTabletOpen : onSidebarOpenChange}
      mobileBreakpoint={768}
      className="bo-shell"
    >
      <StaffSidebar
        brand={brand}
        groups={groups}
        defaultTabs={defaultTabs}
        counts={counts}
      />
      <SidebarInset className="min-w-0 bg-background">
        <HeaderDetailProvider>
          <StaffHeader
            title={title}
            groups={groups}
            defaultTabs={defaultTabs}
            onOpenSearch={onOpenSearch}
            searchPrompt={searchPrompt}
            actions={headerActions}
            account={userMenu}
            detail={headerDetail}
          />
          <main className="bo-content">{children}</main>
        </HeaderDetailProvider>
      </SidebarInset>
      {overlays}
    </SidebarProvider>
  );
}
