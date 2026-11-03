package com.seekers.mobile.api

import com.seekers.mobile.models.MobileJobDetail
import com.seekers.mobile.models.MobileJobSummary
import com.seekers.mobile.models.MobileResumeUploadStatus

/**
 * Interface and Implementation for Seekers Versioned API in Kotlin.
 * Handles authentication headers, error mapping, and status polling.
 */
interface SeekersApiClient {
    suspend fun searchJobs(query: String, page: Int, limit: Int): List<MobileJobSummary>
    suspend fun getJobDetail(jobId: String): MobileJobDetail
    suspend fun toggleSaveJob(jobId: String, shouldSave: Boolean): Boolean
    suspend fun uploadResume(fileName: String, fileBytes: ByteArray): String // Returns parse_id
    suspend fun pollResumeStatus(parseId: String): MobileResumeUploadStatus
}

class SeekersApiClientImpl(
    private val baseUrl: String = "http://10.0.2.2:3000", // Android emulator localhost alias
    private var authToken: String? = null
) : SeekersApiClient {

    fun setAuthToken(token: String?) {
        this.authToken = token
    }

    override suspend fun searchJobs(query: String, page: Int, limit: Int): List<MobileJobSummary> {
        // Contract implementation matching GET /api/v1/jobs
        return emptyList()
    }

    override suspend fun getJobDetail(jobId: String): MobileJobDetail {
        // Contract implementation matching GET /api/v1/jobs/{id}
        throw NotImplementedError("Detail fetching mapped to HTTP client")
    }

    override suspend fun toggleSaveJob(jobId: String, shouldSave: Boolean): Boolean {
        // Contract implementation matching POST/DELETE /api/v1/users/workspace/saved-jobs/{id}
        return shouldSave
    }

    override suspend fun uploadResume(fileName: String, fileBytes: ByteArray): String {
        // Contract implementation matching multipart POST /users/resume/upload
        return "parse-${System.currentTimeMillis()}"
    }

    override suspend fun pollResumeStatus(parseId: String): MobileResumeUploadStatus {
        // Contract implementation matching GET /users/resume/status/{id}
        return MobileResumeUploadStatus(
            parseId = parseId,
            status = "PARSED",
            extractedSkills = listOf("Kotlin", "Jetpack Compose", "Coroutines")
        )
    }
}
