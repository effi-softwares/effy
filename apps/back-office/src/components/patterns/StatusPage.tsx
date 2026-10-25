import { Link } from "@tanstack/react-router"
import { type LucideIcon, CloudOff, LockKeyhole, SearchX, ShieldOff } from "lucide-react"

import { cn } from "@effy/design-system"
import { Button } from "@effy/design-system/ui"

type StatusKind = "denied" | "notfound" | "expired" | "unavailable"

const KINDS: Record<
  StatusKind,
  { code: string; icon: LucideIcon; problem?: boolean; title: string; body: string; foot: string }
> = {
  denied: {
    code: "403",
    icon: ShieldOff,
    problem: true,
    title: "Access denied",
    body: "Your account doesn't have access to this area. The backend decided — the console only hides what it knows you can't use.",
    foot: "Need it? Ask an administrator to grant the role.",
  },
  notfound: {
    code: "404",
    icon: SearchX,
    title: "Not found",
    body: "That page or record doesn't exist. It may have been removed, or the link is wrong.",
    foot: "Looking for an order? Press ⌘K and type its number.",
  },
  expired: {
    code: "Session",
    icon: LockKeyhole,
    title: "Your session has expired",
    body: "Sign in again to continue.",
    foot: "Sessions end after a period without activity.",
  },
  unavailable: {
    code: "503",
    icon: CloudOff,
    title: "Service unavailable",
    body: "The service is waking up or unreachable. Try again in a moment.",
    foot: "Nothing was changed.",
  },
}

export function StatusPage({ kind, onRetry }: { kind: StatusKind; onRetry?: () => void }) {
  const k = KINDS[kind]
  return (
    <div className="mx-auto flex max-w-[460px] flex-1 flex-col items-center justify-center gap-3 py-12 text-center">
      <span className={cn("bo-icon-tile size-14!", k.problem && "bo-icon-tile--problem")}>
        <k.icon aria-hidden="true" className="size-[26px]!" />
      </span>
      <span className="bo-code text-muted-foreground">{k.code}</span>
      <h1 className="text-2xl font-semibold tracking-tight">{k.title}</h1>
      <p className="text-sm text-balance text-muted-foreground">{k.body}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {kind === "unavailable" && onRetry ? (
          <Button onClick={onRetry}>Try again</Button>
        ) : kind === "expired" ? (
          <Button asChild>
            <Link to="/auth/sign-in">Sign in again</Link>
          </Button>
        ) : (
          <Button asChild>
            <Link to="/">Back to overview</Link>
          </Button>
        )}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{k.foot}</p>
    </div>
  )
}
