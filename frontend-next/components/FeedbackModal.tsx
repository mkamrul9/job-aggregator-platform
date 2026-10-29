'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { JobDetail, JobSummary } from '../lib/mock-data';
import { useAuth } from '../lib/auth-context';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportingJob?: JobDetail | JobSummary | null;
}

export default function FeedbackModal({
  isOpen,
  onClose,
  reportingJob,
}: FeedbackModalProps) {
  const { user, token, isDemo } = useAuth();
  const [reportType, setReportType] = useState('EXPIRED_LISTING');
  const [description, setDescription] = useState('');
  const [contactEmail, setContactEmail] = useState(user?.email || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLSelectElement>(null);

  const handleResetAndClose = useCallback(() => {
    setSubmittedRef(null);
    setErrorMessage(null);
    setDescription('');
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    firstInputRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleResetAndClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleResetAndClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || description.trim().length < 5) {
      setErrorMessage('Please provide a detailed description (at least 5 characters).');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    // If explicit demo mode, generate high-fidelity synthetic receipt
    if (isDemo) {
      setTimeout(() => {
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
        setSubmittedRef(`RPT-${todayStr}-DEMO${randomSuffix}`);
        setIsSubmitting(false);
      }, 500);
      return;
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/v1/reports', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          report_type: reportType,
          description: description.trim(),
          job_id: reportingJob?.id || undefined,
          contact_email: contactEmail.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || `Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      setSubmittedRef(data.reference_num || data.reference_number || 'RPT-RECORDED');
      setDescription('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit report. Please try again.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleResetAndClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-title"
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
            id="feedback-title"
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.15rem',
              fontWeight: 700,
              color: 'var(--seekers-text-primary)',
            }}
          >
            {reportingJob ? 'Report Listing Issue' : 'Feedback & Bug Report'}
          </h2>

          <button
            type="button"
            className="btn-ghost"
            onClick={handleResetAndClose}
            style={{ width: '32px', height: '32px', minHeight: '32px', padding: 0 }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {reportingJob && (
          <div
            style={{
              backgroundColor: 'var(--seekers-bg-surface)',
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.8125rem',
              color: 'var(--seekers-text-secondary)',
              marginBottom: '1rem',
            }}
          >
            Reporting listing:{' '}
            <strong style={{ color: 'var(--seekers-text-primary)' }}>
              {reportingJob.title}
            </strong>{' '}
            at {reportingJob.company} (ID: {reportingJob.id.substring(0, 8)})
          </div>
        )}

        {submittedRef ? (
          <div
            style={{
              padding: '1.5rem 1rem',
              textAlign: 'center',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid var(--seekers-success)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--seekers-text-primary)',
            }}
          >
            <div style={{ fontSize: '2rem', color: 'var(--seekers-success)', marginBottom: '0.5rem' }}>
              ✓
            </div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.25rem' }}>
              Report Received
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--seekers-text-secondary)', marginBottom: '1rem' }}>
              Your issue report has been recorded and queued for operator triage.
            </div>
            <div
              style={{
                display: 'inline-block',
                backgroundColor: 'var(--seekers-bg-surface)',
                border: '1px solid var(--seekers-border-subtle)',
                padding: '0.5rem 1rem',
                borderRadius: 'var(--radius-sm)',
                fontFamily: 'monospace',
                fontSize: '0.95rem',
                fontWeight: 600,
                color: 'var(--seekers-amber)',
                marginBottom: '1.25rem',
              }}
            >
              Reference: {submittedRef}
            </div>
            {isDemo && (
              <div
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--seekers-text-tertiary)',
                  marginBottom: '1rem',
                }}
              >
                (Demo mode simulation: recorded locally)
              </div>
            )}
            <div>
              <button
                type="button"
                className="btn-primary"
                onClick={handleResetAndClose}
                style={{ minWidth: '120px' }}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {errorMessage && (
              <div
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid #ef4444',
                  color: '#f87171',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8125rem',
                  marginBottom: '1rem',
                }}
              >
                {errorMessage}
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="feedback-type">
                Issue Classification
              </label>
              <select
                ref={firstInputRef}
                id="feedback-type"
                className="select-input"
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
              >
                <option value="EXPIRED_LISTING">Expired Listing / Role Closed</option>
                <option value="BROKEN_LINK">Broken Outbound Link</option>
                <option value="INCORRECT_DATA">Incorrect Salary or Requirement Details</option>
                <option value="SPAM">Duplicate or Suspicious Job Post</option>
                <option value="OTHER">General Platform Feedback</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="feedback-desc">
                Description of the Issue
              </label>
              <textarea
                id="feedback-desc"
                className="input-text"
                rows={4}
                placeholder="Please describe what is incorrect or what went wrong (minimum 5 characters)..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="feedback-email">
                Contact Email (Optional)
              </label>
              <input
                id="feedback-email"
                className="input-text"
                type="email"
                placeholder="your.email@example.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>

            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                justifyContent: 'flex-end',
                marginTop: '1.5rem',
              }}
            >
              <button
                type="button"
                className="btn-ghost"
                onClick={handleResetAndClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
