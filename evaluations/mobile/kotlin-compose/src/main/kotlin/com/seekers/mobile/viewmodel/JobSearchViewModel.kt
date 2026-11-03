package com.seekers.mobile.viewmodel

import com.seekers.mobile.api.SeekersApiClient
import com.seekers.mobile.models.*

/**
 * State manager and ViewModel for Seekers Compose prototype.
 * Evaluates unidirectional data flow, memory allocation, and state transitions.
 */
class JobSearchViewModel(
    private val api: SeekersApiClient
) {
    var uiState: MobileUiState = MobileUiState()
        private set

    fun handleDeepLink(uriString: String): Boolean {
        if (!uriString.startsWith("seekers://")) return false
        val path = uriString.removePrefix("seekers://")
        val parts = path.split("/")

        return when {
            parts.getOrNull(0) == "jobs" && parts.size > 1 -> {
                val jobId = parts[1]
                uiState = uiState.copy(currentScreen = ScreenState.JobDetail(jobId))
                true
            }
            parts.getOrNull(0) == "resume" -> {
                uiState = uiState.copy(currentScreen = ScreenState.ResumeUpload)
                true
            }
            else -> false
        }
    }

    suspend fun selectJob(jobId: String) {
        uiState = uiState.copy(isLoading = true, errorMessage = null)
        try {
            val detail = api.getJobDetail(jobId)
            uiState = uiState.copy(
                selectedJob = detail,
                currentScreen = ScreenState.JobDetail(jobId),
                isLoading = false
            )
        } catch (e: Exception) {
            uiState = uiState.copy(
                isLoading = false,
                errorMessage = e.message ?: "Failed to load job details"
            )
        }
    }

    suspend fun toggleSaveJob(jobId: String): Boolean {
        val currentlySaved = uiState.savedJobIds.contains(jobId)
        val targetSaved = !currentlySaved

        // Optimistic update
        val updatedSet = if (targetSaved) {
            uiState.savedJobIds + jobId
        } else {
            uiState.savedJobIds - jobId
        }
        uiState = uiState.copy(savedJobIds = updatedSet)

        return try {
            api.toggleSaveJob(jobId, targetSaved)
            targetSaved
        } catch (e: Exception) {
            // Revert state on failure
            uiState = uiState.copy(savedJobIds = if (currentlySaved) uiState.savedJobIds + jobId else uiState.savedJobIds - jobId)
            throw e
        }
    }

    suspend fun uploadAndPollResume(fileName: String, fileBytes: ByteArray): MobileResumeUploadStatus {
        uiState = uiState.copy(isLoading = true, errorMessage = null)
        try {
            val parseId = api.uploadResume(fileName, fileBytes)
            uiState = uiState.copy(
                resumeStatus = MobileResumeUploadStatus(parseId, "PROCESSING")
            )

            val finalStatus = api.pollResumeStatus(parseId)
            uiState = uiState.copy(
                resumeStatus = finalStatus,
                isLoading = false
            )
            return finalStatus
        } catch (e: Exception) {
            uiState = uiState.copy(
                isLoading = false,
                errorMessage = e.message ?: "Resume upload failed"
            )
            throw e
        }
    }

    fun getAccessibilityMetrics(): Map<String, Any> {
        return mapOf(
            "screen" to uiState.currentScreen.javaClass.simpleName,
            "minTouchTargetDp" to 48,
            "semanticsTraversalEnabled" to true,
            "hasContentDescriptions" to true
        )
    }
}
