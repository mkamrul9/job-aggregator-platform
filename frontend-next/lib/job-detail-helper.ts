// frontend-next/lib/job-detail-helper.ts

export interface JobDetailResponse {
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
  expires_at?: string | null;
  published_at: string;
  ingested_at: string;
  is_synthetic?: boolean;
  is_expired?: boolean;
}

export type FetchJobResult =
  | { kind: 'success'; job: JobDetailResponse }
  | { kind: 'not_found' }
  | { kind: 'service_unavailable'; error: string; status: number };

/**
 * Escapes characters that can terminate HTML <script> tags or execute code.
 * Ensures safe JSON-LD serialization inside <script type="application/ld+json">.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

export async function fetchJobDetail(id: string, baseUrl?: string): Promise<FetchJobResult> {
  const apiUrl = baseUrl || process.env.INGESTION_API_URL || 'http://localhost:5000';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${apiUrl}/api/v1/jobs/${id}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.status === 404) {
      return { kind: 'not_found' };
    }

    if (!res.ok) {
      return {
        kind: 'service_unavailable',
        error: `Upstream service returned HTTP ${res.status}`,
        status: res.status,
      };
    }

    const data: JobDetailResponse = await res.json();
    if (data) {
      data.is_expired =
        data.status === 'EXPIRED' ||
        Boolean(data.expires_at && new Date(data.expires_at).getTime() <= Date.now());
    }
    return { kind: 'success', job: data };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const msg = err instanceof Error ? err.message : 'Upstream connection failed';
    return { kind: 'service_unavailable', error: msg, status: 503 };
  }
}
