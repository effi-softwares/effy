import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { UserPlus } from "lucide-react"

import { isShopManager, SHOP_ROLES, type ShopRole, type ShopTeamMemberDTO } from "@effy/shared-types"
import {
  Skeleton,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@effy/design-system/ui"
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
        <div className="bo-table-wrap" aria-busy="true" aria-label="Loading the team">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-4 last:border-b-0">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="ml-auto h-6 w-20 rounded-md" />
            </div>
          ))}
        </div>
      ) : (
        <div className="bo-table-wrap overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                {canManage ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((m) => (
                <MemberRow key={m.staffId} member={m} canManage={canManage} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  )
}

function MemberRow({ member, canManage }: { member: ShopTeamMemberDTO; canManage: boolean }) {
  const changeRole = useChangeRole()
  const deactivate = useDeactivateStaff()
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)

  const busy = changeRole.isPending || deactivate.isPending
  const role = member.roles.includes("shop_manager") ? "shop_manager" : "shop_staff"

  return (
    <TableRow>
      <TableCell className="font-medium">
        <span className="flex items-center gap-2.5">
          <InitialsAvatar name={member.name ?? member.email ?? "?"} seed={member.staffId} className="size-8 shrink-0" />
          {member.name ?? "—"}
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground">{member.email ?? "—"}</TableCell>
      <TableCell>
        {canManage && member.status === "active" ? (
          <Select
            value={role}
            disabled={busy}
            onValueChange={(v) =>
              changeRole.mutate(
                { staffId: member.staffId, role: v as ShopRole },
                { onError: (e) => setError(productMutationError(e)) },
              )
            }
          >
            <SelectTrigger className="w-40" aria-label={`Role for ${member.name ?? member.email}`}>
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
      </TableCell>
      <TableCell>
        {member.status === "active" ? (
          <span className="bo-st bo-st--done">Active</span>
        ) : (
          <span className="bo-st bo-st--quiet">Stood down</span>
        )}
      </TableCell>
      {canManage ? (
        <TableCell className="text-right">
          {member.status === "active" && !member.isSelf ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirm(true)}>
              Stand down
            </Button>
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
        </TableCell>
      ) : null}
    </TableRow>
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
          <div className="space-y-1.5">
            <Label htmlFor="invite-name">Name</Label>
            <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Work email</Label>
            <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
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
