'use client';

import React, { useState } from 'react';
import { RecommendedJob, JobSummary } from '../lib/mock-data';
import { formatSalary, formatTimeAgo } from './JobCard';

interface RecommendationsWorkspaceProps {
  recommendations: RecommendedJob[];
  isColdStart: boolean;
  isLoading: boolean;
  error: string | null;
  savedJobIds: Set<string>;
  onToggleSave: (e: React.MouseEvent, job: JobSummary) => void;
  onTrackApplication: (job: JobSummary) => void;
  onSelectJob: (job: JobSummary) => void;
  onDismiss: (jobId: string, reason?: string) => void;
  undoDismissJob: { id: string; title: string } | null;
  onUndoDismiss: (jobId: string) => void;
  onGoToProfile: () => void;
  onOpenAuth: () => void;
  isAuthenticated: boolean;
  isDemoMode: boolean;
  onRetry?: () => void;
}

export default function RecommendationsWorkspace({
  recommendations,
  isColdStart,
  isLoading,
  error,
  savedJobIds,
  onToggleSave,
  onTrackApplication,
  onSelectJob,
  onDismiss,
  undoDismissJob,
  onUndoDismiss,
  onGoToProfile,
  onOpenAuth,
  isAuthenticated,
  isDemoMode,
  onRetry,
}: RecommendationsWorkspaceProps) {
  const [expandedReasons, setExpandedReasons] = useState<Set<string>>(
    new Set(),
  );
  const [dismissModalJob, setDismissModalJob] = useState<RecommendedJob | null>(
    null,
  );
  const [selectedDismissReason, setSelectedDismissReason] =
    useState<string>('NOT_INTERESTED');

  const toggleReason = (id: string) => {
    setExpandedReasons((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleConfirmDismiss = () => {
    if (dismissModalJob) {
      onDismiss(dismissModalJob.id, selectedDismissReason);
      setDismissModalJob(null);
      setSelectedDismissReason('NOT_INTERESTED');
    }
  };

  return (
    <div className="recommendations-workspace">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '1.25rem',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h1
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '1.35rem',
                fontWeight: 700,
                color: 'var(--seekers-text-primary)',
              }}
            >
              Recommended For You ({recommendations.length})
            </h1>
            <span
              className="badge"
              style={{
                fontSize: '0.7rem',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                color: 'var(--seekers-primary)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
              }}
            >
              Deterministic v1.0.0
            </span>
          </div>
          <p
            style={{
              fontSize: '0.875rem',
              color: 'var(--seekers-text-secondary)',
              marginTop: '0.2rem',
            }}
          >
            Personalized job recommendations grounded strictly in your reviewed
            profile attributes and preferences.
          </p>
        </div>
      </div>

      {/* Undo Dismissal Banner */}
      {undoDismissJob && (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            backgroundColor: 'rgba(30, 41, 59, 0.9)',
            border: '1px solid var(--seekers-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
          }}
        >
          <div style={{ fontSize: '0.875rem', color: 'var(--seekers-text-primary)' }}>
            Dismissed <strong>{undoDismissJob.title}</strong>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onUndoDismiss(undoDismissJob.id)}
            style={{
              padding: '0.35rem 0.8rem',
              fontSize: '0.8125rem',
              fontWeight: 600,
            }}
          >
            ↩ Undo Dismissal
          </button>
        </div>
      )}

      {/* Unauthenticated in Live Mode */}
      {!isAuthenticated && !isDemoMode && (
        <div
          className="empty-state-card"
          style={{
            padding: '2.5rem 1.5rem',
            textAlign: 'center',
            backgroundColor: 'var(--seekers-surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--seekers-border)',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🎯</div>
          <h2
            style={{
              fontSize: '1.2rem',
              fontWeight: 700,
              color: 'var(--seekers-text-primary)',
              marginBottom: '0.5rem',
            }}
          >
            Personalized Job Matching
          </h2>
          <p
            style={{
              color: 'var(--seekers-text-secondary)',
              fontSize: '0.875rem',
              maxWidth: '520px',
              margin: '0 auto 1.5rem',
              lineHeight: 1.5,
            }}
          >
            Sign in to receive transparent, explainable recommendations tailored to
            your reviewed skills, seniority preferences, and compensation
            constraints without black-box ML.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onOpenAuth}
            style={{ minHeight: '44px', padding: '0 1.5rem' }}
          >
            Sign In to Unlock Recommendations
          </button>
        </div>
      )}

      {/* Cold Start Banner */}
      {(isAuthenticated || isDemoMode) && isColdStart && (
        <div
          style={{
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
            backgroundColor: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ flex: 1, minWidth: '260px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontWeight: 600,
                color: 'var(--seekers-amber-400)',
                fontSize: '0.9rem',
                marginBottom: '0.25rem',
              }}
            >
              <span>💡</span> Cold-Start Mode: Profile Preferences Incomplete
            </div>
            <p
              style={{
                fontSize: '0.8125rem',
                color: 'var(--seekers-text-secondary)',
                margin: 0,
                lineHeight: 1.4,
              }}
            >
              Add your reviewed technical skills and desired role titles in your
              Profile to unlock deterministic skill matching and precise scoring.
              Active roles are shown below for exploration.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onGoToProfile}
            style={{
              padding: '0.45rem 1rem',
              fontSize: '0.8125rem',
              fontWeight: 600,
              minHeight: '40px',
            }}
          >
            Complete Profile & Skills ➔
          </button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div
          style={{
            textAlign: 'center',
            padding: '3rem 0',
            color: 'var(--seekers-text-secondary)',
          }}
        >
          <div
            className="spinner"
            style={{ margin: '0 auto 1rem', width: '28px', height: '28px' }}
          />
          <p style={{ fontSize: '0.875rem' }}>
            Evaluating deterministic candidate matches against active catalog...
          </p>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div
          role="alert"
          style={{
            padding: '1rem 1.25rem',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--seekers-danger)',
            fontSize: '0.875rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div>{error}</div>
          {onRetry && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onRetry}
              style={{
                padding: '0.35rem 0.8rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
              }}
            >
              🔄 Retry
            </button>
          )}
        </div>
      )}

      {/* Empty State */}
      {!isLoading &&
        !error &&
        recommendations.length === 0 &&
        (isAuthenticated || isDemoMode) && (
          <div
            className="empty-state-card"
            style={{
              padding: '2.5rem 1.5rem',
              textAlign: 'center',
              backgroundColor: 'var(--seekers-surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--seekers-border)',
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔍</div>
            <h2
              style={{
                fontSize: '1.2rem',
                fontWeight: 700,
                color: 'var(--seekers-text-primary)',
                marginBottom: '0.5rem',
              }}
            >
              No Matching Roles Found
            </h2>
            <p
              style={{
                color: 'var(--seekers-text-secondary)',
                fontSize: '0.875rem',
                maxWidth: '480px',
                margin: '0 auto 1.5rem',
              }}
            >
              Your strict hard constraints (minimum salary, location, or remote
              requirement) currently exclude all active listings in the catalog.
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onGoToProfile}
              style={{ minHeight: '44px', padding: '0 1.5rem' }}
            >
              Adjust Profile Preferences
            </button>
          </div>
        )}

      {/* Recommendations List */}
      {!isLoading && recommendations.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {recommendations.map((job) => {
            const isSaved = savedJobIds.has(job.id);
            const isReasonExpanded = expandedReasons.has(job.id);
            const reasons = job.match_reasons;

            const scoreBadgeColor =
              job.score >= 75
                ? 'badge-success'
                : job.score >= 50
                  ? 'badge-seniority'
                  : 'badge-amber';

            return (
              <div
                key={job.id}
                className="job-card recommended-job-card"
                style={{
                  backgroundColor: 'var(--seekers-surface)',
                  border: '1px solid var(--seekers-border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '1.25rem',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
              >
                {/* Top Row: Title, Company, Score Badge & Dismiss */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '1rem',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        flexWrap: 'wrap',
                        marginBottom: '0.25rem',
                      }}
                    >
                      <h2
                        onClick={() => onSelectJob(job)}
                        style={{
                          fontSize: '1.125rem',
                          fontWeight: 700,
                          color: 'var(--seekers-text-primary)',
                          cursor: 'pointer',
                          margin: 0,
                        }}
                      >
                        {job.title}
                      </h2>
                      <span
                        className={`badge ${scoreBadgeColor}`}
                        style={{
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          padding: '0.2rem 0.5rem',
                        }}
                        title={`Deterministic Match Score: ${job.score}/100`}
                      >
                        {job.score} Match
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: 'var(--seekers-text-secondary)',
                      }}
                    >
                      {job.company}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={(e) => onToggleSave(e, job)}
                      aria-label={isSaved ? 'Unsave job' : 'Save job'}
                      title={isSaved ? 'Remove from saved' : 'Save for later'}
                      style={{
                        fontSize: '1.2rem',
                        color: isSaved
                          ? 'var(--seekers-amber-400)'
                          : 'var(--seekers-text-muted)',
                      }}
                    >
                      {isSaved ? '★' : '☆'}
                    </button>
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={() => setDismissModalJob(job)}
                      aria-label="Dismiss recommendation"
                      title="Dismiss listing"
                      style={{
                        fontSize: '1rem',
                        color: 'var(--seekers-text-muted)',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Attributes Pills */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                    marginTop: '0.75rem',
                  }}
                >
                  {job.location && (
                    <span className="badge badge-location">
                      📍 {job.location}
                    </span>
                  )}
                  {job.remote_eligibility && (
                    <span
                      className={`badge ${
                        job.remote_eligibility === 'FULLY_REMOTE'
                          ? 'badge-remote'
                          : job.remote_eligibility === 'HYBRID'
                            ? 'badge-hybrid'
                            : 'badge-onsite'
                      }`}
                    >
                      {job.remote_eligibility.replace('_', ' ')}
                    </span>
                  )}
                  {job.salary && (
                    <span className="badge badge-salary">
                      💰 {formatSalary(job.salary)}
                    </span>
                  )}
                  {job.seniority && (
                    <span className="badge badge-seniority">
                      {job.seniority}
                    </span>
                  )}
                  {job.published_at && (
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--seekers-text-muted)',
                        marginLeft: 'auto',
                      }}
                    >
                      {formatTimeAgo(job.published_at)}
                    </span>
                  )}
                </div>

                {/* Grounded Explanation Preview */}
                <div
                  style={{
                    marginTop: '0.85rem',
                    padding: '0.75rem 1rem',
                    backgroundColor: 'rgba(15, 23, 42, 0.45)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                    }}
                    onClick={() => toggleReason(job.id)}
                  >
                    <div
                      style={{
                        fontSize: '0.8125rem',
                        color: 'var(--seekers-text-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      <span style={{ color: 'var(--seekers-primary)' }}>✦</span>
                      <span>
                        <strong>Why this role:</strong>{' '}
                        {reasons.overall_summary || 'Deterministic profile match'}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--seekers-text-muted)',
                        fontWeight: 600,
                      }}
                    >
                      {isReasonExpanded ? 'Hide Details ▲' : 'Inspect Match ▼'}
                    </span>
                  </div>

                  {/* Expanded Detailed Grounded Evidence */}
                  {isReasonExpanded && (
                    <div
                      style={{
                        marginTop: '0.75rem',
                        paddingTop: '0.75rem',
                        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                        fontSize: '0.8125rem',
                      }}
                    >
                      {/* Matched skills */}
                      <div>
                        <span
                          style={{
                            color: 'var(--seekers-text-muted)',
                            marginRight: '0.5rem',
                          }}
                        >
                          Matched Reviewed Skills:
                        </span>
                        {reasons.matched_skills &&
                        reasons.matched_skills.length > 0 ? (
                          reasons.matched_skills.map((s) => (
                            <span
                              key={s}
                              className="badge badge-success"
                              style={{
                                marginRight: '0.35rem',
                                fontSize: '0.72rem',
                              }}
                            >
                              ✓ {s}
                            </span>
                          ))
                        ) : (
                          <span
                            style={{
                              color: 'var(--seekers-text-muted)',
                              fontStyle: 'italic',
                            }}
                          >
                            None overlapping
                          </span>
                        )}
                      </div>

                      {/* Missing skills */}
                      {reasons.missing_skills &&
                        reasons.missing_skills.length > 0 && (
                          <div>
                            <span
                              style={{
                                color: 'var(--seekers-text-muted)',
                                marginRight: '0.5rem',
                              }}
                            >
                              Additional Role Skills:
                            </span>
                            {reasons.missing_skills.map((s) => (
                              <span
                                key={s}
                                className="badge"
                                style={{
                                  marginRight: '0.35rem',
                                  fontSize: '0.72rem',
                                  backgroundColor: 'rgba(100, 116, 139, 0.15)',
                                  color: 'var(--seekers-text-secondary)',
                                }}
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        )}

                      {/* Alignment reasons */}
                      {reasons.location_reason && (
                        <div>
                          <span style={{ color: 'var(--seekers-text-muted)' }}>
                            Location:
                          </span>{' '}
                          <span style={{ color: 'var(--seekers-text-secondary)' }}>
                            {reasons.location_reason}
                          </span>
                        </div>
                      )}

                      {reasons.seniority_reason && (
                        <div>
                          <span style={{ color: 'var(--seekers-text-muted)' }}>
                            Seniority:
                          </span>{' '}
                          <span style={{ color: 'var(--seekers-text-secondary)' }}>
                            {reasons.seniority_reason}
                          </span>
                        </div>
                      )}

                      {reasons.compensation_reason && (
                        <div>
                          <span style={{ color: 'var(--seekers-text-muted)' }}>
                            Compensation:
                          </span>{' '}
                          <span style={{ color: 'var(--seekers-text-secondary)' }}>
                            {reasons.compensation_reason}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Bottom Actions */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '0.6rem',
                    marginTop: '1rem',
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => onSelectJob(job)}
                    style={{ fontSize: '0.8125rem', padding: '0.4rem 0.85rem' }}
                  >
                    View Details
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => onTrackApplication(job)}
                    style={{ fontSize: '0.8125rem', padding: '0.4rem 0.85rem' }}
                  >
                    Track Application
                  </button>
                  <a
                    href={`/api/v1/jobs/${job.id}/outbound`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                    style={{
                      fontSize: '0.8125rem',
                      padding: '0.4rem 0.85rem',
                      textDecoration: 'none',
                    }}
                  >
                    Apply Outbound ↗
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dismiss Reason Modal */}
      {dismissModalJob && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="dismiss-dialog-title"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--seekers-surface)',
              border: '1px solid var(--seekers-border)',
              borderRadius: 'var(--radius-lg)',
              maxWidth: '440px',
              width: '100%',
              padding: '1.5rem',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            }}
          >
            <h3
              id="dismiss-dialog-title"
              style={{
                fontSize: '1.1rem',
                fontWeight: 700,
                color: 'var(--seekers-text-primary)',
                marginBottom: '0.5rem',
              }}
            >
              Dismiss Recommendation
            </h3>
            <p
              style={{
                fontSize: '0.85rem',
                color: 'var(--seekers-text-secondary)',
                marginBottom: '1rem',
              }}
            >
              Why are you dismissing <strong>{dismissModalJob.title}</strong>?
              Your feedback refines recommendations without altering your reviewed
              skills.
            </p>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                marginBottom: '1.25rem',
              }}
            >
              {[
                { id: 'NOT_INTERESTED', label: 'Not interested in this role' },
                { id: 'WRONG_LOCATION', label: 'Wrong location / remote model' },
                { id: 'UNDERQUALIFIED', label: 'Skills or seniority too advanced' },
                { id: 'OVERQUALIFIED', label: 'Position too junior' },
                { id: 'OTHER', label: 'Other / Listing issue' },
              ].map((reason) => (
                <label
                  key={reason.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.85rem',
                    color: 'var(--seekers-text-primary)',
                    cursor: 'pointer',
                    padding: '0.4rem 0.6rem',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor:
                      selectedDismissReason === reason.id
                        ? 'rgba(59, 130, 246, 0.12)'
                        : 'transparent',
                  }}
                >
                  <input
                    type="radio"
                    name="dismissReason"
                    value={reason.id}
                    checked={selectedDismissReason === reason.id}
                    onChange={(e) => setSelectedDismissReason(e.target.value)}
                  />
                  <span>{reason.label}</span>
                </label>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.5rem',
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDismissModalJob(null)}
                style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmDismiss}
                style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}
              >
                Dismiss Listing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

