package com.seekers.mobile.models

/**
 * Data models for Seekers Android Jetpack Compose Prototype.
 * Strictly aligned with OpenAPI 3.1 specification (contracts/openapi/seekers-api-v1.yaml).
 */

data class Salary(
    val currency: String = "BDT",
    val period: String = "MONTHLY",
    val min: Int? = null,
    val max: Int? = null
)

data class MobileJobSummary(
    val id: String, // UUID
    val title: String,
    val company: String,
    val location: String,
    val remote_eligibility: String, // "FULLY_REMOTE", "HYBRID", "ONSITE_ONLY", "FLEXIBLE"
    val job_type: String = "FULL_TIME",
    val seniority: String? = null,
    val salary: Salary? = null,
    val skills: List<String> = emptyList(),
    val source: String = "Direct",
    val published_at: String, // ISO 8601
    val is_saved: Boolean = false
)

data class MobileJobDetail(
    val id: String,
    val title: String,
    val company: String,
    val location: String,
    val remote_eligibility: String,
    val job_type: String = "FULL_TIME",
    val seniority: String? = null,
    val salary: Salary? = null,
    val skills: List<String> = emptyList(),
    val source: String = "Direct",
    val published_at: String,
    val description: String,
    val canonical_url: String,
    val status: String = "ACTIVE",
    val outbound_url: String,
    val is_saved: Boolean = false
)

data class JobListResponse(
    val items: List<MobileJobSummary>,
    val limit: Int,
    val next_cursor: String?,
    val prev_cursor: String?,
    val total_count: Int
)

data class MobileResumeUploadStatus(
    val parse_id: String,
    val status: String, // "QUEUED", "PROCESSING", "PARSED", "FAILED"
    val extracted_skills: List<String> = emptyList(),
    val error_code: String? = null,
    val processing_time_ms: Long? = null
)

sealed class ScreenState {
    object JobList : ScreenState()
    data class JobDetail(val jobId: String) : ScreenState()
    object ResumeUpload : ScreenState()
}

data class MobileUiState(
    val currentScreen: ScreenState = ScreenState.JobList,
    val jobs: List<MobileJobSummary> = emptyList(),
    val selectedJob: MobileJobDetail? = null,
    val savedJobIds: Set<String> = emptySet(),
    val searchQuery: String = "",
    val isFilterRemote: Boolean = false,
    val nextCursor: String? = null,
    val resumeStatus: MobileResumeUploadStatus? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)
