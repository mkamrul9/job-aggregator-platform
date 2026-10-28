import React from 'react';
import Link from 'next/link';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  safeJsonLd,
  fetchJobDetail,
} from '@/lib/job-detail-helper';

export const dynamic = 'force-dynamic';

export async function generateMetadata(
  props: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await props.params;
  const result = await fetchJobDetail(id);

  if (result.kind !== 'success') {
    if (result.kind === 'not_found') {
      return {
        title: 'Job Not Found | Seekers',
        description: 'The requested job listing could not be found.',
      };
    }
    return {
      title: 'Service Unavailable | Seekers',
      description: 'Job catalog service is temporarily unavailable.',
    };
  }

  const job = result.job;

  if (job.is_synthetic) {
    return {
      title: `[Demo] ${job.title} at ${job.company} | Seekers`,
      description: `Simulated job listing for demonstration purposes.`,
      robots: { index: false, follow: false },
    };
  }

  const remoteLabel = {
    FULLY_REMOTE: 'Remote',
    HYBRID: 'Hybrid',
    ON_SITE: 'On-Site',
    UNSPECIFIED: 'Flexible',
  }[job.remote_eligibility];

  return {
    title: `${job.title} at ${job.company} (${remoteLabel}) | Seekers`,
    description: `${job.title} at ${job.company} in ${job.location}. Discover authentic tech roles on Seekers.`,
    alternates: {
      canonical: `/jobs/${job.id}`,
    },
    openGraph: {
      title: `${job.title} at ${job.company}`,
      description: job.description.slice(0, 160),
      url: `/jobs/${job.id}`,
      type: 'website',
    },
  };
}

export default async function JobDetailPage(
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  const result = await fetchJobDetail(id);

  if (result.kind === 'not_found') {
    notFound();
  }

  if (result.kind === 'service_unavailable') {
    return (
      <main style={{ minHeight: '100vh', backgroundColor: 'var(--seekers-bg-base)', padding: '4rem 1rem' }}>
        <div
          style={{
            maxWidth: '600px',
            margin: '0 auto',
            textAlign: 'center',
            backgroundColor: 'var(--seekers-bg-surface)',
            padding: '2.5rem',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--seekers-border-subtle)',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚠️</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--seekers-text-primary)', marginBottom: '0.75rem' }}>
            Job Catalog Service Unavailable
          </h1>
          <p style={{ color: 'var(--seekers-text-secondary)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
            We encountered a temporary issue contacting the job discovery service. The listing has not been marked as missing. Please retry in a few moments.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <Link href="/" className="btn-secondary" style={{ textDecoration: 'none' }}>
              ← Return to Search
            </Link>
            <a href={`/jobs/${id}`} className="btn-primary" style={{ textDecoration: 'none' }}>
              Retry
            </a>
          </div>
        </div>
      </main>
    );
  }

  const job = result.job;
  const isExpired = Boolean(job.is_expired);
  const isFlagged = job.status === 'FLAGGED';
  const isAvailable = job.status === 'ACTIVE' && !isExpired && !isFlagged;

  // Construct valid JobPosting Schema for real active listings only
  let jsonLd: Record<string, unknown> | null = null;
  if (!job.is_synthetic && isAvailable) {
    const employmentTypeMap: Record<string, string> = {
      FULL_TIME: 'FULL_TIME',
      PART_TIME: 'PART_TIME',
      CONTRACT: 'CONTRACTOR',
      INTERNSHIP: 'INTERN',
    };

    const isBangladesh =
      job.location.toLowerCase().includes('dhaka') ||
      job.location.toLowerCase().includes('chittagong') ||
      job.location.toLowerCase().includes('sylhet') ||
      job.location.toLowerCase().includes('bangladesh') ||
      job.location.toLowerCase().includes('bd');

    jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: job.title,
      description: job.description,
      datePosted: job.published_at,
      ...(job.expires_at ? { validThrough: job.expires_at } : {}),
      hiringOrganization: {
        '@type': 'Organization',
        name: job.company,
      },
      jobLocation:
        job.remote_eligibility === 'FULLY_REMOTE'
          ? undefined
          : {
              '@type': 'Place',
              address: {
                '@type': 'PostalAddress',
                addressLocality: job.location,
                ...(isBangladesh ? { addressCountry: 'BD' } : {}),
              },
            },
      ...(job.remote_eligibility === 'FULLY_REMOTE' ? { jobLocationType: 'TELECOMMUTE' } : {}),
      ...(employmentTypeMap[job.job_type] ? { employmentType: employmentTypeMap[job.job_type] } : {}),
      baseSalary: job.salary
        ? {
            '@type': 'MonetaryAmount',
            currency: job.salary.currency,
            value: {
              '@type': 'QuantitativeValue',
              minValue: job.salary.min,
              maxValue: job.salary.max,
              unitText: job.salary.period === 'MONTHLY' ? 'MONTH' : 'YEAR',
            },
          }
        : undefined,
    };
  }

  const remoteText = {
    FULLY_REMOTE: 'Fully Remote',
    HYBRID: 'Hybrid Work',
    ON_SITE: 'On-Site',
    UNSPECIFIED: 'Flexible Work',
  }[job.remote_eligibility];

  return (
    <main style={{ minHeight: '100vh', backgroundColor: 'var(--seekers-bg-base)', padding: '2rem 1rem' }}>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
        />
      )}

      <div style={{ maxWidth: '840px', margin: '0 auto' }}>
        {/* Navigation Breadcrumb */}
        <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              color: 'var(--seekers-text-secondary)',
              fontSize: '0.875rem',
              textDecoration: 'none',
              padding: '0.5rem 0.75rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--seekers-border-subtle)',
              backgroundColor: 'var(--seekers-bg-surface)',
            }}
          >
            ← Back to Job Search
          </Link>

          <span style={{ fontSize: '0.8125rem', color: 'var(--seekers-text-muted)' }}>
            Job ID: <code style={{ fontFamily: 'var(--font-mono)' }}>{job.id.slice(0, 8)}</code>
          </span>
        </div>

        {/* Synthetic Demo Listing Banner */}
        {job.is_synthetic && (
          <div
            style={{
              padding: '0.875rem 1.25rem',
              marginBottom: '1.5rem',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--seekers-text-primary)',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            <span style={{ fontSize: '1.25rem' }}>🧪</span>
            <div>
              <strong>Synthetic Demo Listing:</strong> This vacancy is a simulated listing for developer demonstration and testing. It does not represent an actual hiring commitment.
            </div>
          </div>
        )}

        {/* Expired / Inactive Notice */}
        {isExpired && (
          <div
            style={{
              padding: '1rem',
              marginBottom: '1.5rem',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--seekers-danger)',
              fontSize: '0.875rem',
            }}
          >
            ⚠️ <strong>Listing Expired:</strong> This job vacancy has expired or reached its application deadline. Outbound application redirection is inactive.
          </div>
        )}

        {/* Flagged Notice */}
        {isFlagged && (
          <div
            style={{
              padding: '1rem',
              marginBottom: '1.5rem',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--seekers-amber-400)',
              fontSize: '0.875rem',
            }}
          >
            ⚠️ <strong>Listing Under Review:</strong> This listing has been flagged for moderation review. Outbound application links are temporarily suspended.
          </div>
        )}

        {/* Main Job Card Container */}
        <div
          style={{
            backgroundColor: 'var(--seekers-bg-surface)',
            border: '1px solid var(--seekers-border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '2rem',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
          }}
        >
          {/* Header section */}
          <div style={{ borderBottom: '1px solid var(--seekers-border-subtle)', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              <span className={`badge ${isExpired ? 'badge-danger' : isFlagged ? 'badge-warning' : 'badge-success'}`}>
                {isExpired ? 'EXPIRED' : job.status} LISTING
              </span>
              <span className="badge badge-accent">{remoteText}</span>
              <span className="badge badge-outline">{job.seniority} LEVEL</span>
              <span className="badge badge-outline">{job.job_type.replace('_', ' ')}</span>
            </div>

            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--seekers-text-primary)', marginBottom: '0.5rem' }}>
              {job.title}
            </h1>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', color: 'var(--seekers-text-secondary)', fontSize: '0.9375rem' }}>
              <span style={{ fontWeight: 600, color: 'var(--seekers-accent)' }}>{job.company}</span>
              <span>📍 {job.location}</span>
              {job.salary && (
                <span style={{ fontWeight: 600, color: 'var(--seekers-text-primary)' }}>
                  💰 {job.salary.currency === 'USD' ? '$' : '৳'}
                  {job.salary.min ? job.salary.min.toLocaleString() : ''}
                  {job.salary.max ? ` - ${job.salary.max.toLocaleString()}` : ''} / {job.salary.period.toLowerCase()}
                </span>
              )}
              <span style={{ fontSize: '0.8125rem', color: 'var(--seekers-text-muted)' }}>
                Source: {job.source}
              </span>
            </div>
          </div>

          {/* Action & Apply Box */}
          <div
            style={{
              padding: '1.25rem',
              backgroundColor: 'var(--seekers-bg-elevated)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--seekers-border-subtle)',
              marginBottom: '2rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              {!isAvailable ? (
                <button
                  type="button"
                  disabled
                  className="btn-primary"
                  style={{ opacity: 0.5, cursor: 'not-allowed' }}
                >
                  {isExpired ? 'Vacancy Closed' : isFlagged ? 'Under Moderation' : 'Unavailable'}
                </button>
              ) : (
                <a
                  href={`/api/v1/jobs/${job.id}/outbound`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    textDecoration: 'none',
                    fontWeight: 600,
                  }}
                >
                  Apply on Source ↗
                </a>
              )}

              <Link
                href="/"
                className="btn-secondary"
                style={{ textDecoration: 'none' }}
              >
                Browse Other Roles
              </Link>
            </div>

            <p style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)', lineHeight: 1.5, margin: 0 }}>
              <strong>Notice:</strong> Seekers is an aggregator and is not affiliated with {job.company}. Clicking &quot;Apply on Source&quot; validates safety and redirects to the official listing at <span style={{ fontFamily: 'var(--font-mono)' }}>{job.source}</span>. An outbound click is not a completed job application.
            </p>
          </div>

          {/* Skills Required */}
          {job.skills && job.skills.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--seekers-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                Required & Relevant Skills
              </h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {job.skills.map((skill, idx) => (
                  <span key={idx} className="skill-tag" style={{ padding: '0.3rem 0.75rem', fontSize: '0.875rem' }}>
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Description Body */}
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--seekers-text-primary)', marginBottom: '0.75rem' }}>
              Role Overview & Description
            </h2>
            <div
              style={{
                color: 'var(--seekers-text-secondary)',
                lineHeight: 1.7,
                fontSize: '0.9375rem',
                whiteSpace: 'pre-line',
              }}
            >
              {job.description}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
