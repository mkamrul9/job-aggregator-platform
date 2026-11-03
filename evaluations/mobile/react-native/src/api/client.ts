/**
 * evaluations/mobile/react-native/src/api/client.ts
 * Versioned API client for Seekers React Native prototype.
 */

import { MobileJobSummary, MobileJobDetail, MobileResumeUploadStatus } from '../../shared-contracts';

export class SeekersMobileApiClient {
  private baseUrl: string;
  private authToken: string | null = null;

  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  setAuthToken(token: string | null) {
    this.authToken = token;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  async searchJobs(query = '', page = 1, limit = 20): Promise<{ jobs: MobileJobSummary[]; total: number; page: number }> {
    const params = new URLSearchParams({
      q: query,
      page: String(page),
      limit: String(limit)
    });
    const res = await fetch(`${this.baseUrl}/api/v1/jobs?${params.toString()}`, {
      headers: this.getHeaders()
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch jobs: HTTP ${res.status}`);
    }
    return res.json();
  }

  async getJobDetail(jobId: string): Promise<MobileJobDetail> {
    const res = await fetch(`${this.baseUrl}/api/v1/jobs/${encodeURIComponent(jobId)}`, {
      headers: this.getHeaders()
    });
    if (!res.ok) {
      throw new Error(`Job not found: HTTP ${res.status}`);
    }
    return res.json();
  }

  async toggleSaveJob(jobId: string, shouldSave: boolean): Promise<{ success: boolean; isSaved: boolean }> {
    const method = shouldSave ? 'POST' : 'DELETE';
    const res = await fetch(`${this.baseUrl}/api/v1/users/workspace/saved-jobs/${encodeURIComponent(jobId)}`, {
      method,
      headers: this.getHeaders()
    });
    if (!res.ok) {
      throw new Error(`Failed to update saved job: HTTP ${res.status}`);
    }
    return res.json();
  }

  async uploadResume(fileName: string, fileBytes: Uint8Array): Promise<{ parse_id: string; status: string }> {
    const formData = new FormData();
    const blob = new Blob([fileBytes], { type: 'application/pdf' });
    formData.append('resume', blob as any, fileName);

    const headers: Record<string, string> = {};
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const res = await fetch(`${this.baseUrl}/users/resume/upload`, {
      method: 'POST',
      headers,
      body: formData
    });
    if (!res.ok) {
      throw new Error(`Resume upload failed: HTTP ${res.status}`);
    }
    return res.json();
  }

  async pollResumeStatus(parseId: string): Promise<MobileResumeUploadStatus> {
    const res = await fetch(`${this.baseUrl}/users/resume/status/${encodeURIComponent(parseId)}`, {
      headers: this.getHeaders()
    });
    if (!res.ok) {
      throw new Error(`Failed to poll status: HTTP ${res.status}`);
    }
    const data = await res.json();
    return {
      parseId: data.parse_id,
      status: data.status,
      extractedSkills: data.extracted_skills || [],
      errorMessage: data.error_message
    };
  }
}
