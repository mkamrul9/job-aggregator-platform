package com.seekers.mobile

import com.seekers.mobile.api.SeekersApiClient
import com.seekers.mobile.models.*
import com.seekers.mobile.viewmodel.JobSearchViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class JobSearchViewModelTest {

    private lateinit var mockApi: MockSeekersApiClient
    private lateinit var viewModel: JobSearchViewModel

    private val sampleSummary = MobileJobSummary(
        id = "550e8400-e29b-41d4-a716-446655440000",
        title = "Staff Android Engineer",
        company = "Acme Corp",
        location = "Dhaka, Bangladesh",
        remote_eligibility = "FULLY_REMOTE",
        published_at = "2026-11-01T10:00:00Z",
        skills = listOf("Kotlin", "Jetpack Compose", "Coroutines")
    )

    private val sampleDetail = MobileJobDetail(
        id = "550e8400-e29b-41d4-a716-446655440000",
        title = "Staff Android Engineer",
        company = "Acme Corp",
        location = "Dhaka, Bangladesh",
        remote_eligibility = "FULLY_REMOTE",
        published_at = "2026-11-01T10:00:00Z",
        description = "Design and build modern native Android mobile applications.",
        canonical_url = "https://example.com/jobs/550e8400-e29b-41d4-a716-446655440000",
        outbound_url = "https://acme.example.com/apply/1",
        skills = listOf("Kotlin", "Jetpack Compose", "Coroutines")
    )

    @Before
    fun setup() {
        mockApi = MockSeekersApiClient(sampleSummary, sampleDetail)
        viewModel = JobSearchViewModel(mockApi)
    }

    @Test
    fun testDeepLinkingRouting() {
        val handledJob = viewModel.handleDeepLink("seekers://jobs/550e8400-e29b-41d4-a716-446655440000")
        assertTrue(handledJob)
        assertEquals(
            ScreenState.JobDetail("550e8400-e29b-41d4-a716-446655440000"),
            viewModel.uiState.value.currentScreen
        )

        val handledResume = viewModel.handleDeepLink("seekers://resume")
        assertTrue(handledResume)
        assertEquals(ScreenState.ResumeUpload, viewModel.uiState.value.currentScreen)

        val handledInvalid = viewModel.handleDeepLink("invalid://path")
        assertFalse(handledInvalid)
    }

    @Test
    fun testCursorPaginationSearch() = runTest {
        viewModel.loadJobs(query = "Android", cursor = null)
        val state1 = viewModel.uiState.value
        assertEquals(1, state1.jobs.size)
        assertEquals("cursor-page-2", state1.nextCursor)
        assertFalse(state1.isLoading)

        // Load next page with cursor
        viewModel.loadJobs(query = "Android", cursor = state1.nextCursor)
        val state2 = viewModel.uiState.value
        assertEquals(2, state2.jobs.size)
    }

    @Test
    fun testSelectJobDetail() = runTest {
        viewModel.selectJob("550e8400-e29b-41d4-a716-446655440000")
        val state = viewModel.uiState.value
        assertNotNull(state.selectedJob)
        assertEquals("Acme Corp", state.selectedJob?.company)
        assertEquals(
            ScreenState.JobDetail("550e8400-e29b-41d4-a716-446655440000"),
            state.currentScreen
        )
    }

    @Test
    fun testOptimisticBookmarkWithRollback() = runTest {
        val jobId = "550e8400-e29b-41d4-a716-446655440000"

        // 1. Success save
        val saved = viewModel.toggleSaveJob(jobId)
        assertTrue(saved)
        assertTrue(viewModel.uiState.value.savedJobIds.contains(jobId))

        // 2. Unsave success
        val unsaved = viewModel.toggleSaveJob(jobId)
        assertFalse(unsaved)
        assertFalse(viewModel.uiState.value.savedJobIds.contains(jobId))

        // 3. Failure scenario with rollback
        mockApi.shouldFailBookmark = true
        try {
            viewModel.toggleSaveJob(jobId)
            fail("Expected IOException")
        } catch (e: IOException) {
            // Assert state was reverted
            assertFalse(viewModel.uiState.value.savedJobIds.contains(jobId))
        }
    }

    @Test
    fun testResumeUploadAndPolling() = runTest {
        val sampleBytes = "%PDF-1.4".toByteArray()
        val result = viewModel.uploadAndPollResume("my_resume.pdf", sampleBytes)

        assertEquals("PARSED", result.status)
        assertEquals(3, result.extracted_skills.size)
        assertTrue(result.extracted_skills.contains("Kotlin"))
    }

    @Test
    fun testAccessibilitySemantics() {
        val a11y = viewModel.getAccessibilitySemantics()
        assertEquals(48, a11y["minTouchTargetDp"])
        assertEquals("ROLE_PAGINATED_LIST", a11y["talkBackRole"])
        assertEquals(true, a11y["contentDescriptionsPresent"])
    }

    class MockSeekersApiClient(
        private val summary: MobileJobSummary,
        private val detail: MobileJobDetail
    ) : SeekersApiClient {
        var shouldFailBookmark = false

        override suspend fun searchJobs(
            query: String,
            cursor: String?,
            limit: Int,
            remoteOnly: Boolean
        ): JobListResponse {
            return JobListResponse(
                items = listOf(summary),
                limit = limit,
                next_cursor = if (cursor == null) "cursor-page-2" else null,
                prev_cursor = cursor,
                total_count = 2
            )
        }

        override suspend fun getJobDetail(jobId: String): MobileJobDetail {
            if (jobId == detail.id) return detail
            throw NoSuchElementException("Job not found: $jobId")
        }

        override suspend fun toggleSaveJob(jobId: String, shouldSave: Boolean): Boolean {
            if (shouldFailBookmark) throw IOException("Simulated network failure")
            return shouldSave
        }

        override suspend fun uploadResume(fileName: String, fileBytes: ByteArray): String {
            return "parse-mock-123"
        }

        override suspend fun pollResumeStatus(parseId: String): MobileResumeUploadStatus {
            return MobileResumeUploadStatus(
                parse_id = parseId,
                status = "PARSED",
                extracted_skills = listOf("Kotlin", "Jetpack Compose", "Coroutines")
            )
        }
    }
}
