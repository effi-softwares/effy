package com.effyshopping.customer.mobile.features.account

import com.effyshopping.customer.mobile.core.storage.InMemoryDevicePreferences
import com.effyshopping.customer.mobile.core.storage.PreferenceKeys
import com.effyshopping.customer.mobile.core.storage.clearGuestData
import com.effyshopping.customer.mobile.core.storage.hasDeviceShoppingData
import com.effyshopping.customer.mobile.features.account.domain.ClosureBlocker
import com.effyshopping.customer.mobile.features.account.domain.ClosureBlockerKind
import com.effyshopping.customer.mobile.features.account.domain.ClosurePreview
import com.effyshopping.customer.mobile.features.account.domain.Customer
import com.effyshopping.customer.mobile.features.account.domain.CustomerName
import com.effyshopping.customer.mobile.features.account.domain.CustomerStanding
import com.effyshopping.customer.mobile.features.account.domain.PasswordJourney
import com.effyshopping.customer.mobile.features.account.domain.RetainedCategory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

// ⚠ NO COMMAS IN BACKTICKED TEST NAMES. Kotlin/Native forbids them in a declaration name while the
// JVM accepts them, so a comma here compiles green on `testAndroidHostTest` and fails the iOS test
// target outright. Feature 033 found that its whole commonTest suite had NEVER compiled for iOS for
// exactly this reason — and this file reproduced it on the first try. Use a dash.

/**
 * 034 — the account centre's decisions, asserted where they are DECIDED rather than where they are
 * drawn. Compose UI is not unit-testable on the JVM host here, so each test pins the rule the screen
 * reads, which is the part a refactor can silently invert.
 */
class AccountCentreTest {

    private fun customer(
        hasPassword: Boolean = false,
        phone: String? = null,
    ) = Customer(
        id = "c-1",
        email = "shopper@example.com",
        name = CustomerName("Janith", "Madarasinghe"),
        phone = phone,
        standing = CustomerStanding.ACTIVE,
        hasPassword = hasPassword,
        passwordSetAtIso = null,
        createdAtIso = "2026-07-14T00:00:00Z",
    )

    // ── Security is composed from the credentials actually held (FR-025/FR-026, SC-006) ────────

    /**
     * ⚠ A shopper with no password must be offered SET and never CHANGE, and vice versa — never both.
     * Effy's customer pool has three credential routes, so a fixed row list is wrong for a large
     * share of customers. This is the presentation half of the defect 012 found in Cognito itself.
     */
    @Test
    fun `a passwordless account is offered SET and never CHANGE`() {
        assertEquals(PasswordJourney.SET, customer(hasPassword = false).passwordJourney)
    }

    @Test
    fun `an account with a password is offered CHANGE and never SET`() {
        assertEquals(PasswordJourney.CHANGE, customer(hasPassword = true).passwordJourney)
    }

    /** The journey is derived ONLY from the record — never from how the shopper signed in. */
    @Test
    fun `the journey is derived from the record - so a Google shopper can still hold a password`() {
        val googleShopperWithPassword = customer(hasPassword = true)
        assertEquals(PasswordJourney.CHANGE, googleShopperWithPassword.passwordJourney)
    }

    // ── Phone (FR-060/FR-060a) ─────────────────────────────────────────────────────────────────

    @Test
    fun `a phone is optional and absent by default`() {
        assertNull(customer().phone)
    }

    /**
     * ⚠ There is deliberately NO verified flag on the domain model. A field whose only honest value
     * is `false` eventually gets rendered as a badge by someone, and a shopper would reasonably rely
     * on it. If phone verification is ever built it arrives WITH its challenge flow.
     */
    @Test
    fun `the customer model carries no phone-verified concept at all`() {
        val fields = customer(phone = "0400 000 000").toString()
        assertFalse(fields.contains("phoneVerified", ignoreCase = true))
        assertFalse(fields.contains("verified", ignoreCase = true))
    }

    // ── Blockers (FR-042) ──────────────────────────────────────────────────────────────────────

    private fun blocker(kind: ClosureBlockerKind) = ClosureBlocker(
        kind = kind,
        reference = "EFY-HVX2AE",
        orderId = "o-1",
        clearsAtIso = "2026-08-10T00:00:00Z",
        resolvableByShopper = kind == ClosureBlockerKind.ORDER_AWAITING_PAYMENT,
    )

    /**
     * ⚠ Every blocker must say WHEN IT CLEARS. This requirement has been wrong twice — first blocking
     * forever on any unfulfilled order, then bounding it at 30 days, which on a weekly-re-buy grocery
     * platform still meant the most active shoppers could never delete.
     */
    @Test
    fun `every blocker states when it clears and names the order`() {
        ClosureBlockerKind.entries.forEach { kind ->
            val b = blocker(kind)
            assertTrue(b.clearsAtIso.isNotBlank(), "a blocker must state when it ends")
            assertTrue(b.sentence.contains(b.reference), "a blocker must name the order")
            assertTrue(b.sentence.isNotBlank())
        }
    }

    /** ⚠ SC-009 — the sentences never offer an alternative to deleting. */
    @Test
    fun `blocker copy never says deactivate - disable - freeze or pause`() {
        ClosureBlockerKind.entries.forEach { kind ->
            val s = blocker(kind).sentence.lowercase()
            listOf("deactivate", "disable", "freeze", "pause").forEach {
                assertFalse(s.contains(it), "blocker copy must not offer to $it an account")
            }
        }
    }

    @Test
    fun `an awaiting-payment order is shopper-resolvable and one in transit is not`() {
        assertTrue(blocker(ClosureBlockerKind.ORDER_AWAITING_PAYMENT).resolvableByShopper)
        assertFalse(blocker(ClosureBlockerKind.ORDER_IN_TRANSIT).resolvableByShopper)
    }

    @Test
    fun `closure may proceed only with no blockers and no live request`() {
        val clean = ClosurePreview(
            blockers = emptyList(),
            retained = listOf(RetainedCategory("Orders", "Tax records")),
            eraseAfterIfRequestedNowIso = "2026-09-02T00:00:00Z",
            activeRequest = null,
        )
        assertTrue(clean.canProceed)
        assertFalse(clean.copy(blockers = listOf(blocker(ClosureBlockerKind.ORDER_IN_TRANSIT))).canProceed)
    }

    // ── Guest data deletion (FR-046) ───────────────────────────────────────────────────────────

    /**
     * ⚠ Apple's FAQ names guest accounts explicitly, and Effy is guest-first: a guest's saved list
     * survives a restart, so "there is no account" is not an answer.
     */
    @Test
    fun `clearing guest data removes the saved list - the cart mirror and the queue`() {
        val prefs = InMemoryDevicePreferences()
        prefs.putString(PreferenceKeys.SAVED_GUEST, "{...}")
        prefs.putString(PreferenceKeys.CART_MIRROR, "{...}")
        prefs.putString(PreferenceKeys.CART_QUEUE, "[...]")

        prefs.clearGuestData()

        assertNull(prefs.getString(PreferenceKeys.SAVED_GUEST))
        assertNull(prefs.getString(PreferenceKeys.CART_MIRROR))
        assertNull(prefs.getString(PreferenceKeys.CART_QUEUE))
    }

    /**
     * The appearance preference is a DEVICE SETTING, not personal data. Resetting someone's theme
     * because they cleared their shopping data would be a surprise, not a courtesy.
     */
    @Test
    fun `clearing guest data leaves the appearance preference alone`() {
        val prefs = InMemoryDevicePreferences()
        prefs.putString(PreferenceKeys.APPEARANCE_MODE, "dark")
        prefs.putString(PreferenceKeys.SAVED_GUEST, "{...}")

        prefs.clearGuestData()

        assertEquals("dark", prefs.getString(PreferenceKeys.APPEARANCE_MODE))
        assertNull(prefs.getString(PreferenceKeys.SAVED_GUEST))
    }

    /**
     * ⚠ SIGNING OUT MUST LEAVE NOTHING BEHIND, and the offline cart QUEUE is the part that was missed.
     *
     * The stores' own `reset()` writes an empty envelope back, which is functionally clear — but the
     * queue was covered by neither reset, so a change made just before signing out could still be
     * drained afterwards, on a shared device, into the next person's session.
     */
    @Test
    fun `everything this device holds is clearable in one call`() {
        val prefs = InMemoryDevicePreferences()
        prefs.putString(PreferenceKeys.SAVED_GUEST, "{...}")
        prefs.putString(PreferenceKeys.CART_MIRROR, "{...}")
        prefs.putString(PreferenceKeys.CART_QUEUE, "[{...}]")
        assertTrue(prefs.hasDeviceShoppingData())

        prefs.clearGuestData()

        assertFalse(
            prefs.hasDeviceShoppingData(),
            "nothing shopping-related may survive a sign-out",
        )
    }

    /**
     * ⚠ The "clear data on this device" control is shown ONLY when this reports true. Signing out
     * already clears everything, so offering the button to a just-signed-out shopper implied the app
     * had not tidied up after them — the opposite of what happened.
     */
    @Test
    fun `a device with nothing on it reports nothing to clear`() {
        val prefs = InMemoryDevicePreferences()
        assertFalse(prefs.hasDeviceShoppingData())

        prefs.putString(PreferenceKeys.APPEARANCE_MODE, "dark")
        assertFalse(
            prefs.hasDeviceShoppingData(),
            "an appearance preference is a device setting, not shopping data",
        )
    }

    @Test
    fun `remove actually removes rather than blanking`() {
        val prefs = InMemoryDevicePreferences()
        prefs.putString("k", "v")
        prefs.remove("k")
        assertNull(prefs.getString("k"))
    }

    // ── Retained-data disclosure (FR-045) ──────────────────────────────────────────────────────

    /** Every retained category must carry its REASON — SC-010 checks the claims, so they must exist. */
    @Test
    fun `a retained category always carries a reason`() {
        val c = RetainedCategory("Completed orders", "Required for tax and accounting records.")
        assertNotNull(c.reason)
        assertTrue(c.reason.isNotBlank())
    }
}
