package com.effyshopping.driver.mobile.features.today

import com.effyshopping.driver.mobile.contract.TodayDTO
import com.effyshopping.driver.mobile.core.http.effyJson
import com.effyshopping.driver.mobile.core.offline.WriteOutcome
import com.effyshopping.driver.mobile.features.delivery.domain.ParcelsToReturn
import com.effyshopping.driver.mobile.features.driver.domain.Driver
import com.effyshopping.driver.mobile.features.driver.domain.DriverRepository
import com.effyshopping.driver.mobile.features.driver.domain.DutyStatus
import com.effyshopping.driver.mobile.features.driver.domain.SetDuty
import com.effyshopping.driver.mobile.features.driver.domain.Vehicle
import com.effyshopping.driver.mobile.features.today.domain.GetToday
import com.effyshopping.driver.mobile.features.today.domain.Phase
import com.effyshopping.driver.mobile.features.today.domain.Today
import com.effyshopping.driver.mobile.features.today.domain.TodayRepository
import com.effyshopping.driver.mobile.features.today.presentation.TodayViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** 088 — the "Return to hub" step reaches the app as a field, and Today acts on it. */
class ParcelsToReturnTest {
    @BeforeTest fun setup() { Dispatchers.setMain(Dispatchers.Unconfined) }

    private val base = """{"phase":"delivery","activeRunId":"r1","active":null,"upNext":[],
        "remainingCount":0,"opening":null,"deadlineAt":null,"dueLabel":null,"upcoming":[]"""

    @Test fun today_decodes_nothing_to_return_and_parcels_to_return() {
        assertNull(effyJson.decodeFromString(TodayDTO.serializer(), "$base,\"toReturn\":null}").toReturn)
        val with = effyJson.decodeFromString(
            TodayDTO.serializer(),
            """$base,"toReturn":{"runId":"r1","count":2,"orders":["EFY-1","EFY-2"],"parcels":[]}}""",
        )
        assertEquals(2L, with.toReturn?.count)
        assertEquals(listOf("EFY-1", "EFY-2"), with.toReturn?.orders)
    }

    private class FakeToday(var today: Today) : TodayRepository {
        override suspend fun today(): Today = today
    }

    private object NoDrivers : DriverRepository {
        val ada = Driver("d1", "Ada", "ada@effyshopping.com", null, null, Vehicle(null, null), DutyStatus.ON_DUTY)
        override suspend fun me(): Driver = ada
        override suspend fun setDuty(onDuty: Boolean, changeId: String): Driver = ada
    }

    @Test fun returning_clears_the_step_and_rereads() = runTest {
        val pending = Today(Phase.DELIVERY, "r1", null, emptyList(), 0, toReturn = ParcelsToReturn("r1", 1, listOf("EFY-1")))
        val repo = FakeToday(pending)
        val sent = mutableListOf<String>()
        val vm = TodayViewModel(
            initialDuty = DutyStatus.ON_DUTY,
            getToday = GetToday(repo),
            setDuty = SetDuty(NoDrivers),
            newChangeId = { "cid" },
            returnToHub = { runId, changeId ->
                sent += "$runId/$changeId"
                repo.today = pending.copy(toReturn = null)
                WriteOutcome.SENT
            },
        )
        assertEquals(1, vm.state.value.today?.toReturn?.count)
        vm.returnParcels()
        assertNull(vm.state.value.today?.toReturn)
        assertEquals(listOf("r1/cid"), sent)
    }
}
