import type { useHotkeySequence } from "@tanstack/react-hotkeys"

type Sequence = Parameters<typeof useHotkeySequence>[0]

export const CHORDS: readonly { keys: Sequence; label: string; navKey: string }[] = [
  { keys: ["G", "H"], label: "G H", navKey: "overview" },
  { keys: ["G", "O"], label: "G O", navKey: "orders" },
  { keys: ["G", "D"], label: "G D", navKey: "dispatch" },
  { keys: ["G", "E"], label: "G E", navKey: "exceptions" },
  { keys: ["G", "C"], label: "G C", navKey: "customers" },
  { keys: ["G", "R"], label: "G R", navKey: "review" },
]
