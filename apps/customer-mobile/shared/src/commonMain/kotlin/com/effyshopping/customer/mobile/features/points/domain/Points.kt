package com.effyshopping.customer.mobile.features.points.domain

/**
 * Effy points (074 US1) — store credit Effy gives and the customer spends.
 *
 * ⚠ NOTHING HERE IS STORED ON THE DEVICE. The balance is what the platform says it is right now; a
 * cached copy would show points that have since expired or been spent at checkout on the web.
 */
data class PointsBalance(
    val points: Long,
    /** A 2-dp decimal string, no currency symbol. */
    val valueAmount: String,
    val nextExpiry: PointsExpiry?,
)

data class PointsExpiry(val points: Long, /** yyyy-mm-dd, the last day they can be used. */ val date: String)

/** One line of history, as the customer sees it. The server decides the words. */
data class PointsLine(
    val id: String,
    /** Signed: credits positive, debits negative. */
    val points: Long,
    val words: String,
    /** Credits only. */
    val usableUntil: String?,
    val at: String,
)

data class PointsHistoryPage(val lines: List<PointsLine>, val nextCursor: String?)

interface PointsRepository {
    /** ⚠ A failure THROWS — "you have no points" and "we could not ask" are different facts. */
    suspend fun balance(): PointsBalance
    suspend fun history(cursor: String?): PointsHistoryPage
}

/** GetPoints — the balance and the first page of history, read together on open. */
class GetPoints(private val repo: PointsRepository) {
    suspend operator fun invoke(): Pair<PointsBalance, PointsHistoryPage> = repo.balance() to repo.history(null)
}

/** GetOlderPoints — the next page of history. */
class GetOlderPoints(private val repo: PointsRepository) {
    suspend operator fun invoke(cursor: String): PointsHistoryPage = repo.history(cursor)
}
