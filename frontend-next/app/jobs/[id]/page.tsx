import React from 'react';
import Link from 'next/link';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface JobDetailResponse {
  id: string;
  title: string;
  company: string;
  location: string;
  remote_eligibility: 'FULLY_REMOTE' | 'HYBRID' | 'ON_SITE' | 'UNSPECIFIED';
  job_type: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP' | 'UNSPECIFIED';
  seniority: 'ENTRY' | 'MID' | 'SENIOR' | 'LEAD' | 'EXECUTIVE' | 'UNSPECIFIED';
  salary?: {
    currency: 'BDT' | 'USD';
    min?: number;
    max?: number;
    period: 'MONTHLY' | 'YEARLY';
  };
  skills: string[];
  source: string;
  description: string;
  canonical_url: string;
  status: 'ACTIVE' | 'EXPIRED' | 'FLAGGED';
  published_at: string;
  ingested_at: string;
}

const INGESTION_API_URL = process.env.INGESTION_API_URL || 'http://localhost:5000';

async function fetchJobDetail(id: string): Promise<JobDetailResponse | null> {
  try {
    const res = await fetch(`${INGESTION_API_URL}/api/v1/jobs/${id}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      throw new Error(`Upstream error: ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    console.warn(`Failed to fetch job ${id} from ingestion service:`, err);
    return null;
  }
}

export async function generateMetadata(
  props: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await props.params;
  const job = await fetchJobDetail(id);

  if (!job) {
    return {
      title: 'Job Not Found | Seekers',
      description: 'The requested job listing could not be found.',
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
  const job = await fetchJobDetail(id);

  if (!job) {
    notFound();
  }

  const isExpired = job.status === 'EXPIRED';
  const isFlagged = job.status === 'FLAGGED';

  // Construct valid JobPosting Schema for active listings
  const jsonLd =
    job.status === 'ACTIVE'
      ? {
          '@context': 'https://schema.org',
          '@type': 'JobPosting',
          title: job.title,
          description: job.description,
          datePosted: job.published_at,
          validThrough: new Date(new Date(job.published_at).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          hiringOrganization: {
            '@type': 'Organization',
            name: job.company,
          },
          jobLocation: {
            '@type': 'Place',
            address: {
              '@type': 'PostalAddress',
              addressLocality: job.location,
              addressCountry: 'BD',
            },
          },
          employmentType: job.job_type,
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
        }
      : null;

  const remoteText = {
    FULLY_REMOTE: 'Fully Remote',
    HYBRID: 'Hybrid (Dhaka)',
    ON_SITE: 'On-Site',
    UNSPECIFIED: 'Flexible Work',
  }[job.remote_eligibility];

  return (
    <main style={{ minHeight: '100vh', backgroundColor: 'var(--seekers-bg-base)', padding: '2rem 1rem' }}>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
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
            ⚠️ <strong>Listing Expired:</strong> This job vacancy has expired or been filled. Outbound application redirection is inactive.
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
                {job.status} LISTING
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
              {isExpired ? (
                <button
                  type="button"
                  disabled
                  className="btn-primary"
                  style={{ opacity: 0.5, cursor: 'not-allowed' }}
                >
                  Vacancy Closed
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
