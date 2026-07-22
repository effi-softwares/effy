/**
 * ResponsiveModal — one overlay API that renders a centered {@link Dialog} at/above the mobile
 * breakpoint and a bottom {@link Drawer} below it (the shadcn responsive pattern). Both surfaces need
 * exactly this for the address add/edit form, so it lives in the design-system once (Principle II)
 * rather than being hand-rolled per app. Breakpoint detection reuses the existing `useIsMobile` hook.
 *
 * Usage mirrors Dialog/Drawer:
 *   <ResponsiveModal open={open} onOpenChange={setOpen}>
 *     <ResponsiveModalContent>
 *       <ResponsiveModalHeader>
 *         <ResponsiveModalTitle>…</ResponsiveModalTitle>
 *         <ResponsiveModalDescription>…</ResponsiveModalDescription>
 *       </ResponsiveModalHeader>
 *       … form …
 *       <ResponsiveModalFooter>…</ResponsiveModalFooter>
 *     </ResponsiveModalContent>
 *   </ResponsiveModal>
 */
import * as React from "react"

import { useIsMobile } from "../hooks/use-mobile"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "./drawer"

const ResponsiveModalContext = React.createContext(false)

/** True when the modal is currently rendering as a Drawer (below the breakpoint). */
function useResponsiveModalIsMobile() {
  return React.useContext(ResponsiveModalContext)
}

interface ResponsiveModalProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}

function ResponsiveModal({ children, ...props }: ResponsiveModalProps) {
  const isMobile = useIsMobile()
  const Root = isMobile ? Drawer : Dialog
  return (
    <ResponsiveModalContext.Provider value={isMobile}>
      <Root {...props}>{children}</Root>
    </ResponsiveModalContext.Provider>
  )
}

function ResponsiveModalTrigger(
  props: React.ComponentProps<typeof DialogTrigger>
) {
  const isMobile = useResponsiveModalIsMobile()
  const Trigger = isMobile ? DrawerTrigger : DialogTrigger
  return <Trigger {...props} />
}

function ResponsiveModalClose(props: React.ComponentProps<typeof DialogClose>) {
  const isMobile = useResponsiveModalIsMobile()
  const Close = isMobile ? DrawerClose : DialogClose
  return <Close {...props} />
}

function ResponsiveModalContent({
  children,
  ...props
}: React.ComponentProps<typeof DialogContent>) {
  const isMobile = useResponsiveModalIsMobile()
  if (isMobile) {
    return <DrawerContent {...props}>{children}</DrawerContent>
  }
  return <DialogContent {...props}>{children}</DialogContent>
}

function ResponsiveModalHeader(props: React.ComponentProps<"div">) {
  const isMobile = useResponsiveModalIsMobile()
  const Header = isMobile ? DrawerHeader : DialogHeader
  return <Header {...props} />
}

function ResponsiveModalFooter(props: React.ComponentProps<"div">) {
  const isMobile = useResponsiveModalIsMobile()
  const Footer = isMobile ? DrawerFooter : DialogFooter
  return <Footer {...props} />
}

function ResponsiveModalTitle(
  props: React.ComponentProps<typeof DialogTitle>
) {
  const isMobile = useResponsiveModalIsMobile()
  const Title = isMobile ? DrawerTitle : DialogTitle
  return <Title {...props} />
}

function ResponsiveModalDescription(
  props: React.ComponentProps<typeof DialogDescription>
) {
  const isMobile = useResponsiveModalIsMobile()
  const Description = isMobile ? DrawerDescription : DialogDescription
  return <Description {...props} />
}

export {
  ResponsiveModal,
  ResponsiveModalClose,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  ResponsiveModalTrigger,
  useResponsiveModalIsMobile,
}
