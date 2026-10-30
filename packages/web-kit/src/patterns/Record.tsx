import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { Link } from "@tanstack/react-router";
import { ArrowLeft, type LucideIcon } from "lucide-react";

import { Sidebar, SidebarContent, SidebarHeader, SidebarProvider } from "@effy/design-system/ui";

import { useHeaderBack, type HeaderBack } from "../console/StaffHeader";
import { SidebarEdgeToggle } from "./SidebarEdgeToggle";

/** The side panel's width, and the window width below which it is a drawer instead (as the product form's preview). */
const RAIL_WIDTH = "360px";
const RAIL_DOCKED_FROM = 1280;

/**
 * A record page (a product, in both consoles): the head and its row of facts, a section navigator that sticks
 * under the console header, the sections on hairlines — and beside all of it the side panel (`rail`): shadcn's right
 * Sidebar under the console header, open to start, hidden and shown by the circle on its edge, a drawer on a narrower
 * screen (as the product form's preview). One page instead of tabs, so nothing about the record hides behind another
 * view. The classes are `ef-record*` in `console.css`.
 */
export function RecordPage({
  rail,
  railTitle,
  children,
}: {
  rail: ReactNode;
  railTitle: string;
  children: ReactNode;
}) {
  return (
    <SidebarProvider
      className="ef-record min-h-0"
      style={{ "--sidebar-width": RAIL_WIDTH } as CSSProperties}
      mobileBreakpoint={RAIL_DOCKED_FROM}
      keyboardShortcut={null}
    >
      <div className="ef-record__main">{children}</div>
      <Sidebar side="right" collapsible="offcanvas" className="top-(--header-h) h-auto" aria-label={railTitle}>
        <SidebarHeader className="mt-5 h-11 flex-row items-center px-6 py-0">
          <h2 className="text-sm font-semibold">{railTitle}</h2>
        </SidebarHeader>
        <SidebarContent className="px-6 pb-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{rail}</SidebarContent>
      </Sidebar>
      <SidebarEdgeToggle showLabel={`Show ${railTitle.toLowerCase()}`} hideLabel={`Hide ${railTitle.toLowerCase()}`} />
    </SidebarProvider>
  );
}

/** The record's head: its picture, where it lives, its name with its state words, a meta line and its actions. */
export function RecordHeader({
  media,
  eyebrow,
  title,
  meta,
  actions,
  back,
}: {
  media?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  back?: HeaderBack;
}) {
  const inHeader = useHeaderBack(back);
  return (
    <header className="ef-record__head">
      {media ? <div className="ef-record__media">{media}</div> : null}
      <div className="ef-record__titles">
        {back && !inHeader ? (
          <Link
            {...back.link}
            className="mb-2 inline-flex min-h-11 w-fit items-center gap-2 text-base text-muted-foreground no-underline hover:text-foreground [&_svg]:size-4"
          >
            <ArrowLeft aria-hidden="true" />
            {back.label}
          </Link>
        ) : null}
        {eyebrow ? <div className="ef-record__eyebrow">{eyebrow}</div> : null}
        <h1 className="ef-record__title">{title}</h1>
        {meta ? <div className="ef-record__meta">{meta}</div> : null}
      </div>
      {actions ? <div className="ef-record__actions">{actions}</div> : null}
    </header>
  );
}

export interface RecordFact {
  key?: string;
  label: ReactNode;
  value: ReactNode;
  /** One short line under the value. */
  note?: ReactNode;
}

/** The head's row of facts: each said once, as a labelled value. Not metric cards — they sit on one hairline. */
export function RecordFacts({ facts }: { facts: readonly RecordFact[] }) {
  return (
    <dl className="ef-record__facts" aria-label="At a glance">
      {facts.map((f, i) => (
        <div key={f.key ?? i} className="ef-record__fact">
          <dt>{f.label}</dt>
          <dd>{f.value}</dd>
          {f.note ? <dd>{f.note}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

export interface RecordNavItem {
  /** The section's element id. */
  id: string;
  label: string;
  count?: ReactNode;
  /** The count is a problem (something missing). */
  problem?: boolean;
}

/**
 * The page's sections in one row, sticking under the console header. It follows the scroll (the section in view
 * is marked) and jumps on a click. Once it sticks it shows `compact` (the record's name) and `actions`.
 */
export function RecordNav({
  items,
  compact,
  actions,
}: {
  items: readonly RecordNavItem[];
  compact?: ReactNode;
  actions?: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [current, setCurrent] = useState(items[0]?.id ?? "");
  const [stuck, setStuck] = useState(false);
  const ids = items.map((i) => i.id).join(" ");

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const nav = ref.current;
      if (!nav) return;
      const top = parseFloat(getComputedStyle(nav).top) || 0;
      const box = nav.getBoundingClientRect();
      setStuck(box.top <= top + 0.5 && window.scrollY > 0);
      const line = box.bottom + 32;
      let at = ids.split(" ")[0] ?? "";
      for (const id of ids.split(" ")) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) at = id;
      }
      // At the foot of the page the last section counts as in view, however short it is.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        at = ids.split(" ").at(-1) ?? at;
      }
      setCurrent(at);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ids]);

  return (
    <nav ref={ref} className="ef-record__nav" aria-label="Sections" data-stuck={stuck ? "" : undefined}>
      {compact ? (
        <div className="ef-record__compact" aria-hidden={!stuck}>
          {compact}
        </div>
      ) : null}
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="ef-record__navlink"
          aria-current={item.id === current ? "true" : undefined}
          onClick={() => document.getElementById(item.id)?.scrollIntoView({ block: "start" })}
        >
          {item.label}
          {item.count !== undefined && item.count !== null ? (
            <span className="ef-record__count" data-tone={item.problem ? "problem" : undefined}>
              {item.count}
            </span>
          ) : null}
        </button>
      ))}
      {actions ? <div className="ef-record__navend">{actions}</div> : null}
    </nav>
  );
}

/** One section of the page: an icon, a title, one line on what it is, its own actions, then its body. */
export function RecordSection({
  id,
  icon: Icon,
  title,
  description,
  actions,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="ef-record__section" aria-labelledby={`${id}-title`}>
      <div className="ef-record__section-head">
        <span className="ef-record__section-icon" aria-hidden="true">
          <Icon />
        </span>
        <div className="ef-record__section-text">
          <h2 id={`${id}-title`} className="ef-record__section-title">
            {title}
          </h2>
          {description ? <p className="ef-record__section-desc">{description}</p> : null}
        </div>
        {actions ? <div className="ef-record__section-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** One block of the inspector: a small title, its own actions, then its body. */
export function InspectorSection({
  title,
  actions,
  children,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ef-record__rs">
      {title || actions ? (
        <div className="ef-record__rs-head">
          {title ? <h2 className="ef-record__rs-title">{title}</h2> : null}
          {actions ? <div className="ef-record__rs-actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** The inspector's short labelled rows, each with a small icon. */
export function InspectorRows({
  rows,
}: {
  rows: readonly { key?: string; icon: LucideIcon; label: ReactNode; value: ReactNode }[];
}) {
  return (
    <dl className="ef-record__rows">
      {rows.map(({ key, icon: Icon, label, value }, i) => (
        <div key={key ?? i} className="ef-record__row">
          <Icon aria-hidden="true" />
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
