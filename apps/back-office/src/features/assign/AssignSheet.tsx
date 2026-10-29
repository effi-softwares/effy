import { useQuery } from "@tanstack/react-query"
import { cn } from "@effy/design-system"
import { useState } from "react"

import { CircleAlert, Search } from "lucide-react"

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Input,
  toast,
} from "@effy/design-system/ui"

import { Bone, Callout, ListSkeleton, Loading, ResponsiveSheet } from "@effy/web-kit/patterns"
import { initialsOf } from "@/components/shell/identity"

import { assignErrorLine, driversForQuery, useAssignTo } from "./queries"
import type { DriverFit, Stage } from "./repo"

export function AssignSheet({
  open,
  onOpenChange,
  packageId,
  stage,
  expectedAssignmentId,
  title,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  packageId: string
  stage: Stage
  expectedAssignmentId: string | null
  title: string
}) {
  const [search, setSearch] = useState("")
  const [confirming, setConfirming] = useState<{ driver: DriverFit; line: string } | null>(null)
  const drivers = useQuery({ ...driversForQuery(packageId, stage), enabled: open })
  const assign = useAssignTo(packageId)

  const pick = (driver: DriverFit, acceptConcerns = false) => {
    assign.mutate(
      { stage, driverId: driver.driverId, expectedAssignmentId, acceptConcerns },
      {
        onSuccess: (res) => {
          toast(res.message)
          setConfirming(null)
          onOpenChange(false)
        },
        onError: (err) => {
          const { line, needsConfirm } = assignErrorLine(err)
          if (needsConfirm) setConfirming({ driver, line })
          else {
            toast(line)
            setConfirming(null)
          }
        },
      },
    )
  }

  const shown = (drivers.data ?? []).filter((d) => d.name.toLowerCase().includes(search.trim().toLowerCase()))
  const groups: Array<{ fit: DriverFit["fit"]; title: string }> = [
    { fit: "fine", title: "Can take it" },
    { fit: "concern", title: "Can take it, with a concern" },
    { fit: "cannot", title: "Can't take it" },
  ]

  const tone: Record<DriverFit["fit"], string> = {
    fine: "bg-success-soft text-success",
    concern: "bg-primary-muted text-primary",
    cannot: "",
  }

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Assign to…"
      description={title}
      footer={
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      }
    >
      <label className="relative flex items-center">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
        <span className="sr-only">Search drivers</span>
        <Input
          className="pl-9!"
          placeholder="Search drivers"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </label>

      {confirming ? (
        <Alert role="alertdialog" variant="muted">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>
            {confirming.driver.name}: {confirming.line}
          </AlertTitle>
          <AlertDescription className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => pick(confirming.driver, true)} disabled={assign.isPending}>
              Assign anyway
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {drivers.isPending ? (
        <Loading label="Loading drivers">
          <div className="space-y-2">
            <Bone kind="small" className="w-32" />
            <div className="rounded-lg border border-border px-4">
              <ListSkeleton rows={3} media="icon" lines={1} trailing="chip" />
            </div>
          </div>
        </Loading>
      ) : null}
      {drivers.isError ? <Callout tone="destructive" title={assignErrorLine(drivers.error).line} /> : null}
      {groups.map(({ fit, title: heading }) => {
        const list = shown.filter((d) => d.fit === fit)
        if (list.length === 0) return null
        return (
          <section key={fit} aria-label={heading} className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <h3 className="font-medium text-muted-foreground">{heading}</h3>
              <span className="text-muted-foreground">
                {list.length} {list.length === 1 ? "driver" : "drivers"}
              </span>
            </div>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {list.map((d) => (
                <li key={d.driverId}>
                  <button
                    type="button"
                    disabled={fit === "cannot" || assign.isPending}
                    onClick={() => pick(d)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left first:rounded-t-lg last:rounded-b-lg enabled:hover:bg-row-hover disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Avatar aria-hidden="true" className="rounded-lg">
                      <AvatarFallback className={cn("rounded-lg", tone[fit])}>{initialsOf(d.name)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{d.name}</span>
                      {d.notes.length > 0 ? (
                        <span className="mt-0.5 block text-sm text-muted-foreground">{d.notes.join(" · ")}</span>
                      ) : null}
                    </span>
                    <Badge variant="secondary">{d.packagesToday} today</Badge>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      <p className="text-xs text-muted-foreground">
        The server decides who can take it. Drivers who can't stay listed with the reason, so "why isn't Ben here?"
        never needs asking.
      </p>
    </ResponsiveSheet>
  )
}
