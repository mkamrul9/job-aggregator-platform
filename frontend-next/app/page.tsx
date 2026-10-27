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
import {
  SYNTHETIC_JOBS,
  INITIAL_USER_PROFILE,
  INITIAL_TRACKED_APPLICATIONS,
  INITIAL_SAVED_JOBS,
  INITIAL_ALERT_SUBSCRIPTIONS,
  JobDetail,
  TrackedApplication,
  JobSummary,
  AlertSubscription,
  UserProfile
} from '../lib/mock-data';

export default function Home() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<ActiveTab>('discover');

  // Candidate Data State
  const [profile, setProfile] = useState<UserProfile>(INITIAL_USER_PROFILE);
  const [candidateName, setCandidateName] = useState<string | null>('Farhan Ahmed');
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
    sort: 'recent'
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
        const matchesSkills = job.skills.some(s => s.toLowerCase().includes(query));
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
  const savedJobIds = useMemo(() => new Set(savedJobs.map(j => j.id)), [savedJobs]);
  const trackedJobIds = useMemo(() => new Set(applications.map(a => a.job_id)), [applications]);

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
    setFilters(prev => ({ ...prev, q: searchInput }));
  };

  const handleResetFilters = () => {
    setFilters({
      q: '',
      location: '',
      remote: '',
      seniority: '',
      jobType: '',
      minSalary: 0,
      sort: 'recent'
    });
    setSearchInput('');
  };

  const handleToggleSave = (e: React.MouseEvent, job: JobDetail) => {
    e.stopPropagation();
    if (savedJobIds.has(job.id)) {
      setSavedJobs(prev => prev.filter(j => j.id !== job.id));
    } else {
      setSavedJobs(prev => [job, ...prev]);
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
      updated_at: new Date().toISOString()
    };
    setApplications(prev => [newApp, ...prev]);
  };

  const handleUpdateAppStatus = (id: string, status: TrackedApplication['status']) => {
    setApplications(prev => prev.map(a => a.id === id ? { ...a, status, updated_at: new Date().toISOString() } : a));
  };

  const handleUpdateAppNotes = (id: string, notes: string) => {
    setApplications(prev => prev.map(a => a.id === id ? { ...a, notes, updated_at: new Date().toISOString() } : a));
  };

  const handleRemoveApplication = (id: string) => {
    setApplications(prev => prev.filter(a => a.id !== id));
  };

  const handleToggleAlertActive = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, active: !a.active } : a));
  };

  const handleDeleteAlert = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  const handleCreateAlert = (newAlert: Omit<AlertSubscription, 'id' | 'created_at'>) => {
    const alert: AlertSubscription = {
      ...newAlert,
      id: `alert_sub_${Date.now()}`,
      created_at: new Date().toISOString()
    };
    setAlerts(prev => [alert, ...prev]);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* Universal Navigation */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        savedCount={savedJobs.length}
        applicationsCount={applications.length}
        alertsCount={alerts.length}
        candidateName={candidateName}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenFeedback={() => {
          setReportingJob(null);
          setIsFeedbackOpen(true);
        }}
        onOpenDemoInfo={() => setIsDemoInfoOpen(true)}
      />

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '1.5rem 0 3.5rem' }}>
        <div className="seekers-container">

          {/* ─── TAB 1: DISCOVER ────────────────────────────────────────── */}
          {activeTab === 'discover' && (
            <div>
              
              {/* Search-First Banner */}
              <div style={{ marginBottom: '1.25rem' }}>
                <h1 style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: 'clamp(1.25rem, 3vw, 1.75rem)',
                  fontWeight: 700,
                  color: 'var(--seekers-text-primary)',
                  letterSpacing: '-0.02em',
                  marginBottom: '0.35rem'
                }}>
                  Find Your Next Engineering Role
                </h1>
                <p style={{ color: 'var(--seekers-text-secondary)', fontSize: '0.9375rem' }}>
                  Aggregated from leading Bangladesh tech employers and regional remote teams.
                </p>
              </div>

              {/* Search Bar */}
              <form onSubmit={handleSearchSubmit} className="search-container">
                <div className="search-input-wrap">
                  <span className="search-icon">🔍</span>
                  <input
                    type="text"
                    className="input-text"
                    placeholder="Search by role, company, or tech stack (e.g. Go, React, Mobile)..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    id="main-job-search-input"
                  />
                </div>

                <div>
                  <select
                    className="select-input"
                    value={filters.location}
                    onChange={(e) => setFilters(prev => ({ ...prev, location: e.target.value }))}
                    id="location-filter-select"
                  >
                    <option value="">All Locations</option>
                    <option value="Dhaka">Dhaka (Tech Hubs)</option>
                    <option value="Chattogram">Chattogram</option>
                    <option value="Remote">Remote Only</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="submit"
                    className="btn-primary"
                    style={{ flex: 1, whiteSpace: 'nowrap' }}
                    id="search-submit-btn"
                  >
                    Search Roles
                  </button>

                  {/* Mobile Filters Trigger (<768px) */}
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setIsMobileFilterOpen(true)}
                    style={{ minHeight: '44px', padding: '0.5rem 0.85rem' }}
                    id="mobile-filters-trigger"
                    aria-label="Open filter sheet"
                  >
                    Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
                  </button>
                </div>
              </form>

              {/* Desktop Filters Bar (≥768px) */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem 1rem',
                marginBottom: '1.25rem',
                paddingBottom: '0.85rem',
                borderBottom: '1px solid var(--seekers-border-subtle)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--seekers-text-muted)' }}>
                    Filter By:
                  </span>

                  {/* Remote Eligibility Filter */}
                  <select
                    className="select-input"
                    style={{ minHeight: '36px', padding: '0.25rem 0.75rem', fontSize: '0.8125rem', width: 'auto' }}
                    value={filters.remote}
                    onChange={(e) => setFilters(prev => ({ ...prev, remote: e.target.value }))}
                  >
                    <option value="">Arrangement: All</option>
                    <option value="FULLY_REMOTE">Fully Remote</option>
                    <option value="HYBRID">Hybrid</option>
                    <option value="ON_SITE">On-Site</option>
                  </select>

                  {/* Seniority Filter */}
                  <select
                    className="select-input"
                    style={{ minHeight: '36px', padding: '0.25rem 0.75rem', fontSize: '0.8125rem', width: 'auto' }}
                    value={filters.seniority}
                    onChange={(e) => setFilters(prev => ({ ...prev, seniority: e.target.value }))}
                  >
                    <option value="">Seniority: All</option>
                    <option value="ENTRY">Entry Level</option>
                    <option value="MID">Mid Level</option>
                    <option value="SENIOR">Senior</option>
                    <option value="LEAD">Lead / Architect</option>
                  </select>

                  {/* Job Type Filter */}
                  <select
                    className="select-input"
                    style={{ minHeight: '36px', padding: '0.25rem 0.75rem', fontSize: '0.8125rem', width: 'auto' }}
                    value={filters.jobType}
                    onChange={(e) => setFilters(prev => ({ ...prev, jobType: e.target.value }))}
                  >
                    <option value="">Type: All</option>
                    <option value="FULL_TIME">Full Time</option>
                    <option value="CONTRACT">Contract</option>
                  </select>
                </div>

                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--seekers-text-muted)' }}>Sort:</span>
                  <select
                    className="select-input"
                    style={{ minHeight: '36px', padding: '0.25rem 0.75rem', fontSize: '0.8125rem', width: 'auto' }}
                    value={filters.sort}
                    onChange={(e) => setFilters(prev => ({ ...prev, sort: e.target.value as 'recent' | 'relevance' }))}
                  >
                    <option value="recent">Most Recent</option>
                    <option value="relevance">Relevance</option>
                  </select>

                  {(filters.q || activeFilterCount > 0) && (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={handleResetFilters}
                      style={{ fontSize: '0.8125rem', minHeight: '36px', padding: '0.25rem 0.5rem' }}
                    >
                      Clear All ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Active Filter Chips */}
              {(filters.q || activeFilterCount > 0) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)' }}>Active Filters:</span>
                  {filters.q && (
                    <span className="badge badge-amber">
                      Query: &quot;{filters.q}&quot;
                      <button
                        type="button"
                        onClick={() => {
                          setFilters(prev => ({ ...prev, q: '' }));
                          setSearchInput('');
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: '0.25rem' }}
                      >
                        ✕
                      </button>
                    </span>
                  )}
                  {filters.location && (
                    <span className="badge badge-amber">
                      Location: {filters.location}
                      <button
                        type="button"
                        onClick={() => setFilters(prev => ({ ...prev, location: '' }))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: '0.25rem' }}
                      >
                        ✕
                      </button>
                    </span>
                  )}
                  {filters.remote && (
                    <span className="badge badge-amber">
                      {filters.remote}
                      <button
                        type="button"
                        onClick={() => setFilters(prev => ({ ...prev, remote: '' }))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: '0.25rem' }}
                      >
                        ✕
                      </button>
                    </span>
                  )}
                  {filters.seniority && (
                    <span className="badge badge-amber">
                      {filters.seniority}
                      <button
                        type="button"
                        onClick={() => setFilters(prev => ({ ...prev, seniority: '' }))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: '0.25rem' }}
                      >
                        ✕
                      </button>
                    </span>
                  )}
                </div>
              )}

              {/* Results Count Summary */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1rem',
                fontSize: '0.875rem',
                color: 'var(--seekers-text-secondary)'
              }}>
                <div>
                  Showing <strong style={{ color: 'var(--seekers-text-primary)' }}>{filteredJobs.length}</strong> role{filteredJobs.length !== 1 ? 's' : ''}
                  {filters.q && <span> for &quot;{filters.q}&quot;</span>}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)' }}>
                  South Asia Engineering Catalog (12 listings)
                </div>
              </div>

              {/* Job Listings Feed */}
              {filteredJobs.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">🔎</div>
                  <div className="empty-title">No listings match your criteria</div>
                  <div className="empty-desc">
                    Try clearing one or more filters or broadening your search terms across tech stacks.
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
                <h1 style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '1.35rem',
                  fontWeight: 700,
                  color: 'var(--seekers-text-primary)'
                }}>
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
              profile={profile}
              onUpdateProfile={setProfile}
              onOpenDataControl={() => setIsDataControlOpen(true)}
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

      {/* 3. Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onLoginSuccess={(name) => {
          setCandidateName(name);
          setActiveTab('discover');
        }}
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
        profile={profile}
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
