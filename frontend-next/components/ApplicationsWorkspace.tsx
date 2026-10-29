'use client';

import React, { useState } from 'react';
import { TrackedApplication, JobDetail, JobSummary } from '../lib/mock-data';
import { formatSalary, formatTimeAgo } from './JobCard';

interface ApplicationsWorkspaceProps {
  applications: TrackedApplication[];
  onUpdateStatus: (
    id: string,
    newStatus: TrackedApplication['status'],
    currentVersion?: number,
  ) => void;
  onUpdateNotes: (
    id: string,
    notes: string,
    currentVersion?: number,
  ) => void;
  onRemoveApplication: (id: string) => void;
  onSelectJob: (job: JobDetail | JobSummary) => void;
  onBrowseJobs: () => void;
}

export default function ApplicationsWorkspace({
  applications,
  onUpdateStatus,
  onUpdateNotes,
  onRemoveApplication,
  onSelectJob,
  onBrowseJobs,
}: ApplicationsWorkspaceProps) {
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempNotes, setTempNotes] = useState<string>('');
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const filtered = applications.filter((app) => {
    if (filterStatus === 'ALL') return true;
    return app.status === filterStatus;
  });

  const statusColors = {
    APPLIED: 'badge-seniority',
    INTERVIEWING: 'badge-amber',
    OFFERED: 'badge-success',
    REJECTED: 'badge-danger',
    WITHDRAWN: 'badge-onsite',
  };

  const startEditNotes = (app: TrackedApplication) => {
    setEditingId(app.id);
    setTempNotes(app.notes || '');
  };

  const saveNotes = (app: TrackedApplication) => {
    onUpdateNotes(app.id, tempNotes, app.version);
    setEditingId(null);
  };

  const toggleHistory = (appId: string) => {
    setExpandedHistoryId((prev) => (prev === appId ? null : appId));
  };

  return (
    <div>
      {/* Header and Stats */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '1.25rem'
      }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '1.35rem',
            fontWeight: 700,
            color: 'var(--seekers-text-primary)'
          }}>
            Application Tracker
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--seekers-text-secondary)', marginTop: '0.2rem' }}>
            Privately manage your job application pipeline and interview stages.
          </p>
        </div>

        {/* Status Filter Tabs */}
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {['ALL', 'APPLIED', 'INTERVIEWING', 'OFFERED', 'REJECTED'].map((st) => (
            <button
              key={st}
              type="button"
              className={`btn-ghost ${filterStatus === st ? 'badge-amber' : ''}`}
              onClick={() => setFilterStatus(st)}
              style={{
                fontSize: '0.75rem',
                minHeight: '34px',
                padding: '0.25rem 0.65rem',
                borderRadius: 'var(--radius-sm)'
              }}
            >
              {st} {st !== 'ALL' && `(${applications.filter(a => a.status === st).length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Notice Banner */}
      <div style={{
        backgroundColor: '#111827',
        border: '1px solid var(--seekers-border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '0.75rem 1rem',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        fontSize: '0.8125rem',
        color: 'var(--seekers-text-secondary)'
      }}>
        <span style={{ color: 'var(--seekers-amber-400)', fontSize: '1rem' }}>ℹ</span>
        <span>
          <strong>Private Tracker:</strong> Statuses and interview notes are saved in your local candidate workspace. Seekers does not auto-update or sync private application outcomes with external job boards.
        </span>
      </div>

      {/* Empty State */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <div className="empty-title">
            {filterStatus === 'ALL' ? 'No tracked applications yet' : `No applications in '${filterStatus}' status`}
          </div>
          <div className="empty-desc">
            Discover roles in the Seekers catalog and click &quot;Track Application&quot; to organize your pipeline here.
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={onBrowseJobs}
          >
            Browse Available Roles
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {filtered.map((app) => (
            <div
              key={app.id}
              style={{
                backgroundColor: 'var(--seekers-bg-elevated)',
                border: '1px solid var(--seekers-border-medium)',
                borderRadius: 'var(--radius-md)',
                padding: '1.25rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <h3
                    style={{
                      fontFamily: 'var(--font-heading)',
                      fontSize: '1.05rem',
                      fontWeight: 600,
                      color: 'var(--seekers-text-primary)',
                      cursor: 'pointer'
                    }}
                    onClick={() => onSelectJob(app.job_summary as JobDetail)}
                  >
                    {app.job_summary.title} ↗
                  </h3>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', color: 'var(--seekers-text-secondary)', fontSize: '0.875rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--seekers-text-primary)' }}>{app.job_summary.company}</span>
                    <span>•</span>
                    <span>{app.job_summary.location}</span>
                    <span>•</span>
                    <span style={{ color: 'var(--seekers-amber-400)', fontWeight: 600 }}>{formatSalary(app.job_summary.salary)}</span>
                  </div>
                </div>

                {/* Status Dropdown & Version Badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {app.version !== undefined && (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        color: 'var(--seekers-text-muted)',
                        backgroundColor: 'var(--seekers-bg-surface)',
                        padding: '0.2rem 0.4rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--seekers-border-subtle)',
                      }}
                      title="Optimistic concurrency record version"
                    >
                      v{app.version}
                    </span>
                  )}

                  <select
                    className={`select-input ${statusColors[app.status]}`}
                    value={app.status}
                    onChange={(e) =>
                      onUpdateStatus(
                        app.id,
                        e.target.value as TrackedApplication['status'],
                        app.version,
                      )
                    }
                    style={{
                      fontWeight: 600,
                      minHeight: '38px',
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.8125rem',
                    }}
                    aria-label={`Update status for ${app.job_summary.title}`}
                  >
                    <option value="APPLIED">Applied</option>
                    <option value="INTERVIEWING">Interviewing</option>
                    <option value="OFFERED">Offered</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="WITHDRAWN">Withdrawn</option>
                  </select>

                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => onRemoveApplication(app.id)}
                    style={{ color: 'var(--seekers-danger)', minHeight: '38px', padding: '0.35rem 0.6rem' }}
                    title="Remove from tracker"
                    aria-label="Remove application"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Notes Section */}
              <div style={{
                marginTop: '1rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid var(--seekers-border-subtle)',
                backgroundColor: 'var(--seekers-bg-surface)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.75rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--seekers-text-muted)', textTransform: 'uppercase' }}>
                    Candidate Interview Notes & Milestones
                  </span>
                  {editingId !== app.id && (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => startEditNotes(app)}
                      style={{ fontSize: '0.75rem', minHeight: '26px', padding: '0.15rem 0.4rem' }}
                    >
                      ✎ Edit Notes
                    </button>
                  )}
                </div>

                {editingId === app.id ? (
                  <div>
                    <textarea
                      className="input-text"
                      rows={3}
                      value={tempNotes}
                      onChange={(e) => setTempNotes(e.target.value)}
                      placeholder="e.g. Completed initial recruiter screen; technical round on Thursday..."
                      style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => setEditingId(null)}
                        style={{ minHeight: '32px', fontSize: '0.8125rem' }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => saveNotes(app)}
                        style={{ minHeight: '32px', fontSize: '0.8125rem' }}
                      >
                        Save Notes
                      </button>
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: '0.875rem', color: app.notes ? 'var(--seekers-text-primary)' : 'var(--seekers-text-muted)', fontStyle: app.notes ? 'normal' : 'italic' }}>
                    {app.notes || 'No notes added yet. Record recruiter contact, interview prep, or follow-ups.'}
                  </p>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--seekers-text-muted)', marginTop: '0.5rem' }}>
                  <span>Applied: {formatTimeAgo(app.applied_at)}</span>
                  {app.history && app.history.length > 0 && (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => toggleHistory(app.id)}
                      style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem', minHeight: '24px' }}
                    >
                      {expandedHistoryId === app.id ? 'Hide History ▲' : `Stage History (${app.history.length}) ▼`}
                    </button>
                  )}
                  <span>Updated: {formatTimeAgo(app.updated_at)}</span>
                </div>

                {/* History Timeline */}
                {expandedHistoryId === app.id && app.history && app.history.length > 0 && (
                  <div
                    style={{
                      marginTop: '0.75rem',
                      paddingTop: '0.75rem',
                      borderTop: '1px dashed var(--seekers-border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                    }}
                  >
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--seekers-text-secondary)', textTransform: 'uppercase' }}>
                      Lifecycle Stage Transitions
                    </span>
                    {app.history.map((entry, idx) => (
                      <div
                        key={entry.id || idx}
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: '0.5rem',
                          fontSize: '0.775rem',
                          color: 'var(--seekers-text-secondary)',
                        }}
                      >
                        <span
                          className={`badge ${statusColors[entry.status as keyof typeof statusColors] || 'badge-seniority'}`}
                          style={{ fontSize: '0.7rem', padding: '0.1rem 0.35rem' }}
                        >
                          {entry.status}
                        </span>
                        <span style={{ color: 'var(--seekers-text-muted)', fontSize: '0.7rem' }}>
                          {new Date(entry.changed_at).toLocaleDateString()}
                        </span>
                        {entry.notes && (
                          <span style={{ color: 'var(--seekers-text-primary)' }}>
                            — {entry.notes}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
