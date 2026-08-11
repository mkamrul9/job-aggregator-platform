'use client';

import { useState } from 'react';

interface Job {
  title: string;
  company: string;
  url: string;
  raw_description?: string;
}

export default function JobSearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchTerm)}`);
      const data = await response.json();
      if (data.jobs) setJobs(data.jobs);
    } catch (error) {
      console.error('Failed to fetch jobs', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="card-title">
        <div className="card-icon">🔍</div>
        Search Roles
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="search-bar">
        <input
          type="text"
          placeholder="Role, skill, or company — e.g. "React Engineer""
          className="s-input"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          id="job-search-input"
        />
        <button
          type="submit"
          disabled={loading}
          className="btn-amber"
          id="job-search-btn"
        >
          {loading ? (
            <span className="loading-pulse">...</span>
          ) : (
            <>
              Search
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </>
          )}
        </button>
      </form>

      {/* Results */}
      {loading && (
        <div className="empty-state">
          <div className="loading-pulse" style={{ fontSize: '1.5rem' }}>⏳</div>
          <span>Searching across all sources...</span>
        </div>
      )}

      {!loading && jobs.length > 0 && (
        <>
          <div className="section-label">
            {jobs.length} result{jobs.length !== 1 ? 's' : ''} for "{searchTerm}"
          </div>
          <div className="jobs-list">
            {jobs.map((job, i) => (
              <div key={i} className="job-card fade-up" style={{ animationDelay: `${i * 0.04}s` }}>
                <div className="job-card-header">
                  <div className="job-card-title">{job.title}</div>
                  <span className="job-card-badge">New</span>
                </div>
                <div className="job-card-company">@ {job.company}</div>
                <div className="job-card-desc">
                  {job.raw_description || 'No description available.'}
                </div>
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="job-card-link"
                  id={`apply-btn-${i}`}
                >
                  View & Apply
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </a>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && jobs.length === 0 && searchTerm && (
        <div className="empty-state">
          <div className="empty-state-icon">🔎</div>
          <strong style={{ color: 'var(--text-secondary)' }}>No results found</strong>
          <span>Try a different keyword or broaden your search.</span>
        </div>
      )}

      {!loading && jobs.length === 0 && !searchTerm && (
        <div className="empty-state">
          <div className="empty-state-icon">✦</div>
          <strong style={{ color: 'var(--text-secondary)' }}>Start your search</strong>
          <span>Enter a role, skill, or company above to find live openings.</span>
        </div>
      )}
    </div>
  );
}
