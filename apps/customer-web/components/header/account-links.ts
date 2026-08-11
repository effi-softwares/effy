/**
 * The customer's account destinations — ONE list, rendered by two different controls.
 *
 * ⚠ It exists because the same four entries are now shown in two places that look nothing alike: the
 * desktop `<details>` dropdown (`AccountMenu`) and the drawer's slide-in account panel on small
 * screens (`MobileNavIsland`). Written out twice, they drift — a link added for the desktop menu
 * simply never appears on a phone, and nothing fails.
 *
 * Sign-out is deliberately NOT in here. It is a `<form method="post">`, not a link (a GET sign-out is
 * triggerable by any `<img src="/sign-out">` on the internet — a CSRF logout), so it has a different
 * shape and belongs to each renderer.
 */
export const ACCOUNT_LINKS = [
  { label: "Your account", href: "/account", testId: "menu-account" },
  { label: "Your addresses", href: "/account?tab=addresses", testId: "menu-addresses" },
  // 033 FR-055: a storefront entry point that does not require scrolling to the footer.
  { label: "Saved items", href: "/saved", testId: "menu-saved" },
] as const
