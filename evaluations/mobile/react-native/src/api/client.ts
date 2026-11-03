/**
 * evaluations/mobile/react-native/src/api/client.ts
 * Seekers React Native API Client.
 * Strictly aligned with OpenAPI 3.1 specification (contracts/openapi/seekers-api-v1.yaml).
 */

import {
  MobileJobSummary,
  MobileJobDetail,
  JobListResponse,
  MobileResumeUploadStatus
} from '../../../shared-contracts';

export class SeekersMobileApiClient {
  private baseUrl: string;
  private authToken: string | null = null;

  constructor(baseUrl = 'http://10.0.2.2:80') {
    // 10.0.2.2 is Android emulator host loopback; port 80 routes via Nginx gateway
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  setAuthToken(token: string | null) {
    this.authToken = token;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json'
    };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  /**
   * Search jobs with cursor pagination matching OpenAPI GET /api/v1/jobs.
   */
  async searchJobs(
    query = '',
    cursor: string | null = null,
    limit = 20,
    remoteOnly = false
  ): Promise<JobListResponse> {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (cursor) params.set('cursor', cursor);
    params.set('limit', String(limit));
    if (remoteOnly) params.set('remote_eligibility', 'FULLY_REMOTE');

    const url = `${this.baseUrl}/api/v1/jobs?${params.toString()}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders()
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Search failed: HTTP ${res.status} - ${errText}`);
    }

    const data = await res.json();
    return {
      items: data.items || [],
      limit: data.limit || limit,
      next_cursor: data.next_cursor || null,
      prev_cursor: data.prev_cursor || null,
      total_count: typeof data.total_count === 'number' ? data.total_count : (data.items?.length || 0)
    };
  }

  /**
   * Fetch single job detail matching OpenAPI GET /api/v1/jobs/:id.
   */
  async getJobDetail(jobId: string): Promise<MobileJobDetail> {
    const url = `${this.baseUrl}/api/v1/jobs/${encodeURIComponent(jobId)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders()
    });

    if (!res.ok) {
      throw new Error(`Job not found: HTTP ${res.status}`);
    }

    return res.json();
  }

  /**
   * Toggle save/unsave matching OpenAPI POST/DELETE /api/v1/users/saved-jobs/:jobId.
   */
  async toggleSaveJob(jobId: string, shouldSave: boolean): Promise<boolean> {
    const method = shouldSave ? 'POST' : 'DELETE';
    const url = `${this.baseUrl}/api/v1/users/saved-jobs/${encodeURIComponent(jobId)}`;

    const headers = this.getHeaders();
    if (shouldSave) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, {
      method,
      headers,
      body: shouldSave ? JSON.stringify({ saved_at: new Date().toISOString() }) : undefined
    });

    if (!res.ok && res.status !== 204 && res.status !== 201) {
      throw new Error(`Failed to update saved job: HTTP ${res.status}`);
    }

    return shouldSave;
  }

  /**
   * Multipart resume PDF upload matching OpenAPI POST /api/v1/users/resume/upload.
   */
  async uploadResume(
    fileName: string,
    fileBytes: Uint8Array
  ): Promise<{ parse_id: string; status: string }> {
    const formData = new FormData();
    const blob = new Blob([fileBytes], { type: 'application/pdf' });
    // Service-user accepts either 'file' or 'resume' field
    formData.append('file', blob as any, fileName);

    const headers = this.getHeaders();
    // Do not set Content-Type header manually for FormData so browser/runtime sets boundary

    const url = `${this.baseUrl}/api/v1/users/resume/upload`;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: formData
    });

    if (!res.ok && res.status !== 202) {
      throw new Error(`Resume upload failed: HTTP ${res.status}`);
    }

    return res.json();
  }

  /**
   * Poll resume parsing status matching OpenAPI GET /api/v1/users/resume/status/:id.
   */
  async pollResumeStatus(parseId: string): Promise<MobileResumeUploadStatus> {
    const url = `${this.baseUrl}/api/v1/users/resume/status/${encodeURIComponent(parseId)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders()
    });

    if (!res.ok) {
      throw new Error(`Failed to poll resume status: HTTP ${res.status}`);
    }

    const data = await res.json();
    return {
      parse_id: data.parse_id,
      status: data.status,
      extracted_skills: data.extracted_skills || [],
      error_code: data.error_code,
      processing_time_ms: data.processing_time_ms
    };
  }
}
