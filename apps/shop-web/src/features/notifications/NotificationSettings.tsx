import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { useStore } from "@tanstack/react-store"
import { Bell, BellOff, BellRing, CircleCheck, MonitorSmartphone, Play, Share, Volume2, VolumeX } from "lucide-react"

import { previewCue } from "@effy/design-system/toast"
import { Alert, AlertDescription, AlertTitle, Badge, Button, Switch } from "@effy/design-system/ui"

import {
  Bone,
  Loading,
  PageHeader,
  SettingsIcon,
  SettingsList,
  SettingsListHeading,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from "@effy/web-kit/patterns"

import { categoriesFor } from "@effy/shared-types"

import { Page } from "@/components/console/primitives"
import { sessionQuery } from "@/features/auth/queries"
import { consoleStore, setSoundOn } from "@/lib/console-store"

import type { NotificationSection } from "./api"
import { showTestNotification, thisDevice } from "./messaging"
import { useNotifications } from "./useNotifications"
import { useTourPage } from "@effy/web-kit/tour"

type State = ReturnType<typeof useNotifications>

export function NotificationSettingsScreen() {
  const n = useNotifications()
  // Nothing to load: what this device can do is known at once.
  useTourPage("settings-notifications", { status: "ready" })

  return (
    <Page>
      <PageHeader
        title="Notifications"
        description="Alerts on this device for new orders and anything that needs attention, even when the console is closed."
      />
      <SettingsPage>
        <SettingsSection
          tour="notifications.device"
          title="This device"
          description="Each computer, tablet or phone is turned on separately. Nothing about a customer is ever included."
        >
          <DeviceStatus state={n} />
        </SettingsSection>

        <SettingsSection
          tour="notifications.sound"
          title="Sound"
          description="A chime in this tab while the console is open, whether or not notifications are on."
        >
          <SoundSetting />
        </SettingsSection>

        <SettingsSection
          tour="notifications.categories"
          title="Always in your inbox"
          description="Everything Effy tells your shop reaches the inbox of everyone who works here. These can't be turned off, so nobody misses one."
        >
          <CategoryList />
        </SettingsSection>

        <SettingsSection
          tour="notifications.types"
          title="What you're told about"
          description="Choose which alerts reach this device. Everything is on until you turn it off."
        >
          <TypeList state={n} />
        </SettingsSection>
      </SettingsPage>
    </Page>
  )
}

/** 111 US4 - the shop's kinds of message, each fixed with why (the shared policy's words). */
function CategoryList() {
  return (
    <SettingsList>
      {categoriesFor("shop").map((p) => (
        <SettingsRow key={p.category} label={p.label} hint={p.description}>
          <span className="text-sm text-muted-foreground">Always on</span>
        </SettingsRow>
      ))}
    </SettingsList>
  )
}

const STATUS: Record<
  State["status"],
  { title: string; tone: "on" | "off" | "muted"; icon: React.ReactNode; badge: React.ReactNode }
> = {
  on: {
    title: "Notifications are on",
    tone: "on",
    icon: <BellRing />,
    badge: <Badge variant="success">On</Badge>,
  },
  off: {
    title: "Notifications are off",
    tone: "muted",
    icon: <Bell />,
    badge: <Badge variant="muted">Off</Badge>,
  },
  blocked: {
    title: "Blocked by the browser",
    tone: "off",
    icon: <BellOff />,
    badge: <Badge variant="destructive">Blocked</Badge>,
  },
  "needs-install": {
    title: "Add Effy Shop to your home screen first",
    tone: "muted",
    icon: <MonitorSmartphone />,
    badge: <Badge variant="muted">Not set up</Badge>,
  },
  unsupported: {
    title: "This browser can't show notifications",
    tone: "muted",
    icon: <BellOff />,
    badge: <Badge variant="muted">Unavailable</Badge>,
  },
}

function DeviceStatus({ state }: { state: State }) {
  const s = STATUS[state.status]
  const [tested, setTested] = useState<"sent" | "failed" | null>(null)

  return (
    <>
      <SettingsList>
        <SettingsRow
          leading={<SettingsIcon tone={s.tone}>{s.icon}</SettingsIcon>}
          label={
            <span className="flex flex-wrap items-center gap-2">
              {s.title}
              {s.badge}
            </span>
          }
          hint={thisDevice()}
        >
          {state.status === "off" ? (
            <Button disabled={state.busy} onClick={() => void state.enable()}>
              <Bell aria-hidden="true" />
              Turn on notifications
            </Button>
          ) : state.status === "on" ? (
            <Button variant="outline" disabled={state.busy} onClick={() => void state.disable()}>
              <BellOff aria-hidden="true" />
              Turn off
            </Button>
          ) : null}
        </SettingsRow>

        {state.status === "on" ? (
          <SettingsRow
            label="Send a test"
            hint={
              tested === "sent" ? (
                <span role="status" className="inline-flex items-center gap-1.5 text-foreground">
                  <CircleCheck aria-hidden="true" className="size-4 text-success" />
                  Sent. If nothing appeared, check this computer's notification settings for the browser.
                </span>
              ) : tested === "failed" ? (
                <span role="status" className="text-foreground">
                  This device couldn't show it. Close the console fully, open it again and try once more.
                </span>
              ) : (
                "Shows one notification on this device now, to check it gets through."
              )
            }
          >
            <Button
              variant="outline"
              data-tour="notifications.test"
              onClick={() => {
                setTested(null)
                void showTestNotification().then((ok) => setTested(ok ? "sent" : "failed"))
              }}
            >
              <BellRing aria-hidden="true" />
              Send a test
            </Button>
          </SettingsRow>
        ) : null}
      </SettingsList>

      <StateHelp state={state} />
    </>
  )
}

function StateHelp({ state }: { state: State }) {
  switch (state.status) {
    case "off":
      return state.hint ? (
        <Alert role="status" variant="muted">
          <AlertDescription>{state.hint}</AlertDescription>
        </Alert>
      ) : null

    case "blocked":
      return (
        <Alert role="status" variant="destructive">
          <BellOff aria-hidden="true" />
          <AlertTitle>The console can't turn them back on for you</AlertTitle>
          <AlertDescription>
            <ol className="list-decimal space-y-1 pl-4">
              <li>Click the icon at the left of the address bar.</li>
              <li>Set Notifications to Allow.</li>
              <li>Reload this page and turn notifications on.</li>
            </ol>
          </AlertDescription>
        </Alert>
      )

    case "needs-install":
      return (
        <Alert role="status" variant="info" data-tour="notifications.home-screen">
          <MonitorSmartphone aria-hidden="true" />
          <AlertTitle>On iPad and iPhone, notifications only work for apps on the home screen</AlertTitle>
          <AlertDescription>
            <ol className="list-decimal space-y-1 pl-4">
              <li>
                Tap <Share className="inline size-4 align-text-bottom" aria-label="Share" /> Share, then{" "}
                <span className="font-medium">Add to Home Screen</span>.
              </li>
              <li>Open Effy Shop from the home screen.</li>
              <li>Come back to Settings › Notifications and turn them on.</li>
            </ol>
          </AlertDescription>
        </Alert>
      )

    case "unsupported":
      return (
        <Alert role="status" variant="muted">
          <AlertDescription>Open the console in Chrome, Edge or Safari to turn notifications on.</AlertDescription>
        </Alert>
      )

    case "on":
      return null
  }
}

function SoundSetting() {
  const soundOn = useStore(consoleStore, (s) => s.soundOn)
  return (
    <SettingsList>
      <SettingsRow
        leading={<SettingsIcon tone={soundOn ? "on" : "muted"}>{soundOn ? <Volume2 /> : <VolumeX />}</SettingsIcon>}
        label="Chime for new orders"
        htmlFor="sound-on"
        hint="The Sound button at the top of every page does the same."
      >
        <Button variant="ghost" onClick={() => previewCue("new-order")}>
          <Play aria-hidden="true" />
          Play
        </Button>
        <Switch id="sound-on" checked={soundOn} onCheckedChange={setSoundOn} />
      </SettingsRow>
    </SettingsList>
  )
}

const SECTIONS: ReadonlyArray<{ key: NotificationSection; title: string; rows: number }> = [
  { key: "orders", title: "Orders", rows: 2 },
  { key: "stock", title: "Stock", rows: 2 },
  { key: "refunds", title: "Refunds", rows: 1 },
  { key: "effy", title: "From Effy", rows: 6 },
]

function TypeList({ state }: { state: State }) {
  const { data: session } = useQuery(sessionQuery)
  const isManager = session?.status === "signed-in" && session.identity.roles.includes("shop_manager")
  const on = state.status === "on"

  if (state.typesLoading) {
    return (
      <Loading label="Reading the alert types">
        <SettingsList>
          {SECTIONS.map((s) => (
            <div key={s.key} className="divide-y">
              <SettingsListHeading>{s.title}</SettingsListHeading>
              {Array.from({ length: s.rows }, (_, i) => (
                <SettingsRow key={i} label={<Bone className={i % 2 ? "w-40" : "w-56"} />}>
                  <Bone className="h-6 w-11 rounded-full" />
                </SettingsRow>
              ))}
            </div>
          ))}
        </SettingsList>
      </Loading>
    )
  }

  if (state.typesFailed) {
    return (
      <Alert role="status" variant="muted">
        <AlertDescription>
          The list of alerts couldn't be read. It will try again when you come back here.
        </AlertDescription>
      </Alert>
    )
  }

  const groups = SECTIONS.map((s) => ({ ...s, types: state.availableTypes.filter((t) => t.section === s.key) })).filter(
    (g) => g.types.length > 0,
  )

  return (
    <>
      {!on ? <p className="text-sm text-muted-foreground">Turn notifications on for this device to choose.</p> : null}
      <SettingsList>
        {groups.map((g) => (
          <div key={g.key} role="group" aria-label={g.title} className="divide-y">
            <SettingsListHeading>{g.title}</SettingsListHeading>
            {g.types.map((t) => {
              const managersOnly = t.requiresRole === "shop_manager"
              return (
                <SettingsRow
                  key={t.type}
                  htmlFor={`notif-${t.type}`}
                  className="min-h-14"
                  label={
                    <span className="flex flex-wrap items-center gap-2">
                      {t.label}
                      {managersOnly ? <Badge variant="quiet">Managers only</Badge> : null}
                    </span>
                  }
                  hint={managersOnly && !isManager ? "Only sent to shop managers." : undefined}
                >
                  <Switch
                    id={`notif-${t.type}`}
                    checked={!state.mutedTypes.includes(t.type)}
                    disabled={!on || state.busy}
                    onCheckedChange={(next) => void state.toggleType(t.type, !next)}
                  />
                </SettingsRow>
              )
            })}
          </div>
        ))}
      </SettingsList>
    </>
  )
}
