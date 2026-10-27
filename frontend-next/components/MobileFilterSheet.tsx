'use client';

import React, { useEffect, useRef } from 'react';

export interface FilterState {
  q: string;
  location: string;
  remote: string;
  seniority: string;
  jobType: string;
  minSalary: number;
  sort: 'recent' | 'relevance';
}

interface MobileFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterState;
  onFilterChange: (newFilters: FilterState) => void;
  onReset: () => void;
  totalFilteredCount: number;
}

export default function MobileFilterSheet({
  isOpen,
  onClose,
  filters,
  onFilterChange,
  onReset,
  totalFilteredCount
}: MobileFilterSheetProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    closeBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="bottom-sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Filter Jobs"
    >
      <div className="bottom-sheet-content">
        
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.25rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid var(--seekers-border-subtle)'
        }}>
          <h2 style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '1.15rem',
            fontWeight: 700,
            color: 'var(--seekers-text-primary)'
          }}>
            Filter Listings
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn-ghost"
              onClick={onReset}
              style={{ fontSize: '0.8125rem', padding: '0.25rem 0.5rem', minHeight: '36px' }}
            >
              Reset All
            </button>
            <button
              ref={closeBtnRef}
              type="button"
              className="btn-ghost"
              onClick={onClose}
              aria-label="Close filters"
              style={{ width: '36px', height: '36px', minHeight: '36px', padding: 0 }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Location */}
          <div className="form-group">
            <label className="form-label" htmlFor="m-filter-location">Location</label>
            <select
              id="m-filter-location"
              className="select-input"
              value={filters.location}
              onChange={(e) => onFilterChange({ ...filters, location: e.target.value })}
            >
              <option value="">All Locations (South Asia)</option>
              <option value="Dhaka">Dhaka (Gulshan, Banani, Dhanmondi, Tejgaon)</option>
              <option value="Chattogram">Chattogram</option>
              <option value="Remote">Remote Only</option>
            </select>
          </div>

          {/* Remote Policy */}
          <div className="form-group">
            <label className="form-label" htmlFor="m-filter-remote">Remote Eligibility</label>
            <select
              id="m-filter-remote"
              className="select-input"
              value={filters.remote}
              onChange={(e) => onFilterChange({ ...filters, remote: e.target.value })}
            >
              <option value="">Any Work Arrangement</option>
              <option value="FULLY_REMOTE">Fully Remote</option>
              <option value="HYBRID">Hybrid</option>
              <option value="ON_SITE">On-Site</option>
            </select>
          </div>

          {/* Seniority */}
          <div className="form-group">
            <label className="form-label" htmlFor="m-filter-seniority">Seniority Level</label>
            <select
              id="m-filter-seniority"
              className="select-input"
              value={filters.seniority}
              onChange={(e) => onFilterChange({ ...filters, seniority: e.target.value })}
            >
              <option value="">Any Experience Level</option>
              <option value="ENTRY">Entry Level</option>
              <option value="MID">Mid Level</option>
              <option value="SENIOR">Senior Level</option>
              <option value="LEAD">Lead / Architect</option>
            </select>
          </div>

          {/* Job Type */}
          <div className="form-group">
            <label className="form-label" htmlFor="m-filter-type">Employment Type</label>
            <select
              id="m-filter-type"
              className="select-input"
              value={filters.jobType}
              onChange={(e) => onFilterChange({ ...filters, jobType: e.target.value })}
            >
              <option value="">Any Job Type</option>
              <option value="FULL_TIME">Full Time</option>
              <option value="CONTRACT">Contract</option>
              <option value="INTERNSHIP">Internship</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="form-group">
            <label className="form-label" htmlFor="m-filter-sort">Sort Listings By</label>
            <select
              id="m-filter-sort"
              className="select-input"
              value={filters.sort}
              onChange={(e) => onFilterChange({ ...filters, sort: e.target.value as 'recent' | 'relevance' })}
            >
              <option value="recent">Most Recent First</option>
              <option value="relevance">Highest Relevance</option>
            </select>
          </div>

        </div>

        {/* Footer Apply Button */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--seekers-border-subtle)' }}>
          <button
            type="button"
            className="btn-primary"
            onClick={onClose}
            style={{ width: '100%', minHeight: '48px', fontSize: '1rem' }}
          >
            Show {totalFilteredCount} Result{totalFilteredCount !== 1 ? 's' : ''}
          </button>
        </div>

      </div>
    </div>
  );
}
