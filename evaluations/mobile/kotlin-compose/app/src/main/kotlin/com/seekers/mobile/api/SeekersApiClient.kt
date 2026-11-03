package com.seekers.mobile.api

import com.seekers.mobile.models.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * Interface and Implementation for Seekers Versioned API in Kotlin.
 * Strictly maps to OpenAPI endpoints:
 *   - GET /api/v1/jobs
 *   - GET /api/v1/jobs/{id}
 *   - POST/DELETE /api/v1/users/saved-jobs/{jobId}
 *   - POST /api/v1/users/resume/upload
 *   - GET /api/v1/users/resume/status/{id}
 */
interface SeekersApiClient {
    suspend fun searchJobs(query: String, cursor: String?, limit: Int, remoteOnly: Boolean): JobListResponse
    suspend fun getJobDetail(jobId: String): MobileJobDetail
    suspend fun toggleSaveJob(jobId: String, shouldSave: Boolean): Boolean
    suspend fun uploadResume(fileName: String, fileBytes: ByteArray): String // Returns parse_id
    suspend fun pollResumeStatus(parseId: String): MobileResumeUploadStatus
}

class SeekersApiClientImpl(
    private val baseUrl: String = "http://10.0.2.2:80",
    private var authToken: String? = null,
    private val client: OkHttpClient = OkHttpClient()
) : SeekersApiClient {

    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    fun setAuthToken(token: String?) {
        this.authToken = token
    }

    private fun addHeaders(builder: Request.Builder): Request.Builder {
        builder.header("Accept", "application/json")
        authToken?.let { builder.header("Authorization", "Bearer $it") }
        return builder
    }

    private suspend fun Call.await(): Response {
        return suspendCancellableCoroutine { continuation ->
            continuation.invokeOnCancellation {
                cancel()
            }
            enqueue(object : Callback {
                override fun onResponse(call: Call, response: Response) {
                    continuation.resume(response)
                }
                override fun onFailure(call: Call, e: IOException) {
                    continuation.resumeWithException(e)
                }
            })
        }
    }

    override suspend fun searchJobs(
        query: String,
        cursor: String?,
        limit: Int,
        remoteOnly: Boolean
    ): JobListResponse {
        val httpUrlBuilder = HttpUrl.get(baseUrl).newBuilder()
            .addPathSegment("api")
            .addPathSegment("v1")
            .addPathSegment("jobs")
            .addQueryParameter("limit", limit.toString())

        if (query.isNotBlank()) {
            httpUrlBuilder.addQueryParameter("q", query)
        }
        if (cursor != null && cursor.isNotBlank()) {
            httpUrlBuilder.addQueryParameter("cursor", cursor)
        }
        if (remoteOnly) {
            httpUrlBuilder.addQueryParameter("remote_eligibility", "FULLY_REMOTE")
        }

        val request = addHeaders(Request.Builder().url(httpUrlBuilder.build()).get()).build()
        val response = client.newCall(request).await()

        if (!response.isSuccessful) {
            throw IOException("Search jobs failed with HTTP ${response.code}: ${response.message}")
        }

        val bodyString = response.body?.string() ?: "{}"
        val root = JSONObject(bodyString)
        val itemsArray = root.optJSONArray("items") ?: JSONArray()
        val items = mutableListOf<MobileJobSummary>()

        for (i in 0 until itemsArray.length()) {
            val item = itemsArray.getJSONObject(i)
            val skillsArray = item.optJSONArray("skills") ?: JSONArray()
            val skills = mutableListOf<String>()
            for (j in 0 until skillsArray.length()) {
                skills.add(skillsArray.getString(j))
            }

            val salaryObj = item.optJSONObject("salary")
            val salary = if (salaryObj != null) {
                Salary(
                    currency = salaryObj.optString("currency", "BDT"),
                    period = salaryObj.optString("period", "MONTHLY"),
                    min = if (salaryObj.has("min")) salaryObj.optInt("min") else null,
                    max = if (salaryObj.has("max")) salaryObj.optInt("max") else null
                )
            } else null

            items.add(
                MobileJobSummary(
                    id = item.getString("id"),
                    title = item.getString("title"),
                    company = item.getString("company"),
                    location = item.getString("location"),
                    remote_eligibility = item.optString("remote_eligibility", "FLEXIBLE"),
                    job_type = item.optString("job_type", "FULL_TIME"),
                    seniority = item.optString("seniority", null),
                    salary = salary,
                    skills = skills,
                    source = item.optString("source", "Direct"),
                    published_at = item.optString("published_at", ""),
                    is_saved = item.optBoolean("is_saved", false)
                )
            )
        }

        return JobListResponse(
            items = items,
            limit = root.optInt("limit", limit),
            next_cursor = if (root.isNull("next_cursor")) null else root.optString("next_cursor", null),
            prev_cursor = if (root.isNull("prev_cursor")) null else root.optString("prev_cursor", null),
            total_count = root.optInt("total_count", items.size)
        )
    }

    override suspend fun getJobDetail(jobId: String): MobileJobDetail {
        val httpUrl = HttpUrl.get(baseUrl).newBuilder()
            .addPathSegment("api")
            .addPathSegment("v1")
            .addPathSegment("jobs")
            .addPathSegment(jobId)
            .build()

        val request = addHeaders(Request.Builder().url(httpUrl).get()).build()
        val response = client.newCall(request).await()

        if (!response.isSuccessful) {
            throw IOException("Get job detail failed with HTTP ${response.code}")
        }

        val bodyString = response.body?.string() ?: "{}"
        val item = JSONObject(bodyString)

        val skillsArray = item.optJSONArray("skills") ?: JSONArray()
        val skills = mutableListOf<String>()
        for (j in 0 until skillsArray.length()) {
            skills.add(skillsArray.getString(j))
        }

        val salaryObj = item.optJSONObject("salary")
        val salary = if (salaryObj != null) {
            Salary(
                currency = salaryObj.optString("currency", "BDT"),
                period = salaryObj.optString("period", "MONTHLY"),
                min = if (salaryObj.has("min")) salaryObj.optInt("min") else null,
                max = if (salaryObj.has("max")) salaryObj.optInt("max") else null
            )
        } else null

        return MobileJobDetail(
            id = item.getString("id"),
            title = item.getString("title"),
            company = item.getString("company"),
            location = item.getString("location"),
            remote_eligibility = item.optString("remote_eligibility", "FLEXIBLE"),
            job_type = item.optString("job_type", "FULL_TIME"),
            seniority = item.optString("seniority", null),
            salary = salary,
            skills = skills,
            source = item.optString("source", "Direct"),
            published_at = item.optString("published_at", ""),
            description = item.optString("description", ""),
            canonical_url = item.optString("canonical_url", ""),
            status = item.optString("status", "ACTIVE"),
            outbound_url = item.optString("outbound_url", ""),
            is_saved = item.optBoolean("is_saved", false)
        )
    }

    override suspend fun toggleSaveJob(jobId: String, shouldSave: Boolean): Boolean {
        val httpUrl = HttpUrl.get(baseUrl).newBuilder()
            .addPathSegment("api")
            .addPathSegment("v1")
            .addPathSegment("users")
            .addPathSegment("saved-jobs")
            .addPathSegment(jobId)
            .build()

        val request = if (shouldSave) {
            val body = JSONObject().put("saved_at", java.time.Instant.now().toString()).toString()
                .toRequestBody(jsonMediaType)
            addHeaders(Request.Builder().url(httpUrl).post(body)).build()
        } else {
            addHeaders(Request.Builder().url(httpUrl).delete()).build()
        }

        val response = client.newCall(request).await()
        if (!response.isSuccessful && response.code != 204 && response.code != 201) {
            throw IOException("Toggle save job failed with HTTP ${response.code}")
        }
        return shouldSave
    }

    override suspend fun uploadResume(fileName: String, fileBytes: ByteArray): String {
        val httpUrl = HttpUrl.get(baseUrl).newBuilder()
            .addPathSegment("api")
            .addPathSegment("v1")
            .addPathSegment("users")
            .addPathSegment("resume")
            .addPathSegment("upload")
            .build()

        val mediaType = "application/pdf".toMediaType()
        val requestBody = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart(
                "file",
                fileName,
                fileBytes.toRequestBody(mediaType)
            )
            .build()

        val request = addHeaders(Request.Builder().url(httpUrl).post(requestBody)).build()
        val response = client.newCall(request).await()

        if (!response.isSuccessful && response.code != 202) {
            throw IOException("Upload resume failed with HTTP ${response.code}")
        }

        val bodyString = response.body?.string() ?: "{}"
        val obj = JSONObject(bodyString)
        return obj.optString("parse_id", "parse-${System.currentTimeMillis()}")
    }

    override suspend fun pollResumeStatus(parseId: String): MobileResumeUploadStatus {
        val httpUrl = HttpUrl.get(baseUrl).newBuilder()
            .addPathSegment("api")
            .addPathSegment("v1")
            .addPathSegment("users")
            .addPathSegment("resume")
            .addPathSegment("status")
            .addPathSegment(parseId)
            .build()

        val request = addHeaders(Request.Builder().url(httpUrl).get()).build()
        val response = client.newCall(request).await()

        if (!response.isSuccessful) {
            throw IOException("Poll resume status failed with HTTP ${response.code}")
        }

        val bodyString = response.body?.string() ?: "{}"
        val obj = JSONObject(bodyString)
        val skillsArray = obj.optJSONArray("extracted_skills") ?: JSONArray()
        val skills = mutableListOf<String>()
        for (i in 0 until skillsArray.length()) {
            skills.add(skillsArray.getString(i))
        }

        return MobileResumeUploadStatus(
            parse_id = obj.optString("parse_id", parseId),
            status = obj.optString("status", "PROCESSING"),
            extracted_skills = skills,
            error_code = if (obj.isNull("error_code")) null else obj.optString("error_code", null),
            processing_time_ms = if (obj.has("processing_time_ms")) obj.optLong("processing_time_ms") else null
        )
    }
}
