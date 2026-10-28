'use client';

import React, { useState, useEffect, useRef } from 'react';
import { JobDetail, JobSummary } from '../lib/mock-data';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportingJob?: JobDetail | JobSummary | null;
}

export default function FeedbackModal({
  isOpen,
  onClose,
  reportingJob
}: FeedbackModalProps) {
  const [reportType, setReportType] = useState('EXPIRED_LISTING');
  const [description, setDescription] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const firstInputRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    firstInputRef.current?.focus();

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setDescription('');
      onClose();
    }, 1200);
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-title"
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
          <h2 id="feedback-title" style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '1.15rem',
            fontWeight: 700,
            color: 'var(--seekers-text-primary)'
          }}>
            {reportingJob ? 'Report Listing Issue' : 'Feedback & Bug Report'}
          </h2>

          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
            style={{ width: '32px', height: '32px', minHeight: '32px', padding: 0 }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {reportingJob && (
          <div style={{
            backgroundColor: 'var(--seekers-bg-surface)',
            padding: '0.65rem 0.85rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.8125rem',
            color: 'var(--seekers-text-secondary)',
            marginBottom: '1rem'
          }}>
            Reporting listing: <strong style={{ color: 'var(--seekers-text-primary)' }}>{reportingJob.title}</strong> at {reportingJob.company} (ID: {reportingJob.id.substring(0, 8)})
          </div>
        )}

        {submitted ? (
          <div style={{
            padding: '2rem 1rem',
            textAlign: 'center',
            backgroundColor: 'var(--seekers-success-dim)',
            border: '1px solid var(--seekers-success)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--seekers-success)'
          }}>
            <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>✓</div>
            <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>Thank You for Your Feedback</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--seekers-text-secondary)', marginTop: '0.25rem' }}>
              Your issue report has been recorded locally for moderation review.
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="feedback-type">Issue Classification</label>
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
              <label className="form-label" htmlFor="feedback-desc">Description of the Issue</label>
              <textarea
                id="feedback-desc"
                className="input-text"
                rows={4}
                placeholder="Please describe what is incorrect or what went wrong..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="feedback-email">Contact Email (Optional)</label>
              <input
                id="feedback-email"
                className="input-text"
                type="email"
                placeholder="your.email@example.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                type="button"
                className="btn-ghost"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
              >
                Submit Report
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
