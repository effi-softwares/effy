import type { ReactNode } from "react";

import type { LucideIcon } from "lucide-react";

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
  problem: "text-destructive-foreground hover:bg-destructive-foreground/15 hover:text-destructive-foreground",
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
}) {
  const buttons =
    actions && actions.length > 0 ? (
      <div className={cn("flex flex-wrap items-center gap-2", actionsBelow ? "mt-3" : "ml-auto")}>
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
      className={cn("flex flex-wrap gap-x-4 gap-y-3 rounded-xl py-3 pr-3 pl-4", actionsBelow ? "items-start py-4 pr-4" : "items-center", FILL[tone])}
    >
      <span
        aria-hidden="true"
        className={cn("grid size-10 flex-none place-items-center rounded-full [&_svg]:size-5", ICON[tone], iconClassName)}
      >
        <Icon />
      </span>
      <div className="min-w-0 flex-[1_1_240px]">
        <p className="text-base leading-6 font-semibold">{title}</p>
        {children ? <div className="text-sm leading-5 [&_p]:opacity-90">{children}</div> : null}
        {actionsBelow ? buttons : null}
      </div>
      {actionsBelow ? null : buttons}
    </div>
  );
}

/** Someone's own words inside a banner (Effy's reason), quoted. */
export function BannerQuote({ children }: { children: ReactNode }) {
  return (
    <blockquote className="mt-2.5 border-l-2 border-current/50 pl-3 break-words whitespace-pre-line">{children}</blockquote>
  );
}
