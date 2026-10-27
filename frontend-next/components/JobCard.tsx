'use client';

import React from 'react';
import { JobDetail } from '../lib/mock-data';

interface JobCardProps {
  job: JobDetail;
  isSelected?: boolean;
  isSaved: boolean;
  onSelect: (job: JobDetail) => void;
  onToggleSave: (e: React.MouseEvent, job: JobDetail) => void;
}

export function formatSalary(salary?: JobDetail['salary']): string {
  if (!salary) return 'Salary Unspecified';
  const currencySymbol = salary.currency === 'BDT' ? '৳' : '$';
  const period = salary.period === 'MONTHLY' ? '/mo' : '/yr';

  if (salary.min && salary.max) {
    return `${currencySymbol}${salary.min.toLocaleString()} – ${currencySymbol}${salary.max.toLocaleString()}${period}`;
  } else if (salary.min) {
    return `From ${currencySymbol}${salary.min.toLocaleString()}${period}`;
  } else if (salary.max) {
    return `Up to ${currencySymbol}${salary.max.toLocaleString()}${period}`;
  }
  return 'Competitive';
}

export function formatTimeAgo(dateString: string): string {
  const published = new Date(dateString);
  const now = new Date('2026-10-27T12:00:00Z');
  const diffDays = Math.floor((now.getTime() - published.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

export default function JobCard({
  job,
  isSelected = false,
  isSaved,
  onSelect,
  onToggleSave
}: JobCardProps) {
  const remoteBadgeClass = {
    FULLY_REMOTE: 'badge-remote',
    HYBRID: 'badge-hybrid',
    ON_SITE: 'badge-onsite',
    UNSPECIFIED: 'badge-seniority'
  }[job.remote_eligibility];

  const remoteLabel = {
    FULLY_REMOTE: 'Fully Remote',
    HYBRID: 'Hybrid',
    ON_SITE: 'On-Site',
    UNSPECIFIED: 'Location Flexible'
  }[job.remote_eligibility];

  return (
    <article
      className={`job-card ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(job)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(job);
        }
      }}
      tabIndex={0}
      role="button"
      aria-pressed={isSelected}
      aria-label={`${job.title} at ${job.company}, ${job.location}`}
    >
      <div className="job-card-top">
        <div>
          <h2 className="job-card-title">{job.title}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
            <span style={{ fontWeight: 600, color: 'var(--seekers-text-primary)' }}>{job.company}</span>
            <span style={{ color: 'var(--seekers-text-muted)' }}>•</span>
            <span style={{ color: 'var(--seekers-text-secondary)', fontSize: '0.85rem' }}>{job.location}</span>
          </div>
        </div>

        <button
          type="button"
          className={`btn-save-bookmark ${isSaved ? 'saved' : ''}`}
          onClick={(e) => onToggleSave(e, job)}
          aria-label={isSaved ? `Unsave ${job.title}` : `Save ${job.title}`}
          title={isSaved ? "Saved to workspace" : "Save role"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={isSaved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
          </svg>
        </button>
      </div>

      <div className="job-card-meta">
        <span className={`badge ${remoteBadgeClass}`}>
          {remoteLabel}
        </span>

        {job.seniority !== 'UNSPECIFIED' && (
          <span className="badge badge-seniority">
            {job.seniority}
          </span>
        )}

        <span className="meta-item" style={{ color: 'var(--seekers-amber-400)', fontWeight: 600, fontSize: '0.8125rem' }}>
          {formatSalary(job.salary)}
        </span>

        <span className="meta-item" style={{ color: 'var(--seekers-text-muted)', fontSize: '0.75rem', marginLeft: 'auto' }}>
          {formatTimeAgo(job.published_at)}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
        <div className="job-card-pills">
          {job.skills.slice(0, 4).map((skill, i) => (
            <span key={i} className="skill-tag">
              {skill}
            </span>
          ))}
          {job.skills.length > 4 && (
            <span style={{ fontSize: '0.7rem', color: 'var(--seekers-text-muted)' }}>
              +{job.skills.length - 4} more
            </span>
          )}
        </div>

        <span className="badge badge-source" title={`Aggregated from ${job.source}`}>
          via {job.source}
        </span>
      </div>
    </article>
  );
}
