import { useEffect, useState, type ReactNode } from "react";

import { Link, useLocation } from "@tanstack/react-router";
import { ChevronRight, Search, X } from "lucide-react";

import { cn } from "@effy/design-system";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@effy/design-system/ui";

import { Kbd } from "../patterns/Kbd";
import {
  staffActiveKey,
  staffLinkOf,
  type DefaultTabs,
  type StaffNavEntry,
  type StaffNavGroup,
  type StaffNavLeaf,
} from "./staff-nav";

/**
 * The consoles' sidebar — shadcn sidebar-07 (`collapsible="icon"`), dressed as the redesign's
 * "Sidebar — expanded" / "Sidebar — icon rail" boards (styles: @effy/design-system/backoffice/shell.css).
 *
 * 256px expanded; folded (⌘B, or always at 768–1023) a 96px labelled rail — icon over word; below 768
 * the same content in a left sheet opened from the header's menu button.
 */
export interface StaffSidebarProps {
  brand: { name: string; surface: string };
  groups: readonly StaffNavGroup[];
  defaultTabs?: DefaultTabs;
  counts: Readonly<Partial<Record<string, number>>>;
  onOpenSearch: () => void;
  /** The account menu (StaffUserMenu). */
  footer: ReactNode;
}

export function StaffSidebar({ brand, groups, defaultTabs, counts, onOpenSearch, footer }: StaffSidebarProps) {
  const { pathname, search } = useLocation();
  const tab = typeof (search as { tab?: unknown }).tab === "string" ? (search as { tab: string }).tab : undefined;
  const active = staffActiveKey(groups, { pathname, tab }, defaultTabs);
  const { isMobile, openMobile, setOpenMobile } = useSidebar();

  // Below 768 the rail is a sheet: choosing a page closes it, so the page is what the person sees.
  useEffect(() => {
    setOpenMobile(false);
  }, [pathname, tab, setOpenMobile]);

  return (
    <Sidebar collapsible="icon" className="bo-sidebar">
      {isMobile && openMobile ? (
        <button type="button" className="bo-iconbtn bo-sheet-close" aria-label="Close menu" onClick={() => setOpenMobile(false)}>
          <X aria-hidden="true" />
        </button>
      ) : null}
      <SidebarHeader className="bo-sb-head">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip={`${brand.name} ${brand.surface}`} className="bo-sb-btn bo-sb-brand">
              <Link to="/">
                <span aria-hidden="true" className="bo-logo">
                  e<b>.</b>
                </span>
                <span className="bo-sb-label grid min-w-0 flex-1 leading-tight">
                  <strong className="truncate text-sm font-semibold">{brand.name}</strong>
                  <span className="truncate text-xs text-muted-foreground">{brand.surface}</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <button type="button" className="bo-sb-search" aria-label="Search and commands" onClick={onOpenSearch}>
          <Search aria-hidden="true" />
          <span className="truncate group-data-[collapsible=icon]:hidden">Search or jump to…</span>
          <Kbd className="ml-auto group-data-[collapsible=icon]:hidden">⌘K</Kbd>
        </button>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group, index) => (
          <SidebarGroup key={group.label} className="bo-sb-group">
            {/* In the folded rail a 1px rule replaces the group labels. */}
            {index > 0 ? <div aria-hidden="true" className="bo-sb-rule" /> : null}
            <SidebarGroupLabel className="bo-sb-grouplabel">{group.label}</SidebarGroupLabel>
            <SidebarMenu className="bo-sb-menu">
              {group.items.map((item) =>
                item.subs && item.subs.length > 0 ? (
                  <NavGroupItem key={item.key} item={item} active={active} counts={counts} />
                ) : (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton asChild isActive={active === item.key} tooltip={item.label} className="bo-sb-btn">
                      <Link {...staffLinkOf(item)} aria-current={active === item.key ? "page" : undefined}>
                        <item.icon aria-hidden="true" />
                        <span className="bo-sb-label">{item.label}</span>
                        <CountBadge n={item.count ? counts[item.count] : undefined} strong={item.countTone === "strong"} />
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ),
              )}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="bo-sb-foot">{footer}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

/**
 * An entry with sub-pages. The chevron turns and the sub-pages slide open under it (220 ms); the group
 * holding the page on screen opens itself on load without animating — motion explains a change the
 * person made, never one the page made for them.
 */
function NavGroupItem({
  item,
  active,
  counts,
}: {
  item: StaffNavEntry;
  active: string | null;
  counts: Readonly<Partial<Record<string, number>>>;
}) {
  const subs = item.subs ?? [];
  const holdsActive = subs.some((s) => s.key === active);
  const [open, setOpen] = useState(holdsActive);
  const [animate, setAnimate] = useState(false);
  const { state, isMobile, setOpen: setSidebarOpen } = useSidebar();

  // Navigating into a group (from the palette, a link on a page) opens it.
  useEffect(() => {
    if (holdsActive) setOpen(true);
  }, [holdsActive]);

  // A group's own count is only worth showing while its sub-pages are hidden.
  const total = sumCounts(subs, counts);
  const strong = subs.some((s) => s.countTone === "strong");

  // In the folded rail there is nowhere to open a group into: the icon goes to its first page.
  if (state === "collapsed" && !isMobile) {
    const first = subs[0]!;
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={holdsActive} tooltip={item.label} className="bo-sb-btn">
          <Link {...staffLinkOf(first)} onClick={() => setSidebarOpen(false)}>
            <item.icon aria-hidden="true" />
            <span className="bo-sb-label">{item.label}</span>
            <CountBadge n={total} strong={strong} />
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible
      asChild
      open={open}
      onOpenChange={(next) => {
        setAnimate(true);
        setOpen(next);
      }}
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={item.label} className="bo-sb-btn" data-open={open ? "true" : "false"}>
            <item.icon aria-hidden="true" />
            <span className="bo-sb-label">{item.label}</span>
            {!open ? <CountBadge n={total} strong={strong} /> : null}
            <ChevronRight aria-hidden="true" className="bo-sb-chev" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent className={cn("bo-sb-collapse", animate && "is-animated")}>
          <SidebarMenuSub className="bo-sb-sub">
            {subs.map((sub) => (
              <SidebarMenuSubItem key={sub.key}>
                <SidebarMenuSubButton asChild isActive={active === sub.key} className="bo-sb-subbtn">
                  <Link {...staffLinkOf(sub)} aria-current={active === sub.key ? "page" : undefined}>
                    <span className="bo-sb-label">{sub.label}</span>
                    <CountBadge n={sub.count ? counts[sub.count] : undefined} strong={sub.countTone === "strong"} small />
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function sumCounts(subs: readonly StaffNavLeaf[], counts: Readonly<Partial<Record<string, number>>>): number | undefined {
  let total: number | undefined;
  for (const s of subs) {
    const n = s.count ? counts[s.count] : undefined;
    if (typeof n === "number") total = (total ?? 0) + n;
  }
  return total;
}

/**
 * A count that rolls to its new number (220 ms) so a falling queue reads as progress. Zero is not
 * shown: "0 waiting" is noise on a rail read at a glance. In the folded rail it becomes a dot, so
 * folding the rail never hides that something needs a person.
 */
function CountBadge({ n, strong = false, small = false }: { n: number | undefined; strong?: boolean; small?: boolean }) {
  if (typeof n !== "number" || n <= 0) return null;
  return (
    <>
      <span className={cn("bo-count", strong && "is-strong", small && "is-small")} aria-label={`${n} need attention`}>
        <span key={n} className="bo-count__n">
          {n}
        </span>
      </span>
      <span aria-hidden="true" className={cn("bo-count-dot", strong && "is-strong")} />
    </>
  );
}
