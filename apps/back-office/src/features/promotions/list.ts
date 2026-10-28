import { defineListSearch, searchFilter } from "@effy/web-kit/data-table"

/** A promotion's single-use codes on its page (103): mirrors the admin service's `CODE_LIST_SPEC`. */
export const codesList = defineListSearch({
  id: "promotion-codes",
  mode: "offset",
  sorts: ["created", "code"] as const,
  defaultSort: "created",
  sortDir: { created: "asc", code: "asc" },
  filters: { state: searchFilter.oneOf(["unused", "held", "used"] as const) },
  prefix: "code",
})

/** The customers a promotion is for (103): mirrors `CUSTOMER_LIST_SPEC`. */
export const chosenCustomersList = defineListSearch({
  id: "promotion-customers",
  mode: "offset",
  sorts: ["email"] as const,
  defaultSort: "email",
  sortDir: { email: "asc" },
  filters: {},
  prefix: "cust",
})
