import { Bell, BellOff, Share } from "lucide-react"

import { Button, Switch } from "@effy/design-system/ui"

import { PageHeader } from "@effy/web-kit/patterns"

import { Page } from "@/components/console/primitives"

import { useNotifications } from "./useNotifications"

/**
 * Notifications — one screen, five states.
 *
 * Sectioned rows, not cards (Principle V). Each notification type is a labelled row with a switch,
 * which is the console's language for "a list of settings"; a grid of cards would make five
 * equal-weight tiles out of one list.
 */
export function NotificationSettingsScreen() {
  const n = useNotifications()

  return (
    <Page>
      <PageHeader
        title="Notifications"
        description="Get alerts on this device for new orders and urgent issues, even when closed."
        actions={
          n.status === "on" ? (
            <Button variant="outline" disabled={n.busy} onClick={() => void n.disable()}>
              <BellOff aria-hidden="true" />
              Turn off on this device
            </Button>
          ) : null
        }
      />
      <section className="bo-panel max-w-3xl">
        <div className="bo-panel__body">
          <StateBlock state={n} />
        </div>
        {n.status === "on" ? <TypeToggles state={n} /> : null}
      </section>
    </Page>
  )
}

type State = ReturnType<typeof useNotifications>

function Note({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[70ch] text-muted-foreground">{children}</p>
}

function StateBlock({ state }: { state: State }) {
  switch (state.status) {
    case "unsupported":
      return (
        <Note>
          This browser cannot show notifications. Open the console in Safari, Chrome or Edge to turn
          them on.
        </Note>
      )

    case "needs-install":
      // Not a fallback for a missing API — on iPadOS this IS the route. The Push API is available
      // only to a home-screen web app there, so permission cannot even be requested in a tab. An
      // operator who never installs cannot be notified at all, which is why US2 is P1.
      return (
        <div className="grid gap-2">
          <Note>
            <span className="text-foreground font-medium">
              Add the console to your home screen first.
            </span>{" "}
            On iPad and iPhone, notifications only work for apps on the home screen.
          </Note>
          <Note>
            Tap <Share className="inline size-3.5 align-text-bottom" aria-label="Share" /> Share,
            then <span className="text-foreground font-medium">Add to Home Screen</span>. Open Effy
            Shop from there and come back to this screen.
          </Note>
        </div>
      )

    case "blocked":
      // No toggle here, deliberately. A denied permission is not recoverable in-app on
      // any browser. A switch that silently does nothing teaches the operator the console is
      // broken; naming the situation is the only honest option, and the only path back.
      return (
        <div role="status" className="bo-alert bo-alert--destructive">
          <BellOff aria-hidden="true" />
          <div className="bo-alert__title">Notifications are blocked in your browser.</div>
          <div className="bo-alert__description">
            The console cannot turn them back on for you. Allow notifications for this site in your browser&apos;s
            settings, then return here.
          </div>
        </div>
      )

    case "off":
      // Priming: what will be sent, before the browser prompt. There is exactly one
      // prompt per browser per lifetime, and spending it before the operator knows what they are
      // agreeing to is how a console loses the ability to notify permanently.
      return (
        <div className="grid gap-3">
          <Note>
            You will be notified when a new order arrives for this shop, and when orders, stock or a
            refund need attention. Nothing about a customer is ever included.
          </Note>
          <Note>You can turn any of these off individually once they are on.</Note>
          {state.hint && (
            <p className="max-w-[70ch] font-medium">{state.hint}</p>
          )}
          <div>
            <Button size="lg" disabled={state.busy} onClick={() => void state.enable()}>
              <Bell aria-hidden="true" />
              Turn on notifications
            </Button>
          </div>
        </div>
      )

    case "on":
      return (
        <p className="flex items-center gap-2 font-medium">
          <span aria-hidden="true" className="bo-dot bo-dot--on" />
          This device is receiving notifications for this shop.
        </p>
      )
  }
}

function TypeToggles({ state }: { state: State }) {
  if (state.availableTypes.length === 0) return null
  return (
    <div className="border-t border-border">
      {state.availableTypes.map((t) => {
        const muted = state.mutedTypes.includes(t.type)
        return (
          <div key={t.type} className="sh-toggle-row">
            <label htmlFor={`notif-${t.type}`} className="sh-toggle-row__text font-medium">
              {/* The label comes from the server, not from a list in this file. It is notification
                  copy, and copy lives in one catalogue — a console-local list would be a second
                  source for the wording the operator sees in the banner itself. */}
              {t.label}
            </label>
            <Switch
              id={`notif-${t.type}`}
              checked={!muted}
              disabled={state.busy}
              onCheckedChange={(on) => void state.toggleType(t.type, !on)}
            />
          </div>
        )
      })}
    </div>
  )
}
