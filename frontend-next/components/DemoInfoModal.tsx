'use client';

import React, { useEffect } from 'react';

interface DemoInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DemoInfoModal({
  isOpen,
  onClose
}: DemoInfoModalProps) {
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

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-info-title"
    >
      <div className="modal-dialog" style={{ maxWidth: '600px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem',
          paddingBottom: '0.5rem',
          borderBottom: '1px solid var(--seekers-border-subtle)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--seekers-amber-400)', fontSize: '1.25rem' }}>✦</span>
            <h2 id="demo-info-title" style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.2rem',
              fontWeight: 700,
              color: 'var(--seekers-text-primary)'
            }}>
              Demo Provenance & Architectural Boundaries
            </h2>
          </div>

          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
            style={{ width: '32px', height: '32px', minHeight: '32px', padding: 0 }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.875rem', color: 'var(--seekers-text-secondary)', lineHeight: 1.55 }}>
          
          <div style={{ backgroundColor: 'var(--seekers-bg-surface)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--seekers-border-subtle)' }}>
            <strong style={{ color: 'var(--seekers-text-primary)' }}>1. Confirmed Regional Market Scope</strong>
            <p style={{ marginTop: '0.25rem' }}>
              Targeted focus on the South Asia / Bangladesh technology ecosystem (Dhaka and Chattogram engineering hubs, regional remote listings, BDT and USD compensation, and Asia/Dhaka time zone).
            </p>
          </div>

          <div style={{ backgroundColor: 'var(--seekers-bg-surface)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--seekers-border-subtle)' }}>
            <strong style={{ color: 'var(--seekers-text-primary)' }}>2. Truthful Synthetic Data</strong>
            <p style={{ marginTop: '0.25rem' }}>
              All listings in this prototype are curated synthetic fixtures conforming strictly to the authoritative OpenAPI 3.1 specification (<code style={{ fontFamily: 'var(--font-mono)', color: 'var(--seekers-amber-400)' }}>contracts/openapi/seekers-api-v1.yaml</code>). No fabricated claims (e.g. &quot;2.4M+ jobs&quot;) are used.
            </p>
          </div>

          <div style={{ backgroundColor: 'var(--seekers-bg-surface)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--seekers-border-subtle)' }}>
            <strong style={{ color: 'var(--seekers-text-primary)' }}>3. Aggregator Business Model</strong>
            <p style={{ marginTop: '0.25rem' }}>
              Seekers is an engineering job aggregator with outbound employer application links. Clicking &quot;Apply on Source&quot; directs candidates to the original listing. Application statuses and interview milestones are tracked locally by the candidate.
            </p>
          </div>

          <div style={{ backgroundColor: 'var(--seekers-bg-surface)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--seekers-border-subtle)' }}>
            <strong style={{ color: 'var(--seekers-text-primary)' }}>4. Polyglot Multi-Project Architecture</strong>
            <p style={{ marginTop: '0.25rem' }}>
              • <strong>frontend-next:</strong> Candidate portal built in React 19 / Next.js 16.<br />
              • <strong>frontend-admin:</strong> Operations dashboard built in standalone Angular 18 (SCSS).<br />
              • <strong>service-resume:</strong> Independent NLP parser built in Python 3.11 / FastAPI.<br />
              • <strong>service-user, service-ingestion, service-scraper, service-notification:</strong> Preserved independent microservices.
            </p>
          </div>

        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button
            type="button"
            className="btn-primary"
            onClick={onClose}
          >
            Understood
          </button>
        </div>
      </div>
    </div>
  );
}
