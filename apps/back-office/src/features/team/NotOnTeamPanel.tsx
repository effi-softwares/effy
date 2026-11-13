import { useState } from "react"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { TEAM_ROLE_WORDS, type BackOfficeRole, type NotOnTeamDTO } from "@effy/shared-types"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from "@effy/design-system/ui"
import { Panel, StatusWord } from "@effy/web-kit/patterns"

import { teamErrorText } from "./changes"
import { TEAM_ROOT } from "./queries"
import { deleteSignInAccount } from "./repo"

const groupWords = (groups: string[]) =>
  groups.length === 0
    ? "No group"
    : groups.map((g) => (g in TEAM_ROLE_WORDS ? TEAM_ROLE_WORDS[g as BackOfficeRole] : g)).join(", ")

/**
 * Sign-in accounts with no team record (119 FR-007, FR-030): they cannot use back-office until added. Each can be
 * added to the team (choosing a role) or deleted.
 */
export function NotOnTeamPanel({ accounts, onAdd }: { accounts: NotOnTeamDTO[]; onAdd: (email: string) => void }) {
  return (
    <Panel
      flush
      title="Not on the team"
      description="These sign-in accounts have no team record, so they cannot use back-office. Add each to the team, or delete it."
    >
      <div className="min-w-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Sign-in</TableHead>
              <TableHead>Groups</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((a) => (
              <TableRow key={a.username}>
                <TableCell className="break-all">{a.email ?? a.username}</TableCell>
                <TableCell>
                  <StatusWord tone={a.enabled ? "waiting" : "quiet"}>{a.enabled ? "Enabled" : "Disabled"}</StatusWord>
                </TableCell>
                <TableCell className="text-muted-foreground">{groupWords(a.groups)}</TableCell>
                <TableCell>
                  <span className="flex flex-wrap justify-end gap-2">
                    {a.email ? (
                      <Button variant="outline" size="sm" onClick={() => onAdd(a.email!)}>
                        Add to the team
                      </Button>
                    ) : null}
                    <DeleteAccount account={a} />
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Panel>
  )
}

function DeleteAccount({ account }: { account: NotOnTeamDTO }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const remove = useMutation({
    mutationFn: () => deleteSignInAccount(account.username),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TEAM_ROOT })
      toast.success("The sign-in account was deleted.")
      setOpen(false)
    },
  })
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          Delete sign-in account
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this sign-in account?</AlertDialogTitle>
          <AlertDialogDescription>
            {account.email ?? account.username} can no longer sign in. Nobody on the team is changed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {remove.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {teamErrorText(remove.error)}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={remove.isPending}
            onClick={(e) => {
              e.preventDefault()
              remove.mutate()
            }}
          >
            {remove.isPending ? "Deleting…" : "Delete sign-in account"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
