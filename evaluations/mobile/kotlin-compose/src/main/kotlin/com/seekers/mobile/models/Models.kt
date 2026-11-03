package com.seekers.mobile.models

/**
 * Data models for Seekers Android Jetpack Compose Prototype.
 * Matches shared contract definitions in evaluations/mobile/shared-contracts.
 */

data class MobileJobSummary(
    val id: String,
    val title: String,
    val company: String,
    val location: String,
    val remoteType: String, // "REMOTE", "HYBRID", "ONSITE"
    val salaryMin: Int? = null,
    val salaryMax: Int? = null,
    val currency: String? = "BDT",
    val postedAt: String,
    val sourceUrl: String,
    val isSaved: Boolean = false
)

data class MobileJobDetail(
    val id: String,
    val title: String,
    val company: String,
    val location: String,
    val remoteType: String,
    val salaryMin: Int? = null,
    val salaryMax: Int? = null,
    val currency: String? = "BDT",
    val postedAt: String,
    val sourceUrl: String,
    val outboundUrl: String,
    val description: String,
    val requirements: List<String>,
    val skills: List<String>,
    val sourceName: String,
    val isSaved: Boolean = false
)

data class MobileResumeUploadStatus(
    val parseId: String,
    val status: String, // "QUEUED", "PROCESSING", "PARSED", "FAILED"
    val extractedSkills: List<String> = emptyList(),
    val errorMessage: String? = null
)

sealed class ScreenState {
    object JobList : ScreenState()
    data class JobDetail(val jobId: String) : ScreenState()
    object ResumeUpload : ScreenState()
    object SavedJobs : ScreenState()
}

data class MobileUiState(
    val currentScreen: ScreenState = ScreenState.JobList,
    val jobs: List<MobileJobSummary> = emptyList(),
    val selectedJob: MobileJobDetail? = null,
    val savedJobIds: Set<String> = emptySet(),
    val searchQuery: String = "",
    val isFilterRemote: Boolean = false,
    val resumeStatus: MobileResumeUploadStatus? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)
