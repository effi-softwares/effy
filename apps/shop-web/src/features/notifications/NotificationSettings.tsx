import { BellOff, Share } from "lucide-react"

import { Button, Switch } from "@effy/design-system/ui"

import { DetailSection, Page } from "@/components/console/primitives"

import { useNotifications } from "./useNotifications"

/**
 * Notifications — one screen, five states (059, US1/US4).
 *
 * ⚠ SECTIONED ROWS, NOT CARDS (Principle V). Each notification type is a labelled row with a switch,
 * which is the console's language for "a list of settings"; a grid of cards would make five
 * equal-weight tiles out of one list.
 */
export function NotificationSettingsScreen() {
  const n = useNotifications()

  return (
    <Page>
      <DetailSection
        title="Notifications"
        subtitle="Be told when a new order arrives, or when something needs your attention — even with the console closed."
        action={
          n.status === "on" ? (
            <Button variant="outline" size="sm" disabled={n.busy} onClick={() => void n.disable()}>
              Turn off on this device
            </Button>
          ) : null
        }
      >
        <div className="grid gap-4 pt-4">
          <StateBlock state={n} />
          {n.status === "on" && <TypeToggles state={n} />}
        </div>
      </DetailSection>
    </Page>
  )
}

type State = ReturnType<typeof useNotifications>

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground max-w-[70ch] text-[13px] leading-[1.6]">{children}</p>
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
      // ⚠ NOT a fallback for a missing API — on iPadOS this IS the route. The Push API is available
      // only to a home-screen web app there, so permission cannot even be REQUESTED in a tab. An
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
      // ⚠ NO TOGGLE HERE, DELIBERATELY (FR-026). A denied permission is NOT recoverable in-app on
      // any browser. A switch that silently does nothing teaches the operator the console is
      // broken; naming the situation is the only honest option, and the only path back.
      return (
        <div className="bg-[var(--warning-soft)] text-[var(--warning)] flex items-start gap-3 rounded-md px-3 py-2.5 text-[13px]">
          <BellOff aria-hidden className="mt-0.5 size-4 shrink-0" />
          <div className="grid gap-1">
            <span className="font-medium">Notifications are blocked in your browser.</span>
            <span className="opacity-90">
              The console cannot turn them back on for you. Allow notifications for this site in your
              browser&apos;s settings, then return here.
            </span>
          </div>
        </div>
      )

    case "off":
      // ⚠ PRIMING: what will be sent, BEFORE the browser prompt (FR-023). There is exactly one
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
            <p className="text-[var(--warning)] max-w-[70ch] text-[13px] leading-[1.6]">
              {state.hint}
            </p>
          )}
          <div>
            <Button disabled={state.busy} onClick={() => void state.enable()}>
              Turn on notifications
            </Button>
          </div>
        </div>
      )

    case "on":
      return <Note>This device is receiving notifications for this shop.</Note>
  }
}

function TypeToggles({ state }: { state: State }) {
  if (state.availableTypes.length === 0) return null
  return (
    <div className="grid">
      {state.availableTypes.map((t) => {
        const muted = state.mutedTypes.includes(t.type)
        return (
          <div
            key={t.type}
            className="border-border flex items-center justify-between gap-5 border-b py-[11px]"
          >
            <label htmlFor={`notif-${t.type}`} className="text-[13.5px]">
              {/* ⚠ The label comes from the SERVER, not from a list in this file. It is notification
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
