import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { UserPlus } from "lucide-react"

import { isShopManager, SHOP_ROLES, type ShopRole, type ShopTeamMemberDTO } from "@effy/shared-types"
import {
  Badge,
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

import { productMutationError } from "@/features/catalog/errorText"
import { sessionQuery } from "@/features/auth/queries"

import { teamQuery, useChangeRole, useDeactivateStaff, useInviteStaff } from "./queries"

const ROLE_LABEL: Record<ShopRole, string> = {
  shop_manager: "Manager",
  shop_staff: "Staff",
}

/**
 * The shop's own team (US7, T066).
 *
 * ⚠ THE ROSTER IS READABLE BY EVERYONE, THE ACTIONS ARE MANAGER-ONLY (FR-019b). Knowing who you work
 * with is not privileged; changing who can do what is. And this component is NOT the gate — the
 * backend re-checks `shop_manager` against the platform record on every write and refuses regardless.
 * Withholding the controls only spares a staff member a refusal they can do nothing about.
 *
 * ⚠ IT WRITES THE SAME RECORDS BACK-OFFICE OWNS. There is no shop-local roster (FR-019).
 */
export function TeamRoster() {
  const { data, error, isPending, isError, refetch } = useQuery(teamQuery)
  const { data: session } = useQuery(sessionQuery)
  const [inviteOpen, setInviteOpen] = useState(false)

  const canManage = session?.status === "signed-in" && isShopManager(session.identity.roles)

  return (
    <div className="flex flex-col gap-[var(--pad)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Who can sign in to this shop, and what they can do.
          </p>
        </div>
        {canManage ? (
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus />
            Invite
          </Button>
        ) : null}
      </div>

      {isError ? (
        <ErrorState
          error={error}
          onRetry={() => void refetch()}
          forbiddenMessage="Your account can't see this shop's team."
        />
      ) : isPending ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
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

  const busy = changeRole.isPending || deactivate.isPending
  const role = member.roles.includes("shop_manager") ? "shop_manager" : "shop_staff"

  return (
    <TableRow>
      <TableCell className="font-medium">{member.name ?? "—"}</TableCell>
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
            <SelectTrigger className="w-36" aria-label={`Role for ${member.name ?? member.email}`}>
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
          <span role="alert" className="text-destructive mt-1 block text-xs">
            {error}
          </span>
        ) : null}
      </TableCell>
      <TableCell>
        {/* ⚠ Status by word, never a hue (Principle V). */}
        <Badge variant={member.status === "active" ? "success" : "muted"}>
          {member.status === "active" ? "Active" : "Stood down"}
        </Badge>
      </TableCell>
      {canManage ? (
        <TableCell className="text-right">
          {/* ⚠ Withheld on your OWN row — a courtesy against locking yourself out. The backend also
              refuses removing the last manager, which is the actual protection. */}
          {member.status === "active" && !member.isSelf ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              disabled={busy}
              onClick={() =>
                deactivate.mutate(member.staffId, {
                  onError: (e) => setError(productMutationError(e)),
                })
              }
            >
              Stand down
            </Button>
          ) : null}
        </TableCell>
      ) : null}
    </TableRow>
  )
}

function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
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
        // ⚠ The server's own words are shown. "That email belongs to someone who was stood down here"
        // is the whole point of the refusal — a generic "couldn't invite" would leave the manager
        // retrying an address that will never work.
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
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
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
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </div>

        <ResponsiveModalFooter>
          <Button variant="ghost" disabled={invite.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={invite.isPending || !email.trim() || !name.trim()}
            onClick={submit}
          >
            {invite.isPending ? "Inviting…" : "Send invite"}
          </Button>
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  )
}
