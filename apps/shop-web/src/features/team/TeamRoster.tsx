import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Pencil, UserPlus } from "lucide-react"

import { CAPPED_SET_LIMIT, isShopManager, listFullSentence, SHOP_ROLES, type ShopRole, type ShopTeamMemberDTO } from "@effy/shared-types"
import {
  Badge,
  InitialsAvatar,
  Button,
  Input,
  Label,
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@effy/design-system/ui"
import { StaticTable, type EffyColumnDef } from "@effy/web-kit/data-table"
import { ErrorState } from "@effy/web-kit/console"
import { PageHeader } from "@effy/web-kit/patterns"

import { DesignSheet } from "@/components/console/DesignSheet"

import { sessionQuery } from "@/features/auth/queries"

import { teamError } from "./errorText"
import { teamQuery, useInviteStaff, useUpdateMember, type TeamMemberPatch } from "./queries"
import { tourStatus, useTourPage } from "@effy/web-kit/tour"

const ROLE_LABEL: Record<ShopRole, string> = {
  shop_manager: "Manager",
  shop_staff: "Staff",
}

export function TeamRoster() {
  const { data, error, isPending, isError, refetch } = useQuery(teamQuery)
  const { data: session } = useQuery(sessionQuery)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = data?.find((m) => m.staffId === editingId) ?? null

  const canManage = session?.status === "signed-in" && isShopManager(session.identity.roles)
  // A Staff member's roster read is refused: an error page, so no tour is offered there.
  useTourPage("team", { status: tourStatus({ isSuccess: !isPending && !isError, isError }) })

  return (
    <div className="flex flex-col gap-6 max-md:gap-4">
      <PageHeader
        title="Team"
        description="The people who can sign in to this shop console, and what each can do."
        actions={
          canManage ? (
            <Button data-tour="team.invite" onClick={() => setInviteOpen(true)}>
              <UserPlus aria-hidden="true" />
              Invite
            </Button>
          ) : null
        }
      />

      {isError ? (
        <ErrorState
          error={error}
          onRetry={() => void refetch()}
          forbiddenMessage="Your account can't see this shop's team."
        />
      ) : isPending ? (
        <StaticTable
          label="Team"
          columns={teamColumns(canManage, setEditingId)}
          rows={[]}
          getRowId={(m) => m.staffId}
          loading
        />
      ) : (
        <>
          <StaticTable
            label="Team"
            columns={teamColumns(canManage, setEditingId)}
            rows={data}
            getRowId={(m) => m.staffId}
            initialSort={{ id: "name" }}
          />
          {data.length >= CAPPED_SET_LIMIT ? (
            <p className="text-sm text-muted-foreground">{listFullSentence(CAPPED_SET_LIMIT)}</p>
          ) : null}
        </>
      )}

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      {editing ? (
        <EditMemberDialog key={editing.staffId} member={editing} onClose={() => setEditingId(null)} />
      ) : null}
    </div>
  )
}

const roleOf = (m: ShopTeamMemberDTO): ShopRole => (m.roles.includes("shop_manager") ? "shop_manager" : "shop_staff")

/** The shop's team, shown whole (103 FR-024: a capped set) and sorted in the browser. */
function teamColumns(canManage: boolean, onEdit: (staffId: string) => void): EffyColumnDef<ShopTeamMemberDTO>[] {
  return [
    {
      id: "name",
      accessorFn: (m) => (m.name ?? m.email ?? "").toLowerCase(),
      header: "Name",
      cell: ({ row }) => (
        <span className="flex items-center gap-3 font-medium">
          <InitialsAvatar name={row.original.name ?? row.original.email ?? "?"} seed={row.original.staffId} className="size-8 shrink-0" />
          {row.original.name ?? "-"}
        </span>
      ),
      meta: { label: "Name", identifying: true, phone: "primary" },
    },
    {
      id: "email",
      accessorFn: (m) => m.email ?? "",
      header: "Email",
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.email ?? "-"}</span>,
      meta: { label: "Email", priority: 2 },
    },
    {
      id: "role",
      accessorFn: (m) => (roleOf(m) === "shop_manager" ? 0 : 1),
      header: "Role",
      cell: ({ row }) => ROLE_LABEL[roleOf(row.original)],
      meta: { label: "Role" },
    },
    {
      id: "status",
      accessorFn: (m) => m.status,
      header: "Status",
      cell: ({ row }) =>
        row.original.status === "active" ? <Badge variant="success">Active</Badge> : <Badge variant="quiet">Stood down</Badge>,
      meta: { label: "Status", phone: "badge" },
    },
    ...(canManage
      ? [
        {
          id: "actions",
          header: () => <span className="sr-only">Actions</span>,
          enableSorting: false,
          cell: ({ row }) => (
            <Button
              variant="outline"
              size="sm"
              data-tour="team.actions"
              onClick={() => onEdit(row.original.staffId)}
              aria-label={`Edit ${row.original.name ?? row.original.email ?? "colleague"}`}
            >
              <Pencil aria-hidden="true" />
              Edit
            </Button>
          ),
          meta: { label: "Actions", phone: "full", className: "text-right" },
        } satisfies EffyColumnDef<ShopTeamMemberDTO>,
      ]
      : []),
  ]
}

/**
 * A manager edits a colleague: name and role, and whether they may sign in. The email is their sign-in
 * address and is shown, not edited: a different address is a new invitation.
 */
function EditMemberDialog({ member, onClose }: { member: ShopTeamMemberDTO; onClose: () => void }) {
  const update = useUpdateMember()
  const [name, setName] = useState(member.name ?? "")
  const [role, setRole] = useState<ShopRole>(roleOf(member))
  const [error, setError] = useState<string | null>(null)
  const [confirmStandDown, setConfirmStandDown] = useState(false)

  const who = member.name ?? member.email ?? "this colleague"
  const active = member.status === "active"
  const patch: TeamMemberPatch = {}
  if (name.trim() !== (member.name ?? "")) patch.name = name.trim()
  if (role !== roleOf(member)) patch.role = role
  const changed = Object.keys(patch).length > 0

  function send(p: TeamMemberPatch, after?: () => void) {
    setError(null)
    update.mutate(
      { staffId: member.staffId, patch: p },
      {
        onSuccess: () => (after ? after() : onClose()),
        onError: (e) => {
          setConfirmStandDown(false)
          setError(teamError(e))
        },
      },
    )
  }

  return (
    <>
      <ResponsiveModal open onOpenChange={(o) => !o && !update.isPending && onClose()}>
        <ResponsiveModalContent className="sm:max-w-md">
          <ResponsiveModalHeader>
            <ResponsiveModalTitle>Edit {who}</ResponsiveModalTitle>
            <ResponsiveModalDescription>
              {active ? "Change their name or what they can do in this console." : "Stood down: they can't sign in to this shop."}
            </ResponsiveModalDescription>
          </ResponsiveModalHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input id="edit-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Work email</Label>
              <Input id="edit-email" value={member.email ?? ""} readOnly disabled />
              <p className="text-sm text-muted-foreground">
                Their sign-in address. To use another, invite that address and stand this one down.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as ShopRole)}>
                <SelectTrigger id="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHOP_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error ? (
              <p role="alert" className="text-sm font-medium">
                {error}
              </p>
            ) : null}
          </div>

          <ResponsiveModalFooter className="sm:justify-between">
            {active ? (
              member.isSelf ? (
                <span />
              ) : (
                <Button variant="outline" disabled={update.isPending} onClick={() => setConfirmStandDown(true)}>
                  Stand down
                </Button>
              )
            ) : (
              <Button variant="outline" disabled={update.isPending} onClick={() => send({ status: "active" }, () => undefined)}>
                Reinstate
              </Button>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="ghost" disabled={update.isPending} onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={update.isPending || !changed || !name.trim()} onClick={() => send(patch)}>
                {update.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </ResponsiveModalFooter>
        </ResponsiveModalContent>
      </ResponsiveModal>

      <DesignSheet
        open={confirmStandDown}
        onOpenChange={setConfirmStandDown}
        title={`Stand down ${who}?`}
        description="They can no longer sign in to this shop. You can reinstate them from this list later."
        saveLabel="Stand down"
        destructive
        saving={update.isPending}
        onSave={() => send({ status: "disabled" })}
      >
        {null}
      </DesignSheet>
    </>
  )
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const invite = useInviteStaff()
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [role, setRole] = useState<ShopRole>("shop_staff")
  const [error, setError] = useState<string | null>(null)

  function submit() {
    setError(null)
    invite.mutate(
      { email: email.trim(), name: name.trim(), role },
      {
        onSuccess: () => {
          setEmail("")
          setName("")
          onOpenChange(false)
        },
        onError: (e) => setError(teamError(e)),
      },
    )
  }

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent className="sm:max-w-md">
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Invite a colleague</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            They&apos;ll sign in with a one-time code sent to this address. There are no passwords.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-name">Name</Label>
            <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-email">Work email</Label>
            <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as ShopRole)}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHOP_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error ? (
            <p role="alert" className="text-sm font-medium">
              {error}
            </p>
          ) : null}
        </div>

        <ResponsiveModalFooter>
          <Button variant="ghost" disabled={invite.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={invite.isPending || !email.trim() || !name.trim()} onClick={submit}>
            {invite.isPending ? "Inviting…" : "Send invite"}
          </Button>
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  )
}
