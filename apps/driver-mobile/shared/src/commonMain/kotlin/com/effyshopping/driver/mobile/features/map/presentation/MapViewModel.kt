package com.effyshopping.driver.mobile.features.map.presentation

/** Which run the map is showing (060 US3, design screens `map-collection` / `map-delivery`). */
enum class MapMode { COLLECTION, SAME_DAY }

/**
 * One plotted stop.
 *
 * @param isHub the run's hub, rendered distinctly from an ordinary stop (FR-023d)
 */
data class MapStop(
    val id: String,
    val sequence: Int,
    val title: String,
    val subtitle: String,
    val isHub: Boolean = false,
)

data class MapUiState(
    val mode: MapMode = MapMode.COLLECTION,
    val stops: List<MapStop> = emptyList(),
    val isLoading: Boolean = false,
    val message: String? = null,
)
