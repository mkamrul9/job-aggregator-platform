'use client';

import React, { useState, useEffect } from 'react';
import { useAuth, DeletionRequestResponse } from '../lib/auth-context';
import { TrackedApplication, JobSummary } from '../lib/mock-data';

interface DataControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  applications: TrackedApplication[];
  savedJobs: JobSummary[];
}

export default function DataControlModal({
  isOpen,
  onClose,
  applications,
  savedJobs,
}: DataControlModalProps) {
  const { status, profile, isDemo, exportAccountData, requestAccountDeletion } = useAuth();

  const [deletionResult, setDeletionResult] = useState<DeletionRequestResponse | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [deletionReason, setDeletionReason] = useState('');

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

  const handleExportData = async () => {
    setErrorMsg('');
    setLoading(true);

    try {
      if (isDemo || status === 'DEMO_MODE') {
        // Download local demo synthetic payload
        const payload = {
          export_version: '1.0.0-demo',
          exported_at: new Date().toISOString(),
          candidate_profile: profile,
          tracked_applications: applications,
          saved_jobs: savedJobs,
          provenance: 'Seekers Portfolio Demo Synthetic Data',
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `seekers-demo-data.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setExportSuccess('Downloaded synthetic demo archive.');
      } else {
        // Real authenticated API export
        const archive = await exportAccountData();
        const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `seekers-candidate-export-${archive.user_id}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setExportSuccess(`Export archive generated (Request ID: ${archive.request_id})`);
      }
      setTimeout(() => setExportSuccess(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Export failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestDeletion = async () => {
    setErrorMsg('');
    setLoading(true);

    try {
      if (isDemo || status === 'DEMO_MODE') {
        setDeletionResult({
          success: true,
          message: 'Demo session reset. Synthetic candidate data cleared.',
          request_id: `demo_del_${Date.now()}`,
          status: 'SIMULATED',
          scheduled_for: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          requested_at: new Date().toISOString(),
        });
      } else {
        const result = await requestAccountDeletion(deletionReason);
        setDeletionResult(result);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Deletion request failed: ${msg}`);
    } finally {
      setLoading(false);
    }
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
            paddingBottom: '0.5rem',
            borderBottom: '1px solid var(--seekers-border-subtle)',
          }}
        >
          <h2
            id="data-control-title"
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.15rem',
              fontWeight: 700,
              color: 'var(--seekers-text-primary)',
            }}
          >
            Candidate Privacy & Data Rights
          </h2>

          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
            style={{ width: '32px', height: '32px', minHeight: '32px', padding: 0 }}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <p
          style={{
            fontSize: '0.875rem',
            color: 'var(--seekers-text-secondary)',
            marginBottom: '1.25rem',
            lineHeight: 1.5,
          }}
        >
          Seekers enforces candidate data autonomy. All exports and erasure requests are recorded durably and follow an owned lifecycle.
        </p>

        {errorMsg && (
          <div
            style={{
              backgroundColor: 'var(--seekers-danger-dim)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: 'var(--seekers-danger)',
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.8125rem',
              marginBottom: '1rem',
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* Export Data Section */}
        <div
          style={{
            backgroundColor: 'var(--seekers-bg-surface)',
            border: '1px solid var(--seekers-border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            marginBottom: '1.25rem',
          }}
        >
          <h3
            style={{
              fontSize: '0.9375rem',
              fontWeight: 600,
              color: 'var(--seekers-text-primary)',
              marginBottom: '0.35rem',
            }}
          >
            Export Candidate Personal Archive
          </h3>
          <p
            style={{
              fontSize: '0.8125rem',
              color: 'var(--seekers-text-muted)',
              marginBottom: '0.75rem',
              lineHeight: 1.4,
            }}
          >
            Request a server-generated JSON archive containing your profile attributes, skills, preferences, and workspace entries conforming to OpenAPI specifications.
          </p>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleExportData}
            disabled={loading}
            style={{ minHeight: '38px', fontSize: '0.8125rem' }}
          >
            {loading ? 'Generating...' : exportSuccess ? `✓ ${exportSuccess}` : '↓ Export Personal Data (JSON)'}
          </button>
        </div>

        {/* Delete Account Section */}
        <div
          style={{
            backgroundColor: 'var(--seekers-danger-dim)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
          }}
        >
          <h3
            style={{
              fontSize: '0.9375rem',
              fontWeight: 600,
              color: 'var(--seekers-danger)',
              marginBottom: '0.35rem',
            }}
          >
            Request Account & Identity Erasure
          </h3>
          <p
            style={{
              fontSize: '0.8125rem',
              color: 'var(--seekers-text-secondary)',
              marginBottom: '0.75rem',
              lineHeight: 1.4,
            }}
          >
            In accordance with platform retention rules, requesting deletion registers a durable erasure record with a <strong>30-day grace period</strong>. Full cross-service propagation is scheduled across PostgreSQL, search indexes, and alert pipelines.
          </p>

          {deletionResult ? (
            <div
              style={{
                backgroundColor: '#1c1917',
                border: '1px solid var(--seekers-danger)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.75rem',
                color: 'var(--seekers-text-primary)',
                fontSize: '0.8125rem',
                lineHeight: 1.5,
              }}
            >
              <div style={{ color: 'var(--seekers-danger)', fontWeight: 600, marginBottom: '0.25rem' }}>
                ✓ Deletion Request Registered (Status: {deletionResult.status})
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)' }}>
                Request ID: <code>{deletionResult.request_id}</code>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)' }}>
                Scheduled Purge Date: {new Date(deletionResult.scheduled_for).toLocaleDateString()}
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--seekers-amber-400)' }}>
                Note: Candidate identity remains deactivated during the 30-day grace period. Final multi-system erasure propagation is governed by Phase 13.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <input
                type="text"
                className="filter-select"
                style={{ width: '100%', boxSizing: 'border-box', fontSize: '0.75rem' }}
                placeholder="Optional reason for leaving..."
                value={deletionReason}
                onChange={(e) => setDeletionReason(e.target.value)}
                disabled={loading}
              />
              <button
                type="button"
                className="btn-ghost"
                onClick={handleRequestDeletion}
                disabled={loading}
                style={{
                  color: 'var(--seekers-danger)',
                  border: '1px solid var(--seekers-danger)',
                  minHeight: '38px',
                  fontSize: '0.8125rem',
                  alignSelf: 'flex-start',
                }}
              >
                {loading ? 'Registering Request...' : 'Confirm Account Erasure Request'}
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
