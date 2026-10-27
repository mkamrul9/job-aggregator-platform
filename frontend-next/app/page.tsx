'use client';

import React, { useState, useMemo } from 'react';
import Navbar, { ActiveTab } from '../components/Navbar';
import JobCard from '../components/JobCard';
import JobDetailDrawer from '../components/JobDetailDrawer';
import MobileFilterSheet, { FilterState } from '../components/MobileFilterSheet';
import ApplicationsWorkspace from '../components/ApplicationsWorkspace';
import AlertsWorkspace from '../components/AlertsWorkspace';
import ProfileWorkspace from '../components/ProfileWorkspace';
import AuthModal from '../components/AuthModal';
import FeedbackModal from '../components/FeedbackModal';
import DataControlModal from '../components/DataControlModal';
import DemoInfoModal from '../components/DemoInfoModal';
import { AuthProvider } from '../lib/auth-context';
import {
  SYNTHETIC_JOBS,
  INITIAL_TRACKED_APPLICATIONS,
  INITIAL_SAVED_JOBS,
  INITIAL_ALERT_SUBSCRIPTIONS,
  JobDetail,
  TrackedApplication,
  JobSummary,
  AlertSubscription,
} from '../lib/mock-data';

function CandidatePortalContent() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<ActiveTab>('discover');

  // Candidate Data State (Workspaces)
  const [savedJobs, setSavedJobs] = useState<JobSummary[]>(INITIAL_SAVED_JOBS);
  const [applications, setApplications] = useState<TrackedApplication[]>(INITIAL_TRACKED_APPLICATIONS);
  const [alerts, setAlerts] = useState<AlertSubscription[]>(INITIAL_ALERT_SUBSCRIPTIONS);

  // Search & Filter State
  const [filters, setFilters] = useState<FilterState>({
    q: '',
    location: '',
    remote: '',
    seniority: '',
    jobType: '',
    minSalary: 0,
    sort: 'recent',
  });
  const [searchInput, setSearchInput] = useState('');
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  // Modal / Drawer States
  const [selectedJob, setSelectedJob] = useState<JobDetail | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [reportingJob, setReportingJob] = useState<JobDetail | null>(null);
  const [isDataControlOpen, setIsDataControlOpen] = useState(false);
  const [isDemoInfoOpen, setIsDemoInfoOpen] = useState(false);

  // Filter Logic
  const filteredJobs = useMemo(() => {
    return SYNTHETIC_JOBS.filter((job) => {
      // Query filter
      if (filters.q) {
        const query = filters.q.toLowerCase();
        const matchesTitle = job.title.toLowerCase().includes(query);
        const matchesCompany = job.company.toLowerCase().includes(query);
        const matchesSkills = job.skills.some((s) => s.toLowerCase().includes(query));
        const matchesDesc = job.description.toLowerCase().includes(query);
        if (!matchesTitle && !matchesCompany && !matchesSkills && !matchesDesc) return false;
      }

      // Location filter
      if (filters.location && filters.location !== 'All Locations') {
        if (!job.location.toLowerCase().includes(filters.location.toLowerCase())) {
          return false;
        }
      }

      // Remote filter
      if (filters.remote && job.remote_eligibility !== filters.remote) {
        return false;
      }

      // Seniority filter
      if (filters.seniority && job.seniority !== filters.seniority) {
        return false;
      }

      // Job Type filter
      if (filters.jobType && job.job_type !== filters.jobType) {
        return false;
      }

      return true;
    }).sort((a, b) => {
      if (filters.sort === 'recent') {
        return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
      }
      return 0;
    });
  }, [filters]);

  // Saved Jobs Set for fast lookup
  const savedJobIds = useMemo(() => new Set(savedJobs.map((j) => j.id)), [savedJobs]);
  const trackedJobIds = useMemo(() => new Set(applications.map((a) => a.job_id)), [applications]);

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.location) count++;
    if (filters.remote) count++;
    if (filters.seniority) count++;
    if (filters.jobType) count++;
    return count;
  }, [filters]);

  // Handlers
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters((prev) => ({ ...prev, q: searchInput }));
  };

  const handleResetFilters = () => {
    setFilters({
      q: '',
      location: '',
      remote: '',
      seniority: '',
      jobType: '',
      minSalary: 0,
      sort: 'recent',
    });
    setSearchInput('');
  };

  const handleToggleSave = (e: React.MouseEvent, job: JobDetail) => {
    e.stopPropagation();
    if (savedJobIds.has(job.id)) {
      setSavedJobs((prev) => prev.filter((j) => j.id !== job.id));
    } else {
      setSavedJobs((prev) => [job, ...prev]);
    }
  };

  const handleTrackApplication = (job: JobDetail) => {
    if (trackedJobIds.has(job.id)) return;
    const newApp: TrackedApplication = {
      id: `app_track_${Date.now()}`,
      job_id: job.id,
      job_summary: job,
      status: 'APPLIED',
      notes: 'Tracked directly from job discovery.',
      applied_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setApplications((prev) => [newApp, ...prev]);
  };

  const handleUpdateAppStatus = (id: string, status: TrackedApplication['status']) => {
    setApplications((prev) =>
      prev.map((app) =>
        app.id === id ? { ...app, status, updated_at: new Date().toISOString() } : app,
      ),
    );
  };

  const handleUpdateAppNotes = (id: string, notes: string) => {
    setApplications((prev) =>
      prev.map((app) =>
        app.id === id ? { ...app, notes, updated_at: new Date().toISOString() } : app,
      ),
    );
  };

  const handleRemoveApplication = (id: string) => {
    setApplications((prev) => prev.filter((app) => app.id !== id));
  };

  const handleToggleAlertActive = (id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, active: !a.active } : a)),
    );
  };

  const handleDeleteAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const handleCreateAlert = (newAlertData: Omit<AlertSubscription, 'id' | 'created_at'>) => {
    const newAlert: AlertSubscription = {
      ...newAlertData,
      id: `alert_${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    setAlerts((prev) => [newAlert, ...prev]);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Navigation */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        savedCount={savedJobs.length}
        applicationsCount={applications.length}
        alertsCount={alerts.length}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenFeedback={() => setIsFeedbackOpen(true)}
        onOpenDemoInfo={() => setIsDemoInfoOpen(true)}
        onOpenDataControl={() => setIsDataControlOpen(true)}
      />

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '1.5rem 0' }}>
        <div className="seekers-container">
          {/* ─── TAB 1: DISCOVER ROLES ──────────────────────────────────── */}
          {activeTab === 'discover' && (
            <div>
              {/* Search Header Banner */}
              <div className="search-banner">
                <h1
                  style={{
                    fontFamily: 'var(--font-heading)',
                    fontSize: '1.5rem',
                    fontWeight: 800,
                    color: 'var(--seekers-text-primary)',
                    marginBottom: '0.35rem',
                  }}
                >
                  Find Software Engineering Roles in South Asia
                </h1>
                <p
                  style={{
                    fontSize: '0.875rem',
                    color: 'var(--seekers-text-secondary)',
                    marginBottom: '1rem',
                  }}
                >
                  Aggregated and deduplicated across authentic Bangladesh & regional tech job sources.
                </p>

                {/* Search Bar */}
                <form onSubmit={handleSearchSubmit} className="search-bar-row">
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input
                      type="text"
                      className="search-input"
                      placeholder="Title, technology, or company (e.g. Go, React, Brain Station 23)..."
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      id="job-search-input"
                      aria-label="Search job listings"
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn-primary"
                    style={{ minHeight: '44px', padding: '0 1.25rem' }}
                    id="job-search-btn"
                  >
                    Search Roles
                  </button>
                </form>

                {/* Active Filter Indicators */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: '1rem',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--seekers-text-muted)' }}>
                      Showing {filteredJobs.length} regional vacancies
                    </span>

                    {activeFilterCount > 0 && (
                      <span
                        style={{
                          backgroundColor: 'var(--seekers-teal-dim)',
                          color: 'var(--seekers-teal-400)',
                          fontSize: '0.75rem',
                          padding: '0.15rem 0.5rem',
                          borderRadius: 'var(--radius-xs)',
                        }}
                      >
                        {activeFilterCount} active filters
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {/* Mobile Filter Sheet Button (<768px) */}
                    <button
                      type="button"
                      className="btn-secondary mobile-filter-btn"
                      onClick={() => setIsMobileFilterOpen(true)}
                    >
                      Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
                    </button>

                    {activeFilterCount > 0 && (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={handleResetFilters}
                        style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)' }}
                      >
                        Reset filters
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Desktop Filters Bar (>=768px) */}
              <div className="desktop-filters-row">
                <select
                  className="filter-select"
                  value={filters.location}
                  onChange={(e) => setFilters({ ...filters, location: e.target.value })}
                  aria-label="Filter by location"
                >
                  <option value="">All Locations</option>
                  <option value="Dhaka">Dhaka, Bangladesh</option>
                  <option value="Chattogram">Chattogram, Bangladesh</option>
                  <option value="Sylhet">Sylhet, Bangladesh</option>
                  <option value="Remote">Regional Remote</option>
                </select>

                <select
                  className="filter-select"
                  value={filters.remote}
                  onChange={(e) => setFilters({ ...filters, remote: e.target.value })}
                  aria-label="Filter by remote arrangement"
                >
                  <option value="">Remote Arrangement</option>
                  <option value="FULLY_REMOTE">Fully Remote</option>
                  <option value="HYBRID">Hybrid</option>
                  <option value="ON_SITE">On-Site</option>
                </select>

                <select
                  className="filter-select"
                  value={filters.seniority}
                  onChange={(e) => setFilters({ ...filters, seniority: e.target.value })}
                  aria-label="Filter by seniority level"
                >
                  <option value="">Seniority Level</option>
                  <option value="ENTRY">Entry Level</option>
                  <option value="MID">Mid Level</option>
                  <option value="SENIOR">Senior</option>
                  <option value="LEAD">Lead / Architect</option>
                </select>

                <select
                  className="filter-select"
                  value={filters.jobType}
                  onChange={(e) => setFilters({ ...filters, jobType: e.target.value })}
                  aria-label="Filter by employment type"
                >
                  <option value="">Employment Type</option>
                  <option value="FULL_TIME">Full Time</option>
                  <option value="CONTRACT">Contract</option>
                  <option value="PART_TIME">Part Time</option>
                  <option value="INTERNSHIP">Internship</option>
                </select>

                <select
                  className="filter-select"
                  value={filters.sort}
                  onChange={(e) => setFilters({ ...filters, sort: e.target.value as FilterState['sort'] })}
                  aria-label="Sort job listings"
                >
                  <option value="recent">Most Recent</option>
                  <option value="salary">Highest Compensation</option>
                </select>
              </div>

              {/* Job Listings Feed */}
              {filteredJobs.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">🔍</div>
                  <div className="empty-title">No listings match your criteria</div>
                  <div className="empty-desc">
                    Try broadening your keywords or clearing seniority and location filters.
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleResetFilters}
                  >
                    Reset All Filters
                  </button>
                </div>
              ) : (
                <div role="feed" aria-label="Job openings feed">
                  {filteredJobs.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      isSelected={selectedJob?.id === job.id}
                      isSaved={savedJobIds.has(job.id)}
                      onSelect={(j) => setSelectedJob(j)}
                      onToggleSave={handleToggleSave}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── TAB 2: SAVED JOBS ───────────────────────────────────────── */}
          {activeTab === 'saved' && (
            <div>
              <div style={{ marginBottom: '1.25rem' }}>
                <h1
                  style={{
                    fontFamily: 'var(--font-heading)',
                    fontSize: '1.35rem',
                    fontWeight: 700,
                    color: 'var(--seekers-text-primary)',
                  }}
                >
                  Saved Roles ({savedJobs.length})
                </h1>
                <p style={{ fontSize: '0.875rem', color: 'var(--seekers-text-secondary)', marginTop: '0.2rem' }}>
                  Bookmarked listings saved for later review and application.
                </p>
              </div>

              {savedJobs.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">★</div>
                  <div className="empty-title">You have no saved jobs</div>
                  <div className="empty-desc">
                    When you find an interesting position, click the bookmark icon on any card to save it here.
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setActiveTab('discover')}
                  >
                    Discover Open Roles
                  </button>
                </div>
              ) : (
                <div>
                  {savedJobs.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job as JobDetail}
                      isSelected={selectedJob?.id === job.id}
                      isSaved={true}
                      onSelect={(j) => setSelectedJob(j)}
                      onToggleSave={handleToggleSave}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── TAB 3: APPLICATIONS WORKSPACE ──────────────────────────── */}
          {activeTab === 'applications' && (
            <ApplicationsWorkspace
              applications={applications}
              onUpdateStatus={handleUpdateAppStatus}
              onUpdateNotes={handleUpdateAppNotes}
              onRemoveApplication={handleRemoveApplication}
              onSelectJob={(j) => setSelectedJob(j)}
              onBrowseJobs={() => setActiveTab('discover')}
            />
          )}

          {/* ─── TAB 4: JOB ALERTS ──────────────────────────────────────── */}
          {activeTab === 'alerts' && (
            <AlertsWorkspace
              alerts={alerts}
              onToggleActive={handleToggleAlertActive}
              onDeleteAlert={handleDeleteAlert}
              onCreateAlert={handleCreateAlert}
            />
          )}

          {/* ─── TAB 5: PROFILE & SKILLS ─────────────────────────────────── */}
          {activeTab === 'profile' && (
            <ProfileWorkspace
              onOpenDataControl={() => setIsDataControlOpen(true)}
              onOpenAuth={() => setIsAuthOpen(true)}
            />
          )}
        </div>
      </main>

      {/* ─── MODALS & DRAWERS ────────────────────────────────────────────── */}

      {/* 1. Job Detail Drawer */}
      {selectedJob && (
        <JobDetailDrawer
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          isSaved={savedJobIds.has(selectedJob.id)}
          onToggleSave={handleToggleSave}
          onTrackApplication={handleTrackApplication}
          isAlreadyTracked={trackedJobIds.has(selectedJob.id)}
          onReportListing={(j) => {
            setReportingJob(j);
            setIsFeedbackOpen(true);
          }}
        />
      )}

      {/* 2. Mobile Filter Sheet */}
      <MobileFilterSheet
        isOpen={isMobileFilterOpen}
        onClose={() => setIsMobileFilterOpen(false)}
        filters={filters}
        onFilterChange={setFilters}
        onReset={handleResetFilters}
        totalFilteredCount={filteredJobs.length}
      />

      {/* 3. Real Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
      />

      {/* 4. Feedback / Report Modal */}
      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => {
          setIsFeedbackOpen(false);
          setReportingJob(null);
        }}
        reportingJob={reportingJob}
      />

      {/* 5. Data Privacy & Rights Modal */}
      <DataControlModal
        isOpen={isDataControlOpen}
        onClose={() => setIsDataControlOpen(false)}
        applications={applications}
        savedJobs={savedJobs}
      />

      {/* 6. Demo Scope & Provenance Modal */}
      <DemoInfoModal
        isOpen={isDemoInfoOpen}
        onClose={() => setIsDemoInfoOpen(false)}
      />
    </div>
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <CandidatePortalContent />
    </AuthProvider>
  );
}
