import { useEffect, type ReactNode } from "react"

import { useQuery } from "@tanstack/react-query"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"
import { Bone, boneWidth, Loading } from "@effy/web-kit/patterns"

import { track } from "@/lib/telemetry"

import { meQuery } from "./queries"

export function ProvingScreen() {
  const { data, error, isPending, isError, refetch } = useQuery(meQuery)

  const unassigned = data ? data.shop === null : false
  useEffect(() => {
    if (unassigned) track({ name: "shop_assignment_missing" })
  }, [unassigned])

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Your shop record</CardTitle>
        <CardDescription>
          The platform's own record of you — proves this console reaches the backend as you.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Loading>
            <dl className="space-y-2 text-sm">
              {["Subject", "Email", "Roles", "Status", "Shop"].map((label, i) => (
                <Row key={label} label={label} value={<Bone className={`max-w-48 ${boneWidth(i)}`} />} />
              ))}
            </dl>
          </Loading>
        ) : isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : (
          <div className="space-y-4">
            <dl className="space-y-2 text-sm">
              <Row label="Subject" value={<span className="font-mono">{data.subject}</span>} />
              <Row label="Email" value={data.email ?? "—"} />
              <Row label="Roles" value={data.roles.length > 0 ? data.roles.join(", ") : "—"} />
              <Row label="Status" value={data.status} />
              <Row label="Shop" value={data.shop ? `${data.shop.name} (${data.shop.code})` : "—"} />
            </dl>

            {data.roles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You're recorded, but no shop roles are assigned yet. Ask your manager to grant access.
              </p>
            ) : null}

            {data.shop === null ? (
              <p className="text-sm text-muted-foreground">
                You're not assigned to a shop yet, so nothing is available here. Ask your manager to assign you.
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="break-all">{value}</dd>
    </div>
  )
}
