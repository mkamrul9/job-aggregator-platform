'use client';

import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
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
import { AuthProvider, useAuth } from '../lib/auth-context';
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

type SearchState = 'idle' | 'loading' | 'success' | 'empty' | 'error';

function CandidatePortalContent() {
  const searchParams = useSearchParams();
  const { isDemo: isAuthDemo } = useAuth();

  // Navigation State
  const [activeTab, setActiveTab] = useState<ActiveTab>('discover');

  // Candidate Data State (Workspaces)
  const [savedJobs, setSavedJobs] = useState<JobSummary[]>(INITIAL_SAVED_JOBS);
  const [applications, setApplications] = useState<TrackedApplication[]>(INITIAL_TRACKED_APPLICATIONS);
  const [alerts, setAlerts] = useState<AlertSubscription[]>(INITIAL_ALERT_SUBSCRIPTIONS);

  // Demo Mode state: explicit toggle override or derived from URL/Auth state
  const [demoOverride, setDemoOverride] = useState<boolean | null>(null);
  const isDemoMode = demoOverride !== null ? demoOverride : (searchParams.get('demo') === 'true' || isAuthDemo);

  // Search & Filter State from URL
  const [filters, setFilters] = useState<FilterState>({
    q: searchParams.get('q') || '',
    location: searchParams.get('location') || '',
    remote: searchParams.get('remote') || '',
    seniority: searchParams.get('seniority') || '',
    jobType: searchParams.get('jobType') || '',
    minSalary: parseInt(searchParams.get('minSalary') || '0', 10) || 0,
    sort: (searchParams.get('sort') as FilterState['sort']) || 'recent',
  });
  const [searchInput, setSearchInput] = useState(filters.q);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  // Pagination & Keyset Cursor State
  const [currentCursor, setCurrentCursor] = useState<string | null>(searchParams.get('cursor') || null);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Live API results and fetch state
  const [liveJobs, setLiveJobs] = useState<JobDetail[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);


  // Modal / Drawer States
  const [selectedJob, setSelectedJob] = useState<JobDetail | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [reportingJob, setReportingJob] = useState<JobDetail | null>(null);
  const [isDataControlOpen, setIsDataControlOpen] = useState(false);
  const [isDemoInfoOpen, setIsDemoInfoOpen] = useState(false);

  // Update browser URL query string to keep filters addressable
  const updateUrlParams = useCallback((newFilters: FilterState, cursor: string | null = null, demo: boolean = isDemoMode) => {
    const params = new URLSearchParams();
    if (newFilters.q) params.set('q', newFilters.q);
    if (newFilters.location) params.set('location', newFilters.location);
    if (newFilters.remote) params.set('remote', newFilters.remote);
    if (newFilters.seniority) params.set('seniority', newFilters.seniority);
    if (newFilters.jobType) params.set('jobType', newFilters.jobType);
    if (newFilters.minSalary > 0) params.set('minSalary', String(newFilters.minSalary));
    if (newFilters.sort && newFilters.sort !== 'recent') params.set('sort', newFilters.sort);
    if (cursor) params.set('cursor', cursor);
    if (demo) params.set('demo', 'true');

    const qs = params.toString();
    const newUrl = qs ? `/?${qs}` : '/';
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', newUrl);
    }
  }, [isDemoMode]);

  const [retryTrigger, setRetryTrigger] = useState(0);

  // Trigger search when in live mode using React 19 recommended async lifecycle
  useEffect(() => {
    if (isDemoMode) {
      return;
    }
    let ignore = false;
    const controller = new AbortController();

    async function load() {
      // Yield to next microtask so setState is not synchronous in effect body
      await Promise.resolve();
      if (ignore) return;

      setSearchState('loading');
      setErrorMessage(null);

      const queryParams = new URLSearchParams();
      if (filters.q) queryParams.set('q', filters.q);
      if (filters.location && filters.location !== 'All Locations') {
        queryParams.set('location', filters.location);
      }
      if (filters.remote) queryParams.set('remote_eligibility', filters.remote);
      if (filters.seniority) queryParams.set('seniority', filters.seniority);
      if (filters.jobType) queryParams.set('job_type', filters.jobType);

      if (filters.sort === 'salary') {
        queryParams.set('sort', 'salary_desc');
      } else if (filters.sort === 'relevance') {
        queryParams.set('sort', 'relevance');
      } else {
        queryParams.set('sort', 'date_desc');
      }

      queryParams.set('limit', '10');
      if (currentCursor) {
        queryParams.set('cursor', currentCursor);
      }

      try {
        const res = await fetch(`/api/v1/jobs?${queryParams.toString()}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });

        if (!res.ok) {
          const errorBody = await res.json().catch(() => null);
          throw new Error(errorBody?.detail || `Search API returned HTTP ${res.status}`);
        }

        const data = await res.json();
        if (ignore) return;
        setLiveJobs(data.items || []);
        setTotalCount(data.total_count || 0);
        setNextCursor(data.next_cursor || null);
        setSearchState((data.items || []).length === 0 ? 'empty' : 'success');
      } catch (err: unknown) {
        if (ignore || (err instanceof Error && err.name === 'AbortError')) return;
        console.error('Error fetching jobs from service-ingestion:', err);
        setSearchState('error');
        setErrorMessage(err instanceof Error ? err.message : 'Failed to reach search service');
      }
    }

    load();

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [isDemoMode, filters, currentCursor, retryTrigger]);

  // Synthetic local filtering when in Demo Mode
  const demoFilteredJobs = useMemo(() => {
    if (!isDemoMode) return [];
    return SYNTHETIC_JOBS.filter((job) => {
      if (filters.q) {
        const query = filters.q.toLowerCase();
        const matchesTitle = job.title.toLowerCase().includes(query);
        const matchesCompany = job.company.toLowerCase().includes(query);
        const matchesSkills = job.skills.some((s) => s.toLowerCase().includes(query));
        const matchesDesc = job.description.toLowerCase().includes(query);
        if (!matchesTitle && !matchesCompany && !matchesSkills && !matchesDesc) return false;
      }
      if (filters.location && filters.location !== 'All Locations') {
        if (!job.location.toLowerCase().includes(filters.location.toLowerCase())) {
          return false;
        }
      }
      if (filters.remote && job.remote_eligibility !== filters.remote) return false;
      if (filters.seniority && job.seniority !== filters.seniority) return false;
      if (filters.jobType && job.job_type !== filters.jobType) return false;
      return true;
    }).sort((a, b) => {
      if (filters.sort === 'recent') {
        return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
      }
      return 0;
    });
  }, [isDemoMode, filters]);

  // Active listings for display
  const displayedJobs = isDemoMode ? demoFilteredJobs : liveJobs;
  const effectiveTotalCount = isDemoMode ? demoFilteredJobs.length : totalCount;
  const effectiveSearchState: SearchState = isDemoMode
    ? (demoFilteredJobs.length === 0 ? 'empty' : 'success')
    : searchState;

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
    const updated = { ...filters, q: searchInput };
    setFilters(updated);
    setCurrentCursor(null);
    setCursorHistory([]);
    updateUrlParams(updated, null);
  };

  const handleFilterUpdate = (newFilters: FilterState) => {
    setFilters(newFilters);
    setCurrentCursor(null);
    setCursorHistory([]);
    updateUrlParams(newFilters, null);
  };

  const handleResetFilters = () => {
    const resetState: FilterState = {
      q: '',
      location: '',
      remote: '',
      seniority: '',
      jobType: '',
      minSalary: 0,
      sort: 'recent',
    };
    setFilters(resetState);
    setSearchInput('');
    setCurrentCursor(null);
    setCursorHistory([]);
    updateUrlParams(resetState, null);
  };

  const handleNextPage = () => {
    if (!nextCursor) return;
    setCursorHistory((prev) => [...prev, currentCursor || '']);
    setCurrentCursor(nextCursor);
    updateUrlParams(filters, nextCursor);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePrevPage = () => {
    if (cursorHistory.length === 0) return;
    const prevStack = [...cursorHistory];
    const prevCursor = prevStack.pop() || null;
    setCursorHistory(prevStack);
    setCurrentCursor(prevCursor);
    updateUrlParams(filters, prevCursor);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleDemoMode = () => {
    const nextMode = !isDemoMode;
    setDemoOverride(nextMode);
    setCurrentCursor(null);
    setCursorHistory([]);
    updateUrlParams(filters, null, nextMode);
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
              {/* Demo Mode / Live Mode Indicator Banner */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.6rem 1rem',
                  marginBottom: '1rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: isDemoMode ? 'rgba(245, 158, 11, 0.12)' : 'rgba(20, 184, 166, 0.1)',
                  border: isDemoMode ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(20, 184, 166, 0.25)',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.9rem' }}>{isDemoMode ? '⚡' : '🟢'}</span>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: isDemoMode ? 'var(--seekers-amber-400)' : 'var(--seekers-teal-400)' }}>
                    {isDemoMode
                      ? 'PORTFOLIO DEMO MODE: Browsing synthetic technology roles (OpenAPI 3.1 schema)'
                      : 'LIVE DISCOVERY: Connected to service-ingestion (MongoDB catalog & Elasticsearch)'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleToggleDemoMode}
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid currentColor',
                    color: isDemoMode ? 'var(--seekers-amber-400)' : 'var(--seekers-teal-400)',
                    padding: '0.2rem 0.6rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  id="toggle-demo-mode-btn"
                >
                  {isDemoMode ? 'Switch to Live API Mode ➔' : 'Explore Portfolio Demo ➔'}
                </button>
              </div>

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
                    <span style={{ fontSize: '0.8125rem', color: 'var(--seekers-text-muted)' }} id="results-count-label">
                      {effectiveSearchState === 'loading'
                        ? 'Searching vacancies...'
                        : `Showing ${displayedJobs.length} of ${effectiveTotalCount} active roles`}
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
                      id="mobile-filter-open-btn"
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
                  onChange={(e) => handleFilterUpdate({ ...filters, location: e.target.value })}
                  aria-label="Filter by location"
                  id="filter-location-select"
                >
                  <option value="">All Locations</option>
                  <option value="Dhaka">Dhaka, Bangladesh</option>
                  <option value="Chattogram">Chattogram, Bangladesh</option>
                  <option value="Remote">Regional Remote</option>
                </select>

                <select
                  className="filter-select"
                  value={filters.remote}
                  onChange={(e) => handleFilterUpdate({ ...filters, remote: e.target.value })}
                  aria-label="Filter by remote arrangement"
                  id="filter-remote-select"
                >
                  <option value="">Remote Arrangement</option>
                  <option value="FULLY_REMOTE">Fully Remote</option>
                  <option value="HYBRID">Hybrid</option>
                  <option value="ON_SITE">On-Site</option>
                </select>

                <select
                  className="filter-select"
                  value={filters.seniority}
                  onChange={(e) => handleFilterUpdate({ ...filters, seniority: e.target.value })}
                  aria-label="Filter by seniority level"
                  id="filter-seniority-select"
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
                  onChange={(e) => handleFilterUpdate({ ...filters, jobType: e.target.value })}
                  aria-label="Filter by employment type"
                  id="filter-jobtype-select"
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
                  onChange={(e) => handleFilterUpdate({ ...filters, sort: e.target.value as FilterState['sort'] })}
                  aria-label="Sort job listings"
                  id="filter-sort-select"
                >
                  <option value="recent">Most Recent (date_desc)</option>
                  <option value="salary">Highest Compensation (salary_desc)</option>
                  <option value="relevance">Most Relevant (relevance)</option>
                </select>
              </div>

              {/* Service Outage / Error State with Bounded Retry */}
              {!isDemoMode && searchState === 'error' && (
                <div
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1.5rem',
                    textAlign: 'center',
                    marginBottom: '1.5rem',
                  }}
                  id="search-error-banner"
                >
                  <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>⚠️</div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--seekers-danger)', marginBottom: '0.5rem' }}>
                    Unable to connect to job search service
                  </h3>
                  <p style={{ color: 'var(--seekers-text-secondary)', fontSize: '0.875rem', marginBottom: '1rem', maxWidth: '500px', margin: '0 auto 1rem' }}>
                    {errorMessage || 'The catalog service is temporarily unreachable or undergoing maintenance.'}
                  </p>
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setRetryTrigger((prev) => prev + 1)}
                      id="retry-search-btn"
                    >
                      ↻ Retry Search
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleToggleDemoMode}
                    >
                      View Local Demo Fixtures
                    </button>
                  </div>
                </div>
              )}

              {/* Loading State Skeleton */}
              {!isDemoMode && effectiveSearchState === 'loading' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }} id="search-loading-skeleton">
                  {[1, 2, 3].map((n) => (
                    <div
                      key={n}
                      style={{
                        padding: '1.25rem',
                        backgroundColor: 'var(--seekers-bg-surface)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--seekers-border-subtle)',
                        opacity: 0.6,
                      }}
                    >
                      <div style={{ height: '20px', width: '40%', backgroundColor: 'var(--seekers-bg-elevated)', borderRadius: '4px', marginBottom: '8px' }} />
                      <div style={{ height: '14px', width: '25%', backgroundColor: 'var(--seekers-bg-elevated)', borderRadius: '4px', marginBottom: '12px' }} />
                      <div style={{ height: '12px', width: '70%', backgroundColor: 'var(--seekers-bg-elevated)', borderRadius: '4px' }} />
                    </div>
                  ))}
                </div>
              )}

              {/* Empty Results State */}
              {effectiveSearchState === 'empty' && (
                <div className="empty-state" id="search-empty-state">
                  <div className="empty-icon">🔍</div>
                  <div className="empty-title">No listings match your criteria</div>
                  <div className="empty-desc">
                    Try broadening your search keywords or clearing location and seniority filters.
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleResetFilters}
                    id="reset-empty-filters-btn"
                  >
                    Reset All Filters
                  </button>
                </div>
              )}

              {/* Job Listings Feed */}
              {effectiveSearchState === 'success' && displayedJobs.length > 0 && (
                <div>
                  <div role="feed" aria-label="Job openings feed" id="jobs-feed">
                    {displayedJobs.map((job) => (
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

                  {/* Keyset Pagination Controls (Live Mode) */}
                  {!isDemoMode && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: '1.5rem',
                        paddingTop: '1rem',
                        borderTop: '1px solid var(--seekers-border-subtle)',
                      }}
                      id="pagination-controls"
                    >
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={cursorHistory.length === 0}
                        onClick={handlePrevPage}
                        style={{ opacity: cursorHistory.length === 0 ? 0.4 : 1, cursor: cursorHistory.length === 0 ? 'not-allowed' : 'pointer' }}
                        id="prev-page-btn"
                      >
                        ← Previous Page
                      </button>

                      <span style={{ fontSize: '0.8125rem', color: 'var(--seekers-text-muted)' }}>
                        Page {cursorHistory.length + 1}
                      </span>

                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={!nextCursor}
                        onClick={handleNextPage}
                        style={{ opacity: !nextCursor ? 0.4 : 1, cursor: !nextCursor ? 'not-allowed' : 'pointer' }}
                        id="next-page-btn"
                      >
                        Next Page →
                      </button>
                    </div>
                  )}
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
        onFilterChange={handleFilterUpdate}
        onReset={handleResetFilters}
        totalFilteredCount={effectiveTotalCount}
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
      <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: 'var(--seekers-bg-base)', padding: '2rem', color: 'var(--seekers-text-muted)' }}>Loading Seekers...</div>}>
        <CandidatePortalContent />
      </Suspense>
    </AuthProvider>
  );
}
