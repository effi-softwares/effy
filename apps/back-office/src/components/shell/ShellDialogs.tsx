import type { ReactNode } from "react"

import { useQuery } from "@tanstack/react-query"

import {
  Badge,
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"

import { Bone, boneWidth, Kbd, Loading } from "@effy/web-kit/patterns"
import { TEAM_ROLE_WORDS, TEAM_STATUS_WORDS } from "@effy/shared-types"
import { RenameDialog } from "@/features/team/dialogs/RenameDialog"
import { meQuery } from "@/features/team/queries"
import { renameMe } from "@/features/team/repo"

import { CHORDS } from "./chords"
import { displayName } from "./identity"

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const rows: { keys: string[]; what: string }[] = [
    { keys: ["⌘", "K"], what: "Search and commands" },
    { keys: ["⌘", "B"], what: "Fold or open the sidebar" },
    { keys: ["?"], what: "This list" },
    ...CHORDS.map((c) => ({ keys: c.keys.map(String), what: `Go to ${chordTarget[c.navKey] ?? c.navKey}` })),
  ]
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent className="sm:max-w-md">
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Keyboard shortcuts</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            They work anywhere except while you are typing in a field.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>
        <dl className="divide-y divide-border">
          {rows.map((r) => (
            <div key={r.what} className="flex items-center justify-between gap-4 py-3 text-sm">
              <dt>{r.what}</dt>
              <dd className="flex gap-1">
                {r.keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </ResponsiveModalContent>
    </ResponsiveModal>
  )
}

const chordTarget: Record<string, string> = {
  overview: "Overview",
  orders: "Orders",
  dispatch: "Dispatch",
  exceptions: "Exceptions",
  customers: "Customers",
  review: "Product review",
}

export function StaffRecordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const me = useQuery({ ...meQuery, enabled: open })
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent className="sm:max-w-md">
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Your back-office record</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            What you can do is decided from this record, on the server.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>
        {me.isPending ? (
          <Loading label="Loading your record">
            <dl className="divide-y divide-border text-sm">
              {["Name", "Email", "Role", "Status", "Reference"].map((k, i) => (
                <Row key={k} k={k}>
                  <Bone className={boneWidth(i)} />
                </Row>
              ))}
            </dl>
          </Loading>
        ) : me.isError ? (
          <ErrorState error={me.error} onRetry={() => void me.refetch()} />
        ) : (
          <dl className="divide-y divide-border text-sm">
            <Row k="Name">
              {/* 119 US8: anyone corrects their own name; an email is never changed here. */}
              <span className="flex flex-wrap items-center gap-3">
                {me.data.name ?? displayName(me.data.email)}
                <RenameDialog current={me.data.name} run={renameMe} />
              </span>
            </Row>
            <Row k="Email">{me.data.email}</Row>
            <Row k="Role">
              {me.data.roles[0] ? <Badge variant="brand">{TEAM_ROLE_WORDS[me.data.roles[0]]}</Badge> : "No role"}
            </Row>
            <Row k="Status">
              <Badge variant={me.data.status === "active" ? "success" : "secondary"}>{TEAM_STATUS_WORDS[me.data.status]}</Badge>
            </Row>
            <Row k="Reference">
              <span className="font-mono text-sm break-all">{me.data.subject}</span>
            </Row>
          </dl>
        )}
      </ResponsiveModalContent>
    </ResponsiveModal>
  )
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 py-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}
