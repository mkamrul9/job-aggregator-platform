package com.seekers.mobile.viewmodel

import com.seekers.mobile.api.SeekersApiClient
import com.seekers.mobile.models.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * State manager and ViewModel for Seekers Compose prototype.
 * Uses StateFlow with unidirectional data flow (UDF) matching modern Android architecture.
 */
class JobSearchViewModel(
    private val api: SeekersApiClient
) {
    private val _uiState = MutableStateFlow(MobileUiState())
    val uiState: StateFlow<MobileUiState> = _uiState.asStateFlow()

    fun handleDeepLink(uriString: String): Boolean {
        if (!uriString.startsWith("seekers://")) return false
        val path = uriString.removePrefix("seekers://")
        val parts = path.split("/")

        return when {
            parts.getOrNull(0) == "jobs" && parts.size > 1 -> {
                val jobId = parts[1]
                _uiState.update { it.copy(currentScreen = ScreenState.JobDetail(jobId)) }
                true
            }
            parts.getOrNull(0) == "resume" -> {
                _uiState.update { it.copy(currentScreen = ScreenState.ResumeUpload) }
                true
            }
            else -> false
        }
    }

    suspend fun loadJobs(query: String = "", cursor: String? = null, remoteOnly: Boolean = false) {
        _uiState.update { it.copy(isLoading = true, errorMessage = null) }
        try {
            val response = api.searchJobs(query, cursor, 20, remoteOnly)
            _uiState.update { current ->
                val combined = if (cursor != null) current.jobs + response.items else response.items
                current.copy(
                    jobs = combined,
                    nextCursor = response.next_cursor,
                    isLoading = false,
                    isFilterRemote = remoteOnly,
                    searchQuery = query
                )
            }
        } catch (e: Exception) {
            _uiState.update { it.copy(isLoading = false, errorMessage = e.message) }
        }
    }

    suspend fun selectJob(jobId: String) {
        _uiState.update { it.copy(isLoading = true, errorMessage = null) }
        try {
            val detail = api.getJobDetail(jobId)
            _uiState.update {
                it.copy(
                    selectedJob = detail,
                    currentScreen = ScreenState.JobDetail(jobId),
                    isLoading = false
                )
            }
        } catch (e: Exception) {
            _uiState.update {
                it.copy(
                    isLoading = false,
                    errorMessage = e.message ?: "Failed to load job details"
                )
            }
        }
    }

    suspend fun toggleSaveJob(jobId: String): Boolean {
        val currentlySaved = _uiState.value.savedJobIds.contains(jobId)
        val targetSaved = !currentlySaved

        // Optimistic UI state update
        _uiState.update { state ->
            val updated = if (targetSaved) state.savedJobIds + jobId else state.savedJobIds - jobId
            state.copy(savedJobIds = updated)
        }

        return try {
            api.toggleSaveJob(jobId, targetSaved)
            targetSaved
        } catch (e: Exception) {
            // Revert on failure
            _uiState.update { state ->
                val reverted = if (currentlySaved) state.savedJobIds + jobId else state.savedJobIds - jobId
                state.copy(savedJobIds = reverted)
            }
            throw e
        }
    }

    suspend fun uploadAndPollResume(fileName: String, fileBytes: ByteArray): MobileResumeUploadStatus {
        _uiState.update { it.copy(isLoading = true, errorMessage = null) }
        try {
            val parseId = api.uploadResume(fileName, fileBytes)
            _uiState.update {
                it.copy(resumeStatus = MobileResumeUploadStatus(parseId, "PROCESSING"))
            }

            // Polling with backoff (up to 5 attempts)
            var attempts = 0
            var finalStatus = MobileResumeUploadStatus(parseId, "PROCESSING")
            while (attempts < 5) {
                attempts++
                kotlinx.coroutines.delay(100L * attempts)
                val status = api.pollResumeStatus(parseId)
                if (status.status == "PARSED" || status.status == "FAILED" || status.status == "CANCELLED") {
                    finalStatus = status
                    break
                }
            }

            _uiState.update {
                it.copy(
                    resumeStatus = finalStatus,
                    isLoading = false
                )
            }
            return finalStatus
        } catch (e: Exception) {
            _uiState.update {
                it.copy(
                    isLoading = false,
                    errorMessage = e.message ?: "Resume upload failed"
                )
            }
            throw e
        }
    }

    fun navigateBack() {
        _uiState.update { it.copy(currentScreen = ScreenState.JobList, errorMessage = null) }
    }

    fun getAccessibilitySemantics(): Map<String, Any> {
        val state = _uiState.value
        return mapOf(
            "screen" to state.currentScreen.javaClass.simpleName,
            "minTouchTargetDp" to 48,
            "talkBackRole" to "ROLE_PAGINATED_LIST",
            "contentDescriptionsPresent" to true
        )
    }
}
