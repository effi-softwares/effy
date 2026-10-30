import { useState, type ReactNode } from "react";

import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";

import { cn } from "@effy/design-system";
import { Button } from "@effy/design-system/ui";

export type BannerTone = "info" | "problem";

export interface BannerAction {
  label: ReactNode;
  onClick: () => void;
  /** The banner's main action: drawn light on the fill. The others are quiet. */
  primary?: boolean;
  disabled?: boolean;
}

const FILL: Record<BannerTone, string> = {
  info: "bg-primary-fill text-primary-foreground",
  problem: "bg-destructive-fill text-destructive-foreground",
};
const ICON: Record<BannerTone, string> = {
  info: "bg-primary-foreground/16",
  problem: "bg-destructive-foreground/16",
};
const QUIET: Record<BannerTone, string> = {
  info: "text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground",
  problem:
    "text-destructive-foreground hover:bg-destructive-foreground/15 hover:text-destructive-foreground",
};

/**
 * The one highlighted alert, in both consoles: something that needs a person now (a new order) or says where a record
 * stands (a change with Effy, a hold). A solid fill carrying a white label in both appearances — blue for information,
 * rose for a problem — a round icon, a title and its line, and its own actions: on the right, or under the text when
 * the banner says more than one line. Quieter notes in a page are `Callout`.
 */
export function Banner({
  tone = "info",
  icon: Icon,
  iconClassName,
  title,
  children,
  actions,
  actionsBelow = false,
  role = "status",
  label,
  end,
}: {
  tone?: BannerTone;
  icon: LucideIcon;
  /** Motion on the icon (the new-order bell rings). */
  iconClassName?: string;
  title: ReactNode;
  children?: ReactNode;
  actions?: readonly BannerAction[];
  /** The actions sit under the text instead of at the end of the row. */
  actionsBelow?: boolean;
  role?: "alert" | "status" | "region";
  label?: string;
  /** Something at the very end of the row, after the actions (a stack's counter). */
  end?: ReactNode;
}) {
  const buttons =
    actions && actions.length > 0 ? (
      <div
        className={cn(
          "flex flex-wrap items-center gap-2",
          actionsBelow ? "mt-3" : "ml-auto",
        )}
      >
        {actions.map((a, i) => (
          <Button
            key={i}
            variant={a.primary ? "secondary" : "ghost"}
            className={a.primary ? undefined : QUIET[tone]}
            disabled={a.disabled}
            onClick={a.onClick}
          >
            {a.label}
          </Button>
        ))}
      </div>
    ) : null;

  return (
    <div
      role={role}
      aria-label={label}
      className={cn(
        "flex flex-wrap gap-x-4 gap-y-3 rounded-xl py-3 pr-3 pl-4",
        actionsBelow ? "items-start py-4 pr-4" : "items-center",
        FILL[tone],
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid size-10 flex-none place-items-center rounded-full [&_svg]:size-5",
          ICON[tone],
          iconClassName,
        )}
      >
        <Icon />
      </span>
      <div className="min-w-0 flex-[1_1_240px]">
        <p className="text-base leading-6 font-semibold">{title}</p>
        {children ? (
          <div className="text-sm leading-5 [&_p]:opacity-90">{children}</div>
        ) : null}
        {actionsBelow ? buttons : null}
      </div>
      {actionsBelow ? null : buttons}
      {end ? (
        <div className="ml-auto flex flex-none items-center self-start">
          {end}
        </div>
      ) : null}
    </div>
  );
}

export interface BannerStackItem {
  key: string;
  tone?: BannerTone;
  icon: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
}

/** How far each card under the front one shows, and how much smaller it is. */
const PEEK_Y = 8;
const SHRINK = 0.03;
/** Cards deeper than this wait, unseen, at the last visible depth. */
const SHOWN = 2;

/**
 * Several banners as one stack: the first in front, the next one or two showing underneath in their own colour so the
 * stack reads as a stack, a counter with previous / next, and a card that comes forward when clicked. Every card stays
 * in the stack and moves to its new depth when the front one changes — the front slides back as the next rises — so
 * changing cards is seen, not swapped. Order them most pressing first. One item is a plain `Banner`.
 */
export function BannerStack({
  items,
  label,
}: {
  items: readonly BannerStackItem[];
  label: string;
}) {
  const [at, setAt] = useState(0);
  if (items.length === 0) return null;
  if (items.length === 1) {
    const only = items[0]!;
    return (
      <Banner tone={only.tone} icon={only.icon} title={only.title}>
        {only.children}
      </Banner>
    );
  }

  const n = items.length;
  const front = Math.min(at, n - 1);
  const go = (step: number) => setAt((front + step + n) % n);
  const under = Math.min(n - 1, SHOWN);

  return (
    // One grid cell holds every card, so the stack is as tall as its tallest card and each card fills it.
    <div
      role="region"
      aria-label={label}
      className="grid"
      style={{ paddingBottom: under * PEEK_Y }}
    >
      {items.map((item, k) => {
        const depth = (k - front + n) % n;
        const shown = Math.min(depth, SHOWN);
        const tone = item.tone ?? "info";
        return (
          <div
            key={item.key}
            aria-hidden={depth > 0 || undefined}
            inert={depth > 0}
            onClick={depth > 0 ? () => go(depth) : undefined}
            className={cn(
              "relative grid origin-bottom transition-[transform,opacity] duration-(--dur-emphasised) ease-(--ease-move) [grid-area:1/1] motion-reduce:transition-none",
              depth > 0 && "cursor-pointer",
            )}
            style={{
              zIndex: n - depth,
              transform: `translateY(${shown * PEEK_Y}px) scale(${1 - shown * SHRINK})`,
              // Every card is opaque, so a card behind never shows its words through the front one mid-move.
              opacity: depth > SHOWN ? 0 : 1,
            }}
          >
            <Banner
              tone={tone}
              icon={item.icon}
              title={item.title}
              end={
                <div className="flex items-center gap-1">
                  <span
                    aria-live="polite"
                    className="mr-1 text-sm font-medium tabular-nums opacity-90"
                  >
                    {k + 1} of {n}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className={QUIET[tone]}
                    onClick={() => go(-1)}
                    aria-label="Previous"
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className={QUIET[tone]}
                    onClick={() => go(1)}
                    aria-label="Next"
                  >
                    <ChevronRight />
                  </Button>
                </div>
              }
            >
              {item.children}
            </Banner>
            {/* A card behind is dimmed by the page's own ground laid over it, deeper cards more. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-xl bg-background transition-opacity duration-(--dur-emphasised) ease-(--ease-move) motion-reduce:transition-none"
              style={{ opacity: depth === 0 ? 0 : shown === 1 ? 0.4 : 0.65 }}
            />
          </div>
        );
      })}
    </div>
  );
}

/** Someone's own words inside a banner (Effy's reason), quoted. */
export function BannerQuote({ children }: { children: ReactNode }) {
  return (
    <blockquote className="mt-2.5 border-l-2 border-current/50 pl-3 break-words whitespace-pre-line">
      {children}
    </blockquote>
  );
}
