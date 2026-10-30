package com.effyshopping.driver.mobile.core.platform

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow

/**
 * Whether the phone has a connection, as the platform reports it (backlog C6). Used only to send
 * what is waiting the moment the connection returns - never to decide that a request will fail;
 * the request itself says that.
 */
interface Connectivity {
    /** Emits the current state on collection, then each change. */
    val online: Flow<Boolean>
}

object NoConnectivity : Connectivity {
    override val online: Flow<Boolean> = emptyFlow()
}
