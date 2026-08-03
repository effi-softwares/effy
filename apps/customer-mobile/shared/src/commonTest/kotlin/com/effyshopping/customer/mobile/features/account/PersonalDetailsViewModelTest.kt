package com.effyshopping.customer.mobile.features.account

import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.features.account.domain.Customer
import com.effyshopping.customer.mobile.features.account.domain.CustomerName
import com.effyshopping.customer.mobile.features.account.domain.CustomerRepository
import com.effyshopping.customer.mobile.features.account.domain.CustomerStanding
import com.effyshopping.customer.mobile.features.account.domain.UpdateProfile
import com.effyshopping.customer.mobile.features.account.presentation.EditableDetail
import com.effyshopping.customer.mobile.core.session.SessionWriter
import com.effyshopping.customer.mobile.features.account.presentation.PersonalDetailsViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * 034 T024 / T030c — the personal-details ViewModel.
 *
 * ⚠ These pin the two behaviours a refactor is most likely to "tidy" away: that every field is sent
 * on every save, and that a FAILED save does not close the editor. Both are invisible in the UI until
 * someone loses work.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class PersonalDetailsViewModelTest {

    // ⚠ `save` runs on `viewModelScope`, which dispatches to Main. Without a test Main the coroutine
    // never runs and every assertion below reads state the ViewModel has not reached yet — the tests
    // would pass or fail for reasons unrelated to what they claim to check.
    @BeforeTest fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @AfterTest fun tearDown() = Dispatchers.resetMain()

    private val customer = Customer(
        id = "c-1",
        email = "shopper@example.com",
        name = CustomerName("Janith", "Madarasinghe"),
        phone = "0400 000 000",
        standing = CustomerStanding.ACTIVE,
        hasPassword = false,
        passwordSetAtIso = null,
        createdAtIso = "2026-07-14T00:00:00Z",
    )

    /** Three lines, because the ViewModel depends on the SEAM rather than on SessionManager. */
    private class FakeSession : SessionWriter {
        // ⚠ NOT named `authenticated` — a `var authenticated` generates a JVM `setAuthenticated`
        // setter that clashes with the interface method of the same signature.
        var lastAuthenticated: Customer? = null
        var wasBarred = false
        override fun setAuthenticated(customer: Customer) { lastAuthenticated = customer }
        override fun setBarred() { wasBarred = true }
    }

    private class FakeRepo(
        var fail: AppError? = null,
    ) : CustomerRepository {
        var lastGiven: String? = null
        var lastFamily: String? = null
        var lastPhone: String? = null
        var calls = 0

        override suspend fun me(seedPassword: Boolean): Customer = error("not used")

        override suspend fun updateProfile(given: String?, family: String?, phone: String?): Customer {
            calls++
            lastGiven = given; lastFamily = family; lastPhone = phone
            fail?.let { throw AppException(it) }
            return Customer(
                id = "c-1",
                email = "shopper@example.com",
                name = CustomerName(given, family),
                phone = phone,
                standing = CustomerStanding.ACTIVE,
                hasPassword = false,
                passwordSetAtIso = null,
                createdAtIso = "2026-07-14T00:00:00Z",
            )
        }

        override suspend fun requestPasswordChallenge(): String = error("not used")
        override suspend fun setPassword(code: String, newPassword: String): Customer = error("not used")
        override suspend fun changePassword(current: String, newPassword: String): Customer = error("not used")
        override suspend fun signOutEverywhere() = error("not used")
        override suspend fun confirmPasswordReset(email: String, code: String, newPassword: String) =
            error("not used")
    }

    /**
     * ⚠ EVERY FIELD TRAVELS ON EVERY SAVE. The backend's PATCH writes the columns it names, so
     * omitting the untouched ones would CLEAR them — editing a first name would silently wipe the
     * phone.
     */
    @Test
    fun `saving one field carries the others through unchanged`() {
        val repo = FakeRepo()
        val vm = PersonalDetailsViewModel(UpdateProfile(repo), FakeSession())

        vm.save(customer, EditableDetail.GIVEN, "Jan") {}

        assertEquals("Jan", repo.lastGiven)
        assertEquals("Madarasinghe", repo.lastFamily)
        assertEquals("0400 000 000", repo.lastPhone)
    }

    /** ⚠ `""` clears; a null would be dropped by `explicitNulls = false` and the clear would no-op. */
    @Test
    fun `clearing a phone sends an empty string rather than null`() {
        val repo = FakeRepo()
        val vm = PersonalDetailsViewModel(UpdateProfile(repo), FakeSession())

        vm.save(customer, EditableDetail.PHONE, "") {}

        assertEquals("", repo.lastPhone)
        assertNotNull(repo.lastPhone)
    }

    /**
     * ⚠ T030c — THE ONE THAT PROTECTS TYPED WORK.
     *
     * A failed save must NOT signal "done". An expired session is the tempting case to close on and
     * bounce to sign-in, which would discard what the shopper typed on the way there.
     */
    @Test
    fun `a failed save never reports success - so the editor stays open`() {
        val repo = FakeRepo(fail = AppError.Unauthenticated)
        val vm = PersonalDetailsViewModel(UpdateProfile(repo), FakeSession())
        var closed = false

        vm.save(customer, EditableDetail.GIVEN, "Jan") { closed = true }

        assertFalse(closed, "the editor must stay open so the typed value survives")
        assertNotNull(vm.state.value.error)
    }

    @Test
    fun `an expired session is explained rather than reported as a generic failure`() {
        val repo = FakeRepo(fail = AppError.Unauthenticated)
        val vm = PersonalDetailsViewModel(UpdateProfile(repo), FakeSession())

        vm.save(customer, EditableDetail.GIVEN, "Jan") {}

        assertTrue(vm.state.value.error!!.contains("session", ignoreCase = true))
    }

    @Test
    fun `a successful save reports success exactly once`() {
        val repo = FakeRepo()
        val vm = PersonalDetailsViewModel(UpdateProfile(repo), FakeSession())
        var closes = 0

        vm.save(customer, EditableDetail.FAMILY, "M") { closes++ }

        assertEquals(1, closes)
        assertEquals(1, repo.calls)
        assertNull(vm.state.value.error)
    }

    /**
     * ⚠ T024 — the split's whole point. `AccountViewModel` needed `clearTransient()` on every route
     * change because one class carried the errors of five screens. This one's error is its own.
     */
    @Test
    fun `clearing the error leaves no residue for the next edit`() {
        val repo = FakeRepo(fail = AppError.Network)
        val vm = PersonalDetailsViewModel(UpdateProfile(repo), FakeSession())

        vm.save(customer, EditableDetail.GIVEN, "Jan") {}
        assertNotNull(vm.state.value.error)

        vm.clearError()
        assertNull(vm.state.value.error)
    }
}
