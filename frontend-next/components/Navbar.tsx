'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState('');

  const handleFeedbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Feedback submitted:', feedback);
    setIsFeedbackOpen(false);
    setFeedback('');
    setIsOpen(false);
  };

  return (
    <>
      <nav className="nav-root">
        <div className="nav-inner">

          {/* Brand */}
          <Link href="/" className="nav-brand">
            <div className="nav-logo-icon">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="7.5" cy="7.5" r="5" stroke="#0c0e12" strokeWidth="2.2"/>
                <path d="M11.5 11.5L16 16" stroke="#0c0e12" strokeWidth="2.2" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="nav-logo-text">seek<span>ers</span></span>
          </Link>

          {/* Desktop Nav */}
          <div className="nav-links" style={{ display: 'flex' }}>
            <button
              onClick={() => setIsFeedbackOpen(true)}
              className="nav-btn"
              id="report-bug-btn"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M7 4.5V7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="7" cy="9.5" r="0.75" fill="currentColor"/>
              </svg>
              Report Bug
            </button>

            {/* Mobile hamburger */}
            <button
              className="nav-btn"
              style={{ display: 'none' }}
              onClick={() => setIsOpen(!isOpen)}
              id="mobile-menu-btn"
            >
              {isOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {isOpen && (
          <div style={{
            borderTop: '1px solid var(--border)',
            padding: '1rem 2rem',
            background: 'var(--bg-elevated)',
          }}>
            <button
              onClick={() => { setIsOpen(false); setIsFeedbackOpen(true); }}
              className="nav-btn"
              style={{ width: '100%', justifyContent: 'flex-start' }}
            >
              Report a Bug / Feedback
            </button>
          </div>
        )}
      </nav>

      {/* Feedback Modal */}
      {isFeedbackOpen && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setIsFeedbackOpen(false)}>
          <div className="modal-box fade-up">
            <div className="modal-header">
              <span className="modal-title">
                <span style={{ color: 'var(--amber)' }}>⚑</span>
                Report a Bug
              </span>
              <button
                className="modal-close"
                onClick={() => setIsFeedbackOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleFeedbackSubmit}>
              <label className="form-label" htmlFor="feedback-text">
                What went wrong?
              </label>
              <textarea
                id="feedback-text"
                className="s-textarea"
                placeholder="Describe the bug or share your feedback..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                required
                style={{ marginBottom: '1.25rem' }}
              />
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setIsFeedbackOpen(false)}
                  className="btn-ghost"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-amber">
                  Submit Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
