import {
  Apple,
  Carrot,
  Citrus,
  Coffee,
  Croissant,
  CupSoda,
  Gift,
  IceCreamCone,
  Leaf,
  Milk,
  PartyPopper,
  Sandwich,
  Snowflake,
  Sparkles,
  Sun,
  Wheat,
  type LucideIcon,
} from "lucide-react";

import type { DecorationSet } from "@effy/shared-types";

/**
 * 095 — the decoration sets a skin may show: three icons each, drawn as bubbles. The customer app draws
 * the same icons (Lucide) in the same order (`PromoSkinDecorations.kt`).
 */
export const DECORATION_ICONS: Record<DecorationSet, [LucideIcon, LucideIcon, LucideIcon]> = {
  food: [Apple, Milk, Carrot],
  produce: [Carrot, Apple, Leaf],
  bakery: [Croissant, Wheat, Sandwich],
  drinks: [CupSoda, Citrus, Coffee],
  "seasonal-winter": [Snowflake, Gift, Coffee],
  "seasonal-summer": [Sun, IceCreamCone, Citrus],
  celebration: [Gift, PartyPopper, Sparkles],
};

/** Where the three bubbles sit, as fractions of the box (right/top), and their size relative to its height. */
const SPOTS = [
  { right: 0.08, top: 0.14, size: 0.42 },
  { right: 0.3, top: 0.46, size: 0.3 },
  { right: 0.1, top: 0.66, size: 0.22 },
] as const;

/** Hex + alpha → rgba(). */
export function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function Decorations({ set, colour, strength, height }: { set: DecorationSet; colour: string; strength: number; height: number }) {
  return (
    <span aria-hidden="true" className="eps-decor">
      {DECORATION_ICONS[set].map((Icon, i) => {
        const spot = SPOTS[i]!;
        const size = Math.round(height * spot.size);
        return (
          <span
            key={i}
            className="eps-bubble"
            style={{
              right: `${spot.right * 100}%`,
              top: `${spot.top * 100}%`,
              width: size,
              height: size,
              background: rgba(colour, strength),
              color: colour,
            }}
          >
            <Icon style={{ width: size / 2, height: size / 2 }} />
          </span>
        );
      })}
    </span>
  );
}
