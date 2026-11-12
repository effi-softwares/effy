import type { RetainedCategoryDTO } from "@effy/shared-types"

/**
 * What is kept after erasure, and why: one list for mobile and web. Needs legal confirmation before
 * launch, and every sentence must be true of the system (034 SC-010; 113 erases exactly this much). Keep the
 * verb "DELETE" (`deletion-copy.test.ts` checks). Its own file so the closure service stays free of the word
 * "phone" (`phone-isolation.test.ts`: the closure step-up is keyed on the verified email).
 */
export const RETAINED: RetainedCategoryDTO[] = [
  {
    category: "Your orders and receipts",
    reason:
      "Tax and accounting rules require us to keep a record of every completed sale, even after you delete your account.",
  },
  {
    category: "Your payment records",
    reason:
      "Financial rules require us to hold on to proof of payments and refunds. It is also what lets us help you if a payment is ever disputed.",
  },
  {
    // 113 FR-016: exactly what erasure keeps for security, and only for a barred account.
    category: "Security records",
    reason:
      "If your account was barred for misuse, we keep a scrambled copy of its email and phone so we can recognise it if it's used again. Nothing else is kept.",
  },
]
