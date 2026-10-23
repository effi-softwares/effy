import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merges Tailwind class lists with conflict resolution: the one class-merge util for every web surface. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
