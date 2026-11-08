import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { categoriesFor, type NotificationPreferencesDTO } from "@effy/shared-types"

import { NotificationSettingsForm } from "@/components/notifications/NotificationSettingsForm"
import { Breadcrumb } from "@/components/ui/misc"
import { Bone, Loading } from "@/components/ui/skeletons"
import { getNotificationPreferences } from "@/lib/customer-reads"
import { requireCustomer } from "@/lib/dal"

export const metadata: Metadata = {
  title: "Notification settings",
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <>
      <Breadcrumb
        items={[{ label: "Account", href: "/account" }, { label: "Notifications", href: "/account/notifications" }, { label: "Settings" }]}
        className="mb-6"
      />
      <section className="space-y-6">
        <Heading />
        <Suspense fallback={<SettingsSkeleton />}>
          <Body />
        </Suspense>
      </section>
    </>
  )
}

function Heading() {
  return (
    <div className="space-y-1">
      <h2 className="text-xl font-semibold">Notification settings</h2>
      <p className="text-sm text-muted-foreground">
        Choose what Effy sends you and how. Everything also stays in your{" "}
        <Link href="/account/notifications" className="font-medium text-primary underline-offset-2 hover:underline">
          notifications
        </Link>
        .
      </p>
    </div>
  )
}

async function Body() {
  await requireCustomer("/account/notifications/settings")
  let prefs: NotificationPreferencesDTO | null = null
  try {
    prefs = await getNotificationPreferences()
  } catch {
    prefs = null
  }
  if (!prefs) {
    return <p className="py-12 text-center text-muted-foreground">We couldn't load your settings. Refresh the page to try again.</p>
  }
  return <NotificationSettingsForm initial={prefs} />
}

/** The page's own shape: every group's heading is known; rows are bones (skeleton rule). */
function SettingsSkeleton() {
  return (
    <Loading>
      <div className="space-y-6">
        {categoriesFor("customer").map((p) => (
          <section key={p.category}>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">{p.label}</h3>
            <div className="space-y-3 rounded-lg border px-4 py-4">
              <Bone kind="text" className="w-3/4" />
              <Bone kind="text" className="w-1/3" />
            </div>
          </section>
        ))}
      </div>
    </Loading>
  )
}
