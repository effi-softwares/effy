package com.effyshopping.driver.mobile.core.http

import com.effyshopping.driver.mobile.contract.ProblemJSON
import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.presentation.userMessage
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

/** Backlog B2 - the proof, presign and fail routes answer 422 with a sentence for the driver. */
class HttpErrorsTest {
    private val note = "Tell us what happened, so someone can follow it up."

    @Test fun a_422_shows_the_servers_sentence() {
        val error = appErrorFor(422, ProblemJSON(status = 422.0, title = "Cannot record that", type = "validation_failed", detail = note))
        assertIs<AppError.Validation>(error)
        assertEquals(note, error.userMessage())
    }

    @Test fun a_422_with_no_body_still_reads_as_validation() {
        assertIs<AppError.Validation>(appErrorFor(422, null))
    }

    /** Out of turn: the server's sentence, never "pull to refresh". */
    @Test fun an_out_of_turn_refusal_says_what_to_do_first() {
        val error = appErrorFor(409, ProblemJSON(status = 409.0, title = "Not yet", type = "run_not_loaded", detail = "Load the van first."))
        assertIs<AppError.OutOfTurn>(error)
        assertEquals("Load the van first.", error.userMessage())
    }

    @Test fun any_other_409_is_still_a_conflict() {
        assertEquals(AppError.Conflict, appErrorFor(409, ProblemJSON(status = 409.0, title = "Changed", type = "stale")))
    }
}
