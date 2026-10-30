import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { UserPlus } from "lucide-react"

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

import { productMutationError } from "@/features/catalog/errorText"
import { sessionQuery } from "@/features/auth/queries"

import { teamQuery, useChangeRole, useDeactivateStaff, useInviteStaff } from "./queries"

const ROLE_LABEL: Record<ShopRole, string> = {
  shop_manager: "Manager",
  shop_staff: "Staff",
}

export function TeamRoster() {
  const { data, error, isPending, isError, refetch } = useQuery(teamQuery)
  const { data: session } = useQuery(sessionQuery)
  const [inviteOpen, setInviteOpen] = useState(false)

  const canManage = session?.status === "signed-in" && isShopManager(session.identity.roles)

  return (
    <div className="flex flex-col gap-6 max-md:gap-4">
      <PageHeader
        title="Team"
        description="The people who can sign in to this shop console, and what each can do."
        actions={
          canManage ? (
            <Button onClick={() => setInviteOpen(true)}>
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
          columns={teamColumns(canManage)}
          rows={[]}
          getRowId={(m) => m.staffId}
          loading
        />
      ) : (
        <>
          <StaticTable
            label="Team"
            columns={teamColumns(canManage)}
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
    </div>
  )
}

const roleOf = (m: ShopTeamMemberDTO): ShopRole => (m.roles.includes("shop_manager") ? "shop_manager" : "shop_staff")

/** The shop's team, shown whole (103 FR-024: a capped set) and sorted in the browser. */
function teamColumns(canManage: boolean): EffyColumnDef<ShopTeamMemberDTO>[] {
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
      cell: ({ row }) => <RoleCell member={row.original} canManage={canManage} />,
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
          cell: ({ row }) => <StandDownCell member={row.original} />,
          meta: { label: "Actions", phone: "full", className: "text-right" },
        } satisfies EffyColumnDef<ShopTeamMemberDTO>,
      ]
      : []),
  ]
}

function RoleCell({ member, canManage }: { member: ShopTeamMemberDTO; canManage: boolean }) {
  const changeRole = useChangeRole()
  const [error, setError] = useState<string | null>(null)
  const role = roleOf(member)
  return (
    <>
      {canManage && member.status === "active" ? (
        <Select
          value={role}
          disabled={changeRole.isPending}
          onValueChange={(v) =>
            changeRole.mutate({ staffId: member.staffId, role: v as ShopRole }, { onError: (e) => setError(productMutationError(e)) })
          }
        >
          <SelectTrigger size="sm" className="w-40" aria-label={`Role for ${member.name ?? member.email}`}>
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
      ) : (
        ROLE_LABEL[role]
      )}
      {error ? (
        <span role="alert" className="mt-1 block text-sm font-medium">
          {error}
        </span>
      ) : null}
    </>
  )
}

function StandDownCell({ member }: { member: ShopTeamMemberDTO }) {
  const deactivate = useDeactivateStaff()
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      {member.status === "active" && !member.isSelf ? (
        <Button variant="outline" size="sm" disabled={deactivate.isPending} onClick={() => setConfirm(true)}>
          Stand down
        </Button>
      ) : null}
      {error ? (
        <span role="alert" className="mt-1 block text-sm font-medium">
          {error}
        </span>
      ) : null}
      <DesignSheet
        open={confirm}
        onOpenChange={setConfirm}
        title={`Stand down ${member.name ?? member.email ?? "this colleague"}?`}
        description="They can no longer sign in to this shop. You can reinstate them by inviting the same email again."
        saveLabel="Stand down"
        destructive
        saving={deactivate.isPending}
        onSave={() =>
          deactivate.mutate(member.staffId, {
            onSuccess: () => setConfirm(false),
            onError: (e) => {
              setConfirm(false)
              setError(productMutationError(e))
            },
          })
        }
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
        onError: (e) => setError(productMutationError(e)),
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
