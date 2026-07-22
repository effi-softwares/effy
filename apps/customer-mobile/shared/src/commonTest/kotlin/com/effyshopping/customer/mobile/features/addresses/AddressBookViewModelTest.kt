package com.effyshopping.customer.mobile.features.addresses

import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.features.addresses.domain.AddAddress
import com.effyshopping.customer.mobile.features.addresses.domain.AddressDraft
import com.effyshopping.customer.mobile.features.addresses.domain.AddressRepository
import com.effyshopping.customer.mobile.features.addresses.domain.DeleteAddress
import com.effyshopping.customer.mobile.features.addresses.domain.ListAddresses
import com.effyshopping.customer.mobile.features.addresses.domain.SavedAddress
import com.effyshopping.customer.mobile.features.addresses.domain.SetDefault
import com.effyshopping.customer.mobile.features.addresses.domain.UpdateAddress
import com.effyshopping.customer.mobile.features.addresses.presentation.AddressBookViewModel
import com.effyshopping.customer.mobile.features.addresses.presentation.AddressForm
import com.effyshopping.customer.mobile.features.addresses.presentation.LabelChip
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

// ── Hand-written fake (no mocking lib) — emulates the 019 backend semantics (auto-default first,
//    exactly-one-default set, delete-default guard). ──────────────────────────────────────────────────

private class FakeAddressRepository(seed: List<SavedAddress> = emptyList()) : AddressRepository {
    val store = seed.toMutableList()
    var createCalls = 0
    var updateCalls = 0
    private var seq = seed.size

    override suspend fun list(): List<SavedAddress> = store.toList()

    override suspend fun create(draft: AddressDraft): SavedAddress {
        createCalls++
        val first = store.isEmpty() // the backend auto-defaults the customer's first address (FR-010)
        val created = draft.toSaved("addr-${++seq}", isDefault = first)
        store.add(created)
        return created
    }

    override suspend fun update(id: String, draft: AddressDraft): SavedAddress {
        updateCalls++
        val idx = store.indexOfFirst { it.id == id }
        val existing = store[idx]
        val updated = draft.toSaved(id, isDefault = existing.isDefault) // default unchanged on edit
        store[idx] = updated
        return updated
    }

    override suspend fun setDefault(id: String): SavedAddress {
        for (i in store.indices) store[i] = store[i].copy(isDefault = store[i].id == id)
        return store.first { it.id == id }
    }

    override suspend fun delete(id: String) {
        val target = store.first { it.id == id }
        if (target.isDefault && store.size > 1) throw AppException(AppError.DefaultDeleteBlocked)
        store.removeAll { it.id == id }
    }

    private fun AddressDraft.toSaved(id: String, isDefault: Boolean) = SavedAddress(
        id = id, label = label, recipientName = recipientName, phone = phone,
        line1 = line1, line2 = line2, city = city, region = region,
        postalCode = postalCode, country = "AU", isDefault = isDefault,
    )
}

private fun addr(id: String, isDefault: Boolean, label: String? = null) = SavedAddress(
    id = id, label = label, recipientName = "Recipient $id", phone = null,
    line1 = "$id Main St", line2 = null, city = "Melbourne", region = "VIC",
    postalCode = "3000", country = "AU", isDefault = isDefault,
)

private val VALID_FORM = AddressForm(
    labelChip = LabelChip.HOME, recipientName = "Jo Blogs",
    line1 = "1 Test St", city = "Melbourne", postalCode = "3000",
)

@OptIn(ExperimentalCoroutinesApi::class)
class AddressBookViewModelTest {

    private fun TestScope.vmFor(repo: FakeAddressRepository): AddressBookViewModel =
        AddressBookViewModel(
            ListAddresses(repo), AddAddress(repo), UpdateAddress(repo),
            SetDefault(repo), DeleteAddress(repo), testScope = this,
        )

    // ── US1: list & empty ────────────────────────────────────────────────────────────────────────────

    @Test
    fun listsAddressesWithTheDefaultMarked() = runTest {
        val repo = FakeAddressRepository(listOf(addr("a", isDefault = true), addr("b", isDefault = false)))
        val vm = vmFor(repo)
        advanceUntilIdle()

        val s = vm.state.value
        assertFalse(s.loading)
        assertEquals(2, s.addresses.size)
        assertEquals(1, s.addresses.count { it.isDefault })
        assertEquals("a", s.addresses.first { it.isDefault }.id)
    }

    @Test
    fun emptyBookShowsNoAddresses() = runTest {
        val vm = vmFor(FakeAddressRepository())
        advanceUntilIdle()
        assertTrue(vm.state.value.addresses.isEmpty())
        assertFalse(vm.state.value.loading)
    }

    // ── US2: add ─────────────────────────────────────────────────────────────────────────────────────

    @Test
    fun addingAnAddressAppearsInTheList() = runTest {
        val repo = FakeAddressRepository(listOf(addr("a", isDefault = true)))
        val vm = vmFor(repo)
        advanceUntilIdle()

        vm.openAdd()
        vm.onFormChange(VALID_FORM.copy(recipientName = "New Person"))
        vm.submit()
        advanceUntilIdle()

        assertNull(vm.state.value.sheet) // sheet closed on success
        assertEquals(2, vm.state.value.addresses.size)
        assertTrue(vm.state.value.addresses.any { it.recipientName == "New Person" })
    }

    @Test
    fun firstAddBecomesDefault() = runTest {
        val repo = FakeAddressRepository()
        val vm = vmFor(repo)
        advanceUntilIdle()

        vm.openAdd()
        vm.onFormChange(VALID_FORM)
        vm.submit()
        advanceUntilIdle()

        assertEquals(1, vm.state.value.addresses.size)
        assertTrue(vm.state.value.addresses.single().isDefault)
    }

    @Test
    fun invalidAddShowsFieldErrorsAndKeepsInput() = runTest {
        val repo = FakeAddressRepository()
        val vm = vmFor(repo)
        advanceUntilIdle()

        vm.openAdd()
        // Missing recipientName + postalCode; line2 typed and must be preserved.
        vm.onFormChange(AddressForm(line1 = "5 Kept St", line2 = "Unit 5", city = "Geelong"))
        vm.submit()
        advanceUntilIdle()

        val sheet = assertNotNull(vm.state.value.sheet) // still open
        assertTrue(sheet.fieldErrors.containsKey("recipientName"))
        assertTrue(sheet.fieldErrors.containsKey("postalCode"))
        assertEquals("Unit 5", sheet.form.line2) // input preserved (FR-009)
        assertEquals(0, repo.createCalls) // nothing saved
        assertEquals(0, repo.store.size)
    }

    @Test
    fun dismissingTheSheetSavesNothing() = runTest {
        val repo = FakeAddressRepository()
        val vm = vmFor(repo)
        advanceUntilIdle()

        vm.openAdd()
        vm.onFormChange(VALID_FORM)
        vm.dismissSheet()
        advanceUntilIdle()

        assertNull(vm.state.value.sheet)
        assertEquals(0, repo.createCalls) // SC-009: nothing persisted
        assertTrue(vm.state.value.addresses.isEmpty())
    }

    // ── US3: set-default ─────────────────────────────────────────────────────────────────────────────

    @Test
    fun settingDefaultLeavesExactlyOneDefault() = runTest {
        val repo = FakeAddressRepository(listOf(addr("a", isDefault = true), addr("b", isDefault = false)))
        val vm = vmFor(repo)
        advanceUntilIdle()

        vm.makeDefault("b")
        advanceUntilIdle()

        val s = vm.state.value
        assertEquals(1, s.addresses.count { it.isDefault })
        assertTrue(s.addresses.first { it.id == "b" }.isDefault)
        assertFalse(s.addresses.first { it.id == "a" }.isDefault)
    }

    @Test
    fun settingDefaultOnTheAlreadyDefaultIsANoOp() = runTest {
        val repo = FakeAddressRepository(listOf(addr("a", isDefault = true), addr("b", isDefault = false)))
        val vm = vmFor(repo)
        advanceUntilIdle()

        vm.makeDefault("a") // already default (FR-014)
        advanceUntilIdle()

        val s = vm.state.value
        assertEquals(1, s.addresses.count { it.isDefault })
        assertTrue(s.addresses.first { it.id == "a" }.isDefault)
        assertNull(s.error)
    }

    // ── US4: delete ──────────────────────────────────────────────────────────────────────────────────

    @Test
    fun confirmingDeleteRemovesTheRow() = runTest {
        val repo = FakeAddressRepository(listOf(addr("a", isDefault = true), addr("b", isDefault = false)))
        val vm = vmFor(repo)
        advanceUntilIdle()

        vm.askDelete("b")
        assertEquals("b", vm.state.value.pendingDeleteId)
        vm.confirmDelete()
        advanceUntilIdle()

        assertNull(vm.state.value.pendingDeleteId)
        assertEquals(1, vm.state.value.addresses.size)
        assertFalse(vm.state.value.addresses.any { it.id == "b" })
    }

    @Test
    fun deletingTheDefaultWithOthersIsBlockedWithReassignPrompt() = runTest {
        val repo = FakeAddressRepository(listOf(addr("a", isDefault = true), addr("b", isDefault = false)))
        val vm = vmFor(repo)
        advanceUntilIdle()

        vm.askDelete("a") // the default, with others → 409 (FR-016a)
        vm.confirmDelete()
        advanceUntilIdle()

        assertTrue(vm.state.value.reassignPrompt)
        assertEquals(2, vm.state.value.addresses.size) // nothing removed
        assertNull(vm.state.value.error) // a prompt, not an error
    }

    @Test
    fun deletingTheSoleAddressIsAllowedAndReturnsToEmpty() = runTest {
        val repo = FakeAddressRepository(listOf(addr("a", isDefault = true)))
        val vm = vmFor(repo)
        advanceUntilIdle()

        vm.askDelete("a")
        vm.confirmDelete()
        advanceUntilIdle()

        assertTrue(vm.state.value.addresses.isEmpty())
        assertFalse(vm.state.value.reassignPrompt)
    }

    // ── US5: edit ────────────────────────────────────────────────────────────────────────────────────

    @Test
    fun rowBodyOpensEditButPerRowControlsDoNot() = runTest {
        val repo = FakeAddressRepository(listOf(addr("a", isDefault = true), addr("b", isDefault = false)))
        val vm = vmFor(repo)
        advanceUntilIdle()

        // The set-default / delete controls must NOT open the editor (FR-017a).
        vm.makeDefault("b"); advanceUntilIdle()
        assertNull(vm.state.value.sheet)
        vm.askDelete("b")
        assertNull(vm.state.value.sheet)
        vm.cancelDelete()

        // The row body opens the pre-filled editor.
        vm.openEdit("b")
        val sheet = assertNotNull(vm.state.value.sheet)
        assertEquals("b", sheet.editingId)
        assertEquals("Recipient b", sheet.form.recipientName)
    }

    @Test
    fun editingPersistsAndLeavesDefaultUnchanged() = runTest {
        val repo = FakeAddressRepository(listOf(addr("a", isDefault = true), addr("b", isDefault = false)))
        val vm = vmFor(repo)
        advanceUntilIdle()

        vm.openEdit("b")
        vm.onFormChange(vm.state.value.sheet!!.form.copy(city = "Ballarat"))
        vm.submit()
        advanceUntilIdle()

        assertNull(vm.state.value.sheet)
        val b = vm.state.value.addresses.first { it.id == "b" }
        assertEquals("Ballarat", b.city)
        assertFalse(b.isDefault) // default unaffected
        assertTrue(vm.state.value.addresses.first { it.id == "a" }.isDefault)
        assertEquals(1, repo.updateCalls)
    }

    @Test
    fun labelChipRoundTripsHomeWorkAndOther() = runTest {
        val repo = FakeAddressRepository(
            listOf(
                addr("home", isDefault = true, label = "Home"),
                addr("work", isDefault = false, label = "Work"),
                addr("other", isDefault = false, label = "Beach house"),
                addr("none", isDefault = false, label = null),
            ),
        )
        val vm = vmFor(repo)
        advanceUntilIdle()

        vm.openEdit("home"); assertEquals(LabelChip.HOME, vm.state.value.sheet!!.form.labelChip); vm.dismissSheet()
        vm.openEdit("work"); assertEquals(LabelChip.WORK, vm.state.value.sheet!!.form.labelChip); vm.dismissSheet()
        vm.openEdit("other")
        val otherSheet = vm.state.value.sheet!!.form
        assertEquals(LabelChip.OTHER, otherSheet.labelChip)
        assertEquals("Beach house", otherSheet.otherLabel)
        vm.dismissSheet()
        vm.openEdit("none"); assertEquals(LabelChip.NONE, vm.state.value.sheet!!.form.labelChip)
    }

    @Test
    fun invalidEditKeepsInputAndDoesNotPersist() = runTest {
        val repo = FakeAddressRepository(listOf(addr("a", isDefault = true)))
        val vm = vmFor(repo)
        advanceUntilIdle()

        vm.openEdit("a")
        vm.onFormChange(vm.state.value.sheet!!.form.copy(city = "", recipientName = "Kept Name"))
        vm.submit()
        advanceUntilIdle()

        val sheet = assertNotNull(vm.state.value.sheet) // still open
        assertTrue(sheet.fieldErrors.containsKey("city"))
        assertEquals("Kept Name", sheet.form.recipientName) // input preserved
        assertEquals(0, repo.updateCalls)
    }
}
