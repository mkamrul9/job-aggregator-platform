'use client';

import React, { useEffect, useRef } from 'react';
import { JobDetail } from '../lib/mock-data';
import { formatSalary, formatTimeAgo } from './JobCard';

interface JobDetailDrawerProps {
  job: JobDetail | null;
  onClose: () => void;
  isSaved: boolean;
  onToggleSave: (e: React.MouseEvent, job: JobDetail) => void;
  onTrackApplication: (job: JobDetail) => void;
  isAlreadyTracked: boolean;
  onReportListing: (job: JobDetail) => void;
}

export default function JobDetailDrawer({
  job,
  onClose,
  isSaved,
  onToggleSave,
  onTrackApplication,
  isAlreadyTracked,
  onReportListing
}: JobDetailDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Focus trap & Escape key dismiss
  useEffect(() => {
    if (!job) return;

    // Focus close button on mount
    closeBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [job, onClose]);

  if (!job) return null;

  const remoteLabel = {
    FULLY_REMOTE: 'Fully Remote',
    HYBRID: 'Hybrid Work (Dhaka)',
    ON_SITE: 'On-Site Requirement',
    UNSPECIFIED: 'Flexible Work Location'
  }[job.remote_eligibility];

  return (
    <div
      className="drawer-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-job-title"
    >
      <div className="drawer-panel" ref={drawerRef} tabIndex={-1}>
        
        {/* Drawer Header Controls */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1rem 1.5rem',
          borderBottom: '1px solid var(--seekers-border-subtle)',
          backgroundColor: 'var(--seekers-bg-elevated)',
          position: 'sticky',
          top: 0,
          zIndex: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="badge badge-success">
              {job.status} LISTING
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--seekers-text-muted)' }}>
              Posted {formatTimeAgo(job.published_at)}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              className={`btn-save-bookmark ${isSaved ? 'saved' : ''}`}
              onClick={(e) => onToggleSave(e, job)}
              aria-label={isSaved ? "Unsave role" : "Save role"}
              title={isSaved ? "Saved in workspace" : "Save role"}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill={isSaved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>

            <button
              ref={closeBtnRef}
              type="button"
              className="btn-ghost"
              onClick={onClose}
              aria-label="Close job details"
              style={{ minHeight: '36px', width: '36px', padding: 0 }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Drawer Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
          
          <h1 id="drawer-job-title" style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '1.35rem',
            fontWeight: 700,
            color: 'var(--seekers-text-primary)',
            marginBottom: '0.5rem'
          }}>
            {job.title}
          </h1>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.5rem 1rem',
            fontSize: '0.9375rem',
            color: 'var(--seekers-text-secondary)',
            marginBottom: '1.25rem'
          }}>
            <span style={{ fontWeight: 600, color: 'var(--seekers-text-primary)' }}>
              {job.company}
            </span>
            <span>•</span>
            <span>{job.location}</span>
            <span>•</span>
            <span style={{ color: 'var(--seekers-amber-400)', fontWeight: 600 }}>
              {formatSalary(job.salary)}
            </span>
          </div>

          {/* Quick Info Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '0.75rem',
            padding: '1rem',
            backgroundColor: 'var(--seekers-bg-surface)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--seekers-border-subtle)',
            marginBottom: '1.5rem'
          }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)', marginBottom: '0.2rem' }}>REMOTE POLICY</div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--seekers-text-primary)' }}>{remoteLabel}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)', marginBottom: '0.2rem' }}>EMPLOYMENT TYPE</div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--seekers-text-primary)' }}>{job.job_type.replace('_', ' ')}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)', marginBottom: '0.2rem' }}>EXPERIENCE LEVEL</div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--seekers-text-primary)' }}>{job.seniority}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)', marginBottom: '0.2rem' }}>ORIGINAL SOURCE</div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--seekers-amber-400)', fontFamily: 'var(--font-mono)' }}>{job.source}</div>
            </div>
          </div>

          {/* Outbound Application Action Bar */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            marginBottom: '1.5rem',
            backgroundColor: '#131b2c',
            border: '1px solid var(--seekers-amber-border)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem'
          }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {job.status === 'EXPIRED' ? (
                <button
                  type="button"
                  disabled
                  className="btn-primary"
                  style={{ flex: 1, minWidth: '180px', opacity: 0.5, cursor: 'not-allowed' }}
                >
                  Vacancy Closed
                </button>
              ) : (
                <a
                  href={`/api/v1/jobs/${job.id}/outbound`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                  style={{ flex: 1, minWidth: '180px' }}
                  id="outbound-apply-btn"
                >
                  Apply on Source
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                  </svg>
                </a>
              )}

              <a
                href={`/jobs/${job.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none' }}
                id="shareable-page-btn"
              >
                Permalink ↗
              </a>

              <button
                type="button"
                className={`btn-secondary ${isAlreadyTracked ? 'badge-success' : ''}`}
                onClick={() => onTrackApplication(job)}
                style={{ minWidth: '160px' }}
                id="track-application-btn"
              >
                {isAlreadyTracked ? (
                  <>
                    ✓ Tracked in Workspace
                  </>
                ) : (
                  <>
                    + Track Application
                  </>
                )}
              </button>
            </div>

            <p style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)', lineHeight: 1.4 }}>
              <strong>Notice:</strong> Seekers is an aggregator and is not affiliated with {job.company}. Clicking &quot;Apply on Source&quot; opens the original listing at <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--seekers-text-secondary)' }}>{job.source}</span>. An outbound click is not a completed job application.
            </p>
          </div>

          {/* Required Skills */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--seekers-text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Required & Relevant Skills
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {job.skills.map((skill, i) => (
                <span key={i} className="skill-tag" style={{ padding: '0.25rem 0.6rem', fontSize: '0.8125rem' }}>
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {/* Role Overview */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--seekers-text-primary)', marginBottom: '0.5rem' }}>
              Role Overview
            </h3>
            <p style={{ color: 'var(--seekers-text-secondary)', lineHeight: 1.6, fontSize: '0.9375rem' }}>
              {job.description}
            </p>
          </div>

          {/* Responsibilities */}
          {job.responsibilities && job.responsibilities.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--seekers-text-primary)', marginBottom: '0.5rem' }}>
                Key Responsibilities
              </h3>
              <ul style={{ paddingLeft: '1.25rem', color: 'var(--seekers-text-secondary)', lineHeight: 1.6 }}>
                {job.responsibilities.map((item, i) => (
                  <li key={i} style={{ marginBottom: '0.35rem' }}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Qualifications */}
          {job.qualifications && job.qualifications.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--seekers-text-primary)', marginBottom: '0.5rem' }}>
                Candidate Qualifications
              </h3>
              <ul style={{ paddingLeft: '1.25rem', color: 'var(--seekers-text-secondary)', lineHeight: 1.6 }}>
                {job.qualifications.map((item, i) => (
                  <li key={i} style={{ marginBottom: '0.35rem' }}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Footer report issue trigger */}
          <div style={{
            marginTop: '2rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--seekers-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.8125rem',
            color: 'var(--seekers-text-muted)'
          }}>
            <span>Listing ID: <code style={{ fontFamily: 'var(--font-mono)' }}>{job.id.substring(0, 8)}</code></span>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => onReportListing(job)}
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', minHeight: '30px' }}
            >
              ⚑ Report this listing
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
