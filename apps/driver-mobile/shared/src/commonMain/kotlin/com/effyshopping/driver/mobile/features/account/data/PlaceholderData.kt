package com.effyshopping.driver.mobile.features.account.data

import com.effyshopping.driver.mobile.core.placeholder.Sourced
import com.effyshopping.driver.mobile.core.placeholder.operational

/**
 * What the account screens cannot honestly show (060 US2/US4).
 */
object AccountPlaceholders {

    /**
     * ⚠ **REFUSED ON CONSTITUTIONAL GROUNDS, not merely absent.** The design supplies
     * `1800 EFFY OPS`. A phone number a driver would dial is an **outward-facing real-world
     * identifier**, and the constitution's Real-World Identifiers section requires those be
     * operator-supplied and **never inferred** — the rule exists because 037 read an address out of
     * session context and AWS mailed a real person.
     *
     * A plausible-looking wrong number on a help screen is worse than a blank one: a driver with a
     * problem dials it and reaches a stranger, and every automated gate would have passed, because
     * the defect is one of AUTHORITY, not correctness.
     */
    val dispatchPhone: Sourced<Nothing?> = operational("The operator supplying a real dispatch number")

    /** ⚠ Design: "Hub dock desk · Port Melbourne". No premises contact exists. */
    val hubDeskContact: Sourced<Nothing?> = operational("A hub contact on the operating-hub record")

    /** ⚠ Design: a "Driver handbook" link. No such document exists. */
    val handbookLink: Sourced<Nothing?> = operational("An operator-published driver handbook URL")
}
