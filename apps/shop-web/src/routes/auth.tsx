import { createRoute, Outlet } from "@tanstack/react-router"
import { BarChart3, Boxes, ClipboardList, type LucideIcon } from "lucide-react"

import { SignInScreen } from "@/features/auth/SignInScreen"

import { rootRoute } from "./__root"

const LINES: readonly { icon: LucideIcon; title: string; body: string }[] = [
  { icon: ClipboardList, title: "A live order queue", body: "Pick, check and hand over in one pass." },
  { icon: Boxes, title: "Stock on every size", body: "Counts, low-stock alerts and a one-tap off switch." },
  { icon: BarChart3, title: "How the shop is doing", body: "Sales, orders and your best sellers." },
]

export const authLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth",
  component: () => (
    <div className="grid min-h-dvh bg-background lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-10 p-6 sm:p-11">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="" className="size-10 rounded-lg" />
          <span className="text-base font-semibold">
            Effy <span className="font-normal text-muted-foreground">Shop</span>
          </span>
        </div>
        <div className="grid flex-1 place-items-center">
          <div className="w-full max-w-100 [animation:effy-fade_.3s_ease]">
            <Outlet />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          For the teams of Effy&apos;s fulfilment shops. Every action is recorded against your account.
        </p>
      </div>

      <section className="flex min-w-0 flex-col gap-10 border-border bg-muted p-6 sm:p-11 lg:border-l">
        <p aria-hidden="true" className="text-6xl leading-none font-bold tracking-[-.06em] max-lg:hidden">
          effy<span className="text-success">.</span>
        </p>
        <ul className="grid flex-1 content-center gap-6">
          {LINES.map((l) => (
            <li key={l.title} className="flex items-start gap-4">
              <span aria-hidden="true" className="ef-icon-tile ef-icon-tile--primary size-11">
                <l.icon />
              </span>
              <span className="grid gap-1">
                <span className="font-medium">{l.title}</span>
                <span className="text-muted-foreground">{l.body}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">Effy Shop · works best installed on a tablet</p>
      </section>
    </div>
  ),
})

export const signInRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: "sign-in",
  validateSearch: (search: Record<string, unknown>): { next?: string } => ({
    next: typeof search.next === "string" ? search.next : undefined,
  }),
  component: SignInRouteComponent,
})

function SignInRouteComponent() {
  const { next } = signInRoute.useSearch()
  return <SignInScreen next={next} />
}
