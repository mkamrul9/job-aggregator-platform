'use client';

import React, { useState, useEffect } from 'react';
import { UserProfile, TrackedApplication, JobSummary } from '../lib/mock-data';

interface DataControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  applications: TrackedApplication[];
  savedJobs: JobSummary[];
}

export default function DataControlModal({
  isOpen,
  onClose,
  profile,
  applications,
  savedJobs
}: DataControlModalProps) {
  const [deleteRequested, setDeleteRequested] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

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

  const handleExportData = () => {
    const payload = {
      export_version: '1.0.0',
      exported_at: new Date().toISOString(),
      candidate_profile: profile,
      tracked_applications: applications,
      saved_jobs: savedJobs
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `seekers-candidate-data-${profile.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 2500);
  };

  const handleRequestDeletion = () => {
    setDeleteRequested(true);
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="data-control-title"
    >
      <div className="modal-dialog">
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem',
          paddingBottom: '0.5rem',
          borderBottom: '1px solid var(--seekers-border-subtle)'
        }}>
          <h2 id="data-control-title" style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '1.15rem',
            fontWeight: 700,
            color: 'var(--seekers-text-primary)'
          }}>
            Candidate Privacy & Data Rights
          </h2>

          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
            style={{ width: '32px', height: '32px', minHeight: '32px', padding: 0 }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: '0.875rem', color: 'var(--seekers-text-secondary)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
          Seekers adheres to privacy principles. You retain full control over your saved listings, notes, search alerts, and parsed resume data.
        </p>

        {/* Export Data Section */}
        <div style={{
          backgroundColor: 'var(--seekers-bg-surface)',
          border: '1px solid var(--seekers-border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '1rem',
          marginBottom: '1.25rem'
        }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--seekers-text-primary)', marginBottom: '0.35rem' }}>
            Export Candidate Workspace Data
          </h3>
          <p style={{ fontSize: '0.8125rem', color: 'var(--seekers-text-muted)', marginBottom: '0.75rem' }}>
            Download a machine-readable JSON archive containing your profile attributes, tracked applications, interview notes, and bookmarked listings.
          </p>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleExportData}
            style={{ minHeight: '38px', fontSize: '0.8125rem' }}
          >
            {downloadSuccess ? '✓ Downloaded JSON Archive' : '↓ Download JSON Archive'}
          </button>
        </div>

        {/* Delete Account Section */}
        <div style={{
          backgroundColor: 'var(--seekers-danger-dim)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 'var(--radius-md)',
          padding: '1rem'
        }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--seekers-danger)', marginBottom: '0.35rem' }}>
            Request Account & Data Deletion
          </h3>
          <p style={{ fontSize: '0.8125rem', color: 'var(--seekers-text-secondary)', marginBottom: '0.75rem', lineHeight: 1.4 }}>
            In accordance with platform retention rules, requesting deletion initiates a 30-day grace period, followed by complete purge of PostgreSQL candidate rows, alert subscriptions, and uploaded resume vectors.
          </p>

          {deleteRequested ? (
            <div style={{
              backgroundColor: '#1c1917',
              border: '1px solid var(--seekers-danger)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.75rem',
              color: 'var(--seekers-danger)',
              fontSize: '0.8125rem'
            }}>
              <strong>Deletion Request Registered (Prototype):</strong> Your account deletion request has been recorded. In production (Phase 13), this dispatches an audit log and initiates a 30-day cancellation countdown.
            </div>
          ) : (
            <button
              type="button"
              className="btn-ghost"
              onClick={handleRequestDeletion}
              style={{
                color: 'var(--seekers-danger)',
                border: '1px solid var(--seekers-danger)',
                minHeight: '38px',
                fontSize: '0.8125rem'
              }}
            >
              Request Account Deletion
            </button>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
