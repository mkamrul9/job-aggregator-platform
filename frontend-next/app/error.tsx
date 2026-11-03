'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled application error:', error);
  }, [error]);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--seekers-bg-base)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
      }}
    >
      <div
        style={{
          maxWidth: '540px',
          width: '100%',
          backgroundColor: 'var(--seekers-bg-surface)',
          border: '1px solid var(--seekers-border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '2.5rem',
          textAlign: 'center',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: 'var(--seekers-text-primary)',
            marginBottom: '0.75rem',
          }}
        >
          Something Went Wrong
        </h1>
        <p
          style={{
            color: 'var(--seekers-text-secondary)',
            fontSize: '0.9375rem',
            lineHeight: 1.6,
            marginBottom: '1.5rem',
          }}
        >
          An unexpected error occurred while loading this page. Our telemetry has
          captured the incident details.
        </p>
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={() => reset()}
            className="btn-primary"
            style={{ fontWeight: 600, cursor: 'pointer' }}
          >
            Try Again
          </button>
          <Link
            href="/"
            className="btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            ← Return to Search
          </Link>
        </div>
      </div>
    </main>
  );
}
