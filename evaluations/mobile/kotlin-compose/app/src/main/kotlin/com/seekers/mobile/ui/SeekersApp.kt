package com.seekers.mobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.seekers.mobile.models.*
import com.seekers.mobile.viewmodel.JobSearchViewModel
import kotlinx.coroutines.launch

// Brand palette: Seekers Dark Theme
val SeekersDarkBg = Color(0xFF121416)
val SeekersSurface = Color(0xFF1E2022)
val SeekersSurfaceVariant = Color(0xFF2D3033)
val SeekersAmber = Color(0xFFF59E0B)
val SeekersText = Color(0xFFF9FAFB)
val SeekersSubtext = Color(0xFF9CA3AF)
val SeekersGreen = Color(0xFF10B981)

@Composable
fun SeekersTheme(content: @Composable () -> Unit) {
    val darkColors = darkColorScheme(
        primary = SeekersAmber,
        background = SeekersDarkBg,
        surface = SeekersSurface,
        onPrimary = Color(0xFF121416),
        onBackground = SeekersText,
        onSurface = SeekersText
    )
    MaterialTheme(colorScheme = darkColors, content = content)
}

@Composable
fun SeekersApp(
    viewModel: JobSearchViewModel,
    onApplyOutbound: (String) -> Unit = {}
) {
    val uiState by viewModel.uiState.collectAsState()
    val scope = rememberCoroutineScope()

    SeekersTheme {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background
        ) {
            when (val screen = uiState.currentScreen) {
                is ScreenState.JobList -> {
                    JobListScreen(
                        uiState = uiState,
                        onSearch = { q -> scope.launch { viewModel.loadJobs(q, null, uiState.isFilterRemote) } },
                        onToggleRemote = { scope.launch { viewModel.loadJobs(uiState.searchQuery, null, !uiState.isFilterRemote) } },
                        onSelectJob = { id -> scope.launch { viewModel.selectJob(id) } },
                        onLoadMore = {
                            if (uiState.nextCursor != null && !uiState.isLoading) {
                                scope.launch { viewModel.loadJobs(uiState.searchQuery, uiState.nextCursor, uiState.isFilterRemote) }
                            }
                        }
                    )
                }
                is ScreenState.JobDetail -> {
                    val job = uiState.selectedJob
                    if (job != null) {
                        JobDetailScreen(
                            job = job,
                            isSaved = uiState.savedJobIds.contains(job.id),
                            onBack = { viewModel.navigateBack() },
                            onToggleSave = { scope.launch { viewModel.toggleSaveJob(job.id) } },
                            onApplyOutbound = onApplyOutbound
                        )
                    } else {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = SeekersAmber)
                        }
                    }
                }
                is ScreenState.ResumeUpload -> {
                    ResumeUploadScreen(
                        status = uiState.resumeStatus,
                        isLoading = uiState.isLoading,
                        onBack = { viewModel.navigateBack() },
                        onUploadSample = {
                            scope.launch {
                                val samplePdf = "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF".toByteArray()
                                viewModel.uploadAndPollResume("sample_cv.pdf", samplePdf)
                            }
                        }
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JobListScreen(
    uiState: MobileUiState,
    onSearch: (String) -> Unit,
    onToggleRemote: () -> Unit,
    onSelectJob: (String) -> Unit,
    onLoadMore: () -> Unit
) {
    var searchText by remember { mutableStateOf(uiState.searchQuery) }

    Column(modifier = Modifier.fillMaxSize()) {
        // Search & Filter Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(SeekersSurface)
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = searchText,
                onValueChange = {
                    searchText = it
                    onSearch(it)
                },
                placeholder = { Text("Search engineering roles...", color = SeekersSubtext) },
                modifier = Modifier
                    .weight(1f)
                    .defaultMinSize(minHeight = 48.dp)
                    .semantics { contentDescription = "Search jobs by title, company, or skill" },
                singleLine = true,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = SeekersText,
                    unfocusedTextColor = SeekersText,
                    focusedBorderColor = SeekersAmber,
                    unfocusedBorderColor = SeekersSurfaceVariant
                )
            )

            Spacer(modifier = Modifier.width(8.dp))

            FilterChip(
                selected = uiState.isFilterRemote,
                onClick = onToggleRemote,
                label = { Text("Remote", fontWeight = FontWeight.SemiBold) },
                modifier = Modifier
                    .defaultMinSize(minHeight = 48.dp, minWidth = 48.dp)
                    .semantics {
                        role = Role.Checkbox
                        contentDescription = if (uiState.isFilterRemote) "Filter: Remote active" else "Filter: Remote inactive"
                    },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = SeekersAmber,
                    selectedLabelColor = Color(0xFF121416),
                    containerColor = SeekersSurfaceVariant,
                    labelColor = SeekersText
                )
            )
        }

        // Job List Content
        if (uiState.isLoading && uiState.jobs.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = SeekersAmber)
            }
        } else if (uiState.jobs.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    text = "No verified job listings found.",
                    color = SeekersSubtext,
                    fontSize = 16.sp
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 12.dp),
                contentPadding = PaddingValues(vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(uiState.jobs, key = { it.id }) { job ->
                    JobCard(job = job, onClick = { onSelectJob(job.id) })
                }
                item {
                    LaunchedEffect(Unit) {
                        onLoadMore()
                    }
                }
            }
        }
    }
}

@Composable
fun JobCard(job: MobileJobSummary, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .semantics {
                role = Role.Button
                contentDescription = "View job details for ${job.title} at ${job.company}"
            },
        colors = CardDefaults.cardColors(containerColor = SeekersSurface),
        shape = RoundedCornerShape(10.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = job.title, color = SeekersText, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Text(text = job.company, color = SeekersAmber, fontSize = 14.sp, fontWeight = FontWeight.Medium)

            Spacer(modifier = Modifier.height(8.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(text = job.location, color = SeekersSubtext, fontSize = 13.sp)
                Spacer(modifier = Modifier.width(8.dp))
                Surface(
                    color = if (job.remote_eligibility == "FULLY_REMOTE") Color(0xFF064E3B) else SeekersSurfaceVariant,
                    shape = RoundedCornerShape(4.dp)
                ) {
                    Text(
                        text = job.remote_eligibility,
                        color = if (job.remote_eligibility == "FULLY_REMOTE") SeekersGreen else SeekersSubtext,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                    )
                }
                if (job.salary?.min != null) {
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "${job.salary.currency} ${job.salary.min}",
                        color = Color(0xFFE5E7EB),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }

            if (job.skills.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    job.skills.take(3).forEach { skill ->
                        Surface(
                            color = SeekersSurfaceVariant,
                            shape = RoundedCornerShape(4.dp)
                        ) {
                            Text(
                                text = skill,
                                color = Color(0xFFD1D5DB),
                                fontSize = 11.sp,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun JobDetailScreen(
    job: MobileJobDetail,
    isSaved: Boolean,
    onBack: () -> Unit,
    onToggleSave: () -> Unit,
    onApplyOutbound: (String) -> Unit
) {
    Column(modifier = Modifier.fillMaxSize()) {
        // Navigation Bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(SeekersSurface)
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Button(
                onClick = onBack,
                modifier = Modifier
                    .defaultMinSize(minHeight = 48.dp, minWidth = 48.dp)
                    .semantics { contentDescription = "Back to job listings" },
                colors = ButtonDefaults.buttonColors(containerColor = SeekersSurfaceVariant)
            ) {
                Text("← Back", color = SeekersAmber, fontWeight = FontWeight.Bold)
            }

            Button(
                onClick = onToggleSave,
                modifier = Modifier
                    .defaultMinSize(minHeight = 48.dp, minWidth = 48.dp)
                    .semantics {
                        role = Role.Button
                        contentDescription = if (isSaved) "Remove from saved jobs" else "Save this job"
                    },
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isSaved) SeekersAmber else SeekersSurfaceVariant
                )
            ) {
                Text(
                    text = if (isSaved) "★ Saved" else "☆ Save",
                    color = if (isSaved) Color(0xFF121416) else SeekersText,
                    fontWeight = FontWeight.Bold
                )
            }
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            Text(text = job.title, color = SeekersText, fontSize = 24.sp, fontWeight = FontWeight.ExtraBold)
            Text(text = job.company, color = SeekersAmber, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            Text(text = "${job.location} • ${job.remote_eligibility}", color = SeekersSubtext, fontSize = 14.sp)

            Spacer(modifier = Modifier.height(16.dp))

            if (job.salary?.min != null) {
                Surface(
                    color = SeekersSurface,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Text("TARGET COMPENSATION", color = SeekersSubtext, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        Text(
                            text = "${job.salary.currency} ${job.salary.min} - ${job.salary.max ?: ""} / ${job.salary.period.lowercase()}",
                            color = SeekersGreen,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
            }

            Text("Job Overview", color = SeekersText, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(6.dp))
            Text(text = job.description, color = Color(0xFFD1D5DB), fontSize = 15.sp, lineHeight = 22.sp)

            Spacer(modifier = Modifier.height(16.dp))

            Text("Required Skills", color = SeekersText, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                job.skills.forEach { skill ->
                    Surface(
                        color = SeekersSurfaceVariant,
                        shape = RoundedCornerShape(6.dp)
                    ) {
                        Text(
                            text = skill,
                            color = Color(0xFFF3F4F6),
                            fontSize = 13.sp,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            Surface(
                color = SeekersSurface,
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text("SOURCE PROVENANCE", color = SeekersSubtext, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    Text("Verified listing from ${job.source}.", color = Color(0xFFD1D5DB), fontSize = 13.sp)
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = { onApplyOutbound(job.outbound_url) },
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 48.dp)
                    .semantics {
                        role = Role.Button
                        contentDescription = "Apply on original employer site"
                    },
                colors = ButtonDefaults.buttonColors(containerColor = SeekersAmber),
                shape = RoundedCornerShape(8.dp)
            ) {
                Text("Apply on Employer Site ↗", color = Color(0xFF121416), fontSize = 16.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
fun ResumeUploadScreen(
    status: MobileResumeUploadStatus?,
    isLoading: Boolean,
    onBack: () -> Unit,
    onUploadSample: () -> Unit
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(SeekersSurface)
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Button(
                onClick = onBack,
                modifier = Modifier
                    .defaultMinSize(minHeight = 48.dp, minWidth = 48.dp)
                    .semantics { contentDescription = "Back to dashboard" },
                colors = ButtonDefaults.buttonColors(containerColor = SeekersSurfaceVariant)
            ) {
                Text("← Back", color = SeekersAmber, fontWeight = FontWeight.Bold)
            }
            Spacer(modifier = Modifier.width(16.dp))
            Text("Resume Parser", color = SeekersText, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        }

        Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
            Surface(
                color = SeekersSurface,
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Text("Private In-Memory NLP Parsing", color = SeekersText, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        "Upload your PDF resume (max 10MB). Text is parsed in-memory with spaCy NLP without persistent storage.",
                        color = SeekersSubtext,
                        fontSize = 14.sp,
                        lineHeight = 20.sp
                    )

                    Spacer(modifier = Modifier.height(20.dp))

                    Button(
                        onClick = onUploadSample,
                        enabled = !isLoading,
                        modifier = Modifier
                            .fillMaxWidth()
                            .defaultMinSize(minHeight = 48.dp)
                            .semantics {
                                role = Role.Button
                                contentDescription = "Select PDF resume to upload"
                            },
                        colors = ButtonDefaults.buttonColors(containerColor = SeekersAmber),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(color = Color(0xFF121416), modifier = Modifier.size(24.dp))
                        } else {
                            Text("Select PDF Document 📄", color = Color(0xFF121416), fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            if (status != null) {
                Spacer(modifier = Modifier.height(20.dp))
                Surface(
                    color = SeekersSurface,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Parse Status:", color = SeekersSubtext, fontSize = 14.sp)
                            Surface(
                                color = if (status.status == "PARSED") Color(0xFF064E3B) else Color(0xFF78350F),
                                shape = RoundedCornerShape(4.dp)
                            ) {
                                Text(
                                    text = status.status,
                                    color = if (status.status == "PARSED") SeekersGreen else SeekersAmber,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                )
                            }
                        }

                        if (status.status == "PARSED" && status.extracted_skills.isNotEmpty()) {
                            Spacer(modifier = Modifier.height(14.dp))
                            Text("Extracted Skills (${status.extracted_skills.size})", color = Color(0xFFE5E7EB), fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(modifier = Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                status.extracted_skills.forEach { skill ->
                                    Surface(
                                        color = SeekersSurfaceVariant,
                                        shape = RoundedCornerShape(4.dp)
                                    ) {
                                        Text(
                                            text = skill,
                                            color = Color(0xFFF3F4F6),
                                            fontSize = 12.sp,
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
