/**
 * What the two lasting live regions say (spec FR-023, research R5).
 *
 * A failure is said urgently, everything else politely. The same words twice must be said twice, and a region whose
 * text does not change says nothing - so a repeat is written as "clear now, write on the next tick".
 */
import type { Kind, LiveText, Message } from "./types";

export type Region = keyof LiveText;

export function regionFor(kind: Kind): Region {
  return kind === "error" ? "assertive" : "polite";
}

/** "Saved. 6 orders" - a title that already ends a sentence is not given a second full stop. */
export function spokenText(message: Pick<Message, "title" | "description">): string {
  if (!message.description) return message.title;
  const joiner = /[.!?…:]$/.test(message.title) ? " " : ". ";
  return `${message.title}${joiner}${message.description}`;
}

/** The text to show now, and - for a repeat - the text to write a moment later. */
export function nextLive(prev: LiveText, region: Region, text: string): { now: LiveText; later: LiveText | null } {
  if (prev[region] === text) return { now: { ...prev, [region]: "" }, later: { ...prev, [region]: text } };
  return { now: { ...prev, [region]: text }, later: null };
}
