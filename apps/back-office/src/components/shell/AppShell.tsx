import { useMemo, useState, type ReactNode } from "react"

import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useHotkey, useHotkeySequence } from "@tanstack/react-hotkeys"
import { useStore } from "@tanstack/react-store"

import type { BackOfficeRole } from "@effy/shared-types"
import { DropdownMenuItem, DropdownMenuShortcut } from "@effy/design-system/ui"
import { StaffShell, StaffUserMenu } from "@effy/web-kit/console"
import { AllToursDialog, TourHelpButton, TourProvider } from "@effy/web-kit/tour"
import { IdCard, Keyboard } from "lucide-react"

import { meQuery } from "@/features/team/queries"
import { useOpenRecord } from "@/features/tours/openRecord"
import { tourStateQuery, useTourWrite } from "@/features/tours/repo"
import { BACK_OFFICE_TOURS } from "@/features/tours/tours"
import { track } from "@/lib/telemetry"
import { setCommandPaletteOpen, setSidebarOpen, setTheme, uiStore } from "@/lib/ui-store"

import { CHORDS } from "./chords"
import { CommandPalette } from "./CommandPalette"
import { ScanBox } from "./ScanBox"
import { UpdateBanner } from "./UpdateBanner"
import { DEFAULT_TAB, linkOf, locate, NAV_GROUPS, visibleGroups } from "./nav"
import { ShortcutsDialog, StaffRecordDialog } from "./ShellDialogs"
import { roleLabel } from "./identity"
import { useNavCounts } from "./useNavCounts"

interface AppShellProps {
  email: string
  roles: readonly BackOfficeRole[]
  onSignOut: () => void
  signingOut: boolean
  children: ReactNode
}

export function AppShell({ email, roles, onSignOut, signingOut, children }: AppShellProps) {
  const sidebarOpen = useStore(uiStore, (s) => s.sidebarOpen)
  const theme = useStore(uiStore, (s) => s.theme)
  const paletteOpen = useStore(uiStore, (s) => s.commandPaletteOpen)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [recordOpen, setRecordOpen] = useState(false)
  const navigate = useNavigate()

  const groups = useMemo(() => visibleGroups(NAV_GROUPS, roles), [roles])
  const counts = useNavCounts(email !== "")
  const me = useQuery({ ...meQuery, enabled: email !== "" })
  const status = me.data?.status
  const tourState = useQuery({ ...tourStateQuery, enabled: email !== "" })
  const tourWrite = useTourWrite()
  const openRecord = useOpenRecord()

  // ⌘K / Ctrl+K anywhere, even from inside a field - it is how people leave one.
  useHotkey("Mod+K", () => setCommandPaletteOpen(!uiStore.state.commandPaletteOpen), {
    ignoreInputs: false,
    preventDefault: true,
  })
  // "?" - matched by the character typed (Shift is how most layouts type it).
  useHotkey({ key: "?", shift: true }, () => setShortcutsOpen(true), { ignoreInputs: true })
  for (const chord of CHORDS) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- chords is a module constant; the call order never changes
    useHotkeySequence(
      chord.keys,
      () => {
        const where = locate(groups, chord.navKey)
        if (where) void navigate(linkOf(where.leaf) as never)
      },
      { ignoreInputs: true },
    )
  }

  return (
    // Guided tours (107): a page's tour starts by itself the first time, once per person; replayed from Help.
    <TourProvider
      tours={BACK_OFFICE_TOURS}
      roles={roles}
      analyticsRole={roleLabel(roles) ?? undefined}
      state={tourState}
      write={tourWrite.mutate}
      openRecord={openRecord}
      onEvent={track}
      devWarnings={import.meta.env.DEV}
    >
      <StaffShell
        brand={{ name: "Effy", surface: "Back-Office" }}
        title="Effy Back-Office"
        groups={groups}
        defaultTabs={DEFAULT_TAB}
        counts={counts}
        onOpenSearch={() => setCommandPaletteOpen(true)}
        searchPrompt="Order, customer, package…"
        sidebarOpen={sidebarOpen}
        onSidebarOpenChange={setSidebarOpen}
        headerActions={<TourHelpButton />}
        userMenu={
          <StaffUserMenu
            email={email}
            roleLabel={roleLabel(roles)}
            statusLabel={status ? (status === "active" ? "Active" : "Disabled") : null}
            theme={theme}
            onSetTheme={setTheme}
            items={
              <>
                <DropdownMenuItem onSelect={() => setRecordOpen(true)}>
                  <IdCard aria-hidden="true" />
                  Your back-office record
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
                  <Keyboard aria-hidden="true" />
                  Keyboard shortcuts
                  <DropdownMenuShortcut>?</DropdownMenuShortcut>
                </DropdownMenuItem>
              </>
            }
            onSignOut={onSignOut}
            signingOut={signingOut}
          />
        }
        overlays={
          <>
            <ScanBox />
            <CommandPalette open={paletteOpen} onOpenChange={setCommandPaletteOpen} groups={groups} roles={roles} />
            <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
            <StaffRecordDialog open={recordOpen} onOpenChange={setRecordOpen} />
            <AllToursDialog />
          </>
        }
      >
        <UpdateBanner />
        {children}
      </StaffShell>
    </TourProvider>
  )
}
