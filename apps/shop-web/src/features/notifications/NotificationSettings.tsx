import { Bell, BellOff, Share } from "lucide-react"

import { Alert, AlertDescription, AlertTitle, Button, Card, CardContent, Label, Switch } from "@effy/design-system/ui"

import { PageHeader } from "@effy/web-kit/patterns"

import { Page } from "@/components/console/primitives"

import { useNotifications } from "./useNotifications"

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
      <Card className="max-w-3xl gap-0 overflow-hidden py-0">
        <CardContent className="py-4">
          <StateBlock state={n} />
        </CardContent>
        {n.status === "on" ? <TypeToggles state={n} /> : null}
      </Card>
    </Page>
  )
}

type State = ReturnType<typeof useNotifications>

function Note({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[70ch] text-sm text-muted-foreground">{children}</p>
}

function StateBlock({ state }: { state: State }) {
  switch (state.status) {
    case "unsupported":
      return (
        <Note>This browser cannot show notifications. Open the console in Safari, Chrome or Edge to turn them on.</Note>
      )

    case "needs-install":
      return (
        <div className="grid gap-2">
          <Note>
            <span className="text-foreground font-medium">Add the console to your home screen first.</span> On iPad and
            iPhone, notifications only work for apps on the home screen.
          </Note>
          <Note>
            Tap <Share className="inline size-4 align-text-bottom" aria-label="Share" /> Share, then{" "}
            <span className="text-foreground font-medium">Add to Home Screen</span>. Open Effy Shop from there and come
            back to this screen.
          </Note>
        </div>
      )

    case "blocked":
      return (
        <Alert role="status" variant="destructive">
          <BellOff aria-hidden="true" />
          <AlertTitle>Notifications are blocked in your browser.</AlertTitle>
          <AlertDescription>
            The console cannot turn them back on for you. Allow notifications for this site in your browser&apos;s
            settings, then return here.
          </AlertDescription>
        </Alert>
      )

    case "off":
      return (
        <div className="grid gap-3">
          <Note>
            You will be notified when a new order arrives for this shop, and when orders, stock or a refund need
            attention. Nothing about a customer is ever included.
          </Note>
          <Note>You can turn any of these off individually once they are on.</Note>
          {state.hint && <p className="max-w-[70ch] text-sm font-medium">{state.hint}</p>}
          <div>
            <Button disabled={state.busy} onClick={() => void state.enable()}>
              <Bell aria-hidden="true" />
              Turn on notifications
            </Button>
          </div>
        </div>
      )

    case "on":
      return (
        <p className="flex items-center gap-2 text-sm font-medium">
          <span aria-hidden="true" className="inline-block size-2 rounded-full bg-success" />
          This device is receiving notifications for this shop.
        </p>
      )
  }
}

function TypeToggles({ state }: { state: State }) {
  if (state.availableTypes.length === 0) return null
  return (
    <div className="border-t">
      {state.availableTypes.map((t) => {
        const muted = state.mutedTypes.includes(t.type)
        return (
          <div key={t.type} className="flex min-h-14 items-center gap-4 border-b px-5 py-3 last:border-b-0">
            <Label htmlFor={`notif-${t.type}`} className="min-w-0 flex-auto">
              {t.label}
            </Label>
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
