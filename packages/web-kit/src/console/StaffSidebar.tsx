import { useEffect, useRef, useState } from "react";

import { Link, useLocation } from "@tanstack/react-router";
import { Check, ChevronDown, ChevronRight, X } from "lucide-react";

import { cn } from "@effy/design-system";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Sidebar,
  SidebarContent,
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
 * "Sidebar — expanded" / "Sidebar — icon rail" boards (styles: @effy/design-system/console.css).
 *
 * 256px expanded; folded (⌘B, or always at 768–1023) a 96px labelled rail — icon over word; below 768
 * the same content in a left sheet opened from the header's menu button.
 */
export interface StaffSidebarProps {
  brand: { name: string; surface: string };
  groups: readonly StaffNavGroup[];
  defaultTabs?: DefaultTabs;
  counts: Readonly<Partial<Record<string, number>>>;
}

/** Search and the account menu live in the header only — the rail carries the menu and nothing else. */
export function StaffSidebar({ brand, groups, defaultTabs, counts }: StaffSidebarProps) {
  const { pathname, search } = useLocation();
  const tab = typeof (search as { tab?: unknown }).tab === "string" ? (search as { tab: string }).tab : undefined;
  const active = staffActiveKey(groups, { pathname, tab, query: search as Record<string, unknown> }, defaultTabs);
  const { isMobile, openMobile, setOpenMobile, state } = useSidebar();
  const { scroller, more } = useOverflow([groups, state, isMobile, openMobile]);

  // Below 768 the rail is a sheet: choosing a page closes it, so the page is what the person sees.
  useEffect(() => {
    setOpenMobile(false);
  }, [pathname, tab, setOpenMobile]);

  return (
    <Sidebar collapsible="icon" className="ef-sidebar">
      {isMobile && openMobile ? (
        <Button
          variant="outline"
          size="icon"
          className="absolute top-3 left-[calc(100%+10px)] z-1 rounded-full shadow-md"
          aria-label="Close menu"
          onClick={() => setOpenMobile(false)}
        >
          <X aria-hidden="true" />
        </Button>
      ) : null}
      <SidebarHeader className="ef-sb-head">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip={`${brand.name} ${brand.surface}`} className="ef-sb-btn ef-sb-brand">
              <Link to="/">
                <span aria-hidden="true" className="ef-logo">
                  e<b>.</b>
                </span>
                <span className="ef-sb-label grid min-w-0 flex-1 leading-tight">
                  <strong className="truncate text-sm font-semibold">{brand.name}</strong>
                  <span className="truncate text-xs text-muted-foreground">{brand.surface}</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent
        ref={scroller}
        data-more-above={more.above ? "true" : undefined}
        data-more-below={more.below ? "true" : undefined}
      >
        {groups.map((group, index) => (
          <SidebarGroup key={group.label} className="ef-sb-group">
            {/* In the folded rail a 1px rule replaces the group labels. */}
            {index > 0 ? <div aria-hidden="true" className="ef-sb-rule" /> : null}
            <SidebarGroupLabel className="ef-sb-grouplabel">{group.label}</SidebarGroupLabel>
            <SidebarMenu className="ef-sb-menu">
              {group.items.map((item) =>
                item.subs && item.subs.length > 0 ? (
                  <NavGroupItem key={item.key} item={item} active={active} counts={counts} />
                ) : (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton asChild isActive={active === item.key} tooltip={item.label} className="ef-sb-btn">
                      <Link {...staffLinkOf(item)} aria-current={active === item.key ? "page" : undefined}>
                        <item.icon aria-hidden="true" />
                        <span className="ef-sb-label">{item.label}</span>
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
      {/* More of the menu below the edge: the list fades out there, and this nudges down three times
          when it appears, then rests. A tap scrolls most of a screen — scrolling still works as ever. */}
      {more.below ? (
        <button
          type="button"
          className="ef-sb-more"
          aria-label="Show more of the menu"
          onClick={() => scroller.current?.scrollBy({ top: scroller.current.clientHeight * 0.75 })}
        >
          <ChevronDown aria-hidden="true" />
        </button>
      ) : null}

      <SidebarRail />
    </Sidebar>
  );
}

/**
 * Whether the menu runs past its top or bottom edge — the scroll hint's only input. Re-measured on
 * scroll, on resize (of the rail or of the menu, e.g. a group opening) and when the rail folds.
 */
function useOverflow(deps: readonly unknown[]) {
  const scroller = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ above: false, below: false });

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      const above = el.scrollTop > 4;
      const below = el.scrollTop + el.clientHeight < el.scrollHeight - 4;
      setMore((m) => (m.above === above && m.below === below ? m : { above, below }));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    for (const child of Array.from(el.children)) resize.observe(child);
    return () => {
      el.removeEventListener("scroll", measure);
      resize.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run when the menu or the rail's shape changes
  }, deps);

  return { scroller, more };
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
  const { state, isMobile } = useSidebar();

  // Navigating into a group (from the palette, a link on a page) opens it.
  useEffect(() => {
    if (holdsActive) setOpen(true);
  }, [holdsActive]);

  // A group's own count is only worth showing while its sub-pages are hidden.
  const total = sumCounts(subs, counts);
  const strong = subs.some((s) => s.countTone === "strong");

  // In the folded rail the sub-pages cannot open under the entry, so a TAP opens them in a menu beside
  // the rail — never hover, which a finger cannot do. 44px rows (touch.css), each with its count; the
  // page on screen is marked. A small chevron on the rail item says it holds more than one page.
  if (state === "collapsed" && !isMobile) {
    return (
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton isActive={holdsActive} className="ef-sb-btn" aria-label={`${item.label}: ${subs.length} pages`}>
              <item.icon aria-hidden="true" />
              <span className="ef-sb-label">{item.label}</span>
              <ChevronRight aria-hidden="true" className="ef-sb-flyhint" />
              <CountBadge n={total} strong={strong} />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" sideOffset={8} className="ef-sb-flyout">
            <DropdownMenuLabel>{item.label}</DropdownMenuLabel>
            {subs.map((sub) => {
              const n = sub.count ? counts[sub.count] : undefined;
              const here = active === sub.key;
              return (
                <DropdownMenuItem key={sub.key} asChild data-active={here ? "true" : undefined}>
                  <Link {...staffLinkOf(sub)} aria-current={here ? "page" : undefined}>
                    <span className="min-w-0 flex-1 truncate">{sub.label}</span>
                    {typeof n === "number" && n > 0 ? (
                      <span className={cn("ef-count", sub.countTone === "strong" && "is-strong")}>{n}</span>
                    ) : null}
                    {here ? <Check aria-hidden="true" className="size-4" /> : null}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
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
          <SidebarMenuButton tooltip={item.label} className="ef-sb-btn" data-open={open ? "true" : "false"}>
            <item.icon aria-hidden="true" />
            <span className="ef-sb-label">{item.label}</span>
            {!open ? <CountBadge n={total} strong={strong} /> : null}
            <ChevronRight aria-hidden="true" className="ef-sb-chev" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent className={cn("ef-sb-collapse", animate && "is-animated")}>
          <SidebarMenuSub className="ef-sb-sub">
            {subs.map((sub) => (
              <SidebarMenuSubItem key={sub.key}>
                <SidebarMenuSubButton asChild isActive={active === sub.key} className="ef-sb-subbtn">
                  <Link {...staffLinkOf(sub)} aria-current={active === sub.key ? "page" : undefined}>
                    <span className="ef-sb-label">{sub.label}</span>
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
      <span className={cn("ef-count", strong && "is-strong", small && "is-small")} aria-label={`${n} need attention`}>
        <span key={n} className="ef-count__n">
          {n}
        </span>
      </span>
      <span aria-hidden="true" className={cn("ef-count-dot", strong && "is-strong")} />
    </>
  );
}
