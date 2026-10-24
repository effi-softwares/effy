import type { ReactNode } from "react";

import type { LucideIcon } from "lucide-react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";

import { cn } from "@effy/design-system";

/**
 * Every state says what happens next (Patterns board, "States"). An empty list names why it is empty
 * and the one thing to do about it; a refusal or a conflict is a sentence beside the control, never an
 * error dump.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="bo-empty">
      <span className="bo-empty__icon" aria-hidden="true">
        <Icon />
      </span>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

const CALLOUT_ICON: Record<CalloutTone, LucideIcon> = {
  destructive: CircleAlert,
  info: Info,
  success: CircleCheck,
  muted: Info,
};

type CalloutTone = "destructive" | "info" | "success" | "muted";

/** A note in the page: a problem (black edge, an icon — no red), information (blue), done (green). */
export function Callout({
  tone,
  title,
  children,
  role,
}: {
  tone: CalloutTone;
  title: ReactNode;
  children?: ReactNode;
  role?: "alert" | "status";
}) {
  const Icon = CALLOUT_ICON[tone];
  return (
    <div className={cn("bo-alert", `bo-alert--${tone}`)} role={role ?? (tone === "destructive" ? "alert" : undefined)}>
      <Icon aria-hidden="true" />
      <div className="bo-alert__title">{title}</div>
      {children ? <div className="bo-alert__description">{children}</div> : null}
    </div>
  );
}
