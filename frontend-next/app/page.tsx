'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Navbar, { ActiveTab } from '../components/Navbar';
import JobCard from '../components/JobCard';
import JobDetailDrawer from '../components/JobDetailDrawer';
import MobileFilterSheet, { FilterState } from '../components/MobileFilterSheet';
import ApplicationsWorkspace from '../components/ApplicationsWorkspace';
import AlertsWorkspace from '../components/AlertsWorkspace';
import ProfileWorkspace from '../components/ProfileWorkspace';
import RecommendationsWorkspace from '../components/RecommendationsWorkspace';
import {
  computeDemoRecommendations,
  RecommendedJob,
  CandidateMatchingInput,
} from '../lib/recommendation-adapter';
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
  SavedSearchItem,
} from '../lib/mock-data';
import { formatSalary } from '../components/JobCard';

type SearchState = 'idle' | 'loading' | 'success' | 'empty' | 'error';

interface ApiSavedJobItem {
  id?: string;
  job_id?: string;
  title: string;
  company: string;
  location?: string;
  remote_eligibility?: string;
  job_type?: string;
  seniority?: string;
  salary?: JobSummary['salary'];
  skills?: string[];
  source?: string;
  saved_at?: string;
  published_at?: string;
}

interface ApiTrackedAppItem {
  id: string;
  job_id: string;
  job_summary?: {
    title?: string;
    company?: string;
    location?: string;
    remote_eligibility?: JobSummary['remote_eligibility'];
    job_type?: JobSummary['job_type'];
    seniority?: JobSummary['seniority'];
    salary?: JobSummary['salary'];
    skills?: string[];
    source?: string;
  };
  applied_at?: string;
  status: TrackedApplication['status'];
  notes?: string;
  version?: number;
  history?: TrackedApplication['history'];
  updated_at?: string;
}

function CandidatePortalContent() {
  const searchParams = useSearchParams();
  const { user, token, profile, isDemo: isAuthDemo } = useAuth();

  // Recommendations State
  const [liveRecommendations, setLiveRecommendations] = useState<RecommendedJob[]>([]);
  const [liveIsColdStart, setLiveIsColdStart] = useState<boolean>(false);
  const [isLoadingRecs, setIsLoadingRecs] = useState<boolean>(false);
  const [recsError, setRecsError] = useState<string | null>(null);
  const [dismissedJobIds, setDismissedJobIds] = useState<Set<string>>(new Set());
  const [undoDismissJob, setUndoDismissJob] = useState<{ id: string; title: string } | null>(null);

  // Navigation State
  const [activeTab, setActiveTab] = useState<ActiveTab>('discover');

  // Demo Mode state: explicit toggle override or derived from URL/Auth state
  const [demoOverride, setDemoOverride] = useState<boolean | null>(null);
  const isDemoMode = demoOverride !== null ? demoOverride : (searchParams.get('demo') === 'true' || isAuthDemo);

  // Candidate Data State (Workspaces) - isolate live from synthetic fixtures
  const [savedJobs, setSavedJobs] = useState<JobSummary[]>(() =>
    isDemoMode ? INITIAL_SAVED_JOBS : [],
  );
  const [applications, setApplications] = useState<TrackedApplication[]>(() =>
    isDemoMode ? INITIAL_TRACKED_APPLICATIONS : [],
  );
  const [alerts, setAlerts] = useState<AlertSubscription[]>(() =>
    isDemoMode ? INITIAL_ALERT_SUBSCRIPTIONS : [],
  );
  const [savedSearches, setSavedSearches] = useState<SavedSearchItem[]>([]);
  const [isSavingSearch, setIsSavingSearch] = useState(false);
  const [savedSearchMsg, setSavedSearchMsg] = useState<string | null>(null);

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
  const [liveJobs, setLiveJobs] = useState<JobSummary[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modal / Drawer States
  const [selectedJob, setSelectedJob] = useState<(JobDetail | JobSummary) | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailAbortControllerRef = useRef<AbortController | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [reportingJob, setReportingJob] = useState<(JobDetail | JobSummary) | null>(null);
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
      if (filters.minSalary > 0) queryParams.set('min_salary', String(filters.minSalary));

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
        const items: JobSummary[] = (data.items || []).map((item: JobSummary) => {
          if (item.expires_at) {
            item.is_expired = new Date(item.expires_at).getTime() <= Date.now();
          }
          return item;
        });
        setLiveJobs(items);
        setTotalCount(data.total_count || 0);
        setNextCursor(data.next_cursor || null);
        setSearchState(items.length === 0 ? 'empty' : 'success');
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

  // Load authenticated candidate workspace data (Saved Jobs, Applications, Alerts, Searches)
  useEffect(() => {
    if (isDemoMode || !user || !token) {
      return;
    }

    let isMounted = true;
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };

    // 1. Saved Jobs
    fetch('/api/v1/users/saved-jobs', { headers: authHeaders })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.items) {
          const mapped: JobSummary[] = data.items.map((item: ApiSavedJobItem) => ({
            id: item.id || item.job_id || '',
            title: item.title,
            company: item.company,
            location: item.location || '',
            remote_eligibility: (item.remote_eligibility as JobSummary['remote_eligibility']) || 'UNSPECIFIED',
            job_type: (item.job_type as JobSummary['job_type']) || 'UNSPECIFIED',
            seniority: (item.seniority as JobSummary['seniority']) || 'UNSPECIFIED',
            salary: item.salary,
            skills: item.skills || [],
            source: item.source || 'platform',
            published_at: item.saved_at || item.published_at || new Date().toISOString(),
          }));
          setSavedJobs(mapped);
        }
      })
      .catch(() => {});

    // 2. Tracked Applications
    fetch('/api/v1/users/applications', { headers: authHeaders })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.items) {
          const mapped: TrackedApplication[] = data.items.map((app: ApiTrackedAppItem) => ({
            id: app.id,
            job_id: app.job_id,
            job_summary: {
              id: app.job_id,
              title: app.job_summary?.title || 'Job Listing',
              company: app.job_summary?.company || 'Company',
              location: app.job_summary?.location || '',
              remote_eligibility: app.job_summary?.remote_eligibility || 'UNSPECIFIED',
              job_type: app.job_summary?.job_type || 'UNSPECIFIED',
              seniority: app.job_summary?.seniority || 'UNSPECIFIED',
              salary: app.job_summary?.salary,
              skills: app.job_summary?.skills || [],
              source: app.job_summary?.source || 'platform',
              published_at: app.applied_at,
            },
            status: app.status,
            notes: app.notes || '',
            version: app.version,
            history: app.history || [],
            applied_at: app.applied_at,
            updated_at: app.updated_at,
          }));
          setApplications(mapped);
        }
      })
      .catch(() => {});

    // 3. Alerts
    fetch('/api/v1/users/alerts', { headers: authHeaders })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && Array.isArray(data)) {
          setAlerts(data);
        }
      })
      .catch(() => {});

    // 4. Saved Searches
    fetch('/api/v1/users/saved-searches', { headers: authHeaders })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.items) {
          setSavedSearches(data.items);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
    // 5. Recommendations
    setIsLoadingRecs(true);
    setRecsError(null);
    fetch('/api/v1/users/recommendations?limit=20', { headers: authHeaders })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load recommendations (HTTP ${res.status})`);
        }
        return res.json();
      })
      .then((data) => {
        if (isMounted && data?.items) {
          setLiveRecommendations(data.items);
          setLiveIsColdStart(Boolean(data.is_cold_start));
          setIsLoadingRecs(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          const msg =
            err instanceof Error
              ? err.message
              : 'Could not load recommendations.';
          setRecsError(msg);
          setIsLoadingRecs(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isDemoMode, user, token, profile]);

  // Derive Demo Mode Recommendations via useMemo without side effects
  const demoRecsResult = useMemo(() => {
    if (!isDemoMode) return { items: [] as RecommendedJob[], isColdStart: false };
    const demoCandidate: CandidateMatchingInput = {
      skills: profile?.skills || [],
      title: profile?.title || null,
      locations: profile?.preferences?.locations || [],
      remotePreference:
        profile?.preferences?.remote_preference || 'UNSPECIFIED',
      minSalary: profile?.preferences?.min_salary || null,
      currency: profile?.preferences?.currency || 'BDT',
    };
    return computeDemoRecommendations(
      demoCandidate,
      SYNTHETIC_JOBS,
      dismissedJobIds,
    );
  }, [isDemoMode, profile, dismissedJobIds]);

  const effectiveRecommendations = useMemo(() => {
    if (isDemoMode) return demoRecsResult.items;
    if (!user) return [];
    return liveRecommendations;
  }, [isDemoMode, user, demoRecsResult.items, liveRecommendations]);

  const effectiveIsColdStart = useMemo(() => {
    if (isDemoMode) return demoRecsResult.isColdStart;
    if (!user) return false;
    return liveIsColdStart;
  }, [isDemoMode, user, demoRecsResult.isColdStart, liveIsColdStart]);

  // Effective candidate workspace collections (strictly unauthenticated/live = empty)
  const effectiveSavedJobs = useMemo(
    () => (!isDemoMode && !user ? [] : savedJobs),
    [isDemoMode, user, savedJobs],
  );
  const effectiveApplications = useMemo(
    () => (!isDemoMode && !user ? [] : applications),
    [isDemoMode, user, applications],
  );
  const effectiveAlerts = useMemo(
    () => (!isDemoMode && !user ? [] : alerts),
    [isDemoMode, user, alerts],
  );
  const effectiveSavedSearches = useMemo(
    () => (!isDemoMode && !user ? [] : savedSearches),
    [isDemoMode, user, savedSearches],
  );

  // Active listings for display
  const displayedJobs = isDemoMode ? demoFilteredJobs : liveJobs;
  const effectiveTotalCount = isDemoMode ? demoFilteredJobs.length : totalCount;
  const effectiveSearchState: SearchState = isDemoMode
    ? (demoFilteredJobs.length === 0 ? 'empty' : 'success')
    : searchState;

  // Saved Jobs Set for fast lookup
  const savedJobIds = useMemo(() => new Set(effectiveSavedJobs.map((j) => j.id)), [effectiveSavedJobs]);
  const trackedJobIds = useMemo(() => new Set(effectiveApplications.map((a) => a.job_id)), [effectiveApplications]);

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

  const handleSelectJob = useCallback((job: JobDetail | JobSummary) => {
    if (detailAbortControllerRef.current) {
      detailAbortControllerRef.current.abort();
      detailAbortControllerRef.current = null;
    }

    setSelectedJob(job);

    if (isDemoMode) {
      const demoMatch = SYNTHETIC_JOBS.find((s) => s.id === job.id);
      if (demoMatch) {
        setSelectedJob(demoMatch);
      }
      setIsLoadingDetail(false);
      setDetailError(null);
      return;
    }

    if ('description' in job && (job as JobDetail).description) {
      setIsLoadingDetail(false);
      setDetailError(null);
      return;
    }

    setIsLoadingDetail(true);
    setDetailError(null);

    const controller = new AbortController();
    detailAbortControllerRef.current = controller;

    fetch(`/api/v1/jobs/${job.id}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load details (HTTP ${res.status})`);
        }
        const detail: JobDetail = await res.json();
        detail.is_expired =
          detail.status === 'EXPIRED' ||
          Boolean(detail.expires_at && new Date(detail.expires_at).getTime() <= Date.now());
        setSelectedJob(detail);
        setIsLoadingDetail(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setDetailError(err instanceof Error ? err.message : 'Failed to load details');
        setIsLoadingDetail(false);
      });
  }, [isDemoMode]);

  const handleCloseDrawer = useCallback(() => {
    if (detailAbortControllerRef.current) {
      detailAbortControllerRef.current.abort();
      detailAbortControllerRef.current = null;
    }
    setSelectedJob(null);
    setIsLoadingDetail(false);
    setDetailError(null);
  }, []);

  const handleRetryDetail = useCallback(() => {
    if (selectedJob) {
      handleSelectJob(selectedJob);
    }
  }, [selectedJob, handleSelectJob]);

  const handleToggleSave = async (e: React.MouseEvent, job: JobDetail | JobSummary) => {
    e.stopPropagation();

    if (!isDemoMode && !user) {
      setIsAuthOpen(true);
      return;
    }

    const isAlreadySaved = savedJobIds.has(job.id);

    if (isDemoMode) {
      if (isAlreadySaved) {
        setSavedJobs((prev) => prev.filter((j) => j.id !== job.id));
      } else {
        const summary: JobSummary = {
          id: job.id,
          title: job.title,
          company: job.company,
          location: job.location,
          remote_eligibility: job.remote_eligibility,
          job_type: job.job_type,
          seniority: job.seniority,
          salary: job.salary,
          skills: job.skills,
          source: job.source,
          published_at: job.published_at,
        };
        setSavedJobs((prev) => [summary, ...prev]);
      }
      return;
    }

    // Live mode
    if (isAlreadySaved) {
      setSavedJobs((prev) => prev.filter((j) => j.id !== job.id));
      try {
        const res = await fetch(`/api/v1/users/saved-jobs/${job.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok && res.status !== 404) {
          throw new Error('Failed to unsave job');
        }
      } catch {
        // Rollback
        setSavedJobs((prev) => [job as JobSummary, ...prev]);
        alert('Failed to unsave job. Please try again.');
      }
    } else {
      const summary: JobSummary = {
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        remote_eligibility: job.remote_eligibility,
        job_type: job.job_type,
        seniority: job.seniority,
        salary: job.salary,
        skills: job.skills,
        source: job.source,
        published_at: job.published_at,
      };
      setSavedJobs((prev) => [summary, ...prev]);
      try {
        const res = await fetch(`/api/v1/users/saved-jobs/${job.id}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: job.title,
            company: job.company,
            location: job.location,
            salary: job.salary ? formatSalary(job.salary) : undefined,
            job_url: (job as JobDetail).canonical_url || undefined,
          }),
        });
        if (!res.ok) {
          throw new Error('Failed to save job');
        }
      } catch {
        // Rollback
        setSavedJobs((prev) => prev.filter((j) => j.id !== job.id));
        alert('Failed to save job to server. Please try again.');
      }
    }
  };

  const handleTrackApplication = async (job: JobDetail | JobSummary) => {
    if (trackedJobIds.has(job.id)) return;

    if (!isDemoMode && !user) {
      setIsAuthOpen(true);
      return;
    }

    const summary: JobSummary = {
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      remote_eligibility: job.remote_eligibility,
      job_type: job.job_type,
      seniority: job.seniority,
      salary: job.salary,
      skills: job.skills,
      source: job.source,
      published_at: job.published_at,
    };

    if (isDemoMode) {
      const newApp: TrackedApplication = {
        id: `app_track_${Date.now()}`,
        job_id: job.id,
        job_summary: summary,
        status: 'APPLIED',
        notes: 'Tracked directly from job discovery.',
        version: 1,
        history: [
          {
            status: 'APPLIED',
            notes: 'Tracked directly from job discovery.',
            changed_at: new Date().toISOString(),
          },
        ],
        applied_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setApplications((prev) => [newApp, ...prev]);
      return;
    }

    // Live mode
    try {
      const res = await fetch('/api/v1/users/applications', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          job_id: job.id,
          status: 'APPLIED',
          notes: 'Tracked directly from job discovery.',
          title: job.title,
          company: job.company,
          location: job.location,
          salary: job.salary ? formatSalary(job.salary) : undefined,
          job_url: (job as JobDetail).canonical_url || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || 'Failed to track application');
      }

      const created = await res.json();
      const mappedApp: TrackedApplication = {
        id: created.id,
        job_id: created.job_id,
        job_summary: {
          id: created.job_id,
          title: created.job_summary?.title || job.title,
          company: created.job_summary?.company || job.company,
          location: created.job_summary?.location || job.location,
          remote_eligibility:
            created.job_summary?.remote_eligibility || job.remote_eligibility,
          job_type: created.job_summary?.job_type || job.job_type,
          seniority: created.job_summary?.seniority || job.seniority,
          salary: created.job_summary?.salary || job.salary,
          skills: created.job_summary?.skills || job.skills,
          source: created.job_summary?.source || job.source,
          published_at: created.applied_at,
        },
        status: created.status,
        notes: created.notes || '',
        version: created.version,
        history: created.history || [],
        applied_at: created.applied_at,
        updated_at: created.updated_at,
      };
      setApplications((prev) => [mappedApp, ...prev]);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Error tracking application';
      alert(msg);
    }
  };

  const handleUpdateAppStatus = async (
    id: string,
    status: TrackedApplication['status'],
    currentVersion?: number,
  ) => {
    if (isDemoMode) {
      setApplications((prev) =>
        prev.map((app) =>
          app.id === id
            ? {
                ...app,
                status,
                version: (app.version || 1) + 1,
                history: [
                  ...(app.history || []),
                  {
                    status,
                    notes: `Status changed to ${status}`,
                    changed_at: new Date().toISOString(),
                  },
                ],
                updated_at: new Date().toISOString(),
              }
            : app,
        ),
      );
      return;
    }

    if (!token) return;

    try {
      const res = await fetch(`/api/v1/users/applications/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status,
          expected_version: currentVersion,
        }),
      });

      if (res.status === 409) {
        alert(
          'This application record was modified concurrently in another window. Refreshing latest state...',
        );
        const refreshRes = await fetch('/api/v1/users/applications', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          if (data?.items) {
            setApplications(
              data.items.map((app: ApiTrackedAppItem) => ({
                id: app.id,
                job_id: app.job_id,
                job_summary: {
                  id: app.job_id,
                  title: app.job_summary?.title || 'Job Listing',
                  company: app.job_summary?.company || 'Company',
                  location: app.job_summary?.location || '',
                  remote_eligibility:
                    app.job_summary?.remote_eligibility || 'UNSPECIFIED',
                  job_type: app.job_summary?.job_type || 'UNSPECIFIED',
                  seniority: app.job_summary?.seniority || 'UNSPECIFIED',
                  salary: app.job_summary?.salary,
                  skills: app.job_summary?.skills || [],
                  source: app.job_summary?.source || 'platform',
                  published_at: app.applied_at,
                },
                status: app.status,
                notes: app.notes || '',
                version: app.version,
                history: app.history || [],
                applied_at: app.applied_at,
                updated_at: app.updated_at,
              })),
            );
          }
        }
        return;
      }

      if (res.ok) {
        const updated = await res.json();
        setApplications((prev) =>
          prev.map((app) =>
            app.id === id
              ? {
                  ...app,
                  status: updated.status,
                  version: updated.version,
                  history: updated.history || app.history,
                  updated_at: updated.updated_at,
                }
              : app,
          ),
        );
      }
    } catch {
      alert('Network error updating application status.');
    }
  };

  const handleUpdateAppNotes = async (
    id: string,
    notes: string,
    currentVersion?: number,
  ) => {
    if (isDemoMode) {
      setApplications((prev) =>
        prev.map((app) =>
          app.id === id
            ? {
                ...app,
                notes,
                version: (app.version || 1) + 1,
                updated_at: new Date().toISOString(),
              }
            : app,
        ),
      );
      return;
    }

    if (!token) return;

    try {
      const res = await fetch(`/api/v1/users/applications/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notes,
          expected_version: currentVersion,
        }),
      });

      if (res.status === 409) {
        alert(
          'This application record was modified concurrently. Please refresh.',
        );
        return;
      }

      if (res.ok) {
        const updated = await res.json();
        setApplications((prev) =>
          prev.map((app) =>
            app.id === id
              ? {
                  ...app,
                  notes: updated.notes,
                  version: updated.version,
                  history: updated.history || app.history,
                  updated_at: updated.updated_at,
                }
              : app,
          ),
        );
      }
    } catch {
      alert('Network error saving notes.');
    }
  };

  const handleRemoveApplication = async (id: string) => {
    const existing = applications.find((a) => a.id === id);
    setApplications((prev) => prev.filter((app) => app.id !== id));

    if (!isDemoMode && token) {
      try {
        const res = await fetch(`/api/v1/users/applications/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok && res.status !== 404) {
          throw new Error('Failed to remove application');
        }
      } catch {
        if (existing) {
          setApplications((prev) => [existing, ...prev]);
        }
        alert('Failed to delete application from server.');
      }
    }
  };

  const handleToggleAlertActive = async (id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, active: !a.active } : a)),
    );
    if (!isDemoMode && token) {
      try {
        await fetch(`/api/v1/users/alerts/${id}/toggle`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // ignore
      }
    }
  };

  const handleDeleteAlert = async (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    if (!isDemoMode && token) {
      try {
        await fetch(`/api/v1/users/alerts/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // ignore
      }
    }
  };

  const handleCreateAlert = async (
    newAlertData: Omit<AlertSubscription, 'id' | 'created_at'>,
  ) => {
    if (isDemoMode) {
      const newAlert: AlertSubscription = {
        ...newAlertData,
        id: `alert_${Date.now()}`,
        created_at: new Date().toISOString(),
      };
      setAlerts((prev) => [newAlert, ...prev]);
      return;
    }

    if (!token) {
      setIsAuthOpen(true);
      return;
    }

    try {
      const res = await fetch('/api/v1/users/alerts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newAlertData),
      });
      if (res.ok) {
        const created = await res.json();
        setAlerts((prev) => [created, ...prev]);
      }
    } catch {
      alert('Failed to create alert.');
    }
  };

  const handleSaveCurrentSearch = async () => {
    if (!isDemoMode && !user) {
      setIsAuthOpen(true);
      return;
    }

    const searchName = filters.q
      ? `${filters.q} (${filters.location || 'All Locations'})`
      : `${filters.location || 'All Locations'} Jobs`;

    if (isDemoMode) {
      const demoItem: SavedSearchItem = {
        id: `search_${Date.now()}`,
        name: searchName,
        query: filters.q,
        location: filters.location,
        remote_eligibility: filters.remote,
        seniority: filters.seniority,
        job_type: filters.jobType,
        alerts_enabled: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setSavedSearches((prev) => [demoItem, ...prev]);
      setSavedSearchMsg('Search saved to demo workspace!');
      setTimeout(() => setSavedSearchMsg(null), 3000);
      return;
    }

    setIsSavingSearch(true);
    try {
      const res = await fetch('/api/v1/users/saved-searches', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: searchName,
          query: filters.q || undefined,
          location: filters.location || undefined,
          remote_eligibility: filters.remote || undefined,
          seniority: filters.seniority || undefined,
          job_type: filters.jobType || undefined,
          alerts_enabled: false,
        }),
      });

      if (res.ok) {
        const saved = await res.json();
        setSavedSearches((prev) => [saved, ...prev]);
        setSavedSearchMsg('Search query saved to your workspace!');
        setTimeout(() => setSavedSearchMsg(null), 3000);
      }
    } catch {
      alert('Failed to save search.');
    } finally {
      setIsSavingSearch(false);
    }
  };

  const handleDismissRecommendation = useCallback(
    async (jobId: string, reason = 'NOT_INTERESTED') => {
      const targetJob = effectiveRecommendations.find((r) => r.id === jobId);
      setDismissedJobIds((prev) => new Set(prev).add(jobId));
      setLiveRecommendations((prev) => prev.filter((r) => r.id !== jobId));
      if (targetJob) {
        setUndoDismissJob({ id: jobId, title: targetJob.title });
      }

      if (!isDemoMode && user && token) {
        try {
          const res = await fetch(
            `/api/v1/users/recommendations/${jobId}/feedback`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ action: 'DISMISS', reason }),
            },
          );
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
        } catch {
          setDismissedJobIds((prev) => {
            const next = new Set(prev);
            next.delete(jobId);
            return next;
          });
          if (targetJob) {
            setLiveRecommendations((prev) => [targetJob, ...prev]);
          }
          setUndoDismissJob(null);
          alert(
            'Failed to dismiss recommendation on server. Restoring listing.',
          );
        }
      }
    },
    [effectiveRecommendations, isDemoMode, user, token],
  );

  const handleUndoDismissRecommendation = useCallback(
    async (jobId: string) => {
      setDismissedJobIds((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
      setUndoDismissJob(null);

      if (!isDemoMode && user && token) {
        try {
          const res = await fetch(
            `/api/v1/users/recommendations/${jobId}/feedback`,
            {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            },
          );
          if (!res.ok && res.status !== 404) {
            throw new Error(`HTTP ${res.status}`);
          }
          const recsRes = await fetch(
            '/api/v1/users/recommendations?limit=20',
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
              },
            },
          );
          if (recsRes.ok) {
            const data = await recsRes.json();
            if (data?.items) {
              setLiveRecommendations(data.items);
            }
          }
        } catch {
          setDismissedJobIds((prev) => new Set(prev).add(jobId));
          alert('Failed to undo dismissal on server.');
        }
      }
    },
    [isDemoMode, user, token],
  );

  const handleRetryRecs = useCallback(() => {
    if (isDemoMode || !user || !token) return;
    setIsLoadingRecs(true);
    setRecsError(null);
    fetch('/api/v1/users/recommendations?limit=20', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(
            `Failed to load recommendations (HTTP ${res.status})`,
          );
        }
        return res.json();
      })
      .then((data) => {
        if (data?.items) {
          setLiveRecommendations(data.items);
          setLiveIsColdStart(Boolean(data.is_cold_start));
          setIsLoadingRecs(false);
        }
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof Error
            ? err.message
            : 'Could not load recommendations.';
        setRecsError(msg);
        setIsLoadingRecs(false);
      });
  }, [isDemoMode, user, token]);

  const handleDeleteSavedSearch = async (searchId: string) => {
    setSavedSearches((prev) => prev.filter((s) => s.id !== searchId));
    if (!isDemoMode && token) {
      try {
        await fetch(`/api/v1/users/saved-searches/${searchId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // ignore
      }
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Navigation */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        savedCount={effectiveSavedJobs.length}
        applicationsCount={effectiveApplications.length}
        alertsCount={effectiveAlerts.length}
        recommendationsCount={effectiveRecommendations.length}
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

                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleSaveCurrentSearch}
                      disabled={isSavingSearch}
                      id="save-search-btn"
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                      title="Save this search query to your workspace"
                    >
                      ★ {isSavingSearch ? 'Saving...' : 'Save Search'}
                    </button>

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

                {savedSearchMsg && (
                  <div
                    style={{
                      backgroundColor: 'rgba(16, 185, 129, 0.1)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      color: 'var(--seekers-teal-400)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.4rem 0.75rem',
                      fontSize: '0.8125rem',
                      marginTop: '0.75rem',
                    }}
                    id="saved-search-toast"
                  >
                    {savedSearchMsg}
                  </div>
                )}
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
                        onSelect={handleSelectJob}
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
          {/* ─── TAB: RECOMMENDATIONS ─────────────────────────────────────── */}
          {activeTab === 'recommendations' && (
            <RecommendationsWorkspace
              recommendations={effectiveRecommendations}
              isColdStart={effectiveIsColdStart}
              isLoading={isLoadingRecs}
              error={recsError}
              savedJobIds={savedJobIds}
              onToggleSave={handleToggleSave}
              onTrackApplication={handleTrackApplication}
              onSelectJob={handleSelectJob}
              onDismiss={handleDismissRecommendation}
              undoDismissJob={undoDismissJob}
              onUndoDismiss={handleUndoDismissRecommendation}
              onGoToProfile={() => setActiveTab('profile')}
              onOpenAuth={() => setIsAuthOpen(true)}
              isAuthenticated={Boolean(user)}
              isDemoMode={isDemoMode}
              onRetry={handleRetryRecs}
            />
          )}

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
                  Saved Roles ({effectiveSavedJobs.length})
                </h1>
                <p style={{ fontSize: '0.875rem', color: 'var(--seekers-text-secondary)', marginTop: '0.2rem' }}>
                  Bookmarked listings saved for later review and application.
                </p>
              </div>

              {effectiveSavedSearches.length > 0 && (
                <div
                  style={{
                    backgroundColor: 'var(--seekers-surface-card)',
                    border: '1px solid var(--seekers-border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1rem',
                    marginBottom: '1.5rem',
                  }}
                  id="saved-searches-section"
                >
                  <h2
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: 'var(--seekers-text-primary)',
                      marginBottom: '0.5rem',
                    }}
                  >
                    Saved Search Queries ({effectiveSavedSearches.length})
                  </h2>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {effectiveSavedSearches.map((search) => (
                      <div
                        key={search.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          backgroundColor: 'var(--seekers-surface-raised)',
                          border: '1px solid var(--seekers-border-muted)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '0.35rem 0.65rem',
                          fontSize: '0.8125rem',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setFilters({
                              q: search.query || '',
                              location: search.location || '',
                              remote: search.remote_eligibility || '',
                              seniority: search.seniority || '',
                              jobType: search.job_type || '',
                              minSalary: 0,
                              sort: 'recent',
                            });
                            setCurrentCursor(null);
                            setSearchInput(search.query || '');
                            setActiveTab('discover');
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--seekers-teal-400)',
                            cursor: 'pointer',
                            padding: 0,
                            fontWeight: 500,
                            textAlign: 'left',
                          }}
                          title="Run this search"
                        >
                          🔍 {search.name || search.query || 'Custom Search'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSavedSearch(search.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--seekers-text-muted)',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            padding: '0 0.15rem',
                            lineHeight: 1,
                          }}
                          aria-label={`Delete saved search ${search.name}`}
                          title="Delete saved search"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {effectiveSavedJobs.length === 0 ? (
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
                  {effectiveSavedJobs.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job as JobDetail}
                      isSelected={selectedJob?.id === job.id}
                      isSaved={true}
                      onSelect={handleSelectJob}
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
              applications={effectiveApplications}
              onUpdateStatus={handleUpdateAppStatus}
              onUpdateNotes={handleUpdateAppNotes}
              onRemoveApplication={handleRemoveApplication}
              onSelectJob={handleSelectJob}
              onBrowseJobs={() => setActiveTab('discover')}
            />
          )}

          {/* ─── TAB 4: JOB ALERTS ──────────────────────────────────────── */}
          {activeTab === 'alerts' && (
            <AlertsWorkspace
              alerts={effectiveAlerts}
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
          isLoadingDetail={isLoadingDetail}
          detailError={detailError}
          onRetryDetail={handleRetryDetail}
          onClose={handleCloseDrawer}
          isSaved={savedJobIds.has(selectedJob.id)}
          onToggleSave={handleToggleSave}
          onTrackApplication={handleTrackApplication}
          isAlreadyTracked={trackedJobIds.has(selectedJob.id)}
          onReportListing={(j) => {
            setReportingJob(j);
            setIsFeedbackOpen(true);
          }}
          isDemoMode={isDemoMode}
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
