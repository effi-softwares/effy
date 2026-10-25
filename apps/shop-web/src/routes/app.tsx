import { useMemo } from "react"

import { useQuery } from "@tanstack/react-query"
import { createRoute, Outlet, useNavigate } from "@tanstack/react-router"
import { useHotkey } from "@tanstack/react-hotkeys"
import { useStore } from "@tanstack/react-store"
import type { ShopRole } from "@effy/shared-types"
import { LiveProvider, StaffShell, StaffUserMenu } from "@effy/web-kit/console"

import { HeaderChrome } from "@/components/console/HeaderChrome"
import { CommandPalette } from "@/components/console/CommandPalette"
import { NewOrderAlert } from "@/components/console/NewOrderAlert"
import { ScanButton } from "@/components/console/ScanButton"
import { SoundChip } from "@/components/console/SoundChip"
import { PwaBanners } from "@/components/console/PwaBanners"
import { useNotificationNavigation } from "@/features/notifications/useNotificationNavigation"
import { getLiveDescriptor } from "@/features/live/repo"
import { LIVE_ROUTES } from "@/features/live/routes"
import { navGroups } from "@/components/layout/nav"
import { useHeaderRecord } from "@/components/console/headerRecord"
import { requireSession } from "@/features/auth/guards"
import { sessionQuery, useSignOut } from "@/features/auth/queries"
import { TodayScreen } from "@/features/today/TodayScreen"
import { useNavBadges } from "@/features/today/useNavBadges"
import { ManagerOnlyScreen } from "@/features/shop-identity/ManagerOnlyScreen"
import { meQuery } from "@/features/shop-identity/queries"
import { setScanOpen } from "@/lib/console-store"
import { setCommandPaletteOpen, setSidebarOpen, setTheme, uiStore } from "@/lib/ui-store"

import { rootRoute } from "./__root"

export const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "protected",
  beforeLoad: async ({ context, location }) => {
    const identity = await requireSession(context.queryClient, location.href)
    return { identity }
  },
  component: AppShell,
})

export const appIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  component: TodayScreen,
})

export const managerRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "manager",
  component: ManagerOnlyScreen,
})

function AppShell() {
  const sidebarOpen = useStore(uiStore, (s) => s.sidebarOpen)
  const theme = useStore(uiStore, (s) => s.theme)
  const paletteOpen = useStore(uiStore, (s) => s.commandPaletteOpen)
  useHotkey("Mod+K", () => setCommandPaletteOpen(!uiStore.state.commandPaletteOpen), {
    ignoreInputs: false,
    preventDefault: true,
  })
  const { data } = useQuery(sessionQuery)
  const signOut = useSignOut()
  const navigate = useNavigate()
  const navBadges = useNavBadges()
  useNotificationNavigation()
  const { data: me } = useQuery(meQuery)
  const record = useHeaderRecord()

  const identity = data?.status === "signed-in" ? data.identity : null
  const roles = useMemo(() => identity?.roles ?? [], [identity])
  const groups = useMemo(() => navGroups(roles), [roles])

  return (
    <LiveProvider enabled={identity !== null} loadDescriptor={getLiveDescriptor} routes={LIVE_ROUTES}>
      <StaffShell
        brand={{ name: "Effy Shop", surface: me?.shop?.name ?? "Shop console" }}
        title="Effy Shop"
        groups={groups}
        counts={navBadges}
        onOpenSearch={() => setCommandPaletteOpen(true)}
        searchPrompt="Order, product, code…"
        headerDetail={record}
        headerActions={
          <>
            <HeaderChrome />
            <SoundChip />
            <ScanButton />
          </>
        }
        userMenu={
          <StaffUserMenu
            email={identity?.email ?? ""}
            roleLabel={roleLabel(roles)}
            theme={theme}
            onSetTheme={setTheme}
            onSignOut={() => signOut.mutate(undefined, { onSuccess: () => navigate({ to: "/auth/sign-in" }) })}
            signingOut={signOut.isPending}
          />
        }
        sidebarOpen={sidebarOpen}
        onSidebarOpenChange={setSidebarOpen}
        overlays={
          <CommandPalette
            open={paletteOpen}
            onOpenChange={setCommandPaletteOpen}
            roles={roles}
            onScan={() => setScanOpen(true)}
          />
        }
      >
        <NewOrderAlert />
        <PwaBanners />
        <Outlet />
      </StaffShell>
    </LiveProvider>
  )
}

function roleLabel(roles: readonly ShopRole[]): string | null {
  if (roles.includes("shop_manager")) return "Manager"
  if (roles.includes("shop_staff")) return "Staff"
  return null
}
