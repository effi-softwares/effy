import {
  Apple,
  Carrot,
  Citrus,
  Cookie,
  Croissant,
  CupSoda,
  Egg,
  Gift,
  Leaf,
  Milk,
  Sandwich,
  Sparkles,
  Wheat,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * The promo banner: the drawn ground every home-page promotion sits on (a flat promo colour, a white
 * decoration, icon bubbles), with white type as real text. The colours are `--promo-*` in
 * `app/globals.css`, read through `PROMO_COLORS` only. Icons and colours follow the slot, not the
 * promotion (which has neither).
 */
export type PromoColor = "green" | "blue" | "purple" | "orange" | "rose" | "red"

export const PROMO_COLORS: Record<PromoColor, string> = {
  green: "var(--promo-green)",
  blue: "var(--promo-blue)",
  purple: "var(--promo-purple)",
  orange: "var(--promo-orange)",
  rose: "var(--promo-rose)",
  red: "var(--promo-red)",
}

export interface PromoBubble {
  icon: LucideIcon
  /** The bubble's diameter in px; its icon is drawn at half of it. */
  size: number
  /** The white fill's alpha,.12 –.22. */
  alpha: number
  /** Where it sits in its positioned ancestor. */
  at: Pick<React.CSSProperties, "left" | "right" | "top" | "bottom">
}

export interface PromoTheme {
  color: PromoColor
  bubbles: PromoBubble[]
}

/** The hero carousel. Its bubbles sit in the band's right half. */
export const HERO_THEME: PromoTheme = {
  color: "green",
  bubbles: [
    { icon: Apple, size: 140, alpha: 0.22, at: { left: "18%", top: "22%" } },
    { icon: Citrus, size: 96, alpha: 0.18, at: { right: "14%", top: "10%" } },
    { icon: Carrot, size: 88, alpha: 0.18, at: { right: "22%", bottom: "22%" } },
    { icon: Leaf, size: 64, alpha: 0.14, at: { left: "10%", bottom: "14%" } },
  ],
}

/** The two cards beside the hero, top then bottom. */
export const SIDE_THEMES: PromoTheme[] = [
  {
    color: "blue",
    bubbles: [
      { icon: Milk, size: 80, alpha: 0.2, at: { right: 24, top: 28 } },
      { icon: Egg, size: 48, alpha: 0.16, at: { right: 96, bottom: 16 } },
    ],
  },
  {
    color: "purple",
    bubbles: [
      { icon: Gift, size: 80, alpha: 0.2, at: { right: 24, top: 28 } },
      { icon: Sparkles, size: 44, alpha: 0.16, at: { right: 104, top: 16 } },
    ],
  },
]

const offerBubbles = (icons: [LucideIcon, LucideIcon, LucideIcon], alphas: [number, number, number]): PromoBubble[] => [
  { icon: icons[0], size: 96, alpha: alphas[0], at: { right: "28%", top: "30%" } },
  { icon: icons[1], size: 72, alpha: alphas[1], at: { right: "8%", top: "12%" } },
  { icon: icons[2], size: 64, alpha: alphas[2], at: { right: "10%", bottom: "10%" } },
]

/** The Offers row, left to right. A fourth offer starts again at the first. */
export const OFFER_THEMES: PromoTheme[] = [
  { color: "orange", bubbles: offerBubbles([Croissant, Wheat, Sandwich], [0.22, 0.16, 0.16]) },
  { color: "rose", bubbles: offerBubbles([CupSoda, Citrus, CupSoda], [0.22, 0.16, 0.16]) },
  { color: "red", bubbles: offerBubbles([Cookie, Sparkles, Cookie], [0.18, 0.12, 0.12]) },
]

const menuBubbles = (icons: [LucideIcon, LucideIcon]): PromoBubble[] => [
  { icon: icons[0], size: 64, alpha: 0.22, at: { right: 16, bottom: 14 } },
  { icon: icons[1], size: 40, alpha: 0.16, at: { right: 28, bottom: 88 } },
]

/**
 * The All aisles menu's offer slides — a short, narrow card that is mostly words, so two small
 * bubbles sit in the bottom-right corner, clear of the title, the code and the link. One colour per
 * slide, in the order the menu shows them.
 */
export const MENU_THEMES: PromoTheme[] = [
  { color: "orange", bubbles: menuBubbles([Croissant, Wheat]) },
  { color: "rose", bubbles: menuBubbles([CupSoda, Citrus]) },
  { color: "red", bubbles: menuBubbles([Cookie, Sparkles]) },
  { color: "purple", bubbles: menuBubbles([Gift, Sparkles]) },
]

/** The shared decoration: an arc top-right, a ring bottom-left, a tilted pill and a dot. */
export function PromoDecor({ arcOpacity = 0.3, className }: { arcOpacity?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 640 360"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      className={cn("absolute inset-0 size-full", className)}
    >
      <path d="M420 -40 A220 220 0 0 1 680 200" fill="none" stroke="#ffffff" strokeWidth="44" opacity={arcOpacity} />
      <circle cx="80" cy="360" r="70" fill="none" stroke="#ffffff" strokeWidth="10" opacity=".18" />
      <rect x="250" y="300" width="130" height="30" rx="15" fill="#ffffff" opacity=".12" transform="rotate(-12 315 315)" />
      <circle cx="300" cy="60" r="10" fill="#ffffff" opacity=".35" />
    </svg>
  )
}

/** Icon bubbles, positioned in the nearest positioned ancestor. Decoration: hidden from assistive tech. */
export function PromoBubbles({ bubbles }: { bubbles: PromoBubble[] }) {
  return (
    <>
      {bubbles.map(({ icon: Icon, size, alpha, at }, i) => (
        <span
          key={i}
          aria-hidden="true"
          data-promo-bubble=""
          className="absolute flex items-center justify-center rounded-full text-white"
          style={{ ...at, width: size, height: size, background: `rgba(255,255,255,${alpha})` }}
        >
          <Icon style={{ width: size / 2, height: size / 2 }} />
        </span>
      ))}
    </>
  )
}

/**
 * A promo-coloured ground with its decoration behind whatever is put in it.
 *
 * `isolate` + a `-z-10` backdrop: the decoration paints above the colour and below the content, so
 * the content needs no positioning of its own and a white button is never drawn under the ring.
 *
 * `imageUrl` swaps the drawn decoration and bubbles for real artwork at the same size (`object-cover`).
 * The words on top are then on a photograph nobody has measured — the caller decides whether to keep
 * them there.
 *
 * `bubbles={false}` draws the decoration only, for a banner that places its bubbles itself (the hero).
 */
export function PromoBanner({
  theme,
  imageUrl,
  bubbles = true,
  arcOpacity,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "color"> & {
  theme: PromoTheme
  imageUrl?: string | null
  bubbles?: boolean
  arcOpacity?: number
}) {
  return (
    <div
      {...props}
      className={cn("relative isolate overflow-hidden text-white", className)}
      style={{ ...props.style, background: PROMO_COLORS[theme.color] }}
    >
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        {imageUrl ? (
          <img src={imageUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
        ) : (
          <>
            <PromoDecor arcOpacity={arcOpacity} />
            {bubbles && <PromoBubbles bubbles={theme.bubbles} />}
          </>
        )}
      </div>
      {children}
    </div>
  )
}
