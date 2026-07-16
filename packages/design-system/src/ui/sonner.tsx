import { Toaster as Sonner, toast } from "sonner"
import type { ToasterProps } from "sonner"

/**
 * The platform toast surface (016). Wraps `sonner`'s Toaster, styled from the design-system CSS
 * tokens so it inherits light/dark automatically (no next-themes — these are Vite SPAs whose
 * dark mode is a `.dark` class on the root). Mount once near the app root; call `toast(...)`.
 */
function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster, toast }
