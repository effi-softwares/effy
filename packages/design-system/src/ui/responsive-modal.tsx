/**
 * The earlier name for the responsive dialog. `Dialog` is now responsive itself (a centred Dialog at or
 * above the mobile breakpoint, a bottom Drawer below it), so these are the same components under the
 * names existing screens already use.
 */
export {
  Dialog as ResponsiveModal,
  DialogClose as ResponsiveModalClose,
  DialogContent as ResponsiveModalContent,
  DialogDescription as ResponsiveModalDescription,
  DialogFooter as ResponsiveModalFooter,
  DialogHeader as ResponsiveModalHeader,
  DialogTitle as ResponsiveModalTitle,
  DialogTrigger as ResponsiveModalTrigger,
  useDialogIsMobile as useResponsiveModalIsMobile,
} from "./dialog"
