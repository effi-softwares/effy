import type { useHotkeySequence } from "@tanstack/react-hotkeys";

type Sequence = Parameters<typeof useHotkeySequence>[0];

/**
 * Two-key "go to" shortcuts — press G, then the letter. Listed beside their pages in the command
 * palette and in Keyboard shortcuts, registered once by the shell. `navKey` is the nav leaf they open.
 */
export const CHORDS: readonly { keys: Sequence; label: string; navKey: string }[] = [
  { keys: ["G", "H"], label: "G H", navKey: "overview" },
  { keys: ["G", "O"], label: "G O", navKey: "orders" },
  { keys: ["G", "D"], label: "G D", navKey: "dispatch" },
  { keys: ["G", "E"], label: "G E", navKey: "exceptions" },
  { keys: ["G", "C"], label: "G C", navKey: "customers" },
  { keys: ["G", "R"], label: "G R", navKey: "review" },
];
