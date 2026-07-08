import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class lists with correct conflict resolution. The one class-merge util for
 *  every web surface (shadcn generates `import { cn } from "@/lib/utils"`, which re-exports this). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
