import type { ReactNode } from "react";

import type { LucideIcon } from "lucide-react";
import { CircleAlert, Info } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@effy/design-system/ui";

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
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

const CALLOUT_ICON: Record<CalloutTone, LucideIcon> = {
  destructive: CircleAlert,
  info: Info,
  muted: Info,
};

type CalloutTone = "destructive" | "info" | "muted";

/** A note in the page: a problem (an edge and an icon), information (blue) or an aside (grey). */
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
    <Alert variant={tone} role={role ?? (tone === "destructive" ? "alert" : "status")}>
      <Icon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      {children ? <AlertDescription>{children}</AlertDescription> : null}
    </Alert>
  );
}
