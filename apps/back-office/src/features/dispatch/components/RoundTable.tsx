import { useState } from "react"

import { Link } from "@tanstack/react-router"
import { Clock, Truck } from "lucide-react"

import type { DispatchRoundSummaryDTO } from "@effy/shared-types"

import { Panel, StatusWord } from "@effy/web-kit/patterns"
import { initialsOf } from "@/components/shell/identity"

import { momentText, roundLabel, roundOpenState } from "../model"
import {
  Avatar,
  AvatarFallback,
  Progress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ToggleGroup,
  ToggleGroupItem,
} from "@effy/design-system/ui"

export function RoundTable({ rounds }: { rounds: DispatchRoundSummaryDTO[] }) {
  const [kind, setKind] = useState<"all" | "collection" | "delivery">("all")
  const shown = rounds.filter((r) => kind === "all" || r.round.kind === kind)
  const now = new Date()

  return (
    <Panel
      title={
        <>
          Rounds <span className="font-normal text-muted-foreground">· {rounds.length} held today</span>
        </>
      }
      icon={<Truck aria-hidden="true" />}
      description="Collection runs bring parcels from shops to the hub; delivery rounds take them to customers."
      actions={
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="Work"
          value={kind}
          onValueChange={(v) => v && setKind(v as typeof kind)}
        >
          {(["all", "collection", "delivery"] as const).map((k) => (
            <ToggleGroupItem key={k} value={k} className="px-3">
              {k === "all" ? "All" : k === "collection" ? "Collection" : "Delivery"}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      }
      flush
    >
      {shown.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">No driver is holding a round.</p>
      ) : (
        <div className="min-w-0">
          <Table className="ef-rtable">
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Work</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead numeric>Packages left</TableHead>
                <TableHead>Opens</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => {
                const total = r.round.stops?.length ?? 0
                const done = Math.max(0, total - Number(r.stopsRemaining))
                const pct = total > 0 ? Math.round((done / total) * 100) : 0
                const open = roundOpenState(r.round, now)
                return (
                  <TableRow key={r.round.id}>
                    <TableCell data-m="primary">
                      <div className="flex items-center gap-2">
                        <Avatar aria-hidden="true" className="rounded-lg">
                          <AvatarFallback className="rounded-lg">{initialsOf(r.driverName)}</AvatarFallback>
                        </Avatar>
                        <Link
                          to="/orders/assignments/rounds/$roundId"
                          params={{ roundId: r.round.id }}
                          className="link"
                        >
                          {r.driverName}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell data-m="meta">{roundLabel(r.round.kind)}</TableCell>
                    <TableCell data-m="full" className="min-w-40">
                      {total > 0 ? (
                        <>
                          <div className="mb-1 flex justify-between text-xs tabular-nums text-muted-foreground">
                            <span>
                              {done} of {total} stops
                            </span>
                            <span>{pct}%</span>
                          </div>
                          <Progress value={pct} height={8} />
                        </>
                      ) : (
                        <span className="text-muted-foreground">{r.stopsRemaining} stops left</span>
                      )}
                    </TableCell>
                    <TableCell numeric data-m="meta" data-label="Packages left">
                      {r.packagesRemaining}
                    </TableCell>
                    <TableCell data-m="meta" data-label="Opens">
                      {open.text || "—"}
                    </TableCell>
                    <TableCell data-m="hide" className="whitespace-nowrap">
                      {momentText(r.round.deadlineAt, now)}
                    </TableCell>
                    <TableCell data-m="badge">
                      <span className="flex flex-wrap items-center gap-2">
                        <StatusWord
                          tone={
                            r.round.status === "completed"
                              ? "done"
                              : r.round.status === "cancelled"
                                ? "quiet"
                                : "moving"
                          }
                        >
                          {r.stageLabel ?? r.round.status.replace("_", " ")}
                        </StatusWord>
                        {r.isLate ? (
                          <span className="late">
                            <Clock aria-hidden="true" />
                            Late
                          </span>
                        ) : null}
                      </span>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  )
}
