import * as React from "react"
import { AlertDialog as AlertDialogPrimitive } from "radix-ui"

import { cn } from "../cn"
import { useIsMobile } from "../hooks/use-mobile"
import { buttonVariants } from "./button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
} from "./drawer"
import { dialogDrawerClassName, overlayClassName } from "./overlay"

/**
 * shadcn's AlertDialog, responsive like `Dialog`: centred at or above the mobile breakpoint, a bottom
 * Drawer below it. Either way it is a question that must be answered — the Drawer is not dismissed by a
 * swipe, a tap outside or Escape, only by Cancel or the action. (Not vaul's `dismissible={false}`: that
 * ignores every close, Cancel's included.)
 */
const AlertDialogMobileContext = React.createContext(false)

function useAlertDialogIsMobile() {
  return React.useContext(AlertDialogMobileContext)
}

function AlertDialog({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  const isMobile = useIsMobile()
  return (
    <AlertDialogMobileContext.Provider value={isMobile}>
      {isMobile ? (
        <Drawer handleOnly {...props} />
      ) : (
        <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
      )}
    </AlertDialogMobileContext.Provider>
  )
}

function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  if (useAlertDialogIsMobile()) return <DrawerTrigger data-slot="alert-dialog-trigger" {...props} />
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  )
}

function AlertDialogPortal({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  if (useAlertDialogIsMobile()) return <DrawerPortal data-slot="alert-dialog-portal" {...props} />
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  )
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  if (useAlertDialogIsMobile()) return <DrawerOverlay className={className} {...props} />
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(overlayClassName, className)}
      {...props}
    />
  )
}

function AlertDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  if (useAlertDialogIsMobile()) {
    return (
      <DrawerContent
        role="alertdialog"
        className={cn(dialogDrawerClassName, className)}
        {...props}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      />
    )
  }
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          "bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 border p-6 shadow-lg sm:max-w-lg rounded-lg duration-(--dur-standard) data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className
        )}
        {...props}
      />
    </AlertDialogPortal>
  )
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const isMobile = useAlertDialogIsMobile()
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        "flex flex-col gap-2",
        isMobile ? "pt-4 text-left" : "text-center sm:text-left",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const isMobile = useAlertDialogIsMobile()
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        isMobile && "[&>*]:w-full",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  const classes = cn("font-semibold text-xl leading-7", className)
  if (useAlertDialogIsMobile()) return <DrawerTitle className={classes} {...props} />
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={classes}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  const classes = cn("text-muted-foreground text-base leading-6", className)
  if (useAlertDialogIsMobile()) return <DrawerDescription className={classes} {...props} />
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={classes}
      {...props}
    />
  )
}

/** Closes the dialog after its `onClick`, unless that handler calls `preventDefault` (a pending save). */
function AlertDialogAction({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action>) {
  const classes = cn(buttonVariants(), className)
  if (useAlertDialogIsMobile()) return <DrawerClose className={classes} {...props} />
  return <AlertDialogPrimitive.Action className={classes} {...props} />
}

function AlertDialogCancel({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  const classes = cn(buttonVariants({ variant: "outline" }), className)
  if (useAlertDialogIsMobile()) return <DrawerClose className={classes} {...props} />
  return <AlertDialogPrimitive.Cancel className={classes} {...props} />
}

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}
