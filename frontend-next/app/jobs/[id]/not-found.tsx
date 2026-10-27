import React from 'react';
import Link from 'next/link';

export default function JobNotFound() {
  return (
    <main
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
          maxWidth: '500px',
          width: '100%',
          backgroundColor: 'var(--seekers-bg-surface)',
          border: '1px solid var(--seekers-border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '2.5rem',
          textAlign: 'center',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--seekers-text-primary)', marginBottom: '0.75rem' }}>
          Job Listing Not Found
        </h1>
        <p style={{ color: 'var(--seekers-text-secondary)', fontSize: '0.9375rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
          The job listing you requested does not exist, has expired, or the link is invalid. Explore active technology roles currently open across Bangladesh.
        </p>
        <Link
          href="/"
          className="btn-primary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          ← Return to Job Search
        </Link>
      </div>
    </main>
  );
}
